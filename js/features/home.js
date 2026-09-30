import { esc, money, icon, progress, emptyState, $, $$, toast } from '../ui.js';
import { currentPeriod, inRange, totals, byCategory, catMap, effectiveBudget, spendingPace, forecast, cardCycle, accountBalances, detectSubscriptions, netWorth } from '../calc.js';
import { iso, addDays, daysBetween, periodLabel, prettyDate, parseISO } from '../lib/dates.js';
import { txnGroups, bindTxnClicks } from '../components.js';
import { isOn } from '../features.js';
import { save, addTxnFromRecurring, uid } from '../store.js';

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
  const tb = isOn(state, 'budgets') ? effectiveBudget(state, '_total') : { total: 0, carry: 0 };
  const totalBudget = tb.total;
  const pace = spendingPace(state, today);

  let budgetCard = '';
  if (totalBudget) {
    const left = totalBudget - tot.expense;
    const perDay = left > 0 ? Math.floor(left / Math.max(daysLeft, 1) / 100) * 100 : 0; // whole rupees
    budgetCard = `
      <div class="card">
        <div class="row-between"><span class="label">Monthly budget</span><span class="muted small">${daysLeft} day${daysLeft === 1 ? '' : 's'} left</span></div>
        <div class="big-num">${money(left, { cls: left < 0 ? 'neg' : '' })} <span class="muted small">${left < 0 ? 'over budget' : 'left'}</span></div>
        ${progress(tot.expense, totalBudget)}
        <p class="muted small">${left > 0 ? `You can spend about <strong>${money(perDay)}</strong> a day and stay within budget.` : 'You have gone over this month\'s budget.'}${tb.carry ? ` Includes ${money(tb.carry)} carried over from last month.` : ''}</p>
        ${pace && pace.projected > totalBudget && left > 0 ? `<p class="small neg">At your current pace you'll spend about ${money(pace.projected)} this month, ${money(pace.projected - totalBudget)} over budget.</p>` : ''}
      </div>`;
  }

  const bills = isOn(state, 'recurring')
    ? state.recurring.filter((r) => r.active && !r.autoAdd && r.nextDate <= addDays(today, 7)).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1))
    : [];

  const alerts = isOn(state, 'budgets')
    ? byCategory(ptx).map((x) => ({ ...x, limit: effectiveBudget(state, x.categoryId).total })).filter((x) => x.limit && x.amount >= x.limit * 0.8)
    : [];

  // Accounts needing attention: card bills due within 7 days, balances under the minimum.
  const accOn = isOn(state, 'accounts');
  const bal = accountBalances(state);
  const cardDues = accOn ? state.accounts.filter((a) => !a.archived).map((a) => ({ a, c: cardCycle(a, state, today) })).filter(({ c }) => c && c.statementDue > 0 && c.daysToDue <= 7) : [];
  const lowBal = accOn ? state.accounts.filter((a) => !a.archived && a.type === 'bank' && a.minBalance && bal[a.id] < a.minBalance) : [];
  const fc = isOn(state, 'recurring') && state.recurring.some((r) => r.active) ? forecast(state, 30, today) : null;
  const subs = isOn(state, 'recurring') ? detectSubscriptions(state, today).slice(0, 3) : [];
  const nw = accOn && state.accounts.filter((a) => !a.archived).length > 1 ? netWorth(state) : null;

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

    ${cardDues.length || lowBal.length ? `<div class="card attention">
      <h2 class="card-title">${icon('bell', 18)} Needs attention</h2>
      <div class="bill-list">
        ${cardDues.map(({ a, c }) => `<div class="bill ${c.daysToDue <= 2 ? 'overdue' : ''}">
          <button type="button" class="bill-main as-link" data-acc="${esc(a.id)}"><strong>${esc(a.name)} bill</strong><span class="muted small">Due ${esc(prettyDate(c.dueDate))}${c.daysToDue < 0 ? ' · overdue' : ''}</span></button>
          <span>${money(c.statementDue)}</span>
          <button type="button" class="btn btn-small" data-paycard="${esc(a.id)}">Pay</button></div>`).join('')}
        ${lowBal.map((a) => `<div class="bill overdue">
          <button type="button" class="bill-main as-link" data-acc="${esc(a.id)}"><strong>${esc(a.name)}</strong><span class="muted small">Below minimum balance of ${money(a.minBalance)}</span></button>
          <span class="neg">${money(bal[a.id])}</span><span></span></div>`).join('')}
      </div></div>` : ''}

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
        const b = a.limit;
        return `<div class="budget-row"><div class="row-between"><span>${esc(c?.icon)} ${esc(c?.name)}</span><span class="small">${money(a.amount)} / ${money(b)}</span></div>${progress(a.amount, b)}</div>`;
      }).join('')}</div>` : ''}

    ${fc && fc.items.length ? `<div class="card">
      <div class="row-between"><h2 class="card-title">Next 30 days</h2><span class="muted small">From your bills &amp; regular income</span></div>
      <div class="kpis kpis-3 kpis-flat">
        <div><span class="label">Coming in</span><span class="num pos">${money(fc.income)}</span></div>
        <div><span class="label">Going out</span><span class="num neg">${money(fc.expense)}</span></div>
        <div><span class="label">Cash after</span><span class="num ${fc.projected < 0 ? 'neg' : ''}">${money(fc.projected)}</span></div>
      </div>
      ${fc.lowest.value < 0 ? `<p class="small neg">Your bank and cash balance may go below zero around ${esc(prettyDate(fc.lowest.date))}. Move money or delay a payment.</p>` : ''}
      <details class="plain"><summary class="small">Show ${fc.items.length} upcoming item${fc.items.length === 1 ? '' : 's'}</summary>
        <ul class="plain-list">${fc.items.slice(0, 20).map((x) => `<li><span>${esc(prettyDate(x.date))} · ${esc(x.name)}</span><span class="${x.type === 'income' ? 'pos' : ''}">${x.type === 'income' ? '+' : '−'}${money(x.amount)}</span></li>`).join('')}</ul>
      </details>
    </div>` : ''}

    ${subs.length ? `<div class="card">
      <h2 class="card-title">${icon('repeat', 18)} Looks like a regular payment</h2>
      <div class="bill-list">${subs.map((x) => `<div class="bill sub-suggest">
        <span class="bill-main"><strong>${esc(x.name)}</strong><span class="muted small">${x.count} payments, about ${esc(x.freq)} · next around ${esc(prettyDate(x.nextDate))}</span></span>
        <span>${money(x.amount)}</span>
        <span class="row-end"><button type="button" class="btn btn-small" data-subadd="${esc(x.key)}">Track</button><button type="button" class="icon-btn" data-subno="${esc(x.key)}" aria-label="Dismiss">${icon('x', 16)}</button></span>
      </div>`).join('')}</div>
      <p class="muted small">Tracking it adds a reminder before each payment and includes it in your forecast.</p>
    </div>` : ''}

    ${nw ? `<button type="button" class="card nw-card" id="go-accounts">
      <span><span class="label">Net worth</span><span class="num">${money(nw.net, { cls: nw.net < 0 ? 'neg' : '' })}</span></span>
      <span class="muted small">Own ${money(nw.assets)} · Owe ${money(nw.liabilities)}</span>
    </button>` : ''}

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
  $('#go-accounts', root)?.addEventListener('click', () => ctx.go('accounts'));
  $$('[data-acc]', root).forEach((b) => (b.onclick = () => ctx.go('accounts', { id: b.dataset.acc })));
  $$('[data-paycard]', root).forEach((b) => (b.onclick = () => {
    const card = state.accounts.find((a) => a.id === b.dataset.paycard);
    const c = cardCycle(card, state, today);
    const from = state.accounts.find((a) => a.type === 'bank' && !a.archived) || state.accounts.find((a) => a.id !== card.id && !a.archived);
    ctx.openTxnForm(null, { type: 'transfer', accountId: from?.id, toAccountId: card.id, amount: c.statementDue, note: `${card.name} bill` });
  }));
  $$('[data-subadd]', root).forEach((b) => (b.onclick = () => {
    const x = subs.find((s) => s.key === b.dataset.subadd);
    state.recurring.push({ id: uid(), name: x.name, type: 'expense', amount: x.amount, categoryId: x.categoryId, accountId: x.accountId, freq: x.freq, nextDate: x.nextDate < today ? today : x.nextDate, anchorDay: parseISO(x.nextDate).getDate(), autoAdd: false, active: true });
    save();
    toast(`${x.name} added to Bills & subscriptions`);
    ctx.refresh();
  }));
  $$('[data-subno]', root).forEach((b) => (b.onclick = () => {
    (state.dismissedSuggestions ||= []).push(b.dataset.subno);
    save();
    ctx.refresh();
  }));
  $$('[data-pay]', root).forEach((b) => (b.onclick = () => {
    const r = state.recurring.find((x) => x.id === b.dataset.pay);
    addTxnFromRecurring(r, today);
    save();
    toast(`${r.name} marked as paid`);
    ctx.refresh();
  }));
}
