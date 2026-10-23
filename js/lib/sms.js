// Reads pasted bank / UPI SMS and pulls out amount, direction, merchant and date.
// Runs only on this device; the text is never stored or sent anywhere (only a hash, see smsHash).

const AMOUNT = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const DEBIT = /\b(debited|spent|paid|sent|withdrawn|purchase|dr\.?|debit)\b/i;
const CREDIT = /\b(credited|received|deposited|refund|cr\.?|credit)\b/i;
const MERCHANT = [
  /\bto\s+VPA\s+([\w.\-]+@[\w]+)/i,
  /\b(?:at|to|towards)\s+([A-Za-z0-9&'.\- ]{2,40}?)(?=\s+(?:on|via|ref|upi|using|from|for|avl|\.|$))/i,
  /\bfrom\s+([A-Za-z0-9&'.\- ]{2,40}?)(?=\s+(?:on|via|ref|upi|\.|$))/i,
  /\bInfo:?\s*([A-Za-z0-9&'.\-/ ]{2,40})/i,
];
const DATE = /\b(\d{1,2})[-/ ](\d{1,2}|[A-Za-z]{3})[-/ ](\d{2,4})\b/;
const DATE_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DATE_TIGHT = /\b(\d{1,2})([A-Za-z]{3})(\d{2,4})\b/; // "24Oct26" (SBI and others)
// Mentions money but isn't a completed payment: OTPs, reminders, requests, failures, offers.
const NOT_A_PAYMENT = /\b(otp|one[- ]time password|will be (?:debited|charged|deducted)|is due|due (?:on|by|date)|min(?:imum)?\.? (?:amt|amount) due|requested|collect request|request(?:ed)? money|declined|failed|unsuccessful|pre-?approved|eligible|offer)\b/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function parseSMS(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ');
  const am = t.match(AMOUNT);
  if (!am) return null;
  const amount = Math.round(parseFloat(am[1].replace(/,/g, '')) * 100);

  const d = t.search(DEBIT);
  const c = t.search(CREDIT);
  let type = 'expense';
  if (c !== -1 && (d === -1 || c < d)) type = 'income';

  let merchant = '';
  for (const re of MERCHANT) {
    const m = t.match(re);
    if (m && !/^a\/?c|account|your/i.test(m[1].trim())) { merchant = m[1].trim(); break; }
  }
  // "swiggy@icici" -> "Swiggy"; personal UPI IDs like "9876543210@ybl" are kept as-is.
  const vpa = merchant.match(/^([a-z][\w.\-]*)@\w+$/i);
  if (vpa) {
    const name = vpa[1].replace(/[._\-]+/g, ' ').replace(/\d+$/, '').trim();
    if (name) merchant = name.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const date = findDate(t);

  // "A/c XX1234", "a/c no. ****1234", "Card ending 4321", "card no. XX4321"
  const l4 = t.match(/\b(?:a\/c|acct|account|card)(?:\s*(?:no\.?|number))?(?:\s*ending(?:\s*with)?)?\s*[:\-]?\s*[x*.\s]*(\d{4})\b/i);
  const last4 = l4 ? l4[1] : null;

  const upi = /\bupi\b|vpa/i.test(t);
  const card = /\bcard\b/i.test(t);
  return { amount, type, merchant, date, last4, method: upi ? 'upi' : card ? 'card' : null };
}

// A date written in an SMS or on a line by itself, as YYYY-MM-DD, or null.
export function findDate(text) {
  const iso = text.match(DATE_ISO);
  if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12 && Number(iso[3]) >= 1 && Number(iso[3]) <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  for (const re of [DATE, DATE_TIGHT]) {
    const dm = text.match(re);
    if (!dm) continue;
    const day = Number(dm[1]);
    const mon = /\d/.test(dm[2]) ? Number(dm[2]) - 1 : MONTHS.indexOf(dm[2].toLowerCase());
    let yr = Number(dm[3]);
    if (yr < 100) yr += 2000;
    if (mon >= 0 && mon < 12 && day >= 1 && day <= 31) return `${yr}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

// True for a completed debit or credit, false for OTPs, bill reminders, failed payments and offers.
export function isPaymentSMS(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  return AMOUNT.test(t) && (DEBIT.test(t) || CREDIT.test(t)) && !NOT_A_PAYMENT.test(t);
}

// Splits pasted text into separate messages. Messages are separated by a line of --- (what the
// iPhone Shortcut writes) or, if there is none, by blank lines. A first line holding only a date
// (the day the Shortcut saved it) is returned as `received`.
export function splitMessages(text) {
  const all = String(text || '').replace(/\r\n?/g, '\n');
  const SEP = /^[ \t]*(?:-{3,}|_{3,}|={3,})[ \t]*$/m;
  const blocks = SEP.test(all) ? all.split(new RegExp(SEP.source, 'gm')) : all.split(/\n[ \t]*\n/);
  const out = [];
  for (let b of blocks) {
    b = b.trim();
    const nl = b.indexOf('\n');
    const first = nl === -1 ? b : b.slice(0, nl);
    let received = null;
    if (nl !== -1 && first.length <= 40 && !AMOUNT.test(first)) {
      received = findDate(first);
      if (received) b = b.slice(nl + 1).trim();
    }
    if (b) out.push({ text: b, received });
  }
  return out;
}

// Short fingerprint of a message, so one already reviewed is recognised if pasted again.
export async function smsHash(text) {
  const norm = String(text).toLowerCase().replace(/\s+/g, ' ').trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return [...new Uint8Array(buf).slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
