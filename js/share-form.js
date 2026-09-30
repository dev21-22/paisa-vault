// Sheets for splitting bills: add/edit a shared expense, settle up, and send a reminder.
// Each shared expense keeps one linked transaction so your own totals stay correct:
//   you paid   -> expense of the full amount from your account, but only your share counts as spending
//   they paid  -> expense of just your share, with no account (no money left your account yet)
// Settling up is a 'settlement' transaction: it moves money but is never spending or income.

import { state, save, uid } from './store.js';
import { openSheet, closeSheet, esc, icon, toast, money, confirmSheet, $, $$ } from './ui.js';
import { evalAmount } from './calc.js';
import { computeShares, balances, reminderText, upiLink, ME } from './lib/split.js';
import { iso } from './lib/dates.js';
import { fromPaise, formatINR } from './lib/money.js';

let onChange = () => {};
export function setShareChangeHandler(fn) { onChange = fn; }

export const personName = (id) => (id === ME ? 'You' : state.people.find((p) => p.id === id)?.name || 'Someone');

export function addPerson(name) {
  const n = name.trim().slice(0, 40);
  if (!n) return null;
  const found = state.people.find((p) => p.name.toLowerCase() === n.toLowerCase());
  if (found) return found;
  const p = { id: uid(), name: n, phone: '' };
  state.people.push(p);
  return p;
}

function linkTxn(s) {
  const myShare = s.shares[ME] || 0;
  const base = { date: s.date, note: s.desc, categoryId: s.categoryId, tags: ['shared'], created: s.created || Date.now() };
  const rec = s.paidBy === ME
    ? { ...base, type: 'expense', amount: s.amount, accountId: s.accountId, toAccountId: null, shared: { id: s.id, myShare, paidBy: ME } }
    : { ...base, type: 'expense', amount: myShare, accountId: null, toAccountId: null, shared: { id: s.id, myShare, paidBy: s.paidBy } };
  const i = state.txns.findIndex((t) => t.id === s.txnId);
  if (i >= 0) state.txns[i] = { ...state.txns[i], ...rec, id: s.txnId };
  else { s.txnId = uid(); state.txns.push({ ...rec, id: s.txnId }); }
}

export function deleteShared(s) {
  state.shared = state.shared.filter((x) => x.id !== s.id);
  state.txns = state.txns.filter((t) => t.id !== s.txnId);
}

// ---------- Add / edit a shared expense ----------
export function openSharedForm(existing = null, preset = {}) {
  const s = existing ? JSON.parse(JSON.stringify(existing)) : {
    groupId: preset.groupId || null, desc: preset.desc || '', amount: preset.amount || 0, date: preset.date || iso(),
    paidBy: ME, mode: 'equal', input: {}, shares: {}, categoryId: preset.categoryId || null,
    accountId: preset.accountId || state.settings.lastAccountId || state.accounts.find((a) => !a.archived)?.id,
  };
  const group = () => state.groups.find((g) => g.id === s.groupId);
  // Who is in the split
  let who = existing ? Object.keys(existing.shares)
    : preset.personIds ? [ME, ...preset.personIds]
      : group() ? [ME, ...group().memberIds] : [ME];
  if (preset.onlyThem) who = who.filter((id) => id !== ME);

  const expenseCats = state.categories.filter((c) => c.kind === 'expense');
  if (!s.categoryId) s.categoryId = expenseCats[0]?.id;

  const panel = openSheet(existing ? 'Edit shared expense' : 'Split a bill', `
    <form class="form" id="sf" novalidate>
      <label class="field"><span class="label">What was it for?</span><input id="sf-desc" maxlength="80" value="${esc(s.desc)}" placeholder="e.g. Dinner at Toit, Goa cab, Electricity bill"></label>
      <label class="amount-field"><span class="rupee">₹</span><input id="sf-amt" inputmode="decimal" autocomplete="off" placeholder="Total bill" value="${s.amount ? fromPaise(s.amount) : ''}" aria-label="Total amount"></label>
      <div class="grid-2">
        <label class="field"><span class="label">Group</span><select id="sf-group"><option value="">No group</option>${state.groups.filter((g) => !g.archived || g.id === s.groupId).map((g) => `<option value="${esc(g.id)}" ${g.id === s.groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Date</span><input id="sf-date" type="date" value="${esc(s.date)}"></label>
      </div>

      <div class="field"><span class="label">Split between</span>
        <div class="chips" id="sf-who"></div>
        <div class="add-person"><input id="sf-new" maxlength="40" placeholder="Add a person by name" aria-label="New person's name"><button type="button" class="btn btn-small" id="sf-add">${icon('plus', 16)} Add</button></div>
      </div>

      <label class="field"><span class="label">Paid by</span><select id="sf-paid"></select></label>

      <div class="field"><span class="label">How to split</span>
        <div class="seg seg-small" role="radiogroup" aria-label="Split method">
          ${[['equal', 'Equally'], ['exact', 'Exact ₹'], ['percent', '%'], ['shares', 'Shares']].map(([k, l]) => `<label class="seg-item"><input type="radio" name="mode" value="${k}" ${s.mode === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
      </div>
      <div id="sf-rows" class="share-rows"></div>
      <p class="small" id="sf-sum" aria-live="polite"></p>

      <div class="grid-2">
        <label class="field"><span class="label">Category (for your share)</span><select id="sf-cat">${expenseCats.map((c) => `<option value="${esc(c.id)}" ${c.id === s.categoryId ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field" id="sf-acc-wrap"><span class="label">You paid from</span><select id="sf-acc">${state.accounts.filter((a) => !a.archived || a.id === s.accountId).map((a) => `<option value="${esc(a.id)}" ${a.id === s.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      </div>
      <p class="error" id="sf-err" role="alert" hidden></p>
      <div class="row-between">
        ${existing ? `<button type="button" class="btn btn-danger-ghost" id="sf-del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);

  const err = (m) => { const e = $('#sf-err', panel); e.textContent = m; e.hidden = !m; };
  const total = () => evalAmount($('#sf-amt', panel).value) || 0;
  const mode = () => $('input[name=mode]:checked', panel).value;
  const candidates = () => {
    const g = group();
    const ids = g ? [ME, ...g.memberIds] : [ME, ...state.people.map((p) => p.id)];
    for (const id of who) if (!ids.includes(id)) ids.push(id);
    return ids;
  };

  function renderWho() {
    $('#sf-who', panel).innerHTML = candidates().map((id) => `
      <button type="button" class="chip ${who.includes(id) ? 'on' : ''}" data-who="${esc(id)}" style="--chip:var(--accent)">${id === ME ? '🙋 You' : esc(personName(id))}</button>`).join('')
      || '<span class="muted small">Add the people you shared this with.</span>';
    $$('[data-who]', panel).forEach((b) => (b.onclick = () => {
      const id = b.dataset.who;
      who = who.includes(id) ? who.filter((x) => x !== id) : [...who, id];
      renderAll();
    }));
    const paid = $('#sf-paid', panel);
    const opts = candidates();
    if (!opts.includes(s.paidBy)) s.paidBy = ME;
    paid.innerHTML = opts.map((id) => `<option value="${esc(id)}" ${id === s.paidBy ? 'selected' : ''}>${esc(id === ME ? 'You' : personName(id))}</option>`).join('');
    $('#sf-acc-wrap', panel).hidden = s.paidBy !== ME;
  }

  function renderRows() {
    const m = mode();
    const t = total();
    let shares = null;
    let problem = '';
    try { shares = computeShares(t, who, m, inputFor(m)); } catch (e) { problem = e.message; }
    $('#sf-rows', panel).innerHTML = who.map((id) => {
      const field = m === 'equal' ? '' : `<input data-in="${esc(id)}" inputmode="decimal" value="${esc(s.input?.[m]?.[id] ?? '')}" placeholder="${m === 'exact' ? '₹' : m === 'percent' ? '%' : 'shares'}" aria-label="${esc(personName(id))} ${m}">`;
      return `<div class="share-row"><span class="share-name">${id === ME ? 'You' : esc(personName(id))}</span>${field}<span class="share-amt amt">${shares ? esc(formatINR(shares[id] || 0)) : '—'}</span></div>`;
    }).join('');
    $$('[data-in]', panel).forEach((inp) => (inp.oninput = () => {
      s.input ||= {};
      s.input[m] ||= {};
      s.input[m][inp.dataset.in] = inp.value;
      updateSum();
    }));
    updateSum(problem, shares);
  }

  function inputFor(m) {
    const raw = s.input?.[m] || {};
    if (m === 'exact') return Object.fromEntries(who.map((id) => [id, evalAmount(raw[id] || '0') || 0]));
    return Object.fromEntries(who.map((id) => [id, parseFloat(raw[id]) || 0]));
  }

  function updateSum(problem, shares) {
    if (problem === undefined) {
      try { shares = computeShares(total(), who, mode(), inputFor(mode())); problem = ''; } catch (e) { problem = e.message; }
      if (shares) $$('.share-row', panel).forEach((row, i) => { $('.share-amt', row).textContent = formatINR(shares[who[i]] || 0); });
    }
    const el = $('#sf-sum', panel);
    if (problem) { el.className = 'small neg'; el.textContent = total() ? problem : ''; return; }
    const mine = shares[ME] || 0;
    const others = total() - mine;
    el.className = 'small muted';
    el.textContent = s.paidBy === ME
      ? `Your share ${formatINR(mine)}. Others owe you ${formatINR(others)}.`
      : `${personName(s.paidBy)} paid. You owe ${personName(s.paidBy)} ${formatINR(mine)}.`;
  }

  function renderAll() { renderWho(); renderRows(); }

  $('#sf-group', panel).onchange = (e) => {
    s.groupId = e.target.value || null;
    const g = group();
    if (g) who = [ME, ...g.memberIds];
    renderAll();
  };
  $('#sf-paid', panel).onchange = (e) => { s.paidBy = e.target.value; $('#sf-acc-wrap', panel).hidden = s.paidBy !== ME; updateSum(); };
  $$('input[name=mode]', panel).forEach((r) => (r.onchange = renderRows));
  $('#sf-amt', panel).oninput = () => updateSum();
  const addNew = () => {
    const p = addPerson($('#sf-new', panel).value);
    if (!p) return;
    if (!who.includes(p.id)) who.push(p.id);
    const g = group();
    if (g && !g.memberIds.includes(p.id)) g.memberIds.push(p.id);
    $('#sf-new', panel).value = '';
    renderAll();
  };
  $('#sf-add', panel).onclick = addNew;
  $('#sf-new', panel).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } };
  renderAll();
  if (!existing) setTimeout(() => $('#sf-desc', panel).focus(), 50);

  $('#sf-del', panel)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Delete this shared expense?', 'Balances with everyone involved will change back.'))) return;
    deleteShared(existing);
    save();
    onChange();
    toast('Shared expense deleted');
  });

  $('#sf', panel).onsubmit = (e) => {
    e.preventDefault();
    const desc = $('#sf-desc', panel).value.trim();
    const amount = total();
    if (!desc) return err('Say what the bill was for.');
    if (!(amount > 0)) return err('Enter the total bill above ₹0.');
    if (!who.length) return err('Pick who shares this bill.');
    if (s.paidBy !== ME && !who.includes(ME)) return err('This bill doesn\'t involve you. Include yourself in the split, or pick "You" as the payer.');
    if (s.paidBy === ME && who.length === 1 && who[0] === ME) return err('Add at least one other person, or add this as a normal expense instead.');
    let shares;
    try { shares = computeShares(amount, who, mode(), inputFor(mode())); } catch (ex) { return err(ex.message); }
    const rec = {
      ...s, id: existing?.id || uid(), desc, amount, date: $('#sf-date', panel).value || iso(), mode: mode(), shares,
      categoryId: $('#sf-cat', panel).value, accountId: s.paidBy === ME ? $('#sf-acc', panel).value : null,
      created: existing?.created || Date.now(),
    };
    if (existing) state.shared[state.shared.findIndex((x) => x.id === existing.id)] = rec;
    else state.shared.push(rec);
    linkTxn(rec);
    if (rec.accountId) state.settings.lastAccountId = rec.accountId;
    save();
    onChange();
    closeSheet();
    const others = amount - (shares[ME] || 0);
    toast(rec.paidBy === ME ? `Saved. Others owe you ${formatINR(others)}.` : `Saved. You owe ${personName(rec.paidBy)} ${formatINR(shares[ME])}.`);
  };
}

// ---------- Settle up ----------
export function openSettle(personId = null, groupId = null) {
  const bal = balances(state, groupId);
  const people = state.people.filter((p) => bal[p.id] || p.id === personId);
  if (!people.length) { toast('Everyone is settled up.'); return; }
  let pid = personId || people[0].id;
  const panel = openSheet('Settle up', `
    <form class="form" id="st" novalidate>
      <label class="field"><span class="label">With</span><select id="st-p">${people.map((p) => `<option value="${esc(p.id)}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <p id="st-state" class="small"></p>
      <div class="seg" role="radiogroup" aria-label="Direction">
        <label class="seg-item seg-income"><input type="radio" name="dir" value="in"><span id="st-in">They paid me</span></label>
        <label class="seg-item seg-expense"><input type="radio" name="dir" value="out"><span>I paid them</span></label>
      </div>
      <label class="amount-field"><span class="rupee">₹</span><input id="st-amt" inputmode="decimal" aria-label="Amount"></label>
      <div class="grid-2">
        <label class="field"><span class="label" id="st-acc-l">Received in</span><select id="st-acc">${state.accounts.filter((a) => !a.archived).map((a) => `<option value="${esc(a.id)}" ${a.id === state.settings.lastAccountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Date</span><input id="st-date" type="date" value="${iso()}"></label>
      </div>
      <p class="hint">Settling up moves money between you but isn't counted as spending or income.</p>
      <p class="error" id="st-err" role="alert" hidden></p>
      <div class="row-end"><button type="submit" class="btn btn-primary">Record payment</button></div>
    </form>`);
  const sync = () => {
    pid = $('#st-p', panel).value;
    const b = bal[pid] || 0;
    const name = personName(pid);
    $('#st-state', panel).innerHTML = b > 0 ? `<span class="pos">${esc(name)} owes you ${money(b)}</span>` : b < 0 ? `<span class="neg">You owe ${esc(name)} ${money(-b)}</span>` : 'You are settled up.';
    $(`input[name=dir][value=${b < 0 ? 'out' : 'in'}]`, panel).checked = true;
    $('#st-amt', panel).value = b ? fromPaise(Math.abs(b)) : '';
    syncDir();
  };
  const syncDir = () => { $('#st-acc-l', panel).textContent = $('input[name=dir]:checked', panel).value === 'in' ? 'Received in' : 'Paid from'; };
  $('#st-p', panel).onchange = sync;
  $$('input[name=dir]', panel).forEach((r) => (r.onchange = syncDir));
  sync();
  $('#st', panel).onsubmit = (e) => {
    e.preventDefault();
    const amount = evalAmount($('#st-amt', panel).value);
    if (!(amount > 0)) { const er = $('#st-err', panel); er.textContent = 'Enter an amount above ₹0.'; er.hidden = false; return; }
    const direction = $('input[name=dir]:checked', panel).value;
    const accountId = $('#st-acc', panel).value;
    const date = $('#st-date', panel).value || iso();
    const name = personName(pid);
    const id = uid();
    const txnId = uid();
    state.settlements.push({ id, personId: pid, direction, amount, date, accountId, groupId, txnId, note: '', created: Date.now() });
    state.txns.push({ id: txnId, type: 'settlement', direction, amount, accountId, toAccountId: null, categoryId: null, date,
      note: direction === 'in' ? `${name} paid you` : `You paid ${name}`, personId: pid, settlementId: id, tags: [], created: Date.now() });
    save();
    onChange();
    closeSheet();
    const left = balances(state)[pid] || 0;
    toast(left === 0 ? `All settled with ${name}` : `Recorded. ${left > 0 ? `${name} still owes you ${formatINR(left)}` : `You still owe ${name} ${formatINR(-left)}`}.`);
  };
}

export function openSettlementDetail(txn) {
  const p = state.settlements.find((x) => x.id === txn.settlementId);
  const panel = openSheet('Settle-up payment', `
    <p><strong>${esc(txn.note)}</strong> · ${money(txn.amount)} on ${esc(txn.date)}</p>
    <p class="muted">Recorded when you settled up. It moves money between you and ${esc(personName(txn.personId))} but isn't counted as spending or income.</p>
    <div class="row-end"><button type="button" class="btn btn-danger-ghost" id="sd-del">${icon('trash', 18)} Delete payment</button></div>`);
  $('#sd-del', panel).onclick = async () => {
    if (!(await confirmSheet('Delete this payment?', 'The balance with this person will change back.'))) return;
    state.txns = state.txns.filter((t) => t.id !== txn.id);
    if (p) state.settlements = state.settlements.filter((x) => x.id !== p.id);
    save();
    onChange();
    toast('Payment deleted');
  };
}

// ---------- Reminder ----------
export function openReminder(personId) {
  const text = reminderText(state, personId, { myName: state.settings.name, upiId: state.settings.upiId });
  if (!text) { toast('They don\'t owe you anything right now.'); return; }
  const person = state.people.find((p) => p.id === personId);
  const bal = balances(state)[personId] || 0;
  const wa = `https://wa.me/${person.phone ? person.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1') : ''}?text=${encodeURIComponent(text)}`;
  const upi = upiLink(state.settings.upiId, state.settings.name, bal, 'Settle up');
  const panel = openSheet(`Remind ${person.name}`, `
    <textarea id="rm-text" rows="9" aria-label="Reminder message">${esc(text)}</textarea>
    ${state.settings.upiId ? '' : '<p class="hint" style="margin-top:0">Tip: add your UPI ID in Settings so reminders include a tap-to-pay link.</p>'}
    <div class="row-wrap">
      <button type="button" class="btn btn-primary" id="rm-copy">Copy message</button>
      ${navigator.share ? '<button type="button" class="btn" id="rm-share">Share…</button>' : ''}
      <a class="btn" id="rm-wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">Open WhatsApp</a>
    </div>
    ${upi ? `<p class="small muted">UPI pay link for ${money(bal)}: <span class="mono-break">${esc(upi)}</span></p>` : ''}
    <p class="small muted">Nothing is sent until you send it yourself.</p>`);
  $('#rm-copy', panel).onclick = async () => {
    const t = $('#rm-text', panel).value;
    try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { $('#rm-text', panel).select(); toast('Select all and copy'); }
  };
  $('#rm-share', panel)?.addEventListener('click', () => navigator.share({ text: $('#rm-text', panel).value }).catch(() => {}));
  $('#rm-wa', panel).onclick = () => { $('#rm-wa', panel).href = `https://wa.me/${wa.split('?')[0].split('/').pop()}?text=${encodeURIComponent($('#rm-text', panel).value)}`; };
}
