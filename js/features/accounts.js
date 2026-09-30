import { esc, money, icon, openSheet, closeSheet, toast, confirmSheet, $, $$ } from '../ui.js';
import { accountBalances, evalAmount } from '../calc.js';
import { uid } from '../store.js';
import { fromPaise } from '../lib/money.js';

const TYPES = { cash: 'Cash', bank: 'Bank account', upi: 'UPI / wallet', card: 'Credit card', other: 'Other' };

export function render(root, ctx) {
  const { state } = ctx;
  const bal = accountBalances(state);
  const assets = state.accounts.filter((a) => a.type !== 'card').reduce((s, a) => s + bal[a.id], 0);
  const cards = state.accounts.filter((a) => a.type === 'card').reduce((s, a) => s + bal[a.id], 0);

  root.innerHTML = `
  <div class="stack">
    <div class="kpis kpis-2">
      <div class="kpi"><span class="label">Money you have</span><span class="num">${money(assets)}</span></div>
      <div class="kpi"><span class="label">Credit card dues</span><span class="num ${cards < 0 ? 'neg' : ''}">${money(cards)}</span></div>
    </div>
    <div class="card">
      <div class="row-between"><h2 class="card-title">Accounts</h2><button type="button" class="btn btn-small" id="acc-add">${icon('plus', 16)} Add account</button></div>
      <div class="acc-list">${state.accounts.map((a) => `
        <button type="button" class="acc" data-acc="${esc(a.id)}">
          <span class="acc-main"><strong>${esc(a.name)}</strong><span class="muted small">${esc(TYPES[a.type] || 'Other')} · ${state.txns.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length} transactions</span></span>
          <span class="acc-bal">${money(bal[a.id], { cls: bal[a.id] < 0 ? 'neg' : '' })}</span>
        </button>`).join('')}</div>
      <p class="muted small">Balances start from the opening balance you set, plus everything recorded here. Use a Transfer to move money between accounts, for example ATM withdrawals or card bill payments.</p>
    </div>
    <button type="button" class="btn" id="acc-transfer">${icon('swap', 18)} Record a transfer</button>
  </div>`;

  $('#acc-add', root).onclick = () => edit(ctx, null);
  $('#acc-transfer', root).onclick = () => ctx.openTxnForm(null, { type: 'transfer' });
  $$('[data-acc]', root).forEach((b) => (b.onclick = () => edit(ctx, state.accounts.find((a) => a.id === b.dataset.acc))));
}

function edit(ctx, acc) {
  const { state } = ctx;
  const panel = openSheet(acc ? 'Edit account' : 'Add account', `
    <form class="form" id="af" novalidate>
      <label class="field"><span class="label">Name</span><input id="af-name" maxlength="40" value="${esc(acc?.name || '')}" placeholder="e.g. SBI savings, HDFC credit card" required></label>
      <label class="field"><span class="label">Type</span><select id="af-type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${acc?.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Opening balance ₹</span><input id="af-open" inputmode="decimal" value="${acc?.opening ? fromPaise(acc.opening) : ''}" placeholder="0"></label>
      <p class="hint">For a credit card, enter what you currently owe as a negative number, like -5000.</p>
      <p class="error" id="af-err" role="alert" hidden></p>
      <div class="row-between">
        ${acc ? `<button type="button" class="btn btn-danger-ghost" id="af-del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);
  const err = (m) => { const e = $('#af-err', panel); e.textContent = m; e.hidden = false; };
  $('#af', panel).onsubmit = (e) => {
    e.preventDefault();
    const name = $('#af-name', panel).value.trim();
    if (!name) return err('Give the account a name.');
    const raw = $('#af-open', panel).value.trim();
    const opening = raw ? evalAmount(raw) : 0;
    if (isNaN(opening)) return err('Opening balance must be a number.');
    const rec = { id: acc?.id || uid(), name, type: $('#af-type', panel).value, opening };
    if (acc) Object.assign(acc, rec); else state.accounts.push(rec);
    ctx.save();
    closeSheet();
    toast('Account saved');
    ctx.refresh();
  };
  $('#af-del', panel)?.addEventListener('click', async () => {
    const used = state.txns.some((t) => t.accountId === acc.id || t.toAccountId === acc.id);
    if (used) {
      closeSheet();
      toast('This account has transactions. Move or delete them first.');
      return;
    }
    if (state.accounts.length <= 1) { toast('Keep at least one account.'); return; }
    if (!(await confirmSheet('Delete account?', `"${acc.name}" will be removed.`))) return;
    state.accounts = state.accounts.filter((a) => a.id !== acc.id);
    ctx.save();
    toast('Account deleted');
    ctx.refresh();
  });
}
