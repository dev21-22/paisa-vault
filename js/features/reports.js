import { esc, money, donut, barChart, emptyState, $, $$ } from '../ui.js';
import { currentPeriod, inRange, totals, byCategory, catMap, dailySpend, spendAmount } from '../calc.js';
import { periodLabel, parseISO, addDays, daysBetween, iso } from '../lib/dates.js';
import { formatINRShort } from '../lib/money.js';
import { periodNav } from '../components.js';

let offset = 0;

export function render(root, ctx) {
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

  $('#rp-prev', root).onclick = () => { offset--; render(root, ctx); };
  $('#rp-next', root).onclick = () => { offset++; render(root, ctx); };
  $$('[data-cat]', root).forEach((b) => (b.onclick = () => ctx.go('transactions', { categoryId: b.dataset.cat, offset })));
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
