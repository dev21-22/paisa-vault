// Run with:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveKey, encryptJSON, decryptJSON, makeBackup, openBackup, randomBytes, passwordStrength } from '../js/lib/crypto.js';
import { toPaise, formatINR, sum } from '../js/lib/money.js';
import { periodRange, addMonths, nextOccurrence, addDays } from '../js/lib/dates.js';
import { parseSMS } from '../js/lib/sms.js';
import { evalAmount, totals, byCategory, accountBalances, suggestCategory } from '../js/calc.js';
import { merge } from '../js/features/backup.js';

test('encryption round-trips and rejects a wrong password', async () => {
  const salt = randomBytes(16);
  const key = await deriveKey('correct horse battery', salt, 1000);
  const box = await encryptJSON(key, { a: 1, note: 'चाय ₹20' });
  assert.notEqual(box.ct.includes('चाय'), true);
  assert.deepEqual(await decryptJSON(key, box), { a: 1, note: 'चाय ₹20' });
  const wrong = await deriveKey('wrong password', salt, 1000);
  await assert.rejects(decryptJSON(wrong, box));
});

test('tampered ciphertext is rejected', async () => {
  const key = await deriveKey('pw-123456', randomBytes(16), 1000);
  const box = await encryptJSON(key, { x: 42 });
  const bytes = Buffer.from(box.ct, 'base64');
  bytes[0] ^= 1;
  await assert.rejects(decryptJSON(key, { ...box, ct: bytes.toString('base64') }));
});

test('each encryption uses a fresh IV', async () => {
  const key = await deriveKey('pw-123456', randomBytes(16), 1000);
  const a = await encryptJSON(key, { x: 1 });
  const b = await encryptJSON(key, { x: 1 });
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test('backup file opens only with its password', async () => {
  const file = await makeBackup('Backup-pass-99', { txns: [{ id: 'a' }] });
  assert.equal(file.app, 'paisa-vault');
  assert.equal(file.iterations, 600000);
  assert.deepEqual(await openBackup('Backup-pass-99', file), { txns: [{ id: 'a' }] });
  await assert.rejects(openBackup('nope', file), /Wrong password/);
  await assert.rejects(openBackup('x', { hello: 1 }), /not a Paisa Vault backup/);
});

test('password strength', () => {
  assert.equal(passwordStrength('abc').level, 'weak');
  assert.equal(passwordStrength('password123').level, 'weak');
  assert.equal(passwordStrength('my-dog-eats-3-Mangoes!').level, 'strong');
});

test('money is kept in exact paise', () => {
  assert.equal(toPaise('12.30'), 1230);
  assert.equal(toPaise('₹1,23,456.78'), 12345678);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.ok(isNaN(toPaise('abc')));
  assert.equal(sum([10, 20, 70]), 100);
  assert.equal(formatINR(12345678), '₹1,23,456.78');
  assert.equal(formatINR(10000000000), '₹10,00,00,000');
});

test('amount box arithmetic', () => {
  assert.equal(evalAmount('250+120'), 37000);
  assert.equal(evalAmount('100*3-50'), 25000);
  assert.equal(evalAmount('(100+50)/2'), 7500);
  assert.equal(evalAmount('1,200.50'), 120050);
  assert.ok(isNaN(evalAmount('alert(1)')));
  assert.ok(isNaN(evalAmount('2++')));
  assert.ok(isNaN(evalAmount('1/0')));
});

test('periods: calendar month and salary cycle', () => {
  assert.deepEqual(periodRange('2026-09-30', 1), { start: '2026-09-01', end: '2026-09-30' });
  assert.deepEqual(periodRange('2026-02-10', 1), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(periodRange('2026-09-30', 25), { start: '2026-09-25', end: '2026-10-24' });
  assert.deepEqual(periodRange('2026-09-10', 25), { start: '2026-08-25', end: '2026-09-24' });
  assert.deepEqual(periodRange('2026-01-15', 1, -1), { start: '2025-12-01', end: '2025-12-31' });
});

test('recurring dates keep their day of month', () => {
  assert.equal(addMonths('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(addMonths('2026-02-28', 1, 31), '2026-03-31');
  assert.equal(nextOccurrence('2026-12-15', 'monthly', 15), '2027-01-15');
  assert.equal(nextOccurrence('2026-03-01', 'weekly'), '2026-03-08');
  assert.equal(nextOccurrence('2024-02-29', 'yearly', 29), '2025-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('SMS parsing: UPI debit', () => {
  const r = parseSMS('Rs.450.00 debited from A/c XX1234 on 29-09-26 to VPA swiggy@icici. UPI Ref 1234. Not you? Call 1800');
  assert.equal(r.amount, 45000);
  assert.equal(r.type, 'expense');
  assert.equal(r.merchant, 'Swiggy');
  assert.equal(r.date, '2026-09-29');
  assert.equal(r.method, 'upi');
});

test('SMS parsing: salary credit', () => {
  const r = parseSMS('INR 85,000.00 credited to your A/c XX9876 on 01-Oct-26 by NEFT from ACME PVT LTD. Avl bal INR 1,02,000');
  assert.equal(r.amount, 8500000);
  assert.equal(r.type, 'income');
  assert.equal(r.date, '2026-10-01');
});

test('SMS parsing: card spend', () => {
  const r = parseSMS('You have spent Rs 1,299 on your HDFC Bank Card ending 4321 at AMAZON on 2026-09-28');
  assert.equal(r.amount, 129900);
  assert.equal(r.type, 'expense');
  assert.equal(r.merchant, 'AMAZON');
  assert.equal(r.method, 'card');
  assert.equal(parseSMS('hello there'), null);
});

const sample = () => ({
  accounts: [{ id: 'cash', opening: 100000 }, { id: 'bank', opening: 0 }],
  categories: [],
  txns: [
    { id: '1', type: 'expense', amount: 20000, categoryId: 'food', accountId: 'cash', date: '2026-09-01', note: 'Swiggy' },
    { id: '2', type: 'expense', amount: 5000, categoryId: 'fuel', accountId: 'cash', date: '2026-09-02', note: 'Petrol' },
    { id: '3', type: 'income', amount: 500000, categoryId: 'sal', accountId: 'bank', date: '2026-09-01', note: 'Salary' },
    { id: '4', type: 'transfer', amount: 50000, accountId: 'bank', toAccountId: 'cash', date: '2026-09-03' },
    { id: '5', type: 'expense', amount: 10000, categoryId: 'food', accountId: 'bank', date: '2026-09-04', note: 'swiggy' },
  ],
  recurring: [], goals: [], debts: [], budgets: {},
});

test('totals, categories and balances', () => {
  const s = sample();
  assert.deepEqual(totals(s.txns), { income: 500000, expense: 35000, net: 465000 });
  assert.deepEqual(byCategory(s.txns), [{ categoryId: 'food', amount: 30000 }, { categoryId: 'fuel', amount: 5000 }]);
  assert.deepEqual(accountBalances(s), { cash: 125000, bank: 440000 });
  assert.equal(suggestCategory(s, 'SWIGGY', 'expense'), 'food');
  assert.equal(suggestCategory(s, 'unknown', 'expense'), null);
});

test('backup merge adds only missing items', () => {
  const here = sample();
  const other = sample();
  other.txns.push({ id: '6', type: 'expense', amount: 999, date: '2026-09-05' });
  other.txns[0] = { ...other.txns[0], amount: 1 }; // same id: this device's copy wins
  other.budgets = { food: 100 };
  const added = merge(here, other);
  assert.equal(added, 1);
  assert.equal(here.txns.length, 6);
  assert.equal(here.txns[0].amount, 20000);
  assert.equal(here.budgets.food, 100);
});
