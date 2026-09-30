// Pure calculations over app state. No DOM here, so these are easy to test.

import { periodRange, iso, addDays, daysBetween, parseISO, nextOccurrence } from './lib/dates.js';
import { builtinCategoryName } from './lib/merchants.js';

export const LIABILITY_TYPES = ['card', 'loan'];
export const isLiability = (a) => LIABILITY_TYPES.includes(a.type);

export function catMap(state) {
  return Object.fromEntries(state.categories.map((c) => [c.id, c]));
}

export function accMap(state) {
  return Object.fromEntries(state.accounts.map((a) => [a.id, a]));
}

export function inRange(txns, { start, end }) {
  return txns.filter((t) => t.date >= start && t.date <= end);
}

export function currentPeriod(state, offset = 0, date) {
  return periodRange(date, state.settings.periodStartDay || 1, offset);
}

// How much of an expense is really yours. A bill shared with friends counts only your share;
// the rest is money they owe you.
export function spendAmount(t) {
  return t.shared ? t.shared.myShare : t.amount;
}

// Balance adjustments, transfers and settlements with friends are not income or spending.
export function totals(txns) {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += spendAmount(t);
  }
  return { income, expense, net: income - expense };
}

// A transaction's category parts: split transactions give several, others give one.
export function parts(t) {
  if (t.splits?.length) return t.splits;
  return [{ categoryId: t.categoryId, amount: spendAmount(t) }];
}

export function hasCategory(t, categoryId) {
  return parts(t).some((p) => p.categoryId === categoryId);
}

export function byCategory(txns, type = 'expense') {
  const m = new Map();
  for (const t of txns) {
    if (t.type !== type) continue;
    for (const p of parts(t)) m.set(p.categoryId, (m.get(p.categoryId) || 0) + p.amount);
  }
  return [...m.entries()].map(([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount);
}

function applyTxn(bal, t) {
  if (t.type === 'income' && t.accountId in bal) bal[t.accountId] += t.amount;
  else if (t.type === 'expense' && t.accountId in bal) bal[t.accountId] -= t.amount;
  else if (t.type === 'adjustment' && t.accountId in bal) bal[t.accountId] += t.amount; // signed
  else if (t.type === 'settlement' && t.accountId in bal) bal[t.accountId] += t.direction === 'in' ? t.amount : -t.amount;
  else if (t.type === 'transfer') {
    if (t.accountId in bal) bal[t.accountId] -= t.amount;
    if (t.toAccountId in bal) bal[t.toAccountId] += t.amount;
  }
}

// Balances of every account, optionally as of the end of a given date.
export function accountBalances(state, asOf) {
  const bal = Object.fromEntries(state.accounts.map((a) => [a.id, a.opening || 0]));
  for (const t of state.txns) if (!asOf || t.date <= asOf) applyTxn(bal, t);
  return bal;
}

export function netWorth(state, asOf) {
  const bal = accountBalances(state, asOf);
  let assets = 0;
  let liabilities = 0;
  for (const a of state.accounts) {
    if (a.includeInNetWorth === false) continue;
    const b = bal[a.id];
    if (isLiability(a) || b < 0) liabilities += -b;
    else assets += b;
  }
  return { assets, liabilities, net: assets - liabilities };
}

// Month-end net worth for the last `months` periods (oldest first).
export function netWorthHistory(state, months = 12, today = iso()) {
  const out = [];
  for (let k = months - 1; k >= 0; k--) {
    const p = currentPeriod(state, -k, today);
    const end = p.end > today ? today : p.end;
    out.push({ period: p, ...netWorth(state, end) });
  }
  return out;
}

// Daily closing balances of one account for the last `days` days (oldest first).
export function balanceSeries(state, accountId, days = 90, today = iso()) {
  const acc = state.accounts.find((a) => a.id === accountId);
  const start = addDays(today, -(days - 1));
  let bal = { [accountId]: acc?.opening || 0 };
  const sorted = [...state.txns].filter((t) => t.accountId === accountId || t.toAccountId === accountId).sort((a, b) => (a.date < b.date ? -1 : 1));
  let i = 0;
  while (i < sorted.length && sorted[i].date < start) applyTxn(bal, sorted[i++]);
  const out = [];
  for (let d = 0; d < days; d++) {
    const day = addDays(start, d);
    while (i < sorted.length && sorted[i].date === day) applyTxn(bal, sorted[i++]);
    out.push({ date: day, value: bal[accountId] });
  }
  return out;
}

// Credit card billing cycle. statementDay / dueDay are days of month.
export function cardCycle(acc, state, today = iso()) {
  if (acc.type !== 'card' || !acc.statementDay) return null;
  const t = parseISO(today);
  const sd = acc.statementDay;
  const clamp = (y, m, d) => { const x = new Date(y, m, 1); x.setDate(Math.min(d, new Date(y, m + 1, 0).getDate())); return x; };
  let last = clamp(t.getFullYear(), t.getMonth(), sd);
  if (last > t) last = clamp(t.getFullYear(), t.getMonth() - 1, sd);
  const next = clamp(last.getFullYear(), last.getMonth() + 1, sd);
  const dueDay = acc.dueDay || sd;
  let due = clamp(last.getFullYear(), last.getMonth(), dueDay);
  if (due <= last) due = clamp(last.getFullYear(), last.getMonth() + 1, dueDay);
  const lastStatement = iso(last);
  const owedAtStatement = -Math.min(0, accountBalances(state, lastStatement)[acc.id]);
  const paidSince = state.txns
    .filter((x) => x.date > lastStatement && ((x.type === 'transfer' && x.toAccountId === acc.id) || (x.type === 'income' && x.accountId === acc.id)))
    .reduce((s, x) => s + x.amount, 0);
  const outstanding = -Math.min(0, accountBalances(state)[acc.id]);
  const statementDue = Math.max(0, owedAtStatement - paidSince);
  return {
    lastStatement, nextStatement: iso(next), dueDate: iso(due), outstanding, statementDue,
    unbilled: Math.max(0, outstanding - statementDue),
    utilisation: acc.creditLimit ? outstanding / acc.creditLimit : null,
    daysToDue: daysBetween(today, iso(due)),
  };
}

// Recurring items that fall in the next `days` days, and where cash balance is heading.
export function forecast(state, days = 30, today = iso()) {
  const end = addDays(today, days);
  const items = [];
  for (const r of state.recurring) {
    if (!r.active) continue;
    // Overdue occurrences are counted as due today.
    let next = r.nextDate;
    let guard = 0;
    while (next <= end && guard++ < 60) {
      items.push({ date: next < today ? today : next, name: r.name, type: r.type, amount: r.amount, accountId: r.accountId });
      next = nextOccurrence(next, r.freq, r.anchorDay);
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : 1));
  const income = items.filter((x) => x.type === 'income').reduce((s, x) => s + x.amount, 0);
  const expense = items.filter((x) => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
  const bal = accountBalances(state);
  const liquid = state.accounts.filter((a) => !isLiability(a) && !a.archived && ['cash', 'bank', 'upi'].includes(a.type)).reduce((s, a) => s + bal[a.id], 0);
  // Lowest point along the way, to warn before money runs short.
  let running = liquid;
  let lowest = { value: liquid, date: today };
  for (const x of items) {
    running += x.type === 'income' ? x.amount : -x.amount;
    if (running < lowest.value) lowest = { value: running, date: x.date };
  }
  return { items, income, expense, liquid, projected: liquid + income - expense, lowest };
}

// Projected spend by the end of the period at the current pace.
export function spendingPace(state, today = iso()) {
  const p = currentPeriod(state, 0, today);
  const spent = totals(inRange(state.txns, p)).expense;
  const days = daysBetween(p.start, p.end) + 1;
  const elapsed = Math.min(days, daysBetween(p.start, today) + 1);
  if (elapsed < 5) return null; // too early in the month to say
  return { spent, projected: Math.round((spent / elapsed) * days), elapsed, days };
}

// Budget for a category this period, including unspent money carried from last period if rollover is on.
export function effectiveBudget(state, key, offset = 0) {
  const base = state.budgets[key] || 0;
  if (!base || !state.budgetRollover?.[key]) return { base, carry: 0, total: base };
  const prev = currentPeriod(state, offset - 1);
  const ptx = inRange(state.txns, prev);
  const spent = key === '_total' ? totals(ptx).expense : (byCategory(ptx).find((x) => x.categoryId === key)?.amount || 0);
  const carry = Math.max(0, base - spent);
  return { base, carry, total: base + carry };
}

// Safe arithmetic for the amount box: "250+120*2" -> 490. Only numbers and + - * / ( ).
export function evalAmount(input) {
  const s = String(input).replace(/[₹,\s]/g, '');
  if (!s) return NaN;
  if (!/^[\d.+\-*/()]+$/.test(s)) return NaN;
  let i = 0;
  const peek = () => s[i];
  const num = () => {
    const m = s.slice(i).match(/^\d*\.?\d+|^\d+\.?/);
    if (!m) throw new Error('bad');
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const factor = () => {
    if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error('bad'); return v; }
    if (peek() === '-') { i++; return -factor(); }
    return num();
  };
  const term = () => {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = () => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = expr();
    if (i !== s.length || !isFinite(v)) return NaN;
    return Math.round(v * 100);
  } catch {
    return NaN;
  }
}

// Which category a note/merchant should get: your rules, then your history, then known Indian merchants.
export function suggestCategory(state, note, type) {
  const n = (note || '').trim().toLowerCase();
  if (n.length < 2) return null;
  for (const r of state.rules || []) {
    const cat = state.categories.find((c) => c.id === r.categoryId);
    if (cat && cat.kind === type && r.match && n.includes(r.match.toLowerCase())) return r.categoryId;
  }
  for (let i = state.txns.length - 1; i >= 0; i--) {
    const t = state.txns[i];
    if (t.type === type && t.note && t.note.toLowerCase() === n && !t.splits?.length) return t.categoryId;
  }
  const name = builtinCategoryName(n, type);
  if (name) return state.categories.find((c) => c.kind === type && c.name === name)?.id || null;
  return null;
}

// Find the account an SMS or statement refers to, by last 4 digits.
export function accountByLast4(state, last4) {
  if (!last4) return null;
  return state.accounts.find((a) => !a.archived && a.last4 && String(a.last4).slice(-4) === String(last4).slice(-4)) || null;
}

// Frequent entries (same note, category and amount) for one-tap adding.
export function frequentEntries(state, limit = 6) {
  const m = new Map();
  for (const t of state.txns.slice(-400)) {
    if (t.type !== 'expense' || !t.note || t.splits?.length || t.shared) continue;
    const k = `${t.note.toLowerCase()}|${t.categoryId}|${t.amount}`;
    const e = m.get(k) || { note: t.note, categoryId: t.categoryId, amount: t.amount, accountId: t.accountId, count: 0 };
    e.count++;
    e.accountId = t.accountId;
    m.set(k, e);
  }
  return [...m.values()].filter((e) => e.count >= 2).sort((a, b) => b.count - a.count).slice(0, limit);
}

const normalise = (s) => s.toLowerCase().replace(/[^a-z]+/g, ' ').trim();

// Spot repeating payments (subscriptions, EMIs) that aren't set up as bills yet.
export function detectSubscriptions(state, today = iso()) {
  const since = addDays(today, -200);
  const known = new Set(state.recurring.map((r) => normalise(r.name)));
  const dismissed = new Set(state.dismissedSuggestions || []);
  const groups = new Map();
  for (const t of state.txns) {
    if (t.type !== 'expense' || !t.note || t.date < since || t.recurringId || t.shared) continue;
    const k = normalise(t.note);
    if (!k || known.has(k) || dismissed.has(k)) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps = list.slice(1).map((t, i) => daysBetween(list[i].date, t.date));
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const amounts = list.map((t) => t.amount);
    const avgAmt = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const steady = amounts.every((a) => Math.abs(a - avgAmt) <= avgAmt * 0.15);
    const regular = gaps.every((g) => Math.abs(g - avgGap) <= Math.max(4, avgGap * 0.25));
    let freq = null;
    if (avgGap >= 25 && avgGap <= 35) freq = 'monthly';
    else if (avgGap >= 6 && avgGap <= 8) freq = 'weekly';
    else if (avgGap >= 85 && avgGap <= 95) freq = 'quarterly';
    if (freq && steady && regular) {
      const last = list[list.length - 1];
      out.push({ key, name: last.note, amount: last.amount, categoryId: last.categoryId, accountId: last.accountId, freq, count: list.length, lastDate: last.date, nextDate: nextOccurrence(last.date, freq, parseISO(last.date).getDate()) });
    }
  }
  return out;
}

// Daily spend totals for a period, for the calendar heatmap.
export function dailySpend(txns, { start, end }) {
  const m = {};
  for (const t of txns) if (t.type === 'expense' && t.date >= start && t.date <= end) m[t.date] = (m[t.date] || 0) + spendAmount(t);
  return m;
}

// Possible duplicate: same account, same amount, same or adjacent day.
export function findDuplicate(state, { accountId, amount, date, type }) {
  return state.txns.find((t) => t.accountId === accountId && t.amount === amount
    && (t.type === type || (type === 'expense' && t.type === 'transfer')) && Math.abs(daysBetween(t.date, date)) <= 1) || null;
}
