import { esc, money, icon, emptyState, $, $$ } from '../ui.js';
import { currentPeriod, inRange, totals, catMap } from '../calc.js';
import { periodLabel } from '../lib/dates.js';
import { txnGroups, bindTxnClicks, periodNav } from '../components.js';
import { toPaise } from '../lib/money.js';

// Filters survive moving between screens (memory only, cleared on lock).
const f = { q: '', type: 'all', cat: 'all', acc: 'all', offset: 0, range: 'period', min: '', max: '', limit: 150 };

export function render(root, ctx) {
  const { state } = ctx;
  if (ctx.params.categoryId) { f.cat = ctx.params.categoryId; f.type = 'all'; ctx.params.categoryId = null; }
  if (ctx.params.offset != null) { f.offset = ctx.params.offset; f.range = 'period'; ctx.params.offset = null; }

  const period = currentPeriod(state, f.offset);
  const cats = catMap(state);

  let list = f.range === 'period' ? inRange(state.txns, period) : state.txns;
  if (f.type !== 'all') list = list.filter((t) => t.type === f.type);
  if (f.cat !== 'all') list = list.filter((t) => t.categoryId === f.cat);
  if (f.acc !== 'all') list = list.filter((t) => t.accountId === f.acc || t.toAccountId === f.acc);
  const min = toPaise(f.min);
  const max = toPaise(f.max);
  if (min > 0) list = list.filter((t) => t.amount >= min);
  if (max > 0) list = list.filter((t) => t.amount <= max);
  if (f.q.trim()) {
    const words = f.q.trim().toLowerCase().split(/\s+/);
    list = list.filter((t) => {
      const hay = `${t.note} ${cats[t.categoryId]?.name || ''} ${(t.tags || []).map((x) => `#${x}`).join(' ')} ${t.amount / 100}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  const tot = totals(list);
  const shown = [...list].sort((a, b) => (b.date === a.date ? b.created - a.created : b.date < a.date ? -1 : 1)).slice(0, f.limit);

  const opt = (v, label, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(label)}</option>`;
  const filtersActive = f.type !== 'all' || f.cat !== 'all' || f.acc !== 'all' || f.min || f.max;

  root.innerHTML = `
  <div class="stack">
    <div class="toolbar">
      <label class="search">${icon('search', 18)}<input id="tx-q" type="search" placeholder="Search notes, categories, #tags, amounts" value="${esc(f.q)}" aria-label="Search"></label>
      <div class="seg seg-small" role="radiogroup" aria-label="Date range">
        <label class="seg-item"><input type="radio" name="range" value="period" ${f.range === 'period' ? 'checked' : ''}><span>Month</span></label>
        <label class="seg-item"><input type="radio" name="range" value="all" ${f.range === 'all' ? 'checked' : ''}><span>All time</span></label>
      </div>
    </div>
    ${f.range === 'period' ? periodNav(periodLabel(period), 'tx') : ''}

    <details class="filters" ${filtersActive ? 'open' : ''}>
      <summary>Filters${filtersActive ? ' (on)' : ''}</summary>
      <div class="grid-3">
        <label class="field"><span class="label">Type</span><select id="tx-type">
          ${opt('all', 'All', f.type)}${opt('expense', 'Expenses', f.type)}${opt('income', 'Income', f.type)}${opt('transfer', 'Transfers', f.type)}</select></label>
        <label class="field"><span class="label">Category</span><select id="tx-cat">
          ${opt('all', 'All categories', f.cat)}${state.categories.map((c) => opt(c.id, `${c.icon} ${c.name}`, f.cat)).join('')}</select></label>
        <label class="field"><span class="label">Account</span><select id="tx-acc">
          ${opt('all', 'All accounts', f.acc)}${state.accounts.map((a) => opt(a.id, a.name, f.acc)).join('')}</select></label>
        <label class="field"><span class="label">Min ₹</span><input id="tx-min" inputmode="decimal" value="${esc(f.min)}"></label>
        <label class="field"><span class="label">Max ₹</span><input id="tx-max" inputmode="decimal" value="${esc(f.max)}"></label>
        <div class="field field-end"><button type="button" class="btn" id="tx-clear">Clear filters</button></div>
      </div>
    </details>

    <div class="totals-strip">
      <span>${list.length} item${list.length === 1 ? '' : 's'}</span>
      <span>Out ${money(tot.expense, { cls: 'neg' })}</span>
      <span>In ${money(tot.income, { cls: 'pos' })}</span>
    </div>

    ${shown.length ? txnGroups(state, shown) : emptyState(state.txns.length ? 'Nothing matches' : 'No transactions yet', state.txns.length ? 'Try a different search or clear the filters.' : 'Tap + to add your first one.')}
    ${list.length > shown.length ? `<button type="button" class="btn btn-block" id="tx-more">Show ${Math.min(150, list.length - shown.length)} more</button>` : ''}
  </div>`;

  bindTxnClicks(root, state, ctx.openTxnForm);

  const rerender = () => render(root, ctx);
  let qTimer;
  const q = $('#tx-q', root);
  q.oninput = () => { clearTimeout(qTimer); qTimer = setTimeout(() => { f.q = q.value; f.limit = 150; rerender(); const n = $('#tx-q', root); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
  $$('input[name=range]', root).forEach((r) => (r.onchange = () => { f.range = r.value; rerender(); }));
  $('#tx-prev', root)?.addEventListener('click', () => { f.offset--; rerender(); });
  $('#tx-next', root)?.addEventListener('click', () => { f.offset++; rerender(); });
  const keepOpen = () => { rerender(); $('.filters', root).open = true; };
  $('#tx-type', root).onchange = (e) => { f.type = e.target.value; keepOpen(); };
  $('#tx-cat', root).onchange = (e) => { f.cat = e.target.value; keepOpen(); };
  $('#tx-acc', root).onchange = (e) => { f.acc = e.target.value; keepOpen(); };
  $('#tx-min', root).onchange = (e) => { f.min = e.target.value; keepOpen(); };
  $('#tx-max', root).onchange = (e) => { f.max = e.target.value; keepOpen(); };
  $('#tx-clear', root).onclick = () => { Object.assign(f, { type: 'all', cat: 'all', acc: 'all', min: '', max: '', q: '' }); rerender(); };
  $('#tx-more', root)?.addEventListener('click', () => { f.limit += 150; rerender(); });
}
