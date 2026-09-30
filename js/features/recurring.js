import { esc, money, icon, openSheet, closeSheet, toast, confirmSheet, emptyState, $, $$ } from '../ui.js';
import { evalAmount } from '../calc.js';
import { uid, addTxnFromRecurring, processRecurring } from '../store.js';
import { iso, prettyDate, parseISO } from '../lib/dates.js';
import { fromPaise } from '../lib/money.js';

const FREQ = { weekly: 'Every week', monthly: 'Every month', quarterly: 'Every 3 months', yearly: 'Every year' };
const PER_MONTH = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

export function render(root, ctx) {
  const { state } = ctx;
  const today = iso();
  const list = [...state.recurring].sort((a, b) => (a.active === b.active ? (a.nextDate < b.nextDate ? -1 : 1) : a.active ? -1 : 1));
  const monthly = state.recurring.filter((r) => r.active && r.type === 'expense').reduce((s, r) => s + r.amount * PER_MONTH[r.freq], 0);

  root.innerHTML = `
  <div class="stack">
    <div class="kpis kpis-2">
      <div class="kpi"><span class="label">Fixed costs per month</span><span class="num">${money(Math.round(monthly))}</span></div>
      <div class="kpi"><span class="label">Per year</span><span class="num">${money(Math.round(monthly * 12))}</span></div>
    </div>
    <div class="card">
      <div class="row-between"><h2 class="card-title">Bills &amp; subscriptions</h2><button type="button" class="btn btn-small" id="rc-add">${icon('plus', 16)} Add</button></div>
      ${list.length ? `<div class="bill-list">${list.map((r) => {
        const overdue = r.active && r.nextDate < today;
        return `<div class="bill ${overdue ? 'overdue' : ''} ${r.active ? '' : 'paused'}">
          <button type="button" class="bill-main as-link" data-edit="${esc(r.id)}">
            <strong>${esc(r.name)}</strong>
            <span class="muted small">${esc(FREQ[r.freq])} · ${r.active ? `${overdue ? 'Overdue since' : 'Next'} ${esc(prettyDate(r.nextDate))}` : 'Paused'}${r.autoAdd ? ' · Auto-add' : ''}</span>
          </button>
          <span class="${r.type === 'income' ? 'pos' : ''}">${money(r.amount)}</span>
          ${r.active && !r.autoAdd ? `<button type="button" class="btn btn-small" data-pay="${esc(r.id)}">Mark paid</button>` : '<span></span>'}
        </div>`;
      }).join('')}</div>` : emptyState('No bills yet', 'Add rent, EMIs, phone recharges, OTT subscriptions or SIPs. You get a reminder on the Home screen before each one is due.')}
    </div>
  </div>`;

  $('#rc-add', root).onclick = () => edit(ctx, null);
  $$('[data-edit]', root).forEach((b) => (b.onclick = () => edit(ctx, state.recurring.find((r) => r.id === b.dataset.edit))));
  $$('[data-pay]', root).forEach((b) => (b.onclick = () => {
    const r = state.recurring.find((x) => x.id === b.dataset.pay);
    addTxnFromRecurring(r, today);
    ctx.save();
    toast(`${r.name} recorded. Next due ${prettyDate(r.nextDate)}.`);
    ctx.refresh();
  }));
}

function edit(ctx, r) {
  const { state } = ctx;
  const type = r?.type || 'expense';
  const catOpts = (t) => state.categories.filter((c) => c.kind === t).map((c) => `<option value="${esc(c.id)}" ${r?.categoryId === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('');
  const panel = openSheet(r ? 'Edit bill' : 'Add bill or subscription', `
    <form class="form" id="rf" novalidate>
      <div class="seg" role="radiogroup" aria-label="Type">
        <label class="seg-item seg-expense"><input type="radio" name="type" value="expense" ${type === 'expense' ? 'checked' : ''}><span>Expense</span></label>
        <label class="seg-item seg-income"><input type="radio" name="type" value="income" ${type === 'income' ? 'checked' : ''}><span>Income</span></label>
      </div>
      <label class="field"><span class="label">Name</span><input id="rf-name" maxlength="60" value="${esc(r?.name || '')}" placeholder="e.g. House rent, Netflix, Car EMI, Salary"></label>
      <label class="amount-field"><span class="rupee">₹</span><input id="rf-amt" inputmode="decimal" value="${r ? fromPaise(r.amount) : ''}" placeholder="0" aria-label="Amount"></label>
      <div class="grid-2">
        <label class="field"><span class="label">How often</span><select id="rf-freq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}" ${(r?.freq || 'monthly') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Next due date</span><input id="rf-date" type="date" value="${esc(r?.nextDate || iso())}"></label>
        <label class="field"><span class="label">Category</span><select id="rf-cat">${catOpts(type)}</select></label>
        <label class="field"><span class="label">Account</span><select id="rf-acc">${state.accounts.map((a) => `<option value="${esc(a.id)}" ${r?.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      </div>
      <label class="check"><input type="checkbox" id="rf-auto" ${r?.autoAdd ? 'checked' : ''}> Add it automatically on the due date (for fixed amounts like rent or salary)</label>
      ${r ? `<label class="check"><input type="checkbox" id="rf-active" ${r.active ? 'checked' : ''}> Active</label>` : ''}
      <p class="error" id="rf-err" role="alert" hidden></p>
      <div class="row-between">
        ${r ? `<button type="button" class="btn btn-danger-ghost" id="rf-del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);

  $$('input[name=type]', panel).forEach((x) => (x.onchange = () => { $('#rf-cat', panel).innerHTML = catOpts(x.value); }));
  const err = (m) => { const e = $('#rf-err', panel); e.textContent = m; e.hidden = false; };
  $('#rf', panel).onsubmit = (e) => {
    e.preventDefault();
    const name = $('#rf-name', panel).value.trim();
    const amount = evalAmount($('#rf-amt', panel).value);
    const nextDate = $('#rf-date', panel).value;
    if (!name) return err('Give it a name.');
    if (!(amount > 0)) return err('Enter an amount above ₹0.');
    if (!nextDate) return err('Pick the next due date.');
    const rec = {
      id: r?.id || uid(), name, amount, nextDate,
      type: $('input[name=type]:checked', panel).value,
      freq: $('#rf-freq', panel).value,
      anchorDay: parseISO(nextDate).getDate(),
      categoryId: $('#rf-cat', panel).value,
      accountId: $('#rf-acc', panel).value,
      autoAdd: $('#rf-auto', panel).checked,
      active: r ? $('#rf-active', panel).checked : true,
    };
    if (r) Object.assign(r, rec); else state.recurring.push(rec);
    const added = processRecurring();
    ctx.save();
    closeSheet();
    toast(added ? `Saved. ${added} past-due ${added === 1 ? 'entry' : 'entries'} added.` : 'Saved');
    ctx.refresh();
  };
  $('#rf-del', panel)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Delete this bill?', 'Past payments already recorded stay in your transactions.'))) return;
    state.recurring = state.recurring.filter((x) => x.id !== r.id);
    ctx.save();
    toast('Deleted');
    ctx.refresh();
  });
}
