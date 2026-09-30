import { esc, money, icon, openSheet, closeSheet, toast, confirmSheet, emptyState, $, $$ } from '../ui.js';
import { evalAmount } from '../calc.js';
import { uid } from '../store.js';
import { iso, prettyDate } from '../lib/dates.js';
import { fromPaise } from '../lib/money.js';

let showSettled = false;

const remaining = (d) => d.amount - (d.payments || []).reduce((s, p) => s + p.amount, 0);

export function render(root, ctx) {
  const { state } = ctx;
  const open = state.debts.filter((d) => !d.settled);
  const owedToYou = open.filter((d) => d.direction === 'lent').reduce((s, d) => s + remaining(d), 0);
  const youOwe = open.filter((d) => d.direction === 'borrowed').reduce((s, d) => s + remaining(d), 0);
  const list = state.debts.filter((d) => showSettled || !d.settled).sort((a, b) => (a.settled - b.settled) || (a.date < b.date ? 1 : -1));
  const today = iso();

  root.innerHTML = `
  <div class="stack">
    <div class="kpis kpis-2">
      <div class="kpi"><span class="label">Others owe you</span><span class="num pos">${money(owedToYou)}</span></div>
      <div class="kpi"><span class="label">You owe</span><span class="num neg">${money(youOwe)}</span></div>
    </div>
    <div class="card">
      <div class="row-between"><h2 class="card-title">Lent &amp; borrowed</h2><button type="button" class="btn btn-small" id="d-add">${icon('plus', 16)} Add</button></div>
      ${list.length ? `<div class="bill-list">${list.map((d) => {
        const rem = remaining(d);
        const overdue = !d.settled && d.due && d.due < today;
        return `<div class="bill ${d.settled ? 'paused' : ''} ${overdue ? 'overdue' : ''}">
          <button type="button" class="bill-main as-link" data-edit="${esc(d.id)}">
            <strong>${esc(d.person)}</strong>
            <span class="muted small">${d.direction === 'lent' ? 'You lent' : 'You borrowed'} · ${esc(prettyDate(d.date))}${d.due ? ` · due ${esc(prettyDate(d.due))}` : ''}${d.note ? ` · ${esc(d.note)}` : ''}</span>
          </button>
          <span class="${d.direction === 'lent' ? 'pos' : 'neg'}">${d.settled ? '<span class="pill">Settled</span>' : money(rem)}</span>
          ${d.settled ? '<span></span>' : `<button type="button" class="btn btn-small" data-pay="${esc(d.id)}">Repayment</button>`}
        </div>`;
      }).join('')}</div>` : emptyState('All clear', 'Nobody owes you and you owe nobody. Add an entry when you lend or borrow money.')}
      ${state.debts.some((d) => d.settled) ? `<label class="check"><input type="checkbox" id="d-settled" ${showSettled ? 'checked' : ''}> Show settled</label>` : ''}
    </div>
  </div>`;

  $('#d-add', root).onclick = () => edit(ctx, null);
  $('#d-settled', root)?.addEventListener('change', (e) => { showSettled = e.target.checked; render(root, ctx); });
  $$('[data-edit]', root).forEach((b) => (b.onclick = () => edit(ctx, state.debts.find((d) => d.id === b.dataset.edit))));
  $$('[data-pay]', root).forEach((b) => (b.onclick = () => repay(ctx, state.debts.find((d) => d.id === b.dataset.pay))));
}

function repay(ctx, d) {
  const rem = remaining(d);
  const panel = openSheet(`Repayment · ${d.person}`, `
    <form class="form" id="dp" novalidate>
      <label class="amount-field"><span class="rupee">₹</span><input id="dp-amt" inputmode="decimal" value="${fromPaise(rem)}" aria-label="Amount"></label>
      <p class="hint">${money(rem)} still outstanding.</p>
      <p class="error" id="dp-err" role="alert" hidden></p>
      <div class="row-end"><button type="submit" class="btn btn-primary">Save</button></div>
    </form>`);
  $('#dp', panel).onsubmit = (e) => {
    e.preventDefault();
    const v = evalAmount($('#dp-amt', panel).value);
    if (!(v > 0)) { const er = $('#dp-err', panel); er.textContent = 'Enter an amount above ₹0.'; er.hidden = false; return; }
    (d.payments ||= []).push({ date: iso(), amount: Math.min(v, rem) });
    if (remaining(d) <= 0) d.settled = true;
    ctx.save();
    closeSheet();
    toast(d.settled ? `Settled with ${d.person}` : 'Repayment saved');
    ctx.refresh();
  };
}

function edit(ctx, d) {
  const { state } = ctx;
  const dir = d?.direction || 'lent';
  const people = [...new Set(state.debts.map((x) => x.person))];
  const panel = openSheet(d ? 'Edit entry' : 'Lent or borrowed', `
    <form class="form" id="df" novalidate>
      <div class="seg" role="radiogroup" aria-label="Direction">
        <label class="seg-item seg-income"><input type="radio" name="dir" value="lent" ${dir === 'lent' ? 'checked' : ''}><span>I lent</span></label>
        <label class="seg-item seg-expense"><input type="radio" name="dir" value="borrowed" ${dir === 'borrowed' ? 'checked' : ''}><span>I borrowed</span></label>
      </div>
      <label class="field"><span class="label">Person</span><input id="df-person" list="df-people" maxlength="50" value="${esc(d?.person || '')}" placeholder="Name"></label>
      <datalist id="df-people">${people.map((p) => `<option value="${esc(p)}"></option>`).join('')}</datalist>
      <label class="amount-field"><span class="rupee">₹</span><input id="df-amt" inputmode="decimal" value="${d ? fromPaise(d.amount) : ''}" placeholder="0" aria-label="Amount"></label>
      <div class="grid-2">
        <label class="field"><span class="label">Date</span><input id="df-date" type="date" value="${esc(d?.date || iso())}"></label>
        <label class="field"><span class="label">Return by (optional)</span><input id="df-due" type="date" value="${esc(d?.due || '')}"></label>
      </div>
      <label class="field"><span class="label">Note</span><input id="df-note" maxlength="100" value="${esc(d?.note || '')}"></label>
      ${d ? `<label class="check"><input type="checkbox" id="df-settled" ${d.settled ? 'checked' : ''}> Settled</label>` : ''}
      <p class="error" id="df-err" role="alert" hidden></p>
      <div class="row-between">
        ${d ? `<button type="button" class="btn btn-danger-ghost" id="df-del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);
  const err = (m) => { const e = $('#df-err', panel); e.textContent = m; e.hidden = false; };
  $('#df', panel).onsubmit = (e) => {
    e.preventDefault();
    const person = $('#df-person', panel).value.trim();
    const amount = evalAmount($('#df-amt', panel).value);
    if (!person) return err('Enter the person\'s name.');
    if (!(amount > 0)) return err('Enter an amount above ₹0.');
    const rec = {
      id: d?.id || uid(), person, amount,
      direction: $('input[name=dir]:checked', panel).value,
      date: $('#df-date', panel).value || iso(),
      due: $('#df-due', panel).value || null,
      note: $('#df-note', panel).value.trim(),
      settled: d ? $('#df-settled', panel).checked : false,
      payments: d?.payments || [],
    };
    if (d) Object.assign(d, rec); else state.debts.push(rec);
    ctx.save();
    closeSheet();
    toast('Saved');
    ctx.refresh();
  };
  $('#df-del', panel)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Delete entry?', `The record for ${d.person} will be removed.`))) return;
    state.debts = state.debts.filter((x) => x.id !== d.id);
    ctx.save();
    toast('Deleted');
    ctx.refresh();
  });
}
