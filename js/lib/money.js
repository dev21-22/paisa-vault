// All amounts are stored as integer paise to avoid floating-point errors (₹12.30 -> 1230).

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });

export function toPaise(input) {
  if (typeof input === 'number') return Math.round(input * 100);
  const clean = String(input ?? '').replace(/[₹,\s]|rs\.?|inr/gi, '');
  if (!/^\d*\.?\d*$/.test(clean) || clean === '' || clean === '.') return NaN;
  return Math.round(parseFloat(clean) * 100);
}

export function fromPaise(p) {
  return p / 100;
}

// ₹1,23,456.5 (Indian lakh/crore grouping)
export function formatINR(paise) {
  return inr.format(paise / 100);
}

// ₹1.2L, ₹3.4Cr style for tight spaces
export function formatINRShort(paise) {
  return inrCompact.format(paise / 100).replace('T', 'K');
}

export function sum(list, pick = (x) => x) {
  return list.reduce((a, x) => a + pick(x), 0);
}
