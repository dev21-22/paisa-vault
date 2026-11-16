// Tests for iPhone 17 Double-Tap Quick Add and Deep Linking.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseQuickAction, resolveQuickAction } from '../js/calc.js';

test('parseQuickAction recognizes quick routes and ignores regular page routes', () => {
  assert.ok(parseQuickAction('#add'));
  assert.ok(parseQuickAction('#quick'));
  assert.ok(parseQuickAction('#expense'));
  assert.ok(parseQuickAction('#income'));
  assert.ok(parseQuickAction('#transfer'));
  assert.ok(parseQuickAction('?add=1'));
  assert.ok(parseQuickAction('?quick=1'));
  assert.ok(parseQuickAction('webapp://dev21-22.github.io/paisa-vault/#add'));
  assert.ok(parseQuickAction('webapp://dev21-22.github.io/paisa-vault/?add=1'));
  assert.ok(parseQuickAction('https://dev21-22.github.io/paisa-vault/?amount=250&add=1'));

  assert.equal(parseQuickAction('#home'), null);
  assert.equal(parseQuickAction('#reports'), null);
  assert.equal(parseQuickAction('#transactions'), null);
  assert.equal(parseQuickAction('#more'), null);
  assert.equal(parseQuickAction(''), null);
  assert.equal(parseQuickAction(null), null);
});

test('parseQuickAction parses empty #add into default expense template', () => {
  const q = parseQuickAction('#add');
  assert.deepEqual(q, {
    quick: true,
    type: 'expense',
    amount: 0,
    note: '',
    categoryId: null,
    accountId: null,
    rawQuery: null,
  });
});

test('parseQuickAction evaluates amounts into exact paise and supports arithmetic', () => {
  const a1 = parseQuickAction('#add?amount=250');
  assert.equal(a1.amount, 25000);

  const a2 = parseQuickAction('#add?amt=150.50&note=Coffee');
  assert.equal(a2.amount, 15050);
  assert.equal(a2.note, 'Coffee');

  const a3 = parseQuickAction('#add?amount=100+50*2');
  assert.equal(a3.amount, 20000);

  const a4 = parseQuickAction('#add?amount=invalid');
  assert.equal(a4.amount, 0);
});

test('parseQuickAction respects type override and route shortcuts', () => {
  assert.equal(parseQuickAction('#income?amount=5000').type, 'income');
  assert.equal(parseQuickAction('#transfer?amount=1000').type, 'transfer');
  assert.equal(parseQuickAction('#add?amount=200&type=income').type, 'income');
});

test('parseQuickAction auto-suggests category from note or matches explicit cat name', () => {
  const dummyState = {
    categories: [
      { id: 'cat-food', name: 'Food & dining', kind: 'expense' },
      { id: 'cat-groc', name: 'Groceries', kind: 'expense' },
      { id: 'cat-sal', name: 'Salary', kind: 'income' },
    ],
    rules: [],
    txns: [],
    accounts: [
      { id: 'acc-hdfc', name: 'HDFC Bank', last4: '1234', archived: false },
      { id: 'acc-sbi', name: 'SBI Bank', last4: '5678', archived: false },
    ],
  };

  // Built-in Indian merchant match (Swiggy -> Food & dining)
  const q1 = parseQuickAction('#add?amount=450&note=Swiggy', dummyState);
  assert.equal(q1.categoryId, 'cat-food');

  // Explicit category name
  const q2 = parseQuickAction('#add?amount=900&cat=Groceries', dummyState);
  assert.equal(q2.categoryId, 'cat-groc');

  // Account matching by last 4 digits
  const q3 = parseQuickAction('#add?amount=900&last4=1234', dummyState);
  assert.equal(q3.accountId, 'acc-hdfc');

  // Account matching by account name keyword
  const q4 = parseQuickAction('#add?amount=900&acc=sbi', dummyState);
  assert.equal(q4.accountId, 'acc-sbi');
});

test('resolveQuickAction resolves category and account after the vault is unlocked', () => {
  const raw = parseQuickAction('#add?amount=300&merchant=Zomato&last4=5678');
  assert.equal(raw.categoryId, null); // state was null at parse time
  assert.equal(raw.accountId, null);

  const dummyState = {
    categories: [{ id: 'c1', name: 'Food & dining', kind: 'expense' }],
    rules: [],
    txns: [],
    accounts: [{ id: 'a1', name: 'SBI Bank', last4: '5678', archived: false }],
  };

  const resolved = resolveQuickAction(raw, dummyState);
  assert.equal(resolved.amount, 30000);
  assert.equal(resolved.note, 'Zomato');
  assert.equal(resolved.categoryId, 'c1');
  assert.equal(resolved.accountId, 'a1');
});
