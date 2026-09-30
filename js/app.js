// App shell: lock screen, first-time setup, navigation, auto-lock.

import * as store from './store.js';
import { FEATURES, enabledFeatures, loadFeature, isOn } from './features.js';
import { $, $$, esc, icon, toast, closeSheet, confirmSheet, lockGuard } from './ui.js';
import { openTxnForm, setTxnChangeHandler } from './txn-form.js';
import { setShareChangeHandler } from './share-form.js';
import { passwordStrength, openBackup } from './lib/crypto.js';

const root = $('#root');
let currentRoute = 'home';
let routeParams = {};

// ---------------- Boot ----------------
async function boot() {
  if (!window.isSecureContext || !crypto?.subtle) {
    root.innerHTML = `<div class="lock-wrap"><div class="lock-card"><h1>Needs a secure connection</h1>
      <p class="muted">Paisa Vault encrypts your data with the browser's built-in crypto, which only works over HTTPS or on localhost.
      Open the app from its https:// address.</p></div></div>`;
    return;
  }
  registerSW();
  if (await store.vaultExists()) showUnlock();
  else showSetup();
}

function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------------- Setup (first run) ----------------
function showSetup() {
  root.innerHTML = `
  <div class="lock-wrap">
    <div class="lock-card">
      <div class="brand">${icon('shield', 28)}<span>Paisa Vault</span></div>
      <h1>Create your master password</h1>
      <p class="muted">Everything you enter is encrypted on this device with this password. Nothing is sent to any server.</p>
      <form id="setup-form" class="form" novalidate>
        <label class="field"><span class="label">Master password</span>
          <input id="su-pw" type="password" autocomplete="new-password" minlength="8" required></label>
        <div class="strength" id="su-strength" aria-live="polite"><span></span><em></em></div>
        <label class="field"><span class="label">Type it again</span>
          <input id="su-pw2" type="password" autocomplete="new-password" required></label>
        <label class="check"><input id="su-ack" type="checkbox"> I understand that if I forget this password, my data cannot be recovered by anyone.</label>
        <p class="error" id="su-err" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Create encrypted vault</button>
      </form>
      <p class="tip">Tip: a short sentence like <em>my-dog-eats-3-mangoes!</em> is stronger and easier to remember than a random word.</p>
      <div class="divider"><span>or</span></div>
      <button type="button" class="btn btn-block" id="su-restore">${icon('upload', 18)} Restore from a backup file</button>
      <input type="file" id="su-file" accept=".pvault,.json,application/json" hidden>
    </div>
  </div>`;

  const pw = $('#su-pw');
  pw.oninput = () => {
    const s = passwordStrength(pw.value);
    const el = $('#su-strength');
    el.dataset.level = pw.value ? s.level : '';
    $('em', el).textContent = pw.value ? `Strength: ${s.level}` : '';
  };

  $('#setup-form').onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#su-err');
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    if (pw.value.length < 8) return fail('Use at least 8 characters.');
    if (passwordStrength(pw.value).level === 'weak') return fail('This password is too easy to guess. Make it longer or add numbers and symbols.');
    if (pw.value !== $('#su-pw2').value) return fail('The two passwords do not match.');
    if (!$('#su-ack').checked) return fail('Tick the box to confirm you understand.');
    busy(e.submitter, 'Encrypting…');
    await store.createVault(pw.value);
    startApp();
  };

  $('#su-restore').onclick = () => $('#su-file').click();
  $('#su-file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    let parsed;
    try { parsed = JSON.parse(await f.text()); } catch { toast('That file is not a Paisa Vault backup.'); return; }
    showRestorePassword(parsed);
  };
}

function showRestorePassword(file) {
  root.innerHTML = `
  <div class="lock-wrap"><div class="lock-card">
    <div class="brand">${icon('shield', 28)}<span>Paisa Vault</span></div>
    <h1>Restore backup</h1>
    <p class="muted">Enter the password that was used when this backup was made. It becomes this device's master password too.</p>
    <form id="rs-form" class="form" novalidate>
      <label class="field"><span class="label">Backup password</span><input id="rs-pw" type="password" autocomplete="current-password" required></label>
      <p class="error" id="rs-err" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">Decrypt and restore</button>
      <button class="btn btn-ghost btn-block" type="button" id="rs-back">Back</button>
    </form>
  </div></div>`;
  $('#rs-pw').focus();
  $('#rs-back').onclick = showSetup;
  $('#rs-form').onsubmit = async (e) => {
    e.preventDefault();
    const pw = $('#rs-pw').value;
    const btn = e.submitter;
    busy(btn, 'Decrypting…');
    try {
      const data = await openBackup(pw, file);
      await store.createVault(pw);
      await store.replaceState(data);
      startApp();
    } catch (ex) {
      $('#rs-err').textContent = ex.message;
      $('#rs-err').hidden = false;
      unbusy(btn, 'Decrypt and restore');
    }
  };
}

// ---------------- Unlock ----------------
function lockoutUntil() {
  try { return Number(localStorage.getItem('pv-lockout') || 0); } catch { return 0; }
}
function failures() {
  try { return Number(localStorage.getItem('pv-fails') || 0); } catch { return 0; }
}
function setFailures(n) {
  try {
    localStorage.setItem('pv-fails', String(n));
    // After 3 wrong tries, wait 2s, 4s, 8s … up to 5 minutes between attempts.
    localStorage.setItem('pv-lockout', n >= 3 ? String(Date.now() + Math.min(300000, 1000 * 2 ** (n - 2))) : '0');
  } catch { /* storage blocked: no delay */ }
}

function showUnlock() {
  root.innerHTML = `
  <div class="lock-wrap"><div class="lock-card">
    <div class="brand">${icon('shield', 28)}<span>Paisa Vault</span></div>
    <h1>Unlock</h1>
    <form id="ul-form" class="form" novalidate>
      <label class="field"><span class="label">Master password</span>
        <input id="ul-pw" type="password" autocomplete="current-password" required></label>
      <p class="error" id="ul-err" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">${icon('lock', 18)} Unlock</button>
    </form>
    <button type="button" class="btn-link small" id="ul-forgot">Forgot password?</button>
  </div></div>`;
  $('#ul-pw').focus();
  const err = $('#ul-err');
  $('#ul-form').onsubmit = async (e) => {
    e.preventDefault();
    const wait = lockoutUntil() - Date.now();
    if (wait > 0) { err.textContent = `Too many wrong tries. Wait ${Math.ceil(wait / 1000)} seconds.`; err.hidden = false; return; }
    const btn = e.submitter;
    busy(btn, 'Unlocking…');
    try {
      await store.unlock($('#ul-pw').value);
      setFailures(0);
      startApp();
    } catch {
      setFailures(failures() + 1);
      err.textContent = 'Wrong password.';
      err.hidden = false;
      unbusy(btn, `${icon('lock', 18)} Unlock`);
      $('#ul-pw').select();
    }
  };
  $('#ul-forgot').onclick = async () => {
    const ok = await confirmSheet('Forgot your password?',
      'Your data is encrypted and nobody can recover it without the password. You can erase this vault and start fresh, then restore from a backup file if you have one (you will need that backup\'s password).',
      { yes: 'Erase this vault' });
    if (!ok) return;
    const sure = await confirmSheet('Erase everything on this device?', 'All transactions stored in this browser will be permanently deleted.', { yes: 'Yes, erase' });
    if (!sure) return;
    await store.wipeEverything();
    showSetup();
  };
}

function busy(btn, label) { if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.textContent = label; } }
function unbusy(btn, html) { if (btn) { btn.disabled = false; btn.innerHTML = html; } }

// ---------------- Main app ----------------
function startApp() {
  const added = store.processRecurring();
  applyTheme();
  renderShell();
  setTxnChangeHandler(() => refresh());
  setShareChangeHandler(() => refresh());
  const fromHash = location.hash.replace('#', '');
  go(FEATURES.some((f) => f.id === fromHash) || fromHash === 'more' ? fromHash : 'home');
  startAutoLock();
  if (added) toast(`${added} recurring ${added === 1 ? 'entry' : 'entries'} added automatically`);
}

export function applyTheme() {
  const s = store.state.settings;
  if (s.theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = s.theme;
  document.body.classList.toggle('hide-amt', !!s.hideAmounts);
}

function renderShell() {
  const feats = enabledFeatures(store.state);
  const main = feats.filter((f) => f.nav === 'main');
  const navLink = (f, short = false) => `<a href="#${f.id}" class="nav-link" data-route="${f.id}">${icon(f.icon)}<span>${esc(short && f.short ? f.short : f.title)}</span></a>`;
  root.innerHTML = `
  <div class="shell">
    <aside class="sidebar" aria-label="Main">
      <div class="brand">${icon('shield', 24)}<span>Paisa Vault</span></div>
      <nav>${feats.map((f) => navLink(f)).join('')}</nav>
    </aside>
    <div class="main-col">
      <header class="topbar">
        <h1 id="page-title">Home</h1>
        <div class="topbar-actions">
          <button type="button" class="icon-btn" id="btn-hide" aria-label="Hide amounts" title="Hide amounts">${icon(store.state.settings.hideAmounts ? 'eyeoff' : 'eye')}</button>
          <button type="button" class="icon-btn" id="btn-lock" aria-label="Lock now" title="Lock now">${icon('lock')}</button>
        </div>
      </header>
      <main id="view" tabindex="-1"></main>
    </div>
    <button type="button" class="fab" id="fab" aria-label="Add transaction">${icon('plus', 26)}</button>
    <nav class="bottombar" aria-label="Main">
      ${main.slice(0, 2).map((f) => navLink(f, true)).join('')}
      <span class="bottombar-gap"><button type="button" class="fab-inline" id="fab2" aria-label="Add transaction">${icon('plus', 26)}</button></span>
      ${main.slice(2).map((f) => navLink(f, true)).join('')}
      <a href="#more" class="nav-link" data-route="more">${icon('more')}<span>More</span></a>
    </nav>
  </div>`;

  $$('[data-route]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); go(a.dataset.route); }));
  $('#fab').onclick = () => openTxnForm();
  $('#fab2').onclick = () => openTxnForm();
  $('#btn-lock').onclick = lock;
  $('#btn-hide').onclick = () => {
    store.state.settings.hideAmounts = !store.state.settings.hideAmounts;
    store.save();
    applyTheme();
    $('#btn-hide').innerHTML = icon(store.state.settings.hideAmounts ? 'eyeoff' : 'eye');
  };
}

export async function go(route, params = {}) {
  currentRoute = route;
  routeParams = params;
  if (location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
  $$('[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === route
    || (route !== 'more' && a.dataset.route === 'more' && FEATURES.find((f) => f.id === route)?.nav === 'more')));
  await refresh();
  $('#view')?.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

export async function refresh() {
  const view = $('#view');
  if (!view || !store.state) return;
  if (currentRoute === 'more') {
    $('#page-title').textContent = 'More';
    renderMore(view);
    return;
  }
  const f = FEATURES.find((x) => x.id === currentRoute);
  if (!f || !isOn(store.state, f.id)) { currentRoute = 'home'; return refresh(); }
  $('#page-title').textContent = f.title;
  try {
    const mod = await loadFeature(f.id);
    await mod.render(view, ctx());
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty"><p class="empty-title">This screen hit an error</p><p class="muted">${esc(e.message)}</p></div>`;
  }
}

function renderMore(view) {
  const more = enabledFeatures(store.state).filter((f) => f.nav === 'more');
  view.innerHTML = `<div class="more-list">${more.map((f) => `
    <a href="#${f.id}" class="more-item" data-go="${f.id}">
      <span class="more-ic">${icon(f.icon)}</span>
      <span class="more-text"><strong>${esc(f.title)}</strong><span class="muted">${esc(f.blurb)}</span></span>
      ${icon('chevR', 18)}
    </a>`).join('')}</div>`;
  $$('[data-go]', view).forEach((a) => (a.onclick = (e) => { e.preventDefault(); go(a.dataset.go); }));
}

function ctx() {
  return {
    state: store.state,
    save: store.save,
    go,
    refresh,
    params: routeParams,
    openTxnForm,
    rebuildShell: () => { renderShell(); go(currentRoute, routeParams); },
    applyTheme,
    lock,
  };
}

// ---------------- Locking ----------------
let lastActive = Date.now();
let lockTimer = null;

function startAutoLock() {
  const bump = () => (lastActive = Date.now());
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => addEventListener(ev, bump, { passive: true }));
  clearInterval(lockTimer);
  lockTimer = setInterval(() => {
    const mins = store.state?.settings.autoLockMinutes;
    if (mins && Date.now() - lastActive > mins * 60000) lock();
  }, 10000);
}

document.addEventListener('visibilitychange', () => {
  // Hide amounts from the phone's app-switcher preview.
  document.body.classList.toggle('privacy-blur', document.hidden);
  if (document.hidden && store.state?.settings.lockOnHide && Date.now() > lockGuard.until) lock();
  if (!document.hidden && store.state) {
    const mins = store.state.settings.autoLockMinutes;
    if (mins && Date.now() - lastActive > mins * 60000) lock();
  }
});

export async function lock() {
  if (!store.state) return;
  closeSheet();
  await store.flush();
  store.lockNow();
  root.innerHTML = '';
  // Reload wipes every trace of decrypted data from memory.
  location.replace(location.pathname);
}

boot();
