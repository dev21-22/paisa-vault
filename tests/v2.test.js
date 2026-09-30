// Tests for multi-account features, splits, forecasting, statement import and smart categories.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  byCategory, accountBalances, netWorth, cardCycle, forecast, detectSubscriptions, spendingPace,
  effectiveBudget, suggestCategory, accountByLast4, frequentEntries, findDuplicate, totals, balanceSeries,
} from '../js/calc.js';
import { parseCSV, detectColumns, statementRows, parseDate, parseAmount, cleanNarration } from '../js/lib/statement.js';
import { parseSMS } from '../js/lib/sms.js';
import { builtinCategoryName } from '../js/lib/merchants.js';
import { merge } from '../js/features/backup.js';

const base = () => ({
  settings: { periodStartDay: 1 },
  accounts: [
    { id: 'hdfc', name: 'HDFC Salary', type: 'bank', opening: 5000000, last4: '1234' },
    { id: 'sbi', name: 'SBI', type: 'bank', opening: 1000000, last4: '9876' },
    { id: 'card', name: 'ICICI Card', type: 'card', opening: 0, last4: '4321', creditLimit: 10000000, statementDay: 15, dueDay: 5 },
    { id: 'cash', name: 'Cash', type: 'cash', opening: 200000 },
  ],
  categories: [
    { id: 'food', name: 'Food & dining', kind: 'expense' },
    { id: 'groc', name: 'Groceries', kind: 'expense' },
    { id: 'home', name: 'Bills & utilities', kind: 'expense' },
    { id: 'subs', name: 'Recharge & subscriptions', kind: 'expense' },
    { id: 'sal', name: 'Salary', kind: 'income' },
  ],
  txns: [], recurring: [], goals: [], debts: [], budgets: {}, rules: [], budgetRollover: {}, dismissedSuggestions: [],
});
let n = 0;
const tx = (o) => ({ id: `t${++n}`, tags: [], created: n, note: '', ...o });

test('split transactions count in each category', () => {
  const s = base();
  s.txns.push(tx({ type: 'expense', amount: 300000, categoryId: 'groc', splits: [{ categoryId: 'groc', amount: 200000 }, { categoryId: 'home', amount: 100000 }], accountId: 'hdfc', date: '2026-10-02' }));
  assert.deepEqual(byCategory(s.txns), [{ categoryId: 'groc', amount: 200000 }, { categoryId: 'home', amount: 100000 }]);
  assert.equal(totals(s.txns).expense, 300000);
});

test('balance corrections change balance but not income/spending', () => {
  const s = base();
  s.txns.push(tx({ type: 'adjustment', amount: -50000, accountId: 'sbi', date: '2026-10-01' }));
  assert.equal(accountBalances(s).sbi, 950000);
  assert.deepEqual(totals(s.txns), { income: 0, expense: 0, net: 0 });
});

test('net worth: cards and loans are subtracted', () => {
  const s = base();
  s.txns.push(tx({ type: 'expense', amount: 1500000, categoryId: 'food', accountId: 'card', date: '2026-10-01' }));
  const nw = netWorth(s);
  assert.equal(nw.assets, 5000000 + 1000000 + 200000);
  assert.equal(nw.liabilities, 1500000);
  assert.equal(nw.net, 6200000 - 1500000);
  s.accounts[1].includeInNetWorth = false;
  assert.equal(netWorth(s).assets, 5200000);
});

test('balance as of a past date and daily series', () => {
  const s = base();
  s.txns.push(tx({ type: 'expense', amount: 100000, categoryId: 'food', accountId: 'cash', date: '2026-09-28' }));
  s.txns.push(tx({ type: 'transfer', amount: 50000, accountId: 'hdfc', toAccountId: 'cash', date: '2026-09-30' }));
  assert.equal(accountBalances(s, '2026-09-29').cash, 100000);
  assert.equal(accountBalances(s).cash, 150000);
  const series = balanceSeries(s, 'cash', 5, '2026-10-01');
  assert.deepEqual(series.map((p) => p.value), [200000, 100000, 100000, 150000, 150000]);
});

test('credit card cycle: statement, due date, unbilled, utilisation', () => {
  const s = base();
  s.txns.push(tx({ type: 'expense', amount: 2000000, categoryId: 'food', accountId: 'card', date: '2026-09-10' })); // billed on 15 Sep
  s.txns.push(tx({ type: 'expense', amount: 500000, categoryId: 'food', accountId: 'card', date: '2026-09-20' })); // unbilled
  let c = cardCycle(s.accounts[2], s, '2026-09-25');
  assert.equal(c.lastStatement, '2026-09-15');
  assert.equal(c.nextStatement, '2026-10-15');
  assert.equal(c.dueDate, '2026-10-05');
  assert.equal(c.statementDue, 2000000);
  assert.equal(c.unbilled, 500000);
  assert.equal(c.outstanding, 2500000);
  assert.equal(c.utilisation, 0.25);
  // Paying part of the bill
  s.txns.push(tx({ type: 'transfer', amount: 1500000, accountId: 'hdfc', toAccountId: 'card', date: '2026-09-28' }));
  c = cardCycle(s.accounts[2], s, '2026-09-29');
  assert.equal(c.statementDue, 500000);
  assert.equal(c.daysToDue, 6);
  assert.equal(cardCycle(s.accounts[0], s), null);
});

test('30-day forecast and lowest point', () => {
  const s = base();
  s.recurring.push({ id: 'r1', name: 'Rent', type: 'expense', amount: 6000000, freq: 'monthly', nextDate: '2026-10-05', anchorDay: 5, active: true, accountId: 'hdfc' });
  s.recurring.push({ id: 'r2', name: 'Salary', type: 'income', amount: 9000000, freq: 'monthly', nextDate: '2026-10-28', anchorDay: 28, active: true, accountId: 'hdfc' });
  s.recurring.push({ id: 'r3', name: 'Gym', type: 'expense', amount: 100000, freq: 'weekly', nextDate: '2026-10-02', active: true });
  const f = forecast(s, 30, '2026-10-01');
  assert.equal(f.items.filter((x) => x.name === 'Gym').length, 5); // 2, 9, 16, 23, 30 Oct
  assert.equal(f.expense, 6000000 + 500000);
  assert.equal(f.income, 9000000);
  assert.equal(f.liquid, 6200000);
  assert.equal(f.projected, 6200000 + 9000000 - 6500000);
  assert.ok(f.lowest.value < 0); // rent before salary
  assert.equal(f.lowest.date, '2026-10-23'); // rent on the 5th, then weekly gym until salary on the 28th
});

test('subscription detection', () => {
  const s = base();
  for (const d of ['2026-06-12', '2026-07-12', '2026-08-12', '2026-09-12']) s.txns.push(tx({ type: 'expense', amount: 64900, categoryId: 'subs', accountId: 'card', note: 'Netflix', date: d }));
  for (const d of ['2026-09-01', '2026-09-03', '2026-09-20']) s.txns.push(tx({ type: 'expense', amount: 25000, categoryId: 'food', accountId: 'cash', note: 'Swiggy', date: d }));
  const found = detectSubscriptions(s, '2026-10-01');
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'Netflix');
  assert.equal(found[0].freq, 'monthly');
  assert.equal(found[0].nextDate, '2026-10-12');
  s.dismissedSuggestions.push('netflix');
  assert.equal(detectSubscriptions(s, '2026-10-01').length, 0);
});

test('spending pace and budget rollover', () => {
  const s = base();
  s.txns.push(tx({ type: 'expense', amount: 1000000, categoryId: 'food', accountId: 'cash', date: '2026-09-05' }));
  s.txns.push(tx({ type: 'expense', amount: 1000000, categoryId: 'food', accountId: 'cash', date: '2026-10-03' }));
  const p = spendingPace(s, '2026-10-10');
  assert.equal(p.projected, Math.round((1000000 / 10) * 31));
  assert.equal(spendingPace(s, '2026-10-02'), null);
  s.budgets.food = 1500000;
  assert.deepEqual(effectiveBudget(s, 'food'), { base: 1500000, carry: 0, total: 1500000 });
  s.budgetRollover.food = true;
  const e = effectiveBudget(s, 'food', 0);
  // Real current period depends on today's date; check the rule directly on September -> October.
  assert.ok(e.total >= 1500000);
});

test('smart categories: rules, history, then built-in merchants', () => {
  const s = base();
  assert.equal(suggestCategory(s, 'SWIGGY order', 'expense'), 'food');
  assert.equal(suggestCategory(s, 'BigBasket', 'expense'), 'groc');
  assert.equal(suggestCategory(s, 'Jio recharge', 'expense'), 'subs');
  assert.equal(suggestCategory(s, 'ACME salary Oct', 'income'), 'sal');
  s.rules.push({ id: 'x', match: 'swiggy', categoryId: 'groc' }); // Instamart via Swiggy
  assert.equal(suggestCategory(s, 'swiggy instamart', 'expense'), 'groc');
  assert.equal(suggestCategory(s, 'random shop', 'expense'), null);
  assert.equal(builtinCategoryName('uber trip', 'expense'), 'Travel & fuel');
});

test('SMS: account detected from last 4 digits', () => {
  const s = base();
  const a = parseSMS('Rs.450.00 debited from A/c XX1234 on 29-09-26 to VPA swiggy@icici. UPI Ref 1234');
  assert.equal(a.last4, '1234');
  assert.equal(accountByLast4(s, a.last4).id, 'hdfc');
  const b = parseSMS('You have spent Rs 1,299 on your ICICI Bank Card ending 4321 at AMAZON on 2026-09-28');
  assert.equal(b.last4, '4321');
  assert.equal(accountByLast4(s, b.last4).id, 'card');
  const c = parseSMS('Your a/c no. ****9876 is credited by Rs.25,000.00 on 01-10-26 by NEFT');
  assert.equal(c.last4, '9876');
  assert.equal(c.type, 'income');
  assert.equal(accountByLast4(s, '0000'), null);
});

test('statement import: HDFC style (separate withdrawal/deposit columns)', () => {
  const csv = [
    'HDFC BANK Ltd.,,,,,,',
    'Account No :,50100012341234,,,,,',
    '',
    'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
    '01/09/26,UPI-SWIGGY-swiggy@icici-ICIC0000001-123456-Payment,0000123,01/09/26,450.00,,49550.00',
    '02/09/26,NEFT CR-ACME PVT LTD-SALARY SEP,N123,02/09/26,,"85,000.00","1,34,550.00"',
    '05/09/26,ATW-512345XXXXXX1234-S1ANMU01-MUMBAI,000,05/09/26,"2,000.00",,"1,32,550.00"',
  ].join('\n');
  const rows = parseCSV(csv);
  const cols = detectColumns(rows);
  assert.equal(cols.headerRow, 2); // blank lines are skipped
  const items = statementRows(rows, cols);
  assert.equal(items.length, 3);
  assert.deepEqual([items[0].date, items[0].amount, items[0].type, items[0].note], ['2026-09-01', 45000, 'expense', 'SWIGGY']);
  assert.equal(items[1].note, 'ACME PVT LTD');
  assert.equal(items[1].type, 'income');
  assert.equal(items[1].amount, 8500000);
  assert.equal(items[2].note, 'ATM withdrawal');
});

test('statement import: SBI style (Debit/Credit, text dates)', () => {
  const csv = [
    'Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance',
    '3 Sep 2026,3 Sep 2026,TO TRANSFER-UPI/DR/624512345678/ZOMATO/YESB/zomato@yes/Payment,TRANSFER TO 4897,320.00,,"9,680.00"',
    '10 Sep 2026,10 Sep 2026,BY TRANSFER-INB IMPS/P2A/624512345678/Refund,TRANSFER FROM 1234,,150.00,"9,830.00"',
  ].join('\n');
  const rows = parseCSV(csv);
  const items = statementRows(rows, detectColumns(rows));
  assert.equal(items.length, 2);
  assert.equal(items[0].date, '2026-09-03');
  assert.equal(items[0].amount, 32000);
  assert.equal(items[0].note, 'ZOMATO');
  assert.equal(items[1].note, 'Refund');
  assert.equal(items[1].type, 'income');
});

test('statement import: single Amount column with Dr/Cr', () => {
  const csv = 'Transaction Date,Details,Amount,Dr/Cr\n2026-09-04,POS AMAZON,1299.00,DR\n2026-09-06,INTEREST,12.50,CR\n';
  const rows = parseCSV(csv);
  const items = statementRows(rows, detectColumns(rows));
  assert.deepEqual(items.map((x) => [x.type, x.amount]), [['expense', 129900], ['income', 1250]]);
});

test('statement helpers', () => {
  assert.equal(parseDate('01/09/26'), '2026-09-01');
  assert.equal(parseDate('31-12-2025'), '2025-12-31');
  assert.equal(parseDate('3 Sep 2026'), '2026-09-03');
  assert.equal(parseDate('03-Sept-2026'), '2026-09-03');
  assert.equal(parseDate('2026-09-04 10:22'), '2026-09-04');
  assert.equal(parseDate('Opening balance'), null);
  assert.equal(parseAmount('1,23,456.78'), 12345678);
  assert.equal(parseAmount('(500.00)'), -50000);
  assert.equal(parseAmount(''), 0);
  assert.equal(cleanNarration('UPI/DR/624512345678/ZOMATO/YESB/zomato@yes/Payment'), 'ZOMATO');
  assert.equal(cleanNarration('UPI-SWIGGY-swiggy@icici-ICIC0000001-123456-Payment'), 'SWIGGY');
  assert.equal(parseCSV('a;b;c\n1;"x;y";3').at(1)[1], 'x;y');
});

test('duplicates and frequent entries', () => {
  const s = base();
  s.txns.push(tx({ type: 'expense', amount: 2000, categoryId: 'food', accountId: 'cash', note: 'Tea', date: '2026-09-01' }));
  s.txns.push(tx({ type: 'expense', amount: 2000, categoryId: 'food', accountId: 'cash', note: 'Tea', date: '2026-09-02' }));
  s.txns.push(tx({ type: 'expense', amount: 9000, categoryId: 'food', accountId: 'cash', note: 'Lunch', date: '2026-09-02' }));
  assert.ok(findDuplicate(s, { accountId: 'cash', amount: 9000, date: '2026-09-03', type: 'expense' }));
  assert.equal(findDuplicate(s, { accountId: 'hdfc', amount: 9000, date: '2026-09-03', type: 'expense' }), null);
  const f = frequentEntries(s);
  assert.equal(f.length, 1);
  assert.equal(f[0].note, 'Tea');
});

test('merge across separately set-up devices does not duplicate accounts or categories', () => {
  const phone = base();
  const laptop = base();
  laptop.accounts = laptop.accounts.map((a) => ({ ...a, id: `L-${a.id}` }));
  laptop.categories = laptop.categories.map((c) => ({ ...c, id: `L-${c.id}` }));
  laptop.accounts.push({ id: 'L-new', name: 'Kotak', type: 'bank', opening: 0 });
  laptop.txns.push(tx({ type: 'expense', amount: 100, categoryId: 'L-food', accountId: 'L-cash', date: '2026-09-01', splits: [{ categoryId: 'L-food', amount: 60 }, { categoryId: 'L-groc', amount: 40 }] }));
  laptop.budgets = { 'L-food': 500 };
  const added = merge(phone, laptop);
  assert.equal(phone.accounts.length, 5); // only Kotak is new
  assert.equal(phone.categories.length, 5);
  assert.equal(added, 2); // Kotak + 1 txn
  const t = phone.txns.at(-1);
  assert.equal(t.accountId, 'cash');
  assert.equal(t.categoryId, 'food');
  assert.deepEqual(t.splits.map((p) => p.categoryId), ['food', 'groc']);
  assert.equal(phone.budgets.food, 500);
});
