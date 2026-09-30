// Pieces of UI shared between several screens.

import { esc, money, icon, $$ } from './ui.js';
import { prettyDate } from './lib/dates.js';
import { catMap, accMap } from './calc.js';

export function txnRow(t, cats, accs) {
  const c = cats[t.categoryId];
  const isTransfer = t.type === 'transfer';
  const title = t.note || (isTransfer ? 'Transfer' : c?.name || 'Uncategorised');
  const sub = isTransfer
    ? `${esc(accs[t.accountId]?.name || '?')} → ${esc(accs[t.toAccountId]?.name || '?')}`
    : `${esc(c?.name || '')}${accs[t.accountId] ? ` · ${esc(accs[t.accountId].name)}` : ''}`;
  const amt = t.type === 'income' ? money(t.amount, { sign: true, cls: 'pos' }) : t.type === 'expense' ? money(-t.amount, { cls: 'neg' }) : money(t.amount, { cls: 'neutral' });
  return `<button type="button" class="txn" data-txn="${esc(t.id)}">
    <span class="txn-ic" style="--c:${esc(isTransfer ? 'var(--muted)' : c?.color || 'var(--muted)')}">${isTransfer ? icon('swap', 18) : esc(c?.icon || '•')}</span>
    <span class="txn-main"><span class="txn-title">${esc(title)}</span><span class="txn-sub">${sub}${t.tags?.length ? ` · ${t.tags.map((x) => `#${esc(x)}`).join(' ')}` : ''}</span></span>
    <span class="txn-amt">${amt}</span>
  </button>`;
}

// Transactions grouped under a date heading with the day's net spend.
export function txnGroups(state, txns) {
  const cats = catMap(state);
  const accs = accMap(state);
  const sorted = [...txns].sort((a, b) => (b.date === a.date ? b.created - a.created : b.date < a.date ? -1 : 1));
  const groups = new Map();
  for (const t of sorted) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  return [...groups.entries()].map(([date, list]) => {
    const spent = list.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    return `<section class="day">
      <h3 class="day-head"><span>${esc(prettyDate(date))}</span>${spent ? `<span class="muted">${money(-spent, { cls: 'muted' })}</span>` : ''}</h3>
      <div class="txn-list">${list.map((t) => txnRow(t, cats, accs)).join('')}</div>
    </section>`;
  }).join('');
}

export function bindTxnClicks(root, state, openTxnForm) {
  $$('[data-txn]', root).forEach((b) => (b.onclick = () => {
    const t = state.txns.find((x) => x.id === b.dataset.txn);
    if (t) openTxnForm(t);
  }));
}

export function periodNav(label, id = 'pn') {
  return `<div class="period-nav">
    <button type="button" class="icon-btn" id="${id}-prev" aria-label="Previous period">${icon('chevL')}</button>
    <span class="period-label">${esc(label)}</span>
    <button type="button" class="icon-btn" id="${id}-next" aria-label="Next period">${icon('chevR')}</button>
  </div>`;
}
