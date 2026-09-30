// Encryption for the vault. Uses only the browser's built-in Web Crypto API.
// Password -> PBKDF2-SHA256 (600,000 rounds) -> AES-256-GCM key (never stored, never extractable).

export const KDF_ITERATIONS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKey(password, salt, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJSON(key, obj) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

// Throws if the key is wrong or the data was tampered with (GCM authentication).
export async function decryptJSON(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct));
  return JSON.parse(dec.decode(pt));
}

// A self-contained encrypted backup file: carries its own salt so it can be opened on any device.
export async function makeBackup(password, data) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  const box = await encryptJSON(key, data);
  return { app: 'paisa-vault', format: 1, created: new Date().toISOString(), kdf: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: toB64(salt), ...box };
}

export async function openBackup(password, file) {
  if (!file || file.app !== 'paisa-vault' || !file.salt || !file.ct) throw new Error('This is not a Paisa Vault backup file.');
  const key = await deriveKey(password, fromB64(file.salt), file.iterations || KDF_ITERATIONS);
  try {
    return await decryptJSON(key, file);
  } catch {
    throw new Error('Wrong password for this backup, or the file is damaged.');
  }
}

export function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (/^(.)\1+$/.test(pw) || /^(1234|password|qwerty)/i.test(pw)) score = 0;
  const level = score <= 2 ? 'weak' : score <= 4 ? 'okay' : 'strong';
  return { score, level };
}
