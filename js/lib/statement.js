// Reads a bank statement exported as CSV from net banking and turns it into transactions.
// Works with the common Indian formats: separate Withdrawal/Deposit columns, a single Amount
// column with Dr/Cr, or signed amounts. Runs on this device only.

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  const delim = (s.split('\n')[0].match(/;/g) || []).length > (s.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

// Indian statements put the day first. Returns 'YYYY-MM-DD' or null.
export function parseDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return fmt(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/);
  if (m) return fmt(year(m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,4})[a-z]*[-/. ,]*(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return fmt(year(m[3]), MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}
const year = (y) => (y.length === 2 ? 2000 + +y : +y);
function fmt(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "1,234.50" -> 123450 paise; "" -> 0; "(500)" or "-500" -> -50000
export function parseAmount(v) {
  let s = String(v || '').replace(/[₹,\s]|inr|rs\.?/gi, '');
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/(dr|cr)$/i.test(s)) s = s.replace(/(dr|cr)$/i, '');
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return Math.round((neg ? -n : n) * 100);
}

const H = {
  date: /^(txn |transaction |value )?date$|^date$|tran date|posting date/i,
  desc: /narration|description|particulars|details|remarks|transaction details/i,
  debit: /withdrawal|debit|dr\b|paid out|money out/i,
  credit: /deposit|credit|cr\b|paid in|money in/i,
  amount: /^amount|txn amount|transaction amount/i,
  drcr: /^(dr ?\/ ?cr|cr ?\/ ?dr|type|debit\/credit)$/i,
  ref: /ref|chq|cheque/i,
};

// Find the header row and which column holds what.
export function detectColumns(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i].map((x) => x.toLowerCase());
    const find = (re, skip = []) => r.findIndex((x, j) => re.test(x) && !skip.includes(j));
    const txnDate = r.findIndex((x) => H.date.test(x) && !/value/.test(x));
    const date = txnDate >= 0 ? txnDate : find(H.date);
    if (date < 0) continue;
    const drcr = find(H.drcr);
    const desc = find(H.desc);
    const debit = find(H.debit, [drcr]);
    const credit = find(H.credit, [debit, drcr]);
    const amount = find(H.amount);
    if (desc < 0 && debit < 0 && amount < 0) continue;
    return { headerRow: i, date, desc, debit: debit === amount ? -1 : debit, credit: credit === amount ? -1 : credit, amount, drcr };
  }
  return null;
}

// Turn rows into { date, note, amount (paise, positive), type: expense|income }.
export function statementRows(rows, cols) {
  const out = [];
  for (let i = cols.headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[cols.date]);
    if (!date) continue;
    let amount = 0;
    let type = null;
    if (cols.debit >= 0 || cols.credit >= 0) {
      const d = cols.debit >= 0 ? parseAmount(r[cols.debit]) : 0;
      const c = cols.credit >= 0 ? parseAmount(r[cols.credit]) : 0;
      if (Math.abs(d) > 0) { amount = Math.abs(d); type = 'expense'; }
      else if (Math.abs(c) > 0) { amount = Math.abs(c); type = 'income'; }
    } else if (cols.amount >= 0) {
      const a = parseAmount(r[cols.amount]);
      const flag = cols.drcr >= 0 ? String(r[cols.drcr]).toLowerCase() : String(r[cols.amount]).toLowerCase();
      amount = Math.abs(a);
      type = /dr|debit/.test(flag) ? 'expense' : /cr|credit/.test(flag) ? 'income' : a < 0 ? 'expense' : 'income';
    }
    if (!type || !amount || isNaN(amount)) continue;
    const note = cleanNarration(cols.desc >= 0 ? r[cols.desc] : '');
    out.push({ date, amount, type, note, raw: cols.desc >= 0 ? r[cols.desc] : '' });
  }
  return out;
}

// "UPI/DR/123456789/SWIGGY/YESB/swiggy@yesbank/Payment" -> "SWIGGY"
// "NEFT CR-ACME PVT LTD-SALARY SEP" -> "ACME PVT LTD"
const NOISE = /^(upi|neft|imps|rtgs|ach|nach|ecs|dr|cr|p2m|p2a|p2p|inb|mb|mmt|pos|ib|payment|pay|paid|transfer|to transfer|by transfer|trf|ref|txn|(inb |mb )?(imps|neft|rtgs)( (cr|dr))?|(neft|imps|rtgs) (cr|dr))$/i;
export function cleanNarration(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (/^(ATM|ATW|CASH WDL|NWD|CWDR)/i.test(t)) return 'ATM withdrawal';
  if (!/[-/]/.test(t)) return t.slice(0, 60);
  const tokens = t.split(/[-/]/).map((x) => x.trim()).filter(Boolean);
  const good = tokens.find((x) => x.length >= 2 && !NOISE.test(x) && !/\d{5,}/.test(x) && !x.includes('@')
    && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(x) && !/^[A-Z]{4}$/.test(x) && /[a-z]/i.test(x));
  return (good || t).slice(0, 60);
}
