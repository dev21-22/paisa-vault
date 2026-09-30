// Encrypted storage. The whole app state lives in memory only while unlocked,
// and is written to IndexedDB as a single AES-GCM encrypted blob.

import { deriveKey, encryptJSON, decryptJSON, randomBytes, toB64, fromB64, KDF_ITERATIONS } from './lib/crypto.js';
import { iso, nextOccurrence } from './lib/dates.js';
import { defaultFeatureState } from './features.js';

const DB_NAME = 'paisa-vault';
const STORE = 'kv';

let key = null; // CryptoKey, memory only
let meta = null; // { salt, iterations }
export let state = null;

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { d.close(); resolve(req?.result); };
    tx.onerror = () => { d.close(); reject(tx.error); };
  });
}

const get = (k) => idb('readonly', (s) => s.get(k));
const put = (k, v) => idb('readwrite', (s) => s.put(v, k));
const del = (k) => idb('readwrite', (s) => s.delete(k));

export async function vaultExists() {
  return !!(await get('meta'));
}

export function uid() {
  return toB64(randomBytes(9)).replace(/[+/=]/g, (c) => ({ '+': 'a', '/': 'b', '=': '' })[c]);
}

export function defaultState() {
  const c = (name, icon, color, kind = 'expense') => ({ id: uid(), name, icon, color, kind });
  return {
    schema: 1,
    settings: {
      name: '',
      periodStartDay: 1,
      autoLockMinutes: 5,
      lockOnHide: false,
      hideAmounts: false,
      theme: 'system',
      lastBackup: null,
    },
    features: defaultFeatureState(),
    accounts: [
      { id: uid(), name: 'Cash', type: 'cash', opening: 0 },
      { id: uid(), name: 'Bank account', type: 'bank', opening: 0 },
      { id: uid(), name: 'UPI', type: 'upi', opening: 0 },
    ],
    categories: [
      c('Food & dining', '🍽️', '#E07A3F'),
      c('Groceries', '🛒', '#4F9D69'),
      c('Travel & fuel', '⛽', '#3F7AE0'),
      c('Shopping', '🛍️', '#C850C0'),
      c('Bills & utilities', '💡', '#D4A017'),
      c('Rent', '🏠', '#8C6BD1'),
      c('Health', '💊', '#D9534F'),
      c('Education', '📚', '#2BA5A5'),
      c('Entertainment', '🎬', '#E0569B'),
      c('Recharge & subscriptions', '📱', '#5A7BB5'),
      c('EMI & loans', '🏦', '#7A6A58'),
      c('Gifts & family', '🎁', '#C9732E'),
      c('Other', '📦', '#8A8F98'),
      c('Salary', '💼', '#2E9E63', 'income'),
      c('Business', '📈', '#1F7A8C', 'income'),
      c('Interest & returns', '💰', '#6A9E2E', 'income'),
      c('Other income', '➕', '#5F8F7A', 'income'),
    ],
    txns: [],       // { id, type: expense|income|transfer, amount(paise), categoryId, accountId, toAccountId, date, note, tags[], created }
    budgets: {},    // { [categoryId | '_total']: paise per period }
    recurring: [],  // { id, name, type, amount, categoryId, accountId, freq, nextDate, anchorDay, autoAdd, active }
    goals: [],      // { id, name, target, saved, deadline, contributions: [{date, amount}] }
    debts: [],      // { id, person, direction: lent|borrowed, amount, date, due, note, settled, payments: [] }
  };
}

// Fill in anything a newer version of the app added, so old vaults keep working.
function migrate(s) {
  const d = defaultState();
  s.settings = { ...d.settings, ...s.settings };
  s.features = { ...d.features, ...s.features };
  for (const k of ['accounts', 'categories', 'txns', 'recurring', 'goals', 'debts']) s[k] ??= d[k];
  s.budgets ??= {};
  return s;
}

export async function createVault(password) {
  const salt = randomBytes(16);
  meta = { salt: toB64(salt), iterations: KDF_ITERATIONS, created: new Date().toISOString() };
  key = await deriveKey(password, salt, meta.iterations);
  state = defaultState();
  await put('meta', meta);
  await persist();
}

export async function unlock(password) {
  meta = await get('meta');
  const box = await get('vault');
  const k = await deriveKey(password, fromB64(meta.salt), meta.iterations);
  try {
    state = migrate(await decryptJSON(k, box));
  } catch {
    throw new Error('Wrong password.');
  }
  key = k;
  return state;
}

export async function changePassword(oldPw, newPw) {
  const box = await get('vault');
  const oldKey = await deriveKey(oldPw, fromB64(meta.salt), meta.iterations);
  try { await decryptJSON(oldKey, box); } catch { throw new Error('Current password is wrong.'); }
  const salt = randomBytes(16);
  const newMeta = { ...meta, salt: toB64(salt), iterations: KDF_ITERATIONS };
  const newKey = await deriveKey(newPw, salt, newMeta.iterations);
  const newBox = await encryptJSON(newKey, state);
  await idb('readwrite', (s) => { s.put(newMeta, 'meta'); return s.put(newBox, 'vault'); });
  meta = newMeta;
  key = newKey;
}

export async function verifyPassword(pw) {
  const k = await deriveKey(pw, fromB64(meta.salt), meta.iterations);
  try { await decryptJSON(k, await get('vault')); return true; } catch { return false; }
}

async function persist() {
  if (!key || !state) return;
  await put('vault', await encryptJSON(key, state));
}

let saveTimer = null;
let saving = Promise.resolve();
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saving = saving.then(persist); }, 250);
}

export async function flush() {
  clearTimeout(saveTimer);
  await (saving = saving.then(persist));
}

export function replaceState(next) {
  state = migrate(next);
  return flush();
}

export async function wipeEverything() {
  key = null;
  state = null;
  await del('vault');
  await del('meta');
}

export function lockNow() {
  key = null;
  state = null;
}

// Turn due recurring items with auto-add into real transactions. Returns how many were added.
export function processRecurring(today = iso()) {
  let added = 0;
  for (const r of state.recurring) {
    if (!r.active || !r.autoAdd) continue;
    let guard = 0;
    while (r.nextDate <= today && guard++ < 400) {
      addTxnFromRecurring(r, r.nextDate);
      added++;
    }
  }
  if (added) save();
  return added;
}

export function addTxnFromRecurring(r, date) {
  state.txns.push({
    id: uid(), type: r.type, amount: r.amount, categoryId: r.categoryId, accountId: r.accountId,
    date, note: r.name, tags: ['recurring'], recurringId: r.id, created: Date.now(),
  });
  r.nextDate = nextOccurrence(r.nextDate, r.freq, r.anchorDay);
}
