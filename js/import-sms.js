// Review many bank / UPI SMS at once: paste them (or a note an iPhone Shortcut fills for you),
// tick the real payments and save. Messages already reviewed are remembered by a short hash only,
// so the same note can be pasted again without adding anything twice. The SMS text is never saved.

import { state, save, uid } from './store.js';
import { openSheet, closeSheet, esc, icon, toast, pickFile, haptic, $, $$ } from './ui.js';
import { parseSMS, splitMessages, isPaymentSMS, smsHash } from './lib/sms.js';
import { suggestCategory, accountByLast4, findDuplicate } from './calc.js';
import { formatINR } from './lib/money.js';
import { iso, prettyDate } from './lib/dates.js';

const KEEP_HASHES = 3000;

export function openSMSImport(onDone, text = '') {
  const panel = openSheet('Bank SMS', `
    <div class="form">
      <p class="muted">Paste one or many bank and UPI messages. Payments are found on this device for you to check before saving. The SMS text is never saved.</p>
      <label class="field"><span class="label">Messages</span>
        <textarea id="sm-text" rows="5" placeholder="Rs.450.00 debited from A/c XX1234 on 24-10-26 to VPA swiggy@icici&#10;---&#10;INR 1,299.00 spent on HDFC Bank Card XX4321 at AMAZON on 23-10-26"></textarea></label>
      <div class="row-wrap">
        <button type="button" class="btn" id="sm-paste">${icon('sms', 18)} Paste</button>
        <button type="button" class="btn" id="sm-file">${icon('upload', 18)} Text file</button>
        <button type="button" class="btn btn-primary" id="sm-read">Find payments</button>
        <input type="file" id="sm-input" accept=".txt,text/plain" hidden>
      </div>
      <p class="error" id="sm-err" role="alert" hidden></p>
      <div id="sm-preview"></div>
      <details class="filters">
        <summary>Collect bank SMS automatically on iPhone</summary>
        <ol class="steps">
          <li>In the <strong>Notes</strong> app, make a note named <strong>Bank SMS</strong>.</li>
          <li>Open <strong>Shortcuts → Automation → +</strong> and choose <strong>Message</strong>.</li>
          <li>Set <strong>Message Contains</strong> to <code>debited</code>, pick <strong>Run Immediately</strong>, then <strong>Next → New Blank Automation</strong>.</li>
          <li>Add the action <strong>Append to Note</strong> and choose the note <strong>Bank SMS</strong>. In its text put: <strong>Current Date</strong>, a new line, <strong>Shortcut Input</strong> (the message), a new line, and <code>---</code>.</li>
          <li>Tap <strong>Current Date</strong> in that text and set its format to <strong>Custom: yyyy-MM-dd</strong>, so each message keeps the day it arrived.</li>
          <li>Repeat steps 2–5 for <code>spent</code> and <code>credited</code>.</li>
          <li>Whenever you like: open the note, <strong>Select All → Copy</strong>, then tap <strong>Paste</strong> here. Messages you have already reviewed are skipped, so clearing the note is optional.</li>
        </ol>
        <p class="muted small">The note holds the SMS text unencrypted, just like the Messages app does. Clear it now and then. Names in Shortcuts can differ slightly between iOS versions.</p>
      </details>
    </div>`, { wide: true });

  const box = $('#sm-text', panel);
  const err = (m) => { const e = $('#sm-err', panel); e.textContent = m; e.hidden = !m; };
  box.value = text;

  $('#sm-paste', panel).onclick = async () => {
    try {
      const t = (await navigator.clipboard?.readText?.()) || '';
      if (!t.trim()) { err('Nothing copied yet. Copy the messages first, then tap Paste.'); return; }
      box.value = t;
      read();
    } catch {
      box.focus();
      err('Long-press the box above and tap Paste.');
    }
  };
  $('#sm-file', panel).onclick = () => pickFile($('#sm-input', panel));
  $('#sm-input', panel).onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { err('That file is larger than 2 MB.'); return; }
    box.value = await f.text();
    read();
  };
  $('#sm-read', panel).onclick = () => read();

  async function read() {
    err('');
    const msgs = splitMessages(box.value);
    if (!msgs.length) { err('Paste at least one message.'); return; }
    const found = await readMessages(msgs);
    preview(panel, found, onDone);
  }

  if (text) read();
}

// Turns messages into rows to review. Exported for tests.
export async function readMessages(msgs, today = iso()) {
  const seen = new Set(state.smsSeen);
  const hashes = new Set();
  const rows = [];
  let already = 0;
  let skipped = 0;
  const fallbackAcc = (state.accounts.find((a) => a.id === state.settings.lastAccountId && !a.archived) || state.accounts.find((a) => !a.archived))?.id;
  for (const m of msgs) {
    const hash = await smsHash(m.text);
    if (seen.has(hash)) { already++; continue; }
    if (hashes.has(hash)) continue; // the same message pasted twice
    hashes.add(hash);
    const p = isPaymentSMS(m.text) ? parseSMS(m.text) : null;
    if (!p || !(p.amount > 0)) { skipped++; continue; }
    // The date in the SMS, else the day the Shortcut saved it, else today.
    const date = p.date && p.date <= today ? p.date : m.received && m.received <= today ? m.received : today;
    const acc = accountByLast4(state, p.last4) || (p.method && state.accounts.find((a) => a.type === p.method && !a.archived));
    const accountId = acc?.id || fallbackAcc;
    const note = p.merchant || (p.type === 'income' ? 'Money received' : 'Payment');
    const dup = !!findDuplicate(state, { accountId, amount: p.amount, date, type: p.type });
    rows.push({
      type: p.type, amount: p.amount, date, accountId, note, dup, include: !dup, matched: !!acc, last4: p.last4,
      categoryId: suggestCategory(state, p.merchant, p.type) || fallbackCat(p.type),
    });
  }
  return { rows, hashes: [...hashes], already, skipped };
}

function preview(panel, { rows, hashes, already, skipped }, onDone) {
  const accs = state.accounts.filter((a) => !a.archived);
  const catOpts = (type, sel) => state.categories.filter((c) => c.kind === type).map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('');
  const accOpts = (sel) => accs.map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}${a.last4 ? ` ··${esc(String(a.last4).slice(-4))}` : ''}</option>`).join('');
  const notes = [
    already ? `${already} already reviewed` : '',
    skipped ? `${skipped} not a payment (OTP, reminder, failed…)` : '',
  ].filter(Boolean).join(' · ');

  if (!rows.length) {
    $('#sm-preview', panel).innerHTML = `<p class="tip">No new payments found.${notes ? ` ${esc(notes)}.` : ''}</p>
      ${hashes.length ? '<div class="row-end"><button type="button" class="btn" id="sm-done">Mark as reviewed</button></div>' : ''}`;
    $('#sm-done', panel)?.addEventListener('click', () => { remember(hashes); save(); closeSheet(); toast('Marked as reviewed'); });
    return;
  }

  $('#sm-preview', panel).innerHTML = `
    <div class="row-between"><strong>${rows.length} payment${rows.length === 1 ? '' : 's'} found</strong>${notes ? `<span class="muted small">${esc(notes)}</span>` : ''}</div>
    <div class="import-list">${rows.map((r, i) => `
      <div class="import-row ${r.dup ? 'dup' : ''}">
        <input type="checkbox" data-inc="${i}" ${r.include ? 'checked' : ''} aria-label="Save this payment">
        <div class="import-main">
          <span class="txn-title">${esc(r.note)}</span>
          <span class="muted small">${esc(prettyDate(r.date))}${r.dup ? ' · looks like you already added it' : ''}${!r.matched && r.last4 ? ` · ··${esc(r.last4)} not linked to an account` : ''}</span>
          <select data-cat="${i}" aria-label="Category">${catOpts(r.type, r.categoryId)}</select>
          <select data-acc="${i}" aria-label="Account">${accOpts(r.accountId)}</select>
        </div>
        <span class="${r.type === 'income' ? 'pos' : 'neg'} import-amt amt">${r.type === 'income' ? '+' : '−'}${esc(formatINR(r.amount))}</span>
      </div>`).join('')}</div>
    <p class="muted small">Unticked messages are also marked as reviewed and won't be shown again.</p>
    <div class="row-end"><button type="button" class="btn btn-primary" id="sm-save">Save</button></div>`;

  const label = () => { $('#sm-save', panel).textContent = `Save ${rows.filter((r) => r.include).length} selected`; };
  $$('[data-inc]', panel).forEach((c) => (c.onchange = () => { rows[+c.dataset.inc].include = c.checked; label(); }));
  $$('[data-cat]', panel).forEach((s) => (s.onchange = () => { rows[+s.dataset.cat].categoryId = s.value; }));
  $$('[data-acc]', panel).forEach((s) => (s.onchange = () => { rows[+s.dataset.acc].accountId = s.value; }));
  label();

  $('#sm-save', panel).onclick = () => {
    const chosen = rows.filter((r) => r.include);
    const now = Date.now();
    chosen.forEach((r, i) => state.txns.push({
      id: uid(), type: r.type, amount: r.amount, categoryId: r.categoryId, accountId: r.accountId, toAccountId: null,
      date: r.date, note: r.note, tags: ['sms'], created: now + i,
    }));
    remember(hashes);
    save();
    haptic();
    closeSheet();
    toast(chosen.length ? `${chosen.length} payment${chosen.length === 1 ? '' : 's'} saved` : 'Marked as reviewed');
    onDone?.();
  };
}

function remember(hashes) {
  state.smsSeen = [...state.smsSeen, ...hashes].slice(-KEEP_HASHES);
}

function fallbackCat(type) {
  const list = state.categories.filter((c) => c.kind === type);
  return (list.find((c) => /^other/i.test(c.name)) || list[0])?.id;
}
