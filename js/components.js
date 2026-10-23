// Pieces of UI shared between several screens.

import { esc, money, icon, haptic, $$ } from './ui.js';
import { formatINR } from './lib/money.js';
import { prettyDate } from './lib/dates.js';
import { catMap, accMap, spendAmount } from './calc.js';
import { deleteTxn, repeatTxn, quickActionable } from './txn-form.js';

let peopleNames = {};
export function setPeopleNames(state) {
  peopleNames = Object.fromEntries((state.people || []).map((p) => [p.id, p.name]));
}
const sharedPayer = (t) => peopleNames[t.shared.paidBy] || 'a friend';

export function txnRow(t, cats, accs) {
  const c = cats[t.categoryId];
  const isTransfer = t.type === 'transfer';
  const isAdj = t.type === 'adjustment';
  const isSettle = t.type === 'settlement';
  const split = t.splits?.length > 1;
  const title = t.note || (isTransfer ? 'Transfer' : isAdj ? 'Balance correction' : c?.name || 'Uncategorised');
  let sub;
  if (isSettle) sub = `Settle up · ${esc(accs[t.accountId]?.name || '')}`;
  else if (t.shared) sub = `${t.shared.paidBy === 'me' ? `Your share ${esc(formatINR(t.shared.myShare))}` : `Paid by ${esc(sharedPayer(t))}`} · ${esc(c?.name || '')}${accs[t.accountId] ? ` · ${esc(accs[t.accountId].name)}` : ''}`;
  else if (isTransfer) sub = `${esc(accs[t.accountId]?.name || '?')} → ${esc(accs[t.toAccountId]?.name || '?')}`;
  else if (isAdj) sub = `Balance correction · ${esc(accs[t.accountId]?.name || '')}`;
  else sub = `${split ? `Split: ${t.splits.map((p) => esc(cats[p.categoryId]?.name || '?')).join(', ')}` : esc(c?.name || '')}${accs[t.accountId] ? ` · ${esc(accs[t.accountId].name)}` : ''}`;
  const amt = isSettle ? money(t.direction === 'in' ? t.amount : -t.amount, { sign: true, cls: t.direction === 'in' ? 'pos' : 'neutral' })
    : t.type === 'income' ? money(t.amount, { sign: true, cls: 'pos' })
    : t.type === 'expense' ? money(-t.amount, { cls: 'neg' })
      : isAdj ? money(t.amount, { sign: true, cls: 'neutral' }) : money(t.amount, { cls: 'neutral' });
  const ic = isSettle ? icon('check', 18) : t.shared ? icon('people', 18) : isTransfer ? icon('swap', 18) : isAdj ? icon('check', 18) : split ? icon('list', 18) : esc(c?.icon || '•');
  const color = isSettle ? 'var(--pos)' : t.shared ? (c?.color || 'var(--accent)') : isTransfer || isAdj ? 'var(--muted)' : split ? 'var(--accent)' : c?.color || 'var(--muted)';
  const swipe = quickActionable(t);
  return `<div class="txn-row">${swipe ? `<span class="swipe-act swipe-repeat" aria-hidden="true">${icon('repeat', 18)} Repeat</span><span class="swipe-act swipe-delete" aria-hidden="true">Delete ${icon('trash', 18)}</span>` : ''}
  <button type="button" class="txn" data-txn="${esc(t.id)}"${swipe ? ' data-swipe' : ''}>
    <span class="txn-ic" style="--c:${esc(color)}">${ic}</span>
    <span class="txn-main"><span class="txn-title">${esc(title)}</span><span class="txn-sub">${sub}${t.tags?.length ? ` · ${t.tags.map((x) => `#${esc(x)}`).join(' ')}` : ''}</span></span>
    <span class="txn-amt">${amt}</span>
  </button></div>`;
}

// Transactions grouped under a date heading with the day's net spend.
export function txnGroups(state, txns) {
  setPeopleNames(state);
  const cats = catMap(state);
  const accs = accMap(state);
  const sorted = [...txns].sort((a, b) => (b.date === a.date ? b.created - a.created : b.date < a.date ? -1 : 1));
  const groups = new Map();
  for (const t of sorted) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  return [...groups.entries()].map(([date, list]) => {
    const spent = list.filter((t) => t.type === 'expense').reduce((a, t) => a + spendAmount(t), 0);
    return `<section class="day">
      <h3 class="day-head"><span>${esc(prettyDate(date))}</span>${spent ? `<span class="muted">${money(-spent, { cls: 'muted' })}</span>` : ''}</h3>
      <div class="txn-list">${list.map((t) => txnRow(t, cats, accs)).join('')}</div>
    </section>`;
  }).join('');
}

export function bindTxnClicks(root, state, openTxnForm) {
  $$('[data-txn]', root).forEach((b) => {
    b.onclick = () => {
      if (b.dataset.swiped) return; // the tap that ends a swipe
      const t = state.txns.find((x) => x.id === b.dataset.txn);
      if (t) openTxnForm(t);
    };
    if ('swipe' in b.dataset) bindSwipe(b, () => state.txns.find((x) => x.id === b.dataset.txn));
  });
}

// Phone gesture on a transaction row: swipe left to delete, right to repeat it today.
// Vertical drags are left to the page so scrolling still works (CSS sets touch-action: pan-y).
const SWIPE_AT = 90;
function bindSwipe(btn, getTxn) {
  const row = btn.parentElement;
  let x0 = null;
  let y0 = 0;
  let dx = 0;
  let dragging = false;
  let armed = false;
  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; dragging = false; armed = false;
  });
  btn.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    const mx = e.clientX - x0;
    const my = e.clientY - y0;
    if (!dragging) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { x0 = null; return; }
      if (Math.abs(mx) < 12) return;
      dragging = true;
      btn.setPointerCapture?.(e.pointerId);
      row.classList.add('swiping');
    }
    dx = Math.max(-160, Math.min(160, mx));
    row.dataset.dir = dx < 0 ? 'left' : 'right';
    btn.style.transform = `translateX(${dx}px)`;
    if (armed !== Math.abs(dx) >= SWIPE_AT) { armed = !armed; row.classList.toggle('armed', armed); }
  });
  const end = (e) => {
    if (x0 === null) return;
    x0 = null;
    if (!dragging) return;
    btn.dataset.swiped = '1';
    setTimeout(() => delete btn.dataset.swiped, 350);
    btn.style.transition = 'transform 0.2s ease-out';
    btn.style.transform = '';
    setTimeout(() => { btn.style.transition = ''; row.classList.remove('swiping', 'armed'); }, 200);
    const t = getTxn();
    if (e.type === 'pointerup' && armed && t) {
      haptic();
      if (dx < 0) deleteTxn(t);
      else repeatTxn(t);
    }
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
}

export function periodNav(label, id = 'pn') {
  return `<div class="period-nav">
    <button type="button" class="icon-btn" id="${id}-prev" aria-label="Previous period">${icon('chevL')}</button>
    <span class="period-label">${esc(label)}</span>
    <button type="button" class="icon-btn" id="${id}-next" aria-label="Next period">${icon('chevR')}</button>
  </div>`;
}
