import { esc, money, donut, barChart, emptyState, $, $$ } from '../ui.js';
import { currentPeriod, inRange, totals, byCategory, catMap, dailySpend, spendAmount, yearRange, yearReport } from '../calc.js';
import { periodLabel, parseISO, addDays, daysBetween, iso } from '../lib/dates.js';
import { formatINRShort } from '../lib/money.js';
import { periodNav } from '../components.js';

let offset = 0;
let view = 'month'; // or 'year'
let yearOffset = 0;

const viewSwitch = () => `<div class="seg" role="radiogroup" aria-label="Report view">
  <label class="seg-item"><input type="radio" name="rview" value="month" ${view === 'month' ? 'checked' : ''}><span>Month</span></label>
  <label class="seg-item"><input type="radio" name="rview" value="year" ${view === 'year' ? 'checked' : ''}><span>Year</span></label>
</div>`;
const bindViewSwitch = (root, ctx) => $$('input[name=rview]', root).forEach((r) => (r.onchange = () => { view = r.value; render(root, ctx); }));

export function render(root, ctx) {
  if (view === 'year') return renderYear(root, ctx);
  const { state } = ctx;
  const period = currentPeriod(state, offset);
  const prev = currentPeriod(state, offset - 1);
  const ptx = inRange(state.txns, period);
  const prevTx = inRange(state.txns, prev);
  const tot = totals(ptx);
  const prevTot = totals(prevTx);
  const cats = catMap(state);
  const byCat = byCategory(ptx);
  const prevByCat = Object.fromEntries(byCategory(prevTx).map((x) => [x.categoryId, x.amount]));

  // Donut: top 6 + "Everything else"
  const top = byCat.slice(0, 6).map((x) => ({ label: cats[x.categoryId]?.name || 'Other', value: x.amount, color: cats[x.categoryId]?.color || '#888', id: x.categoryId }));
  const rest = byCat.slice(6).reduce((a, x) => a + x.amount, 0);
  if (rest) top.push({ label: 'Everything else', value: rest, color: '#9AA0A8', id: null });

  // Daily bars across the period
  const days = daysBetween(period.start, period.end) + 1;
  const today = iso();
  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(period.start, i);
    const v = ptx.filter((t) => t.date === d && t.type === 'expense').reduce((a, t) => a + spendAmount(t), 0);
    daily.push({ label: String(parseISO(d).getDate()), value: v, highlight: d === today, title: `${d}: ${formatINRShort(v)}` });
  }
  const elapsed = Math.max(1, Math.min(days, daysBetween(period.start, today) + 1));
  const avgPerDay = offset < 0 ? Math.round(tot.expense / days) : Math.round(tot.expense / elapsed);

  // Last 6 periods
  const trend = [];
  for (let k = -5; k <= 0; k++) {
    const p = currentPeriod(state, offset + k);
    const t = totals(inRange(state.txns, p));
    trend.push({ p, ...t });
  }
  const trendMax = Math.max(1, ...trend.flatMap((t) => [t.income, t.expense]));

  // Insights
  const insights = [];
  if (prevTot.expense > 0 && tot.expense > 0) {
    const ch = Math.round(((tot.expense - prevTot.expense) / prevTot.expense) * 100);
    insights.push(ch > 0 ? `Spending is <strong class="neg">${ch}% higher</strong> than last month.` : ch < 0 ? `Spending is <strong class="pos">${-ch}% lower</strong> than last month.` : 'Spending is the same as last month.');
  }
  if (tot.income > 0) {
    const rate = Math.round((tot.net / tot.income) * 100);
    insights.push(`You saved <strong>${rate}%</strong> of your income${rate >= 20 ? ', which is a healthy rate' : ''}.`);
  }
  if (byCat[0] && tot.expense) insights.push(`<strong>${esc(cats[byCat[0].categoryId]?.name)}</strong> took ${Math.round((byCat[0].amount / tot.expense) * 100)}% of your spending.`);
  const jumps = byCat.map((x) => ({ ...x, diff: x.amount - (prevByCat[x.categoryId] || 0) })).filter((x) => x.diff > 0 && prevByCat[x.categoryId]).sort((a, b) => b.diff - a.diff);
  if (jumps[0]) insights.push(`Biggest increase: <strong>${esc(cats[jumps[0].categoryId]?.name)}</strong>, up ${money(jumps[0].diff)}.`);
  const biggest = ptx.filter((t) => t.type === 'expense').sort((a, b) => spendAmount(b) - spendAmount(a))[0];
  if (biggest) insights.push(`Largest expense: ${money(spendAmount(biggest))}${biggest.note ? ` for ${esc(biggest.note)}` : ''}.`);
  const wd = Array(7).fill(0);
  ptx.filter((t) => t.type === 'expense').forEach((t) => (wd[parseISO(t.date).getDay()] += spendAmount(t)));
  const maxWd = wd.indexOf(Math.max(...wd));
  if (wd[maxWd] > 0) insights.push(`You spend the most on <strong>${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][maxWd]}</strong>.`);

  // By account
  const accs = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const accSpend = new Map();
  ptx.filter((t) => t.type === 'expense' && t.accountId).forEach((t) => accSpend.set(t.accountId, (accSpend.get(t.accountId) || 0) + spendAmount(t)));
  const byAcc = [...accSpend.entries()].sort((a, b) => b[1] - a[1]);

  // Tags
  const tagMap = new Map();
  ptx.filter((t) => t.type === 'expense').forEach((t) => (t.tags || []).forEach((g) => tagMap.set(g, (tagMap.get(g) || 0) + spendAmount(t))));
  const tags = [...tagMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  root.innerHTML = `
  <div class="stack">
    ${viewSwitch()}
    ${periodNav(periodLabel(period), 'rp')}

    <div class="kpis">
      <div class="kpi"><span class="label">Spent</span><span class="num">${money(tot.expense)}</span></div>
      <div class="kpi"><span class="label">Income</span><span class="num pos">${money(tot.income)}</span></div>
      <div class="kpi"><span class="label">Saved</span><span class="num ${tot.net < 0 ? 'neg' : ''}">${money(tot.net)}</span></div>
      <div class="kpi"><span class="label">Per day</span><span class="num">${money(avgPerDay)}</span></div>
    </div>

    ${ptx.length === 0 ? emptyState('No data for this month', 'Add some transactions and your charts will appear here.') : `
    <div class="report-grid">
      <div class="card">
        <h2 class="card-title">Spending by category</h2>
        ${byCat.length ? `<div class="donut-wrap">
          ${donut(top, { centerTop: `<tspan class="amt">${esc(formatINRShort(tot.expense))}</tspan>`, centerBottom: 'spent' })}
          <ul class="legend">${top.map((x) => `<li>
            <button type="button" class="legend-item" ${x.id ? `data-cat="${esc(x.id)}"` : 'disabled'}>
              <span class="dot" style="background:${esc(x.color)}"></span><span class="legend-name">${esc(x.label)}</span>
              <span class="legend-val">${money(x.value)}</span><span class="muted small">${Math.round((x.value / tot.expense) * 100)}%</span>
            </button></li>`).join('')}</ul>
        </div>` : '<p class="muted">No expenses this month.</p>'}
      </div>

      <div class="card">
        <h2 class="card-title">Insights</h2>
        <ul class="insights">${insights.map((i) => `<li>${i}</li>`).join('') || '<li class="muted">Add more data to see insights.</li>'}</ul>
      </div>
    </div>

    <div class="card">
      <div class="row-between"><h2 class="card-title">Daily spending</h2><span class="muted small">Dashed line = daily average</span></div>
      <div class="chart-scroll">${barChart(daily, { labelEvery: days > 20 ? 3 : 1, avgLine: avgPerDay })}</div>
    </div>`}

    <div class="card">
      <h2 class="card-title">Last 6 months</h2>
      <div class="trend">${trend.map((t) => `
        <div class="trend-col" title="${esc(periodLabel(t.p))}">
          <div class="trend-bars">
            <span class="tb in" style="height:${(t.income / trendMax) * 100}%"></span>
            <span class="tb out" style="height:${(t.expense / trendMax) * 100}%"></span>
          </div>
          <span class="trend-label">${esc(parseISO(t.p.start).toLocaleDateString('en-IN', { month: 'short' }))}</span>
          <span class="trend-val amt">${esc(formatINRShort(t.expense))}</span>
        </div>`).join('')}</div>
      <div class="legend-inline"><span><i class="sw in"></i>Income</span><span><i class="sw out"></i>Expenses</span></div>
    </div>

    ${ptx.length ? calendar(period, dailySpend(ptx, period), today) : ''}

    ${byAcc.length > 1 ? `<div class="card"><h2 class="card-title">Spending by account</h2>
      <div class="cat-bars">${byAcc.map(([id, v]) => `<div class="cat-bar"><span class="cat-name">${esc(accs[id]?.name || '?')}</span>
        <span class="cat-track"><span style="width:${Math.max(2, (v / byAcc[0][1]) * 100)}%;background:${esc(accs[id]?.color || 'var(--accent)')}"></span></span>
        <span class="cat-amt">${money(v)}</span></div>`).join('')}</div></div>` : ''}

    ${tags.length ? `<div class="card"><h2 class="card-title">By tag</h2>
      <div class="tag-list">${tags.map(([g, v]) => `<span class="tag-pill">#${esc(g)} ${money(v)}</span>`).join('')}</div></div>` : ''}
  </div>`;

  bindViewSwitch(root, ctx);
  $('#rp-prev', root).onclick = () => { offset--; render(root, ctx); };
  $('#rp-next', root).onclick = () => { offset++; render(root, ctx); };
  $$('[data-cat]', root).forEach((b) => (b.onclick = () => ctx.go('transactions', { categoryId: b.dataset.cat, offset })));
}

// The whole year at a glance: totals, a fair comparison with last year, month by month,
// categories against last year and the places you spend most.
function renderYear(root, ctx) {
  const { state } = ctx;
  const fy = !!state.settings.financialYear;
  const range = yearRange(fy, yearOffset);
  const r = yearReport(state, range);
  const cats = catMap(state);
  const running = r.win.end < range.end;
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const spendCh = pct(r.tot.expense, r.prevTot.expense);
  const incomeCh = pct(r.tot.income, r.prevTot.income);
  const monthsWithData = Math.max(1, r.elapsedMonths);
  const versus = running ? 'the same months last year' : 'last year';
  // Whole rupees read better over a year (₹3,04,545, not ₹3,04,544.3).
  const rs = (p, opts) => money(Math.round(p / 100) * 100, opts);

  const insights = [];
  if (r.hasPrev && spendCh !== null) {
    insights.push(spendCh > 0 ? `You spent <strong class="neg">${spendCh}% more</strong> than ${versus} (${rs(r.prevTot.expense)}).`
      : spendCh < 0 ? `You spent <strong class="pos">${-spendCh}% less</strong> than ${versus} (${rs(r.prevTot.expense)}).`
        : `You spent the same as ${versus}.`);
  }
  if (r.hasPrev && incomeCh !== null && r.tot.income) {
    insights.push(incomeCh > 0 ? `Income is <strong class="pos">up ${incomeCh}%</strong> on ${versus}.`
      : incomeCh < 0 ? `Income is <strong class="neg">down ${-incomeCh}%</strong> on ${versus}.` : `Income is the same as ${versus}.`);
  }
  if (r.tot.income > 0) {
    const rate = Math.round((r.tot.net / r.tot.income) * 100);
    insights.push(`You saved <strong>${rate}%</strong> of your income${rate >= 20 ? ', which is a healthy rate' : ''}.`);
  }
  if (r.highest) insights.push(`Most expensive month: <strong>${esc(r.highest.label)}</strong>, ${rs(r.highest.expense)}.`);
  if (r.lowest) insights.push(`Lightest month: <strong>${esc(r.lowest.label)}</strong>, ${rs(r.lowest.expense)}.`);
  if (r.tot.expense) insights.push(`<strong>${r.noSpendDays}</strong> no-spend day${r.noSpendDays === 1 ? '' : 's'} so far.`);

  const max = Math.max(1, ...r.months.flatMap((m) => [m.income, m.expense]));
  const catMax = Math.max(1, ...r.byCat.map((x) => x.amount));
  const change = (now, before) => {
    if (!r.hasPrev) return '';
    if (!before) return '<span class="pill">new</span>';
    const c = pct(now, before);
    return `<span class="change ${c > 0 ? 'neg' : c < 0 ? 'pos' : 'neutral'}">${c > 0 ? '▲' : c < 0 ? '▼' : ''}${Math.abs(c)}%</span>`;
  };

  root.innerHTML = `
  <div class="stack">
    ${viewSwitch()}
    ${periodNav(range.label, 'ry')}
    <div class="seg seg-small year-kind" role="radiogroup" aria-label="Kind of year">
      <label class="seg-item"><input type="radio" name="ykind" value="cal" ${fy ? '' : 'checked'}><span>Jan–Dec</span></label>
      <label class="seg-item"><input type="radio" name="ykind" value="fy" ${fy ? 'checked' : ''}><span>Financial year (Apr–Mar)</span></label>
    </div>

    <div class="kpis">
      <div class="kpi"><span class="label">Spent</span><span class="num">${rs(r.tot.expense)}</span></div>
      <div class="kpi"><span class="label">Income</span><span class="num pos">${rs(r.tot.income)}</span></div>
      <div class="kpi"><span class="label">Saved</span><span class="num ${r.tot.net < 0 ? 'neg' : ''}">${rs(r.tot.net)}</span></div>
      <div class="kpi"><span class="label">Per month</span><span class="num">${rs(Math.round(r.tot.expense / monthsWithData))}</span></div>
    </div>

    ${!r.tot.expense && !r.tot.income ? emptyState('No data for this year', 'Entries from this year will show up here.') : `
    <div class="card">
      <h2 class="card-title">${running ? 'So far this year' : 'The year in short'}</h2>
      <ul class="insights">${insights.map((i) => `<li>${i}</li>`).join('')}</ul>
    </div>

    <div class="card">
      <h2 class="card-title">Month by month</h2>
      <div class="trend trend-year">${r.months.map((m) => `
        <div class="trend-col ${m.future ? 'future' : ''}" title="${esc(m.label)}: spent ${esc(formatINRShort(m.expense))}, income ${esc(formatINRShort(m.income))}">
          <div class="trend-bars">
            <span class="tb in" style="height:${(m.income / max) * 100}%"></span>
            <span class="tb out" style="height:${(m.expense / max) * 100}%"></span>
          </div>
          <span class="trend-label">${esc(m.label)}</span>
          <span class="trend-val amt">${m.expense ? esc(formatINRShort(m.expense).replace('₹', '')) : ''}</span>
        </div>`).join('')}</div>
      <div class="legend-inline"><span><i class="sw in"></i>Income</span><span><i class="sw out"></i>Expenses</span></div>
    </div>

    ${r.byCat.length ? `<div class="card">
      <div class="row-between"><h2 class="card-title">Categories</h2>${r.hasPrev ? `<span class="muted small">vs ${esc(versus)}</span>` : ''}</div>
      <div class="cat-bars">${r.byCat.slice(0, 10).map((x) => `<div class="cat-bar">
        <span class="cat-name">${esc(cats[x.categoryId]?.icon || '')} ${esc(cats[x.categoryId]?.name || 'Other')}</span>
        <span class="cat-track"><span style="width:${Math.max(2, (x.amount / catMax) * 100)}%;background:${esc(cats[x.categoryId]?.color || 'var(--accent)')}"></span></span>
        <span class="cat-amt">${rs(x.amount)} ${change(x.amount, x.prev)}</span></div>`).join('')}</div>
    </div>` : ''}

    ${r.merchants.length ? `<div class="card">
      <h2 class="card-title">Where you spend most</h2>
      <div class="merchant-list">${r.merchants.map((m, i) => `
        <button type="button" class="merchant" data-q="${esc(m.name)}">
          <span class="merchant-rank">${i + 1}</span>
          <span class="txn-main"><span class="txn-title">${esc(m.name)}</span><span class="txn-sub">${m.count} time${m.count === 1 ? '' : 's'} · about ${rs(Math.round(m.amount / m.count))} each</span></span>
          <span class="txn-amt">${rs(m.amount)}</span>
        </button>`).join('')}</div>
      <p class="muted small">Grouped by the note on each entry. Tap one to see every entry.</p>
    </div>` : ''}`}
  </div>`;

  bindViewSwitch(root, ctx);
  $('#ry-prev', root).onclick = () => { yearOffset--; render(root, ctx); };
  $('#ry-next', root).onclick = () => { yearOffset++; render(root, ctx); };
  $$('input[name=ykind]', root).forEach((x) => (x.onchange = () => {
    state.settings.financialYear = x.value === 'fy';
    ctx.save();
    render(root, ctx);
  }));
  $$('[data-q]', root).forEach((b) => (b.onclick = () => ctx.go('transactions', { q: b.dataset.q })));
}

// Month calendar, each day shaded by how much was spent.
function calendar(period, spend, today) {
  const days = daysBetween(period.start, period.end) + 1;
  const max = Math.max(1, ...Object.values(spend));
  const lead = (parseISO(period.start).getDay() + 6) % 7; // Monday first
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell empty"></span>');
  for (let i = 0; i < days; i++) {
    const d = addDays(period.start, i);
    const v = spend[d] || 0;
    const level = v ? Math.min(4, Math.ceil((v / max) * 4)) : 0;
    const future = d > today;
    cells.push(`<span class="cal-cell l${level} ${d === today ? 'today' : ''} ${future ? 'future' : ''}" title="${esc(d)}: ${esc(formatINRShort(v))}">
      <span class="cal-day">${parseISO(d).getDate()}</span>${v ? `<span class="cal-amt amt">${esc(formatINRShort(v).replace('₹', ''))}</span>` : ''}</span>`);
  }
  const noSpend = Array.from({ length: days }, (_, i) => addDays(period.start, i)).filter((d) => d <= today && !spend[d]).length;
  return `<div class="card">
    <div class="row-between"><h2 class="card-title">Spending calendar</h2><span class="muted small">${noSpend} no-spend day${noSpend === 1 ? '' : 's'}</span></div>
    <div class="cal-head">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span>${x}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    <div class="legend-inline"><span>Less</span><i class="cal-key l1"></i><i class="cal-key l2"></i><i class="cal-key l3"></i><i class="cal-key l4"></i><span>More</span></div>
  </div>`;
}
