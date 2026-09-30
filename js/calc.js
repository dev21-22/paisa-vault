// Pure calculations over app state. No DOM here, so these are easy to test.

import { periodRange } from './lib/dates.js';

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

export function totals(txns) {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

export function byCategory(txns, type = 'expense') {
  const m = new Map();
  for (const t of txns) {
    if (t.type !== type) continue;
    m.set(t.categoryId, (m.get(t.categoryId) || 0) + t.amount);
  }
  return [...m.entries()].map(([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount);
}

export function accountBalances(state) {
  const bal = Object.fromEntries(state.accounts.map((a) => [a.id, a.opening || 0]));
  for (const t of state.txns) {
    if (t.type === 'income' && t.accountId in bal) bal[t.accountId] += t.amount;
    if (t.type === 'expense' && t.accountId in bal) bal[t.accountId] -= t.amount;
    if (t.type === 'transfer') {
      if (t.accountId in bal) bal[t.accountId] -= t.amount;
      if (t.toAccountId in bal) bal[t.toAccountId] += t.amount;
    }
  }
  return bal;
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

// Learn which category a note/merchant usually gets, most recent first.
export function suggestCategory(state, note, type) {
  const n = note.trim().toLowerCase();
  if (n.length < 2) return null;
  for (let i = state.txns.length - 1; i >= 0; i--) {
    const t = state.txns[i];
    if (t.type === type && t.note && t.note.toLowerCase() === n) return t.categoryId;
  }
  return null;
}
