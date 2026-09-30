// The add / edit transaction sheet, used from every screen.

import { state, save, uid } from './store.js';
import { openSheet, closeSheet, esc, icon, toast, money, $, $$, confirmSheet } from './ui.js';
import { evalAmount, suggestCategory, accountByLast4, frequentEntries, catMap } from './calc.js';
import { iso, prettyDate } from './lib/dates.js';
import { parseSMS } from './lib/sms.js';
import { fromPaise } from './lib/money.js';

let onChange = () => {};
export function setTxnChangeHandler(fn) { onChange = fn; }

function defaultAccountId() {
  const last = state.settings.lastAccountId;
  if (last && state.accounts.some((a) => a.id === last && !a.archived)) return last;
  return state.accounts.find((a) => !a.archived)?.id || state.accounts[0]?.id;
}

function deleteTxn(existing) {
  const idx = state.txns.findIndex((x) => x.id === existing.id);
  const [removed] = state.txns.splice(idx, 1);
  save();
  onChange();
  toast('Transaction deleted', () => { state.txns.splice(idx, 0, removed); save(); onChange(); });
}

// Balance corrections are shown read-only; they can only be deleted.
function openAdjustment(t) {
  const acc = state.accounts.find((a) => a.id === t.accountId);
  const panel = openSheet('Balance correction', `
    <p>${money(t.amount, { sign: true, cls: t.amount < 0 ? 'neg' : 'pos' })} on <strong>${esc(acc?.name || 'account')}</strong>, ${esc(prettyDate(t.date))}.</p>
    <p class="muted">Added when you updated the balance to match your bank. It changes the account balance but doesn't count as income or spending.</p>
    <div class="row-end"><button type="button" class="btn btn-danger-ghost" id="adj-del">${icon('trash', 18)} Delete correction</button></div>`);
  $('#adj-del', panel).onclick = async () => {
    if (!(await confirmSheet('Delete this correction?', 'The account balance will change back.'))) return;
    deleteTxn(t);
  };
}

export function openTxnForm(existing = null, preset = {}) {
  if (existing?.type === 'adjustment') return openAdjustment(existing);

  const t = existing ? { ...existing } : {
    type: preset.type || 'expense', amount: preset.amount || 0, categoryId: preset.categoryId || null,
    accountId: preset.accountId || defaultAccountId(), toAccountId: preset.toAccountId || null,
    date: preset.date || iso(), note: preset.note || '', tags: [],
  };

  const accOptions = (sel) => state.accounts
    .filter((a) => !a.archived || a.id === sel)
    .map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}${a.last4 ? ` ··${esc(String(a.last4).slice(-4))}` : ''}</option>`).join('');
  const otherAcc = state.accounts.find((a) => !a.archived && a.id !== t.accountId)?.id;
  const cats = catMap(state);
  const frequent = existing ? [] : frequentEntries(state);

  const body = `
  <form id="txn-form" class="form" novalidate>
    <div class="seg" role="radiogroup" aria-label="Type">
      ${['expense', 'income', 'transfer'].map((k) => `
        <label class="seg-item seg-${k}"><input type="radio" name="type" value="${k}" ${t.type === k ? 'checked' : ''}><span>${k === 'expense' ? 'Expense' : k === 'income' ? 'Income' : 'Transfer'}</span></label>`).join('')}
    </div>

    ${frequent.length ? `<div class="field" id="tf-quick-wrap"><span class="label">Quick add</span>
      <div class="chips chips-scroll">${frequent.map((f, i) => `
        <button type="button" class="chip" data-quick="${i}" style="--chip:${esc(cats[f.categoryId]?.color || 'var(--accent)')}">
          <span aria-hidden="true">${esc(cats[f.categoryId]?.icon || '•')}</span>${esc(f.note)} <span class="amt">${esc('₹' + fromPaise(f.amount).toLocaleString('en-IN'))}</span></button>`).join('')}
      </div></div>` : ''}

    <label class="amount-field">
      <span class="rupee">₹</span>
      <input id="tf-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${t.amount ? fromPaise(t.amount) : ''}" aria-label="Amount">
    </label>
    <p class="hint" id="tf-calc" aria-live="polite">You can type sums like 250+120</p>

    <div class="field" id="tf-cat-wrap">
      <div class="row-between"><span class="label">Category</span>
        <button type="button" class="btn-link small" id="tf-split-toggle">Split across categories</button></div>
      <div class="chips" id="tf-cats"></div>
      <div id="tf-splits" class="splits" hidden></div>
    </div>

    <div class="grid-2">
      <label class="field"><span class="label" id="tf-acc-label">Paid from</span>
        <select id="tf-account" name="accountId">${accOptions(t.accountId)}</select></label>
      <label class="field" id="tf-to-wrap"><span class="label">To account</span>
        <select id="tf-to" name="toAccountId">${accOptions(t.toAccountId || otherAcc)}</select></label>
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

  const panel = openSheet(existing ? 'Edit transaction' : 'Add transaction', body);
  const form = $('#txn-form', panel);
  const amountEl = $('#tf-amount', panel);
  let selectedCat = t.categoryId;
  let userPickedCat = !!existing;
  // Split rows: [{ categoryId, amount: string }]
  let splits = t.splits?.length ? t.splits.map((p) => ({ categoryId: p.categoryId, amount: String(fromPaise(p.amount)) })) : null;

  const currentType = () => form.type.value;

  function renderCats() {
    const type = currentType();
    const list = state.categories.filter((c) => c.kind === type);
    if (!list.find((c) => c.id === selectedCat)) selectedCat = list[0]?.id || null;
    $('#tf-cats', panel).innerHTML = list.map((c) => `
      <button type="button" class="chip ${c.id === selectedCat ? 'on' : ''}" data-cat="${esc(c.id)}" style="--chip:${esc(c.color)}">
        <span aria-hidden="true">${esc(c.icon)}</span>${esc(c.name)}</button>`).join('');
    $$('[data-cat]', panel).forEach((b) => (b.onclick = () => { selectedCat = b.dataset.cat; userPickedCat = true; renderCats(); }));
  }

  function renderSplits() {
    const on = !!splits && currentType() !== 'transfer';
    $('#tf-cats', panel).hidden = on;
    $('#tf-splits', panel).hidden = !on;
    $('#tf-split-toggle', panel).textContent = on ? 'Use one category' : 'Split across categories';
    if (!on) return;
    const list = state.categories.filter((c) => c.kind === currentType());
    const total = evalAmount(amountEl.value) || 0;
    const assigned = splits.reduce((s, p) => s + (evalAmount(p.amount) || 0), 0);
    const left = total - assigned;
    $('#tf-splits', panel).innerHTML = `
      ${splits.map((p, i) => `
        <div class="split-row">
          <select data-split-cat="${i}" aria-label="Category ${i + 1}">${list.map((c) => `<option value="${esc(c.id)}" ${c.id === p.categoryId ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>
          <input data-split-amt="${i}" inputmode="decimal" placeholder="₹0" value="${esc(p.amount)}" aria-label="Amount ${i + 1}">
          <button type="button" class="icon-btn" data-split-del="${i}" aria-label="Remove">${icon('x', 18)}</button>
        </div>`).join('')}
      <div class="row-between">
        <button type="button" class="btn btn-small" id="tf-split-add">${icon('plus', 16)} Add category</button>
        <span class="small ${left === 0 ? 'pos' : 'neg'}" id="tf-split-left">${left === 0 ? 'All assigned' : left > 0 ? `₹${fromPaise(left).toLocaleString('en-IN')} left to assign` : `₹${fromPaise(-left).toLocaleString('en-IN')} too much`}</span>
      </div>`;
    $$('[data-split-cat]', panel).forEach((s) => (s.onchange = () => { splits[+s.dataset.splitCat].categoryId = s.value; }));
    $$('[data-split-amt]', panel).forEach((s) => (s.oninput = () => { splits[+s.dataset.splitAmt].amount = s.value; updateLeft(); }));
    $$('[data-split-del]', panel).forEach((b) => (b.onclick = () => { splits.splice(+b.dataset.splitDel, 1); if (!splits.length) splits = null; renderSplits(); }));
    $('#tf-split-add', panel).onclick = () => {
      const used = new Set(splits.map((p) => p.categoryId));
      const next = list.find((c) => !used.has(c.id)) || list[0];
      const remaining = (evalAmount(amountEl.value) || 0) - splits.reduce((s, p) => s + (evalAmount(p.amount) || 0), 0);
      splits.push({ categoryId: next.id, amount: remaining > 0 ? String(fromPaise(remaining)) : '' });
      renderSplits();
    };
  }

  function updateLeft() {
    const el = $('#tf-split-left', panel);
    if (!el) return;
    const left = (evalAmount(amountEl.value) || 0) - splits.reduce((s, p) => s + (evalAmount(p.amount) || 0), 0);
    el.className = `small ${left === 0 ? 'pos' : 'neg'}`;
    el.textContent = left === 0 ? 'All assigned' : left > 0 ? `₹${fromPaise(left).toLocaleString('en-IN')} left to assign` : `₹${fromPaise(-left).toLocaleString('en-IN')} too much`;
  }

  $('#tf-split-toggle', panel).onclick = () => {
    if (splits) splits = null;
    else {
      const total = evalAmount(amountEl.value);
      splits = [{ categoryId: selectedCat, amount: total > 0 ? String(fromPaise(total)) : '' }];
    }
    renderSplits();
  };

  function syncType() {
    const type = currentType();
    $('#tf-cat-wrap', panel).hidden = type === 'transfer';
    $('#tf-to-wrap', panel).hidden = type !== 'transfer';
    const quick = $('#tf-quick-wrap', panel);
    if (quick) quick.hidden = type !== 'expense';
    $('#tf-acc-label', panel).textContent = type === 'income' ? 'Received in' : type === 'transfer' ? 'From account' : 'Paid from';
    if (splits) splits = null;
    renderCats();
    renderSplits();
  }

  $$('input[name=type]', form).forEach((r) => (r.onchange = syncType));
  syncType();
  if (t.splits?.length) { splits = t.splits.map((p) => ({ categoryId: p.categoryId, amount: String(fromPaise(p.amount)) })); renderSplits(); }

  $$('[data-quick]', panel).forEach((b) => (b.onclick = () => {
    const f = frequent[+b.dataset.quick];
    amountEl.value = fromPaise(f.amount);
    $('#tf-note', panel).value = f.note;
    selectedCat = f.categoryId;
    userPickedCat = true;
    if (state.accounts.some((a) => a.id === f.accountId && !a.archived)) $('#tf-account', panel).value = f.accountId;
    renderCats();
    toast('Filled in. Check the date and save.');
  }));

  amountEl.oninput = () => {
    const v = amountEl.value;
    const hint = $('#tf-calc', panel);
    if (/[+\-*/]/.test(v.replace(/^-/, ''))) {
      const p = evalAmount(v);
      hint.textContent = isNaN(p) ? 'Check the sum' : `= ₹${fromPaise(p).toLocaleString('en-IN')}`;
    } else hint.textContent = 'You can type sums like 250+120';
    if (splits) updateLeft();
  };
  if (!existing) setTimeout(() => amountEl.focus(), 50);

  $('#tf-note', panel).oninput = (e) => {
    if (userPickedCat || splits) return;
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
      const byDigits = accountByLast4(state, r.last4);
      const byMethod = r.method && state.accounts.find((a) => a.type === r.method && !a.archived);
      const acc = byDigits || byMethod;
      if (acc) $('#tf-account', panel).value = acc.id;
      box.remove();
      showError('');
      toast(byDigits ? `Filled from SMS. Account: ${byDigits.name}.` : r.last4 ? `Filled from SMS. Tip: add ··${r.last4} to an account to match it next time.` : 'Filled from SMS. Check and save.');
    };
  });

  $('#tf-delete', panel)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Delete transaction?', 'This removes it from all totals.'))) return;
    deleteTxn(existing);
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

    let splitParts = null;
    if (splits && type !== 'transfer') {
      splitParts = splits.map((p) => ({ categoryId: p.categoryId, amount: evalAmount(p.amount) }));
      if (splitParts.some((p) => !(p.amount > 0))) { showError('Each split needs an amount above ₹0.'); return; }
      const sum = splitParts.reduce((s, p) => s + p.amount, 0);
      if (sum !== amount) { showError(`The splits add up to ₹${fromPaise(sum).toLocaleString('en-IN')}, but the total is ₹${fromPaise(amount).toLocaleString('en-IN')}.`); return; }
      // Same category twice: combine.
      const m = new Map();
      splitParts.forEach((p) => m.set(p.categoryId, (m.get(p.categoryId) || 0) + p.amount));
      splitParts = [...m.entries()].map(([categoryId, a]) => ({ categoryId, amount: a })).sort((a, b) => b.amount - a.amount);
      if (splitParts.length === 1) { selectedCat = splitParts[0].categoryId; splitParts = null; }
    }
    if (type !== 'transfer' && !splitParts && !selectedCat) { showError('Pick a category.'); return; }

    const rec = {
      id: existing?.id || uid(),
      type, amount, date,
      categoryId: type === 'transfer' ? null : splitParts ? splitParts[0].categoryId : selectedCat,
      ...(splitParts ? { splits: splitParts } : {}),
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
    } else {
      state.txns.push(rec);
      state.settings.lastAccountId = rec.accountId;
    }
    save();
    onChange();
    closeSheet();
    if (again) {
      toast('Saved');
      openTxnForm(null, { type, accountId: rec.accountId, date });
    } else toast(existing ? 'Changes saved' : 'Saved');
  };
}
