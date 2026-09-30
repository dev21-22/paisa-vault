// The add / edit transaction sheet, used from every screen.

import { state, save, uid } from './store.js';
import { openSheet, closeSheet, esc, icon, toast, $, $$, confirmSheet } from './ui.js';
import { evalAmount, suggestCategory } from './calc.js';
import { iso } from './lib/dates.js';
import { parseSMS } from './lib/sms.js';
import { fromPaise } from './lib/money.js';

let onChange = () => {};
export function setTxnChangeHandler(fn) { onChange = fn; }

export function openTxnForm(existing = null, preset = {}) {
  const t = existing ? { ...existing } : {
    type: preset.type || 'expense', amount: preset.amount || 0, categoryId: preset.categoryId || null,
    accountId: preset.accountId || state.accounts[0]?.id, toAccountId: null, date: preset.date || iso(), note: preset.note || '', tags: [],
  };

  const accOptions = (sel) => state.accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');

  const body = `
  <form id="txn-form" class="form" novalidate>
    <div class="seg" role="radiogroup" aria-label="Type">
      ${['expense', 'income', 'transfer'].map((k) => `
        <label class="seg-item seg-${k}"><input type="radio" name="type" value="${k}" ${t.type === k ? 'checked' : ''}><span>${k === 'expense' ? 'Expense' : k === 'income' ? 'Income' : 'Transfer'}</span></label>`).join('')}
    </div>

    <label class="amount-field">
      <span class="rupee">₹</span>
      <input id="tf-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${t.amount ? fromPaise(t.amount) : ''}" aria-label="Amount">
    </label>
    <p class="hint" id="tf-calc" aria-live="polite">You can type sums like 250+120</p>

    <div class="field" id="tf-cat-wrap">
      <span class="label">Category</span>
      <div class="chips" id="tf-cats"></div>
    </div>

    <div class="grid-2">
      <label class="field"><span class="label" id="tf-acc-label">Paid from</span>
        <select id="tf-account" name="accountId">${accOptions(t.accountId)}</select></label>
      <label class="field" id="tf-to-wrap"><span class="label">To account</span>
        <select id="tf-to" name="toAccountId">${accOptions(t.toAccountId || state.accounts[1]?.id)}</select></label>
      <label class="field"><span class="label">Date</span>
        <input id="tf-date" type="date" name="date" value="${esc(t.date)}" required></label>
    </div>

    <label class="field"><span class="label">Note or merchant</span>
      <input id="tf-note" name="note" list="tf-notes" autocomplete="off" maxlength="120" value="${esc(t.note)}" placeholder="e.g. Swiggy, petrol, milk"></label>
    <datalist id="tf-notes">${[...new Set(state.txns.slice(-300).map((x) => x.note).filter(Boolean))].slice(-80).map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>

    <label class="field"><span class="label">Tags <span class="muted">(optional, comma separated)</span></span>
      <input id="tf-tags" name="tags" autocomplete="off" maxlength="120" value="${esc((t.tags || []).join(', '))}" placeholder="trip-goa, office"></label>

    <p class="error" id="tf-error" role="alert" hidden></p>

    <div class="row-between">
      ${existing ? `<button type="button" class="btn btn-danger-ghost" id="tf-delete">${icon('trash', 18)} Delete</button>` : `<button type="button" class="btn btn-ghost" id="tf-sms">${icon('sms', 18)} Paste bank SMS</button>`}
      <div class="row-end">
        ${existing ? '' : '<button type="submit" class="btn" data-again="1">Save &amp; add another</button>'}
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </div>
  </form>`;

  const panel = openSheet(existing ? 'Edit transaction' : 'Add transaction', body, { onMount: () => {} });
  const form = $('#txn-form', panel);
  let selectedCat = t.categoryId;
  let userPickedCat = !!existing;

  const currentType = () => form.type.value;

  function renderCats() {
    const type = currentType();
    const cats = state.categories.filter((c) => c.kind === type);
    if (!cats.find((c) => c.id === selectedCat)) selectedCat = cats[0]?.id || null;
    $('#tf-cats', panel).innerHTML = cats.map((c) => `
      <button type="button" class="chip ${c.id === selectedCat ? 'on' : ''}" data-cat="${esc(c.id)}" style="--chip:${esc(c.color)}">
        <span aria-hidden="true">${esc(c.icon)}</span>${esc(c.name)}</button>`).join('');
    $$('[data-cat]', panel).forEach((b) => (b.onclick = () => { selectedCat = b.dataset.cat; userPickedCat = true; renderCats(); }));
  }

  function syncType() {
    const type = currentType();
    $('#tf-cat-wrap', panel).hidden = type === 'transfer';
    $('#tf-to-wrap', panel).hidden = type !== 'transfer';
    $('#tf-acc-label', panel).textContent = type === 'income' ? 'Received in' : type === 'transfer' ? 'From account' : 'Paid from';
    form.dataset.type = type;
    renderCats();
  }

  $$('input[name=type]', form).forEach((r) => (r.onchange = syncType));
  syncType();

  const amountEl = $('#tf-amount', panel);
  amountEl.oninput = () => {
    const v = amountEl.value;
    const hint = $('#tf-calc', panel);
    if (/[+\-*/]/.test(v.replace(/^-/, ''))) {
      const p = evalAmount(v);
      hint.textContent = isNaN(p) ? 'Check the sum' : `= ₹${fromPaise(p).toLocaleString('en-IN')}`;
    } else hint.textContent = 'You can type sums like 250+120';
  };
  if (!existing) setTimeout(() => amountEl.focus(), 50);

  $('#tf-note', panel).oninput = (e) => {
    if (userPickedCat) return;
    const s = suggestCategory(state, e.target.value, currentType());
    if (s && s !== selectedCat) { selectedCat = s; renderCats(); }
  };

  $('#tf-sms', panel)?.addEventListener('click', () => {
    const box = document.createElement('div');
    box.className = 'sms-box';
    box.innerHTML = `
      <label class="field"><span class="label">Paste the bank or UPI SMS</span>
      <textarea id="tf-sms-text" rows="4" placeholder="Rs.450.00 debited from A/c XX1234 on 29-09-26 to VPA swiggy@icici..."></textarea></label>
      <p class="hint">Read on this device only. The SMS text is not saved.</p>
      <button type="button" class="btn" id="tf-sms-go">Fill from SMS</button>`;
    form.prepend(box);
    $('#tf-sms', panel).hidden = true;
    $('#tf-sms-text', panel).focus();
    $('#tf-sms-go', panel).onclick = () => {
      const r = parseSMS($('#tf-sms-text', panel).value);
      if (!r) { showError('No amount found in that SMS. Check that it has Rs, INR or ₹.'); return; }
      form.querySelector(`input[name=type][value=${r.type}]`).checked = true;
      syncType();
      amountEl.value = fromPaise(r.amount);
      if (r.merchant) {
        $('#tf-note', panel).value = r.merchant;
        const s = suggestCategory(state, r.merchant, r.type);
        if (s) { selectedCat = s; renderCats(); }
      }
      if (r.date) $('#tf-date', panel).value = r.date;
      if (r.method) {
        const acc = state.accounts.find((a) => a.type === r.method);
        if (acc) $('#tf-account', panel).value = acc.id;
      }
      box.remove();
      showError('');
      toast('Filled from SMS. Check and save.');
    };
  });

  $('#tf-delete', panel)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Delete transaction?', 'This removes it from all totals.'))) return;
    const idx = state.txns.findIndex((x) => x.id === existing.id);
    const [removed] = state.txns.splice(idx, 1);
    save();
    onChange();
    toast('Transaction deleted', () => { state.txns.splice(idx, 0, removed); save(); onChange(); });
  });

  function showError(msg) {
    const e = $('#tf-error', panel);
    e.textContent = msg;
    e.hidden = !msg;
  }

  form.onsubmit = (e) => {
    e.preventDefault();
    const again = e.submitter?.dataset.again === '1';
    const amount = evalAmount(amountEl.value);
    if (!(amount > 0)) { showError('Enter an amount above ₹0.'); amountEl.focus(); return; }
    if (amount > 1e13) { showError('That amount is too large.'); return; }
    const type = currentType();
    const date = form.date.value;
    if (!date) { showError('Pick a date.'); return; }
    if (type === 'transfer' && form.accountId.value === form.toAccountId.value) { showError('Pick two different accounts for a transfer.'); return; }
    if (type !== 'transfer' && !selectedCat) { showError('Pick a category.'); return; }

    const rec = {
      id: existing?.id || uid(),
      type, amount, date,
      categoryId: type === 'transfer' ? null : selectedCat,
      accountId: form.accountId.value,
      toAccountId: type === 'transfer' ? form.toAccountId.value : null,
      note: form.note.value.trim(),
      tags: form.tags.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 10),
      created: existing?.created || Date.now(),
      ...(existing?.recurringId ? { recurringId: existing.recurringId } : {}),
    };
    if (existing) {
      const i = state.txns.findIndex((x) => x.id === existing.id);
      state.txns[i] = rec;
    } else state.txns.push(rec);
    save();
    onChange();
    if (again) {
      closeSheet();
      toast('Saved');
      openTxnForm(null, { type, accountId: rec.accountId, date });
    } else {
      closeSheet();
      toast(existing ? 'Changes saved' : 'Saved');
    }
  };
}
