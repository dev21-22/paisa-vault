// Date helpers. Dates are stored as local 'YYYY-MM-DD' strings.

export function iso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

// Adds months, clamping the day (31 Jan + 1 month -> 28/29 Feb). `anchorDay` keeps the original day of month.
export function addMonths(s, n, anchorDay) {
  const d = parseISO(s);
  const day = anchorDay ?? d.getDate();
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const target = new Date(y, m, 1);
  target.setDate(Math.min(day, daysInMonth(target.getFullYear(), target.getMonth())));
  return iso(target);
}

// The budget period ("month") containing `date`, where each period starts on `startDay`
// (1 = calendar month; 25 = salary cycle from the 25th). `offset` moves whole periods.
export function periodRange(date = iso(), startDay = 1, offset = 0) {
  const d = parseISO(date);
  let y = d.getFullYear();
  let m = d.getMonth();
  const clampStart = (yy, mm) => Math.min(startDay, daysInMonth(yy, mm));
  if (d.getDate() < clampStart(y, m)) m -= 1;
  m += offset;
  const s = new Date(y, m, 1);
  s.setDate(clampStart(s.getFullYear(), s.getMonth()));
  const e = new Date(y, m + 1, 1);
  e.setDate(clampStart(e.getFullYear(), e.getMonth()));
  e.setDate(e.getDate() - 1);
  return { start: iso(s), end: iso(e) };
}

export function periodLabel({ start, end }) {
  const s = parseISO(start);
  const e = parseISO(end);
  if (s.getDate() === 1) return s.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const f = (x) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${f(s)} – ${f(e)} ${e.getFullYear()}`;
}

export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

export function prettyDate(s) {
  const today = iso();
  if (s === today) return 'Today';
  if (s === addDays(today, -1)) return 'Yesterday';
  if (s === addDays(today, 1)) return 'Tomorrow';
  const d = parseISO(s);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-IN', opts);
}

export function nextOccurrence(s, freq, anchorDay) {
  if (freq === 'daily') return addDays(s, 1);
  if (freq === 'weekly') return addDays(s, 7);
  if (freq === 'yearly') return addMonths(s, 12, anchorDay);
  if (freq === 'quarterly') return addMonths(s, 3, anchorDay);
  return addMonths(s, 1, anchorDay);
}
