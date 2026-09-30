import { esc, money, icon, openSheet, closeSheet, toast, confirmSheet, progress, lineChart, emptyState, $, $$ } from '../ui.js';
import { accountBalances, evalAmount, netWorth, netWorthHistory, balanceSeries, cardCycle, isLiability, inRange, currentPeriod, totals } from '../calc.js';
import { uid, account } from '../store.js';
import { fromPaise, formatINRShort } from '../lib/money.js';
import { iso, prettyDate, parseISO } from '../lib/dates.js';
import { txnGroups, bindTxnClicks } from '../components.js';
import { openStatementImport } from '../import-statement.js';

export const TYPES = {
  bank: 'Bank account', card: 'Credit card', cash: 'Cash', upi: 'UPI / wallet',
  loan: 'Loan', investment: 'Investment / FD / savings', other: 'Other',
};
const GROUPS = [
  ['Bank accounts', ['bank']],
  ['Credit cards', ['card']],
  ['Cash & wallets', ['cash', 'upi']],
  ['Investments', ['investment']],
  ['Loans', ['loan']],
  ['Other', ['other']],
];
const COLORS = ['#3F7AE0', '#2E9E63', '#8C6BD1', '#E07A3F', '#D4A017', '#1F7A8C', '#C850C0', '#D9534F', '#5A7BB5', '#7A6A58'];

let showClosed = false;

export function render(root, ctx) {
  if (ctx.params.id && ctx.state.accounts.some((a) => a.id === ctx.params.id)) return renderDetail(root, ctx, ctx.params.id);
  const { state } = ctx;
  const bal = accountBalances(state);
  const nw = netWorth(state);
  const hist = netWorthHistory(state, 12);
  const active = state.accounts.filter((a) => !a.archived);
  const closed = state.accounts.filter((a) => a.archived);

  const row = (a) => {
    const b = bal[a.id];
    const cyc = cardCycle(a, state);
    let extra = '';
    if (cyc) {
      extra = `<span class="small ${cyc.statementDue > 0 && cyc.daysToDue <= 5 ? 'neg' : 'muted'}">${cyc.statementDue > 0 ? `${money(cyc.statementDue)} due ${esc(prettyDate(cyc.dueDate))}` : 'No bill due'}</span>
        ${a.creditLimit ? progress(cyc.outstanding, a.creditLimit, { warnAt: 0.3 }) : ''}`;
    } else if (a.minBalance && b < a.minBalance) {
      extra = `<span class="small neg">Below minimum balance of ${money(a.minBalance)}</span>`;
    }
    return `<button type="button" class="acc" data-acc="${esc(a.id)}">
      <span class="acc-dot" style="background:${esc(a.color || 'var(--accent)')}"></span>
      <span class="acc-main"><strong>${esc(a.name)}</strong>
        <span class="muted small">${esc(a.bank || TYPES[a.type] || 'Other')}${a.last4 ? ` ··${esc(String(a.last4).slice(-4))}` : ''}</span>${extra}</span>
      <span class="acc-bal">${isLiability(a) ? money(-Math.min(0, b), { cls: b < 0 ? 'neg' : '' }) : money(b, { cls: b < 0 ? 'neg' : '' })}${isLiability(a) ? '<span class="muted small">owed</span>' : ''}</span>
    </button>`;
  };

  root.innerHTML = `
  <div class="stack">
    <div class="card">
      <div class="row-between"><h2 class="card-title">Net worth</h2><span class="muted small">What you own minus what you owe</span></div>
      <div class="big-num">${money(nw.net, { cls: nw.net < 0 ? 'neg' : '' })}</div>
      <div class="kpis kpis-2 kpis-flat">
        <div><span class="label">You own</span><span class="num">${money(nw.assets)}</span></div>
        <div><span class="label">You owe</span><span class="num ${nw.liabilities ? 'neg' : ''}">${money(nw.liabilities)}</span></div>
      </div>
      ${state.txns.length ? `<div class="chart-scroll">${lineChart(hist.map((h) => ({ label: parseISO(h.period.start).toLocaleDateString('en-IN', { month: 'short' }), value: h.net })), { labelEvery: 2 })}</div>` : ''}
    </div>

    <div class="row-wrap">
      <button type="button" class="btn btn-primary" id="acc-add">${icon('plus', 18)} Add account</button>
      <button type="button" class="btn" id="acc-transfer">${icon('swap', 18)} Transfer</button>
      <button type="button" class="btn" id="acc-import">${icon('upload', 18)} Import statement</button>
    </div>

    ${GROUPS.map(([title, types]) => {
      const list = active.filter((a) => types.includes(a.type));
      if (!list.length) return '';
      const sum = list.reduce((s, a) => s + bal[a.id], 0);
      return `<div class="card">
        <div class="row-between"><h2 class="card-title">${esc(title)}</h2><span class="small">${money(types.includes('card') || types.includes('loan') ? -Math.min(0, sum) : sum)}</span></div>
        <div class="acc-list">${list.map(row).join('')}</div>
      </div>`;
    }).join('')}

    ${closed.length ? `<details class="filters" ${showClosed ? 'open' : ''} id="acc-closed"><summary>Closed accounts (${closed.length})</summary><div class="acc-list">${closed.map(row).join('')}</div></details>` : ''}

    <p class="muted small">Tip: add the last 4 digits of each account and card. Then "Paste bank SMS" picks the right account automatically.</p>
  </div>`;

  $('#acc-add', root).onclick = () => edit(ctx, null);
  $('#acc-transfer', root).onclick = () => ctx.openTxnForm(null, { type: 'transfer' });
  $('#acc-import', root).onclick = () => openStatementImport(ctx, active.find((a) => a.type === 'bank')?.id);
  $('#acc-closed', root)?.addEventListener('toggle', (e) => { showClosed = e.target.open; });
  $$('[data-acc]', root).forEach((b) => (b.onclick = () => ctx.go('accounts', { id: b.dataset.acc })));
}

function renderDetail(root, ctx, id) {
  const { state } = ctx;
  const a = state.accounts.find((x) => x.id === id);
  const bal = accountBalances(state)[a.id];
  const cyc = cardCycle(a, state);
  const period = currentPeriod(state);
  const mine = state.txns.filter((t) => t.accountId === a.id || t.toAccountId === a.id);
  const pt = inRange(mine.filter((t) => t.accountId === a.id), period);
  const tot = totals(pt);
  const series = balanceSeries(state, a.id, 90);
  const vals = series.map((p) => (isLiability(a) ? -p.value : p.value));
  const recent = [...mine].sort((x, y) => (y.date === x.date ? y.created - x.created : y.date < x.date ? -1 : 1)).slice(0, 12);
  const liab = isLiability(a);

  root.innerHTML = `
  <div class="stack">
    <button type="button" class="btn-link" id="acc-back">${icon('chevL', 16)} All accounts</button>
    <div class="card acc-hero" style="--acc:${esc(a.color || 'var(--accent)')}">
      <div class="row-between">
        <div><h2 class="card-title">${esc(a.name)}${a.archived ? ' <span class="pill">Closed</span>' : ''}</h2>
          <span class="muted small">${esc(TYPES[a.type] || '')}${a.bank ? ` · ${esc(a.bank)}` : ''}${a.last4 ? ` · ··${esc(String(a.last4).slice(-4))}` : ''}</span></div>
        <button type="button" class="btn btn-small" id="acc-edit">${icon('edit', 16)} Edit</button>
      </div>
      <div><span class="label">${liab ? 'Outstanding' : 'Balance'}</span>
        <div class="big-num">${liab ? money(-Math.min(0, bal), { cls: bal < 0 ? 'neg' : '' }) : money(bal, { cls: bal < 0 ? 'neg' : '' })}</div></div>
      ${a.minBalance && !liab ? `<p class="small ${bal < a.minBalance ? 'neg' : 'muted'}">Minimum balance ${money(a.minBalance)}${bal < a.minBalance ? `, short by ${money(a.minBalance - bal)}` : ''}</p>` : ''}
      ${cyc ? `
        <div class="grid-3 card-cycle">
          <div><span class="label">Bill due</span><span class="num ${cyc.statementDue && cyc.daysToDue <= 5 ? 'neg' : ''}">${money(cyc.statementDue)}</span><span class="muted small">by ${esc(prettyDate(cyc.dueDate))}</span></div>
          <div><span class="label">Unbilled</span><span class="num">${money(cyc.unbilled)}</span><span class="muted small">next bill ${esc(prettyDate(cyc.nextStatement))}</span></div>
          ${a.creditLimit ? `<div><span class="label">Limit used</span><span class="num">${Math.round(cyc.utilisation * 100)}%</span><span class="muted small">${money(a.creditLimit - cyc.outstanding)} available</span></div>` : ''}
        </div>
        ${a.creditLimit ? progress(cyc.outstanding, a.creditLimit, { warnAt: 0.3 }) : ''}
        ${a.creditLimit && cyc.utilisation > 0.3 ? '<p class="small muted">Keeping card use under 30% of the limit helps your credit score.</p>' : ''}` : ''}
      <div class="row-wrap">
        <button type="button" class="btn btn-small btn-primary" id="acc-new">${icon('plus', 16)} Add entry</button>
        ${a.type === 'card' ? `<button type="button" class="btn btn-small" id="acc-pay">Pay card bill</button>` : `<button type="button" class="btn btn-small" id="acc-tr">${icon('swap', 16)} Transfer</button>`}
        <button type="button" class="btn btn-small" id="acc-rec">${icon('check', 16)} Update balance</button>
        <button type="button" class="btn btn-small" id="acc-imp">${icon('upload', 16)} Import statement</button>
      </div>
    </div>

    <div class="kpis kpis-2">
      <div class="kpi"><span class="label">${liab ? 'Spent on it' : 'Money out'} this month</span><span class="num">${money(tot.expense)}</span></div>
      <div class="kpi"><span class="label">Money in this month</span><span class="num pos">${money(tot.income)}</span></div>
    </div>

    <div class="card">
      <h2 class="card-title">${liab ? 'Amount owed' : 'Balance'}, last 90 days</h2>
      <div class="chart-scroll">${lineChart(series.map((p, i) => ({ label: i % 30 === 0 ? parseISO(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '', value: liab ? -p.value : p.value })), { color: a.color || 'var(--accent)' })}</div>
      <p class="muted small">Lowest ${esc(formatINRShort(Math.min(...vals)))} · Highest ${esc(formatINRShort(Math.max(...vals)))}</p>
    </div>

    <div class="card">
      <div class="row-between"><h2 class="card-title">Recent</h2>${mine.length > recent.length ? '<button type="button" class="btn-link" id="acc-all">See all</button>' : ''}</div>
      ${recent.length ? txnGroups(state, recent) : emptyState('No entries yet', 'Add an entry or import a statement for this account.')}
    </div>
  </div>`;

  bindTxnClicks(root, state, ctx.openTxnForm);
  $('#acc-back', root).onclick = () => ctx.go('accounts');
  $('#acc-edit', root).onclick = () => edit(ctx, a);
  $('#acc-new', root).onclick = () => ctx.openTxnForm(null, { accountId: a.id });
  $('#acc-tr', root)?.addEventListener('click', () => ctx.openTxnForm(null, { type: 'transfer', accountId: a.id }));
  $('#acc-pay', root)?.addEventListener('click', () => {
    const from = state.accounts.find((x) => x.type === 'bank' && !x.archived) || state.accounts.find((x) => x.id !== a.id && !x.archived);
    ctx.openTxnForm(null, { type: 'transfer', accountId: from?.id, toAccountId: a.id, amount: cyc?.statementDue || cyc?.outstanding || 0, note: `${a.name} bill` });
  });
  $('#acc-rec', root).onclick = () => reconcile(ctx, a, bal);
  $('#acc-imp', root).onclick = () => openStatementImport(ctx, a.id);
  $('#acc-all', root)?.addEventListener('click', () => ctx.go('transactions', { accountId: a.id }));
}

// "My bank app says the balance is X" -> add a correction for the difference.
function reconcile(ctx, a, appBal) {
  const liab = isLiability(a);
  const panel = openSheet(`Update balance · ${a.name}`, `
    <form class="form" id="rc" novalidate>
      <p class="muted">Open your bank app and enter the ${liab ? 'outstanding amount' : 'balance'} it shows. If it differs from Paisa Vault, a correction is added so both match. Corrections don't count as spending or income.</p>
      <p>Paisa Vault shows: <strong>${liab ? money(-Math.min(0, appBal)) : money(appBal)}</strong></p>
      <label class="amount-field"><span class="rupee">₹</span><input id="rc-amt" inputmode="decimal" placeholder="${liab ? 'Outstanding' : 'Balance'}" aria-label="Actual balance"></label>
      <p class="hint" id="rc-diff" aria-live="polite"></p>
      <label class="field"><span class="label">As of</span><input id="rc-date" type="date" value="${iso()}"></label>
      <p class="error" id="rc-err" role="alert" hidden></p>
      <div class="row-end"><button type="submit" class="btn btn-primary">Save</button></div>
    </form>`);
  const actual = () => {
    const v = evalAmount($('#rc-amt', panel).value);
    return isNaN(v) ? NaN : liab ? -Math.abs(v) : v;
  };
  $('#rc-amt', panel).oninput = () => {
    const v = actual();
    const date = $('#rc-date', panel).value;
    const base = accountBalances(ctx.state, date)[a.id];
    $('#rc-diff', panel).textContent = isNaN(v) ? '' : v === base ? 'Already matches. Nothing to change.' : `Correction of ${v - base > 0 ? '+' : '−'}₹${fromPaise(Math.abs(v - base)).toLocaleString('en-IN')} will be added.`;
  };
  $('#rc', panel).onsubmit = (e) => {
    e.preventDefault();
    const v = actual();
    if (isNaN(v)) { const er = $('#rc-err', panel); er.textContent = 'Enter the balance as a number.'; er.hidden = false; return; }
    const date = $('#rc-date', panel).value || iso();
    const diff = v - accountBalances(ctx.state, date)[a.id];
    closeSheet();
    if (!diff) { toast('Balance already matches'); return; }
    ctx.state.txns.push({ id: uid(), type: 'adjustment', amount: diff, categoryId: null, accountId: a.id, toAccountId: null, date, note: 'Balance correction', tags: [], created: Date.now() });
    ctx.save();
    toast('Balance updated');
    ctx.refresh();
  };
}

function edit(ctx, acc) {
  const { state } = ctx;
  const a = acc || account('', 'bank', COLORS[state.accounts.length % COLORS.length]);
  let color = a.color || COLORS[0];
  const liabOpening = isLiability(a) ? -a.opening : a.opening;
  const days = (sel) => `<option value="0">Not set</option>${Array.from({ length: 31 }, (_, i) => i + 1).map((d) => `<option value="${d}" ${sel === d ? 'selected' : ''}>${d}</option>`).join('')}`;
  const panel = openSheet(acc ? 'Edit account' : 'Add account', `
    <form class="form" id="af" novalidate>
      <div class="grid-2">
        <label class="field"><span class="label">Type</span><select id="af-type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Name</span><input id="af-name" maxlength="40" value="${esc(a.name)}" placeholder="e.g. Salary account"></label>
        <label class="field" data-show="bank card loan investment"><span class="label">Bank</span><input id="af-bank" maxlength="40" list="af-banks" value="${esc(a.bank || '')}" placeholder="e.g. HDFC Bank"></label>
        <label class="field" data-show="bank card upi loan"><span class="label">Last 4 digits</span><input id="af-last4" inputmode="numeric" maxlength="4" pattern="\\d{4}" value="${esc(a.last4 || '')}" placeholder="1234"></label>
        <label class="field"><span class="label" id="af-open-label">Opening balance ₹</span><input id="af-open" inputmode="decimal" value="${liabOpening ? fromPaise(liabOpening) : ''}" placeholder="0"></label>
        <label class="field" data-show="bank"><span class="label">Minimum balance ₹</span><input id="af-min" inputmode="decimal" value="${a.minBalance ? fromPaise(a.minBalance) : ''}" placeholder="e.g. 10000"></label>
        <label class="field" data-show="card"><span class="label">Credit limit ₹</span><input id="af-limit" inputmode="decimal" value="${a.creditLimit ? fromPaise(a.creditLimit) : ''}"></label>
        <label class="field" data-show="card"><span class="label">Statement date (day)</span><select id="af-sd">${days(a.statementDay)}</select></label>
        <label class="field" data-show="card"><span class="label">Payment due date (day)</span><select id="af-dd">${days(a.dueDay)}</select></label>
      </div>
      <datalist id="af-banks">${['SBI', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Bank of Baroda', 'Punjab National Bank', 'Canara Bank', 'Union Bank of India', 'IDFC FIRST Bank', 'IndusInd Bank', 'Yes Bank', 'AU Small Finance Bank', 'Federal Bank', 'Bank of India', 'Indian Bank', 'Paytm Payments Bank', 'Airtel Payments Bank', 'India Post Payments Bank', 'Jupiter', 'Fi'].map((b) => `<option value="${b}"></option>`).join('')}</datalist>
      <p class="hint" id="af-open-hint"></p>
      <div class="field"><span class="label">Colour</span><div class="pick-grid">${COLORS.map((c) => `<button type="button" class="pick swatch ${c === color ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}</div></div>
      <label class="check"><input type="checkbox" id="af-nw" ${a.includeInNetWorth !== false ? 'checked' : ''}> Count in net worth</label>
      ${acc ? `<label class="check"><input type="checkbox" id="af-arch" ${a.archived ? 'checked' : ''}> Account closed (hide it, keep its history)</label>` : ''}
      <p class="error" id="af-err" role="alert" hidden></p>
      <div class="row-between">
        ${acc ? `<button type="button" class="btn btn-danger-ghost" id="af-del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);

  const syncType = () => {
    const type = $('#af-type', panel).value;
    $$('[data-show]', panel).forEach((el) => (el.hidden = !el.dataset.show.split(' ').includes(type)));
    const liab = ['card', 'loan'].includes(type);
    $('#af-open-label', panel).textContent = liab ? 'Amount owed now ₹' : 'Current balance ₹';
    $('#af-open-hint', panel).textContent = acc ? 'Changing this shifts every balance for this account.'
      : liab ? 'What you owe today. Leave empty if nothing is due.' : 'The balance today. Add past entries later or import a statement.';
  };
  $('#af-type', panel).onchange = syncType;
  syncType();
  $$('[data-c]', panel).forEach((b) => (b.onclick = () => { color = b.dataset.c; $$('[data-c]', panel).forEach((x) => x.classList.toggle('on', x === b)); }));

  const err = (m) => { const e = $('#af-err', panel); e.textContent = m; e.hidden = false; };
  const num = (sel) => { const raw = $(sel, panel).value.trim(); return raw ? evalAmount(raw) : 0; };
  $('#af', panel).onsubmit = (e) => {
    e.preventDefault();
    const type = $('#af-type', panel).value;
    const name = $('#af-name', panel).value.trim();
    const last4 = $('#af-last4', panel).value.trim();
    if (!name) return err('Give the account a name.');
    if (last4 && !/^\d{4}$/.test(last4)) return err('Last 4 digits must be exactly 4 numbers.');
    const open = num('#af-open');
    if (isNaN(open)) return err('Balance must be a number.');
    const minBalance = num('#af-min');
    const creditLimit = num('#af-limit');
    if (isNaN(minBalance) || isNaN(creditLimit)) return err('Check the amounts.');
    if (last4 && state.accounts.some((x) => x.id !== a.id && !x.archived && x.last4 === last4)) return err('Another account already uses these last 4 digits.');
    const liab = ['card', 'loan'].includes(type);
    const rec = {
      ...a, name, type, color, last4,
      bank: $('#af-bank', panel).value.trim(),
      opening: liab ? -Math.abs(open) : open,
      minBalance: type === 'bank' ? minBalance : 0,
      creditLimit: type === 'card' ? creditLimit : 0,
      statementDay: type === 'card' ? +$('#af-sd', panel).value : 0,
      dueDay: type === 'card' ? +$('#af-dd', panel).value : 0,
      includeInNetWorth: $('#af-nw', panel).checked,
      archived: acc ? $('#af-arch', panel).checked : false,
    };
    if (acc) Object.assign(acc, rec); else state.accounts.push(rec);
    ctx.save();
    closeSheet();
    toast('Account saved');
    ctx.refresh();
  };
  $('#af-del', panel)?.addEventListener('click', async () => {
    const used = state.txns.some((t) => t.accountId === acc.id || t.toAccountId === acc.id) || state.recurring.some((r) => r.accountId === acc.id);
    if (used) {
      await confirmSheet('This account has history', 'Accounts with transactions or bills can\'t be deleted. Tick "Account closed" instead to hide it and keep its history.', { yes: 'OK', danger: false });
      return;
    }
    if (state.accounts.filter((x) => !x.archived).length <= 1) { toast('Keep at least one account.'); return; }
    if (!(await confirmSheet('Delete account?', `"${acc.name}" will be removed.`))) return;
    state.accounts = state.accounts.filter((x) => x.id !== acc.id);
    if (state.settings.lastAccountId === acc.id) state.settings.lastAccountId = null;
    ctx.save();
    toast('Account deleted');
    ctx.go('accounts');
  });
}

