// Tests for splitting bills with friends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeShares, balances, totalsOwed, groupSummary, personActivity, reminderText, upiLink, ME } from '../js/lib/split.js';
import { totals, byCategory, accountBalances, parts } from '../js/calc.js';
import { merge } from '../js/features/backup.js';

test('equal split keeps every paisa', () => {
  const s = computeShares(100000, [ME, 'a', 'b']);
  assert.deepEqual(Object.values(s).reduce((x, y) => x + y, 0), 100000);
  assert.deepEqual(s, { me: 33334, a: 33333, b: 33333 });
  assert.deepEqual(computeShares(1000, [ME, 'a']), { me: 500, a: 500 });
});

test('exact, percent and shares modes', () => {
  assert.deepEqual(computeShares(300000, [ME, 'a'], 'exact', { me: 100000, a: 200000 }), { me: 100000, a: 200000 });
  assert.throws(() => computeShares(300000, [ME, 'a'], 'exact', { me: 100000, a: 100000 }), /add up to ₹2,000/);
  assert.deepEqual(computeShares(100000, [ME, 'a', 'b'], 'percent', { me: 50, a: 25, b: 25 }), { me: 50000, a: 25000, b: 25000 });
  assert.throws(() => computeShares(100000, [ME, 'a'], 'percent', { me: 50, a: 40 }), /90%/);
  assert.deepEqual(computeShares(120000, [ME, 'a', 'b'], 'shares', { me: 2, a: 1, b: 1 }), { me: 60000, a: 30000, b: 30000 });
  const odd = computeShares(1000, [ME, 'a', 'b'], 'shares', { me: 1, a: 1, b: 1 });
  assert.equal(odd.me + odd.a + odd.b, 1000);
  assert.throws(() => computeShares(0, [ME]), /above ₹0/);
  assert.throws(() => computeShares(100, []), /at least one/);
});

const world = () => ({
  settings: { periodStartDay: 1, name: 'Dax', upiId: 'dax@okhdfc' },
  accounts: [{ id: 'bank', name: 'HDFC', type: 'bank', opening: 1000000 }],
  categories: [{ id: 'food', name: 'Food', kind: 'expense' }, { id: 'travel', name: 'Travel', kind: 'expense' }],
  people: [{ id: 'r', name: 'Rahul' }, { id: 'p', name: 'Priya' }],
  groups: [{ id: 'goa', name: 'Goa trip', memberIds: ['r', 'p'] }],
  shared: [], settlements: [], txns: [], recurring: [], goals: [], debts: [], budgets: {}, rules: [],
});

test('you paid for the group: owed amounts, and only your share is spending', () => {
  const s = world();
  s.shared.push({ id: 's1', groupId: 'goa', desc: 'Dinner', amount: 300000, date: '2026-10-01', paidBy: ME, shares: { me: 100000, r: 100000, p: 100000 }, categoryId: 'food' });
  s.txns.push({ id: 't1', type: 'expense', amount: 300000, accountId: 'bank', categoryId: 'food', date: '2026-10-01', shared: { id: 's1', myShare: 100000, paidBy: ME } });
  assert.deepEqual(balances(s), { r: 100000, p: 100000 });
  assert.deepEqual(totalsOwed(balances(s)), { owedToYou: 200000, youOwe: 0, net: 200000 });
  assert.equal(totals(s.txns).expense, 100000);
  assert.deepEqual(byCategory(s.txns), [{ categoryId: 'food', amount: 100000 }]);
  assert.equal(accountBalances(s).bank, 1000000 - 300000); // the bank really paid the full bill
});

test('friend paid: you owe them, spending is your share, bank untouched', () => {
  const s = world();
  s.shared.push({ id: 's2', groupId: 'goa', desc: 'Cab', amount: 90000, date: '2026-10-02', paidBy: 'r', shares: { me: 30000, r: 30000, p: 30000 }, categoryId: 'travel' });
  s.txns.push({ id: 't2', type: 'expense', amount: 30000, accountId: null, categoryId: 'travel', date: '2026-10-02', shared: { id: 's2', myShare: 30000, paidBy: 'r' } });
  assert.deepEqual(balances(s), { r: -30000 }); // Priya's share is between her and Rahul
  assert.equal(totals(s.txns).expense, 30000);
  assert.equal(accountBalances(s).bank, 1000000);
});

test('I paid for someone entirely', () => {
  const s = world();
  s.shared.push({ id: 's3', groupId: null, desc: 'Movie ticket', amount: 35000, date: '2026-10-03', paidBy: ME, shares: { r: 35000 }, categoryId: 'food' });
  s.txns.push({ id: 't3', type: 'expense', amount: 35000, accountId: 'bank', categoryId: 'food', date: '2026-10-03', shared: { id: 's3', myShare: 0, paidBy: ME } });
  assert.deepEqual(balances(s), { r: 35000 });
  assert.equal(totals(s.txns).expense, 0);
  assert.deepEqual(parts(s.txns[0]), [{ categoryId: 'food', amount: 0 }]);
});

test('settling up: partial and full, never counted as income or spending', () => {
  const s = world();
  s.shared.push({ id: 's1', groupId: 'goa', desc: 'Dinner', amount: 300000, date: '2026-10-01', paidBy: ME, shares: { me: 100000, r: 100000, p: 100000 } });
  s.settlements.push({ id: 'x1', personId: 'r', direction: 'in', amount: 60000, date: '2026-10-04', accountId: 'bank', groupId: 'goa' });
  s.txns.push({ id: 'tx1', type: 'settlement', direction: 'in', amount: 60000, accountId: 'bank', date: '2026-10-04' });
  assert.deepEqual(balances(s), { r: 40000, p: 100000 });
  assert.deepEqual(totals(s.txns), { income: 0, expense: 0, net: 0 });
  assert.equal(accountBalances(s).bank, 1000000 + 60000);
  s.settlements.push({ id: 'x2', personId: 'r', direction: 'in', amount: 40000, date: '2026-10-05', accountId: 'bank' });
  assert.deepEqual(balances(s), { p: 100000 }); // Rahul settled; zero balances disappear
  s.settlements.push({ id: 'x3', personId: 'p', direction: 'out', amount: 5000, date: '2026-10-05', accountId: 'bank' });
  assert.equal(balances(s).p, 105000);
});

test('group summary and per-person history', () => {
  const s = world();
  s.shared.push({ id: 's1', groupId: 'goa', desc: 'Dinner', amount: 300000, date: '2026-10-01', paidBy: ME, shares: { me: 100000, r: 100000, p: 100000 }, created: 1 });
  s.shared.push({ id: 's2', groupId: 'goa', desc: 'Cab', amount: 90000, date: '2026-10-02', paidBy: 'r', shares: { me: 30000, r: 30000, p: 30000 }, created: 2 });
  s.shared.push({ id: 's9', groupId: null, desc: 'Other', amount: 1000, date: '2026-10-02', paidBy: ME, shares: { p: 1000 }, created: 3 });
  const g = groupSummary(s, 'goa');
  assert.equal(g.total, 390000);
  assert.equal(g.myShare, 130000);
  assert.deepEqual(g.paid, { me: 300000, r: 90000 });
  assert.deepEqual(g.balances, { r: 70000, p: 100000 });
  const acts = personActivity(s, 'r');
  assert.deepEqual(acts.map((a) => [a.item.id, a.effect]), [['s2', -30000], ['s1', 100000]]);
});

test('reminder text and UPI link', () => {
  const s = world();
  s.shared.push({ id: 's1', groupId: 'goa', desc: 'Dinner', amount: 300000, date: '2026-10-01', paidBy: ME, shares: { me: 100000, r: 100000, p: 100000 } });
  const t = reminderText(s, 'r', { myName: 'Dax', upiId: 'dax@okhdfc' });
  assert.match(t, /Hi Rahul/);
  assert.match(t, /you owe me ₹1,000/);
  assert.match(t, /Dinner \(01\/10\): ₹1,000/);
  assert.match(t, /upi:\/\/pay\?pa=dax%40okhdfc&pn=Dax&am=1000.00&cu=INR/);
  assert.equal(reminderText(s, 'nobody'), '');
  assert.equal(upiLink('', 'x', 100), '');
});

test('merge joins people by name across devices', () => {
  const phone = world();
  const laptop = world();
  laptop.people = [{ id: 'L-r', name: 'rahul' }, { id: 'L-k', name: 'Kiran' }];
  laptop.groups = [{ id: 'g2', name: 'Flat', memberIds: ['L-r', 'L-k'] }];
  laptop.shared = [{ id: 'sx', groupId: 'g2', desc: 'Rent', amount: 100, date: '2026-10-01', paidBy: 'L-r', shares: { me: 50, 'L-k': 50 }, input: {} }];
  laptop.settlements = [{ id: 'st', personId: 'L-r', direction: 'out', amount: 50, date: '2026-10-02' }];
  merge(phone, laptop);
  assert.equal(phone.people.length, 3);
  const kiran = phone.people.find((p) => p.name === 'Kiran').id;
  assert.deepEqual(phone.groups.find((g) => g.id === 'g2').memberIds, ['r', kiran]);
  const sx = phone.shared.find((x) => x.id === 'sx');
  assert.equal(sx.paidBy, 'r');
  assert.deepEqual(Object.keys(sx.shares), ['me', kiran]);
  assert.equal(phone.settlements[0].personId, 'r');
  assert.deepEqual(balances(phone), {}); // owed 50 to Rahul, then paid him 50
});
