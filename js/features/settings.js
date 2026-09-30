import { esc, icon, openSheet, closeSheet, toast, confirmSheet, $, $$ } from '../ui.js';
import { FEATURES } from '../features.js';
import { changePassword, wipeEverything, flush } from '../store.js';
import { passwordStrength } from '../lib/crypto.js';

export function render(root, ctx) {
  const { state } = ctx;
  const s = state.settings;
  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  root.innerHTML = `
  <div class="stack">
    <div class="card">
      <h2 class="card-title">General</h2>
      <div class="grid-2">
        <label class="field"><span class="label">Your name (for the greeting)</span><input id="st-name" maxlength="30" value="${esc(s.name)}"></label>
        <label class="field"><span class="label">Month starts on</span>
          <select id="st-start">${days.map((d) => `<option value="${d}" ${s.periodStartDay === d ? 'selected' : ''}>${d === 1 ? '1st (calendar month)' : `${d}th (e.g. salary day)`}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Theme</span>
          <select id="st-theme">${[['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">${icon('lock', 18)} Security &amp; privacy</h2>
      <div class="grid-2">
        <label class="field"><span class="label">Auto-lock after</span>
          <select id="st-lock">${[[1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [0, 'Never (not recommended)']].map(([v, l]) => `<option value="${v}" ${s.autoLockMinutes === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <label class="check"><input type="checkbox" id="st-hide-lock" ${s.lockOnHide ? 'checked' : ''}> Lock as soon as I switch to another app</label>
      <label class="check"><input type="checkbox" id="st-hide-amt" ${s.hideAmounts ? 'checked' : ''}> Hide amounts (blur them until tapped). Useful in public.</label>
      <div class="row-wrap"><button type="button" class="btn" id="st-pw">Change master password</button></div>
      <details class="about">
        <summary>How your data is protected</summary>
        <ul>
          <li>Your data is encrypted with AES-256-GCM before it is saved on this device.</li>
          <li>The key comes from your password through PBKDF2-SHA256 with 600,000 rounds, which makes guessing very slow.</li>
          <li>The key exists only in memory while the app is unlocked. Locking reloads the app and wipes it.</li>
          <li>The app makes no network requests. There are no analytics, ads or trackers, and it loads no outside code.</li>
          <li>Nobody, including the app's author, can recover your password.</li>
        </ul>
      </details>
    </div>

    <div class="card">
      <h2 class="card-title">Features</h2>
      <p class="muted small">Switch off what you don't use. Switching a feature off hides it but keeps its data.</p>
      <div class="feature-list">${FEATURES.map((f) => `
        <label class="feature ${f.core ? 'core' : ''}">
          <span><strong>${esc(f.title)}</strong><span class="muted small">${esc(f.blurb)}</span></span>
          <input type="checkbox" class="switch" data-feat="${esc(f.id)}" ${f.core || state.features[f.id] !== false ? 'checked' : ''} ${f.core ? 'disabled' : ''} aria-label="${esc(f.title)}">
        </label>`).join('')}</div>
    </div>

    <div class="card danger-zone">
      <h2 class="card-title">Danger zone</h2>
      <p class="muted small">Permanently erase all data from this device. Make a backup first if you want to keep anything.</p>
      <button type="button" class="btn btn-danger" id="st-wipe">${icon('trash', 18)} Erase all data on this device</button>
    </div>
    <p class="muted small center">Paisa Vault · data stays on this device</p>
  </div>`;

  const set = (k, v, after) => { s[k] = v; ctx.save(); after?.(); };
  $('#st-name', root).onchange = (e) => set('name', e.target.value.trim());
  $('#st-start', root).onchange = (e) => set('periodStartDay', Number(e.target.value), () => toast('Month start updated'));
  $('#st-theme', root).onchange = (e) => set('theme', e.target.value, ctx.applyTheme);
  $('#st-lock', root).onchange = (e) => set('autoLockMinutes', Number(e.target.value));
  $('#st-hide-lock', root).onchange = (e) => set('lockOnHide', e.target.checked);
  $('#st-hide-amt', root).onchange = (e) => set('hideAmounts', e.target.checked, ctx.applyTheme);
  $$('[data-feat]', root).forEach((c) => (c.onchange = () => {
    state.features[c.dataset.feat] = c.checked;
    ctx.save();
    ctx.rebuildShell();
  }));
  $('#st-pw', root).onclick = () => changePw();
  $('#st-wipe', root).onclick = async () => {
    if (!(await confirmSheet('Erase all data?', 'Every transaction, budget and setting on this device will be permanently deleted. This cannot be undone.', { yes: 'Erase everything' }))) return;
    if (!(await confirmSheet('Are you completely sure?', 'Last chance. Without a backup, this data is gone for good.', { yes: 'Yes, erase now' }))) return;
    await flush();
    await wipeEverything();
    location.replace(location.pathname);
  };
}

function changePw() {
  const panel = openSheet('Change master password', `
    <form class="form" id="cp" novalidate>
      <label class="field"><span class="label">Current password</span><input id="cp-old" type="password" autocomplete="current-password"></label>
      <label class="field"><span class="label">New password</span><input id="cp-new" type="password" autocomplete="new-password"></label>
      <label class="field"><span class="label">New password again</span><input id="cp-new2" type="password" autocomplete="new-password"></label>
      <p class="hint">Old backup files still open with the password they were made with.</p>
      <p class="error" id="cp-err" role="alert" hidden></p>
      <div class="row-end"><button type="submit" class="btn btn-primary">Change password</button></div>
    </form>`);
  const err = (m) => { const e = $('#cp-err', panel); e.textContent = m; e.hidden = false; };
  $('#cp', panel).onsubmit = async (e) => {
    e.preventDefault();
    const n = $('#cp-new', panel).value;
    if (n.length < 8 || passwordStrength(n).level === 'weak') return err('Choose a stronger new password (at least 8 characters, mix in numbers or symbols).');
    if (n !== $('#cp-new2', panel).value) return err('The new passwords do not match.');
    const btn = e.submitter;
    btn.disabled = true;
    btn.textContent = 'Re-encrypting…';
    try {
      await flush();
      await changePassword($('#cp-old', panel).value, n);
      closeSheet();
      toast('Password changed. Make a new backup with it.');
    } catch (ex) {
      err(ex.message);
      btn.disabled = false;
      btn.textContent = 'Change password';
    }
  };
}
