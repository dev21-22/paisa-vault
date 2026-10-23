// Tests for bank SMS batches and the year view.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSMS, splitMessages, isPaymentSMS, findDate, smsHash } from '../js/lib/sms.js';
import { yearRange, yearReport, topMerchants } from '../js/calc.js';

test('splitMessages reads the iPhone Shortcut note format with dates and --- separators', () => {
  const note = `2026-10-22
Rs.450.00 debited from A/c XX1234 on 22-10-26 to VPA swiggy@icici. Ref 123
---
2026-10-23
INR 1,299.00 spent on HDFC Bank Card XX4321 at AMAZON
on 23-10-26. Avl Lmt INR 50,000
---
`;
  const m = splitMessages(note);
  assert.equal(m.length, 2);
  assert.equal(m[0].received, '2026-10-22');
  assert.match(m[0].text, /^Rs\.450/);
  assert.equal(m[1].received, '2026-10-23');
  assert.match(m[1].text, /AMAZON\non 23/); // a line break inside a message is kept
});

test('splitMessages falls back to blank lines and ignores empty input', () => {
  const m = splitMessages('Rs 20 debited for tea\n\n\nRs 40 debited for metro');
  assert.deepEqual(m.map((x) => x.text), ['Rs 20 debited for tea', 'Rs 40 debited for metro']);
  assert.equal(m[0].received, null);
  assert.deepEqual(splitMessages('  \n---\n '), []);
  // A first line that is part of the message is not taken as a date header.
  assert.equal(splitMessages('Dear Customer\nRs 50 debited')[0].text, 'Dear Customer\nRs 50 debited');
});

test('isPaymentSMS keeps real debits and credits, drops OTPs, reminders and failures', () => {
  assert.ok(isPaymentSMS('Rs.450.00 debited from A/c XX1234 on 22-10-26 to VPA swiggy@icici'));
  assert.ok(isPaymentSMS('INR 50,000.00 credited to A/c XX1234 by NEFT from ACME PVT LTD'));
  assert.ok(isPaymentSMS('INR 1,299.00 spent on HDFC Bank Card XX4321 at AMAZON on 23-10-26'));
  assert.ok(!isPaymentSMS('482913 is your OTP for a transaction of Rs 1,299 at AMAZON'));
  assert.ok(!isPaymentSMS('Rs 499 will be debited on 25-10-26 for your Netflix mandate'));
  assert.ok(!isPaymentSMS('Your card bill of Rs 12,400 is due on 05-11-26. Min amt due Rs 620'));
  assert.ok(!isPaymentSMS('Transaction of Rs 300 at UBER failed. Any amount debited will be refunded'));
  assert.ok(!isPaymentSMS('Ravi has requested money Rs 500 via UPI. Pay on GPay'));
  assert.ok(!isPaymentSMS('Your account balance is fine. Visit our branch.'));
});

test('findDate understands ISO, dd-mm-yy, dd Mon yyyy and SBI-style 24Oct26', () => {
  assert.equal(findDate('on 2026-10-24 at 10:15'), '2026-10-24');
  assert.equal(findDate('on 24-10-26'), '2026-10-24');
  assert.equal(findDate('on 24 Oct 2026'), '2026-10-24');
  assert.equal(findDate('debited by 450.0 on date 24Oct26 trf to SWIGGY'), '2026-10-24');
  assert.equal(findDate('no date here'), null);
  assert.equal(parseSMS('A/c X1234 debited by Rs 450.0 on date 24Oct26 trf to SWIGGY').date, '2026-10-24');
});

test('smsHash is stable, ignores spacing and case, and differs between messages', async () => {
  const a = await smsHash('Rs 20 debited  for TEA');
  assert.equal(a, await smsHash('rs 20 debited for tea'));
  assert.notEqual(a, await smsHash('Rs 21 debited for tea'));
  assert.match(a, /^[0-9a-f]{20}$/);
});

test('yearRange gives calendar and financial years', () => {
  assert.deepEqual(yearRange(false, 0, '2026-10-24'), { start: '2026-01-01', end: '2026-12-31', label: '2026' });
  assert.deepEqual(yearRange(false, -1, '2026-10-24'), { start: '2025-01-01', end: '2025-12-31', label: '2025' });
  assert.deepEqual(yearRange(true, 0, '2026-10-24'), { start: '2026-04-01', end: '2027-03-31', label: 'FY 2026–27' });
  // Jan–Mar still belongs to the financial year that started last April.
  assert.equal(yearRange(true, 0, '2027-02-10').start, '2026-04-01');
});

test('yearReport compares with the same stretch of last year and finds top merchants', () => {
  const cat = 'food';
  const tx = (date, amount, note, type = 'expense') => ({ id: date + note, type, amount, categoryId: cat, accountId: 'a', date, note, created: 0 });
  const state = {
    txns: [
      tx('2026-01-10', 10000, 'Swiggy'), tx('2026-03-05', 30000, 'swiggy '), tx('2026-10-20', 5000, 'Metro'),
      tx('2026-11-20', 99999, 'Future'), // after "today": not counted yet
      tx('2026-02-01', 500000, 'Salary', 'income'),
      tx('2025-02-01', 20000, 'Swiggy'), tx('2025-12-01', 77777, 'Late last year'), // outside last year's matching stretch
      { id: 's', type: 'expense', amount: 9000, categoryId: cat, accountId: 'a', date: '2026-06-01', note: 'Dinner', shared: { myShare: 3000 }, created: 0 },
    ],
  };
  const r = yearReport(state, yearRange(false, 0, '2026-10-24'), '2026-10-24');
  assert.equal(r.tot.expense, 10000 + 30000 + 5000 + 3000);
  assert.equal(r.tot.income, 500000);
  assert.equal(r.prevTot.expense, 20000);
  assert.equal(r.months.length, 12);
  assert.equal(r.months[0].label, 'Jan');
  assert.equal(r.months[2].expense, 30000);
  assert.ok(r.months[11].future);
  assert.equal(r.elapsedMonths, 10);
  assert.equal(r.highest.label, 'Mar');
  assert.equal(r.byCat[0].prev, 20000);
  assert.deepEqual(r.merchants[0], { name: 'Swiggy', amount: 40000, count: 2 });
  assert.equal(r.merchants.find((m) => m.name === 'Dinner').amount, 3000); // only your share of a split bill
  assert.equal(r.noSpendDays, 297 - 4);
});

test('topMerchants skips income, transfers and entries without a note', () => {
  const m = topMerchants([
    { type: 'income', amount: 5, note: 'Salary' },
    { type: 'transfer', amount: 5, note: 'To savings' },
    { type: 'expense', amount: 5, note: '  ' },
    { type: 'expense', amount: 7, note: 'Tea' },
  ]);
  assert.deepEqual(m, [{ name: 'Tea', amount: 7, count: 1 }]);
});
