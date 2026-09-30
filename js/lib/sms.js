// Reads a pasted bank / UPI SMS and pulls out amount, direction, merchant and date.
// Runs only on this device; the text is never stored or sent anywhere.

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

  let date = null;
  const dm = t.match(DATE);
  if (dm) {
    const day = Number(dm[1]);
    const mon = /\d/.test(dm[2]) ? Number(dm[2]) - 1 : MONTHS.indexOf(dm[2].toLowerCase());
    let yr = Number(dm[3]);
    if (yr < 100) yr += 2000;
    if (mon >= 0 && mon < 12 && day >= 1 && day <= 31) {
      date = `${yr}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const upi = /\bupi\b|vpa/i.test(t);
  const card = /\bcard\b/i.test(t);
  return { amount, type, merchant, date, method: upi ? 'upi' : card ? 'card' : null };
}
