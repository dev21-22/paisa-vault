import { esc, icon, openSheet, closeSheet, toast, downloadFile, pickFile, $ } from '../ui.js';
import { makeBackup, openBackup } from '../lib/crypto.js';
import { verifyPassword, replaceState, flush } from '../store.js';
import { catMap, accMap } from '../calc.js';
import { iso, prettyDate } from '../lib/dates.js';

export function render(root, ctx) {
  const { state } = ctx;
  const last = state.settings.lastBackup;
  root.innerHTML = `
  <div class="stack">
    <div class="card">
      <h2 class="card-title">${icon('shield', 18)} Encrypted backup</h2>
      <p>Creates a file locked with your master password. Use it to keep your data safe, and to move it between your phone and laptop.</p>
      <p class="muted small">Last backup: ${last ? esc(prettyDate(last.slice(0, 10))) : 'never'}</p>
      <div class="row-wrap">
        <button type="button" class="btn btn-primary" id="bk-export">${icon('download', 18)} Create backup file</button>
        <button type="button" class="btn" id="bk-import">${icon('upload', 18)} Open a backup file</button>
        <input type="file" id="bk-file" accept=".pvault,.json,application/json" hidden>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">How to sync phone and laptop</h2>
      <ol class="steps">
        <li>On the device with the newest entries, tap <strong>Create backup file</strong>.</li>
        <li>Send the file to your other device any way you like: WhatsApp to yourself, Google Drive, email or a USB cable. The file is encrypted, so nobody can read it on the way.</li>
        <li>On the other device, open Paisa Vault, go to <strong>Backup &amp; sync</strong>, tap <strong>Open a backup file</strong> and choose <strong>Merge</strong>.</li>
      </ol>
      <p class="muted small">Merge adds entries that exist on the other device but not on this one. Deletions are not carried over by a merge. Use <strong>Replace</strong> to make this device an exact copy of the backup.</p>
    </div>

    <div class="card">
      <h2 class="card-title">Export to spreadsheet</h2>
      <p>A CSV file opens in Excel or Google Sheets. <strong class="neg">It is not encrypted</strong>, so delete it after use.</p>
      <button type="button" class="btn" id="bk-csv">${icon('download', 18)} Export CSV</button>
    </div>
  </div>`;

  $('#bk-export', root).onclick = () => exportBackup(ctx);
  $('#bk-import', root).onclick = () => pickFile($('#bk-file', root));
  $('#bk-file', root).onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let file;
    try { file = JSON.parse(await f.text()); } catch { toast('That file is not a Paisa Vault backup.'); return; }
    importBackup(ctx, file);
  };
  $('#bk-csv', root).onclick = () => exportCSV(state);
}

function exportBackup(ctx) {
  const panel = openSheet('Create backup file', `
    <form class="form" id="be" novalidate>
      <p class="muted">Enter your master password. The backup is encrypted with it, and you will need it to open the file on any device.</p>
      <label class="field"><span class="label">Master password</span><input id="be-pw" type="password" autocomplete="current-password"></label>
      <p class="error" id="be-err" role="alert" hidden></p>
      <div class="row-end"><button type="submit" class="btn btn-primary">Encrypt and save</button></div>
    </form>`);
  $('#be', panel).onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    const pw = $('#be-pw', panel).value;
    btn.disabled = true;
    btn.textContent = 'Encrypting…';
    if (!(await verifyPassword(pw))) {
      const er = $('#be-err', panel); er.textContent = 'Wrong password.'; er.hidden = false;
      btn.disabled = false; btn.textContent = 'Encrypt and save';
      return;
    }
    ctx.state.settings.lastBackup = new Date().toISOString();
    const data = JSON.stringify(await makeBackup(pw, ctx.state));
    await flush();
    const name = `paisa-vault-${iso()}.pvault`;
    const file = new File([data], name, { type: 'application/json' });
    closeSheet();
    if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ files: [file], title: name }); toast('Backup ready'); ctx.refresh(); return; } catch { /* fall back to download */ }
    }
    downloadFile(name, data);
    toast('Backup saved to your downloads');
    ctx.refresh();
  };
}

function importBackup(ctx, file) {
  const panel = openSheet('Open backup file', `
    <form class="form" id="bi" novalidate>
      <p class="muted">Backup from ${file.created ? esc(new Date(file.created).toLocaleString('en-IN')) : 'an unknown date'}. Enter the password it was made with.</p>
      <label class="field"><span class="label">Backup password</span><input id="bi-pw" type="password" autocomplete="current-password"></label>
      <fieldset class="field"><legend class="label">What should happen?</legend>
        <label class="check"><input type="radio" name="mode" value="merge" checked> <span><strong>Merge</strong>: add what's missing here, keep everything already on this device</span></label>
        <label class="check"><input type="radio" name="mode" value="replace"> <span><strong>Replace</strong>: erase this device's data and use the backup exactly</span></label>
      </fieldset>
      <p class="error" id="bi-err" role="alert" hidden></p>
      <div class="row-end"><button type="submit" class="btn btn-primary">Decrypt</button></div>
    </form>`);
  $('#bi', panel).onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    btn.textContent = 'Decrypting…';
    try {
      const data = await openBackup($('#bi-pw', panel).value, file);
      const mode = $('input[name=mode]:checked', panel).value;
      let added = 0;
      if (mode === 'replace') {
        await replaceState(data);
      } else {
        added = merge(ctx.state, data);
        await flush();
      }
      closeSheet();
      toast(mode === 'replace' ? 'Data replaced from backup' : `Merged: ${added} new item${added === 1 ? '' : 's'} added`);
      ctx.rebuildShell();
    } catch (ex) {
      const er = $('#bi-err', panel); er.textContent = ex.message; er.hidden = false;
      btn.disabled = false; btn.textContent = 'Decrypt';
    }
  };
}

// Union by id. Items already on this device win if both have the same id.
export function merge(into, from) {
  let added = 0;
  for (const k of ['accounts', 'categories', 'txns', 'recurring', 'goals', 'debts']) {
    const have = new Set((into[k] || []).map((x) => x.id));
    for (const item of from[k] || []) {
      if (!have.has(item.id)) { into[k].push(item); added++; }
    }
  }
  for (const [k, v] of Object.entries(from.budgets || {})) if (!(k in into.budgets)) into.budgets[k] = v;
  return added;
}

function exportCSV(state) {
  const cats = catMap(state);
  const accs = accMap(state);
  const q = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [['Date', 'Type', 'Amount (INR)', 'Category', 'Account', 'To account', 'Note', 'Tags']];
  [...state.txns].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((t) => rows.push([
    t.date, t.type, (t.amount / 100).toFixed(2), cats[t.categoryId]?.name || '', accs[t.accountId]?.name || '',
    accs[t.toAccountId]?.name || '', t.note || '', (t.tags || []).join(' '),
  ]));
  const csv = '﻿' + rows.map((r) => r.map((v, i) => (i === 2 ? v : q(v))).join(',')).join('\r\n');
  downloadFile(`paisa-vault-${iso()}.csv`, csv, 'text/csv');
  toast('CSV exported. Remember it is not encrypted.');
}
