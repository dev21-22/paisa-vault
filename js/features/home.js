import { esc, money, icon, progress, emptyState, $, $$, toast } from '../ui.js';
import { currentPeriod, inRange, totals, byCategory, catMap } from '../calc.js';
import { iso, addDays, daysBetween, periodLabel, prettyDate, parseISO } from '../lib/dates.js';
import { txnGroups, bindTxnClicks } from '../components.js';
import { isOn } from '../features.js';
import { save, addTxnFromRecurring } from '../store.js';

export function render(root, ctx) {
  const { state } = ctx;
  const today = iso();
  const period = currentPeriod(state);
  const ptx = inRange(state.txns, period);
  const tot = totals(ptx);
  const cats = catMap(state);

  const todaySpent = totals(state.txns.filter((t) => t.date === today)).expense;
  const weekStart = addDays(today, -((parseISO(today).getDay() + 6) % 7));
  const weekSpent = totals(inRange(state.txns, { start: weekStart, end: today })).expense;

  const daysLeft = daysBetween(today, period.end) + 1;
  const totalBudget = isOn(state, 'budgets') ? state.budgets._total || 0 : 0;

  let budgetCard = '';
  if (totalBudget) {
    const left = totalBudget - tot.expense;
    const perDay = left > 0 ? Math.floor(left / Math.max(daysLeft, 1) / 100) * 100 : 0; // whole rupees
    budgetCard = `
      <div class="card">
        <div class="row-between"><span class="label">Monthly budget</span><span class="muted small">${daysLeft} day${daysLeft === 1 ? '' : 's'} left</span></div>
        <div class="big-num">${money(left, { cls: left < 0 ? 'neg' : '' })} <span class="muted small">${left < 0 ? 'over budget' : 'left'}</span></div>
        ${progress(tot.expense, totalBudget)}
        <p class="muted small">${left > 0 ? `You can spend about <strong>${money(perDay)}</strong> a day and stay within budget.` : 'You have gone over this month\'s budget.'}</p>
      </div>`;
  }

  const bills = isOn(state, 'recurring')
    ? state.recurring.filter((r) => r.active && !r.autoAdd && r.nextDate <= addDays(today, 7)).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1))
    : [];

  const alerts = isOn(state, 'budgets')
    ? byCategory(ptx).filter((x) => state.budgets[x.categoryId] && x.amount >= state.budgets[x.categoryId] * 0.8)
    : [];

  const top = byCategory(ptx).slice(0, 5);
  const topMax = top[0]?.amount || 1;

  const recent = [...state.txns].sort((a, b) => (b.date === a.date ? b.created - a.created : b.date < a.date ? -1 : 1)).slice(0, 8);

  const backupDue = state.txns.length >= 10 && (!state.settings.lastBackup || daysBetween(state.settings.lastBackup.slice(0, 10), today) >= 14);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  root.innerHTML = `
  <div class="stack">
    <p class="greet">${greet}${state.settings.name ? `, ${esc(state.settings.name)}` : ''} · <span class="muted">${esc(periodLabel(period))}</span></p>

    <div class="summary">
      <div class="sum-main">
        <span class="label">Spent this month</span>
        <span class="hero-num">${money(tot.expense)}</span>
      </div>
      <div class="sum-grid">
        <div><span class="label">Income</span><span class="num pos">${money(tot.income)}</span></div>
        <div><span class="label">Saved</span><span class="num ${tot.net < 0 ? 'neg' : ''}">${money(tot.net)}</span></div>
        <div><span class="label">Today</span><span class="num">${money(todaySpent)}</span></div>
        <div><span class="label">This week</span><span class="num">${money(weekSpent)}</span></div>
      </div>
    </div>

    ${backupDue ? `<div class="notice">${icon('shield', 18)}<span>You haven't made a backup in a while. If this phone is lost, a backup is the only way to get your data back.</span><button type="button" class="btn btn-small" id="go-backup">Back up now</button></div>` : ''}

    ${budgetCard}

    ${bills.length ? `<div class="card">
      <h2 class="card-title">${icon('bell', 18)} Bills due soon</h2>
      <div class="bill-list">${bills.map((r) => {
        const overdue = r.nextDate < today;
        return `<div class="bill ${overdue ? 'overdue' : ''}">
          <span class="bill-main"><strong>${esc(r.name)}</strong><span class="muted small">${overdue ? 'Overdue · ' : ''}${esc(prettyDate(r.nextDate))}</span></span>
          <span>${money(r.amount)}</span>
          <button type="button" class="btn btn-small" data-pay="${esc(r.id)}">Mark paid</button>
        </div>`;
      }).join('')}</div></div>` : ''}

    ${alerts.length ? `<div class="card">
      <h2 class="card-title">Budget alerts</h2>
      ${alerts.map((a) => {
        const c = cats[a.categoryId];
        const b = state.budgets[a.categoryId];
        return `<div class="budget-row"><div class="row-between"><span>${esc(c?.icon)} ${esc(c?.name)}</span><span class="small">${money(a.amount)} / ${money(b)}</span></div>${progress(a.amount, b)}</div>`;
      }).join('')}</div>` : ''}

    <div class="card">
      <div class="row-between"><h2 class="card-title">Where it went</h2>${isOn(state, 'reports') ? '<button type="button" class="btn-link" id="go-reports">See reports</button>' : ''}</div>
      ${top.length ? `<div class="cat-bars">${top.map((x) => {
        const c = cats[x.categoryId];
        return `<div class="cat-bar"><span class="cat-name">${esc(c?.icon)} ${esc(c?.name || 'Other')}</span>
          <span class="cat-track"><span style="width:${Math.max(2, (x.amount / topMax) * 100)}%;background:${esc(c?.color)}"></span></span>
          <span class="cat-amt">${money(x.amount)}</span></div>`;
      }).join('')}</div>` : '<p class="muted">No spending yet this month.</p>'}
    </div>

    <div class="card">
      <div class="row-between"><h2 class="card-title">Recent</h2><button type="button" class="btn-link" id="go-all">See all</button></div>
      ${recent.length ? txnGroups(state, recent) : emptyState('No transactions yet', 'Tap the + button to add your first expense. It takes about three taps.', '<button type="button" class="btn btn-primary" id="first-add">Add an expense</button>')}
    </div>
  </div>`;

  bindTxnClicks(root, state, ctx.openTxnForm);
  $('#go-all', root).onclick = () => ctx.go('transactions');
  $('#go-reports', root)?.addEventListener('click', () => ctx.go('reports'));
  $('#go-backup', root)?.addEventListener('click', () => ctx.go('backup'));
  $('#first-add', root)?.addEventListener('click', () => ctx.openTxnForm());
  $$('[data-pay]', root).forEach((b) => (b.onclick = () => {
    const r = state.recurring.find((x) => x.id === b.dataset.pay);
    addTxnFromRecurring(r, today);
    save();
    toast(`${r.name} marked as paid`);
    ctx.refresh();
  }));
}
