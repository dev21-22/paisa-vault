// Import a bank statement (CSV from net banking) into one account, with duplicate detection
// and automatic categories. Everything happens on this device.

import { state, save, uid } from './store.js';
import { openSheet, closeSheet, esc, icon, toast, pickFile, $, $$ } from './ui.js';
import { parseCSV, detectColumns, statementRows } from './lib/statement.js';
import { suggestCategory, findDuplicate } from './calc.js';
import { formatINR } from './lib/money.js';
import { prettyDate } from './lib/dates.js';

export function openStatementImport(ctx, accountId) {
  const accs = state.accounts.filter((a) => !a.archived);
  const panel = openSheet('Import bank statement', `
    <div class="form">
      <ol class="steps">
        <li>In your bank's net banking or app, download the account statement as <strong>CSV</strong> (sometimes called "Delimited" or "Excel/CSV"). If you only get an Excel file, open it and use <em>Save as → CSV</em>.</li>
        <li>Pick the account it belongs to and choose the file below.</li>
        <li>Check the list, then import. Entries you already have are spotted and left unticked.</li>
      </ol>
      <label class="field"><span class="label">Account</span>
        <select id="im-acc">${accs.map((a) => `<option value="${esc(a.id)}" ${a.id === accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <button type="button" class="btn btn-primary" id="im-pick">${icon('upload', 18)} Choose CSV file</button>
      <input type="file" id="im-file" accept=".csv,text/csv,text/plain" hidden>
      <p class="error" id="im-err" role="alert" hidden></p>
      <div id="im-preview"></div>
    </div>`, { wide: true });

  const err = (m) => { const e = $('#im-err', panel); e.textContent = m; e.hidden = !m; };
  $('#im-pick', panel).onclick = () => pickFile($('#im-file', panel));
  $('#im-file', panel).onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return err('That file is larger than 5 MB. Download a shorter date range.');
    if (/\.(xlsx?|pdf)$/i.test(f.name)) return err('This is an Excel or PDF file. Open it and save it as CSV first.');
    const rows = parseCSV(await f.text());
    const cols = detectColumns(rows);
    if (!cols) return err('Could not find the Date and Amount columns in this file. Make sure it is the transaction statement in CSV format.');
    const items = statementRows(rows, cols);
    if (!items.length) return err('No transactions found in this file.');
    err('');
    lastItems = items;
    preview(ctx, panel, items);
  };
  // Changing the account re-checks duplicates against that account.
  let lastItems = null;
  $('#im-acc', panel).onchange = () => { if (lastItems) preview(ctx, panel, lastItems); };
}

function preview(ctx, panel, items) {
  const accountId = $('#im-acc', panel).value;
  // ATM withdrawals move money to your cash wallet; they aren't spending.
  const cashId = state.accounts.find((a) => a.type === 'cash' && !a.archived)?.id;
  const rows = items.map((it) => {
    const dup = findDuplicate(state, { accountId, amount: it.amount, date: it.date, type: it.type });
    const atm = it.type === 'expense' && it.note === 'ATM withdrawal' && cashId && cashId !== accountId;
    return { ...it, atm, dup: !!dup, include: !dup, categoryId: suggestCategory(state, it.note, it.type) || suggestCategory(state, it.raw, it.type) || fallback(it.type) };
  });
  const catOpts = (type, sel) => state.categories.filter((c) => c.kind === type).map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('');
  const dups = rows.filter((r) => r.dup).length;

  $('#im-preview', panel).innerHTML = `
    <div class="row-between"><strong>${rows.length} transactions found</strong>${dups ? `<span class="pill">${dups} already here</span>` : ''}</div>
    <div class="import-list">${rows.map((r, i) => `
      <div class="import-row ${r.dup ? 'dup' : ''}">
        <input type="checkbox" data-inc="${i}" ${r.include ? 'checked' : ''} aria-label="Import this row">
        <div class="import-main">
          <span class="txn-title">${esc(r.note || '(no description)')}</span>
          <span class="muted small">${esc(prettyDate(r.date))}${r.dup ? ' · looks like a duplicate' : ''}</span>
          ${r.atm ? '<span class="small muted">Transfer to Cash (not counted as spending)</span>' : `<select data-cat="${i}" aria-label="Category">${catOpts(r.type, r.categoryId)}</select>`}
        </div>
        <span class="${r.type === 'income' ? 'pos' : 'neg'} import-amt amt">${r.type === 'income' ? '+' : '−'}${esc(formatINR(r.amount))}</span>
      </div>`).join('')}</div>
    <div class="row-end"><button type="button" class="btn btn-primary" id="im-go">Import selected</button></div>`;

  $$('[data-inc]', panel).forEach((c) => (c.onchange = () => { rows[+c.dataset.inc].include = c.checked; label(); }));
  $$('[data-cat]', panel).forEach((s) => (s.onchange = () => { rows[+s.dataset.cat].categoryId = s.value; }));
  const label = () => { $('#im-go', panel).textContent = `Import ${rows.filter((r) => r.include).length} selected`; };
  label();

  $('#im-go', panel).onclick = () => {
    const chosen = rows.filter((r) => r.include);
    if (!chosen.length) { toast('Nothing selected to import.'); return; }
    const acc = $('#im-acc', panel).value;
    const now = Date.now();
    chosen.forEach((r, i) => state.txns.push(r.atm
      ? { id: uid(), type: 'transfer', amount: r.amount, categoryId: null, accountId: acc, toAccountId: cashId, date: r.date, note: r.note, tags: ['imported'], created: now + i }
      : { id: uid(), type: r.type, amount: r.amount, categoryId: r.categoryId, accountId: acc, toAccountId: null, date: r.date, note: r.note, tags: ['imported'], created: now + i }));
    save();
    closeSheet();
    toast(`${chosen.length} transaction${chosen.length === 1 ? '' : 's'} imported`);
    ctx.refresh();
  };
}

function fallback(type) {
  const list = state.categories.filter((c) => c.kind === type);
  return (list.find((c) => /^other/i.test(c.name)) || list[0])?.id;
}
