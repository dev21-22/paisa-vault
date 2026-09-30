import { esc, money, progress, openSheet, closeSheet, toast, $, $$ } from '../ui.js';
import { currentPeriod, inRange, totals, byCategory, evalAmount } from '../calc.js';
import { periodLabel, daysBetween, iso } from '../lib/dates.js';
import { fromPaise } from '../lib/money.js';

export function render(root, ctx) {
  const { state } = ctx;
  const period = currentPeriod(state);
  const ptx = inRange(state.txns, period);
  const spent = Object.fromEntries(byCategory(ptx).map((x) => [x.categoryId, x.amount]));
  const totalSpent = totals(ptx).expense;
  const total = state.budgets._total || 0;
  const catBudgetSum = Object.entries(state.budgets).filter(([k]) => k !== '_total').reduce((a, [, v]) => a + v, 0);
  const daysLeft = daysBetween(iso(), period.end) + 1;
  const expenseCats = state.categories.filter((c) => c.kind === 'expense');

  const row = (id, name, ic, s, b) => `
    <button type="button" class="budget-item" data-edit="${esc(id)}">
      <div class="row-between"><span class="budget-name">${ic ? `<span aria-hidden="true">${esc(ic)}</span> ` : ''}${esc(name)}</span>
        <span class="small">${money(s)}${b ? ` <span class="muted">of ${money(b)}</span>` : ' <span class="muted">· no limit</span>'}</span></div>
      ${b ? progress(s, b) : ''}
      ${b ? `<span class="muted small">${s > b ? `Over by ${money(s - b)}` : `${money(b - s)} left`}</span>` : ''}
    </button>`;

  root.innerHTML = `
  <div class="stack">
    <p class="muted">${esc(periodLabel(period))} · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left. Tap any row to set a limit.</p>
    <div class="card">
      <h2 class="card-title">Overall monthly budget</h2>
      ${row('_total', 'All spending', '', totalSpent, total)}
      ${catBudgetSum ? `<p class="muted small">Category limits add up to ${money(catBudgetSum)}.</p>` : ''}
    </div>
    <div class="card">
      <h2 class="card-title">By category</h2>
      <div class="budget-list">
        ${expenseCats.map((c) => ({ c, s: spent[c.id] || 0, b: state.budgets[c.id] || 0 }))
          .sort((a, b) => (b.b ? 1 : 0) - (a.b ? 1 : 0) || b.s - a.s)
          .map(({ c, s, b }) => row(c.id, c.name, c.icon, s, b)).join('')}
      </div>
    </div>
  </div>`;

  $$('[data-edit]', root).forEach((btn) => (btn.onclick = () => {
    const id = btn.dataset.edit;
    const name = id === '_total' ? 'Overall monthly budget' : state.categories.find((c) => c.id === id)?.name;
    const cur = state.budgets[id] || 0;
    const panel = openSheet(`Budget: ${name}`, `
      <form class="form" id="bf" novalidate>
        <label class="amount-field"><span class="rupee">₹</span><input id="bf-amt" inputmode="decimal" value="${cur ? fromPaise(cur) : ''}" placeholder="0" aria-label="Monthly limit"></label>
        <p class="hint">Monthly limit. Leave empty to remove it.</p>
        <p class="error" id="bf-err" role="alert" hidden></p>
        <div class="row-end"><button type="submit" class="btn btn-primary">Save limit</button></div>
      </form>`);
    $('#bf', panel).onsubmit = (e) => {
      e.preventDefault();
      const raw = $('#bf-amt', panel).value.trim();
      if (!raw) delete state.budgets[id];
      else {
        const v = evalAmount(raw);
        if (!(v > 0)) { const er = $('#bf-err', panel); er.textContent = 'Enter an amount above ₹0, or leave it empty.'; er.hidden = false; return; }
        state.budgets[id] = v;
      }
      ctx.save();
      closeSheet();
      toast(raw ? 'Budget saved' : 'Budget removed');
      ctx.refresh();
    };
  }));
}
