// Shared UI helpers: escaping, icons, bottom sheets, toasts, in-page confirms and SVG charts.

import { formatINR, formatINRShort } from './lib/money.js';

// ALWAYS pass user-entered text through esc() before putting it into innerHTML.
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Opening the phone's file picker hides the page; this stops "lock when hidden" from firing meanwhile.
export const lockGuard = { until: 0 };
export function pickFile(input) {
  lockGuard.until = Date.now() + 120000;
  input.click();
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function money(paise, { sign = false, short = false, cls = '' } = {}) {
  const txt = short ? formatINRShort(Math.abs(paise)) : formatINR(Math.abs(paise));
  const pre = paise < 0 ? '−' : sign && paise > 0 ? '+' : '';
  return `<span class="amt ${cls}">${pre}${txt}</span>`;
}

const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  chart: 'M4 20V10m6 10V4m6 16v-7m6 7H2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Zm14 7h.01',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-1a6 6 0 0 1 12 0v1m3-10a3 3 0 1 0 0-6m5 16v-1a5 5 0 0 0-3.5-4.8',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01',
  shield: 'M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Zm-3-10 2 2 4-4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.3 7.3 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.3 7.3 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeoff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm10 3-5-5',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  x: 'M6 6l12 12M18 6 6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4',
  sms: 'M4 5h16v11H8l-4 4V5Zm4 5h8',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4m4 4H7',
  download: 'M12 3v12m0 0-4-4m4 4 4-4M4 21h16',
  upload: 'M12 21V9m0 0-4 4m4-4 4 4M4 3h16',
  check: 'M5 12l5 5 9-10',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 4h4',
};

export function icon(name, size = 20) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || P.more}"/></svg>`;
}

// ---------- Toast with optional Undo ----------
let toastTimer = null;
export function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" class="btn-link" id="toast-undo">Undo</button>' : ''}`;
  el.hidden = false;
  el.classList.add('show');
  if (undo) $('#toast-undo').onclick = () => { undo(); hideToast(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 6000 : 2800);
}
function hideToast() {
  const el = $('#toast');
  el.classList.remove('show');
  el.hidden = true;
}

// ---------- Bottom sheet (modal on desktop) ----------
let sheetClose = null;
export function openSheet(title, bodyHTML, { onMount, wide = false } = {}) {
  const root = $('#sheet');
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <div class="sheet-panel ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header class="sheet-head">
        <h2 id="sheet-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
      </header>
      <div class="sheet-body">${bodyHTML}</div>
    </div>`;
  root.hidden = false;
  document.body.classList.add('sheet-open');
  const close = () => closeSheet();
  $$('[data-close]', root).forEach((b) => (b.onclick = close));
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  sheetClose = () => document.removeEventListener('keydown', onKey);
  const panel = $('.sheet-panel', root);
  onMount?.(panel);
  const first = $('input:not([type=hidden]), select, textarea', panel);
  if (first && matchMedia('(pointer: fine)').matches) first.focus();
  return panel;
}

export function closeSheet() {
  const root = $('#sheet');
  root.hidden = true;
  root.innerHTML = '';
  document.body.classList.remove('sheet-open');
  sheetClose?.();
  sheetClose = null;
}

// ---------- In-page confirm (browser confirm() is avoided on purpose) ----------
export function confirmSheet(title, message, { yes = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; closeSheet(); resolve(v); } };
    openSheet(title, `
      <p class="muted">${esc(message)}</p>
      <div class="row-end">
        <button type="button" class="btn" id="cf-no">Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cf-yes">${esc(yes)}</button>
      </div>`, {
      onMount: (p) => {
        $('#cf-no', p).onclick = () => finish(false);
        $('#cf-yes', p).onclick = () => finish(true);
        $$('[data-close]', $('#sheet')).forEach((b) => (b.onclick = () => finish(false)));
      },
    });
  });
}

// ---------- Charts (plain SVG, no libraries) ----------

// items: [{ label, value, color }]
export function donut(items, { size = 180, thickness = 26, centerTop = '', centerBottom = '' } = {}) {
  const total = items.reduce((a, x) => a + x.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const arcs = total ? items.map((x) => {
    const len = (x.value / total) * C;
    const gap = items.length > 1 ? Math.min(2, len / 3) : 0;
    const a = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${esc(x.color)}" stroke-width="${thickness}"
      stroke-dasharray="${Math.max(len - gap, 0)} ${C}" stroke-dashoffset="${-offset}"><title>${esc(x.label)}</title></circle>`;
    offset += len;
    return a;
  }).join('') : '';
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${thickness}"/>
    <g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g>
    <text x="50%" y="46%" text-anchor="middle" class="donut-top">${centerTop}</text>
    <text x="50%" y="60%" text-anchor="middle" class="donut-bottom">${esc(centerBottom)}</text>
  </svg>`;
}

// bars: [{ label, value, highlight, title }] — values in paise
export function barChart(bars, { height = 150, labelEvery = 1, color = 'var(--accent)', avgLine = null } = {}) {
  const W = 600;
  const top = 12;
  const bottom = 22;
  const H = height;
  const max = Math.max(1, ...bars.map((b) => b.value), avgLine || 0);
  const bw = W / Math.max(bars.length, 1);
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  const rects = bars.map((b, i) => {
    const h = Math.max(b.value > 0 ? 2 : 0, H - bottom - y(b.value));
    const x = i * bw + bw * 0.18;
    return `<rect x="${x.toFixed(1)}" y="${(H - bottom - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="2"
      fill="${b.highlight ? 'var(--accent-strong)' : color}" opacity="${b.highlight ? 1 : 0.75}"><title>${esc(b.title || '')}</title></rect>
      ${i % labelEvery === 0 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="axis">${esc(b.label)}</text>` : ''}`;
  }).join('');
  const avg = avgLine ? `<line x1="0" x2="${W}" y1="${y(avgLine).toFixed(1)}" y2="${y(avgLine).toFixed(1)}" class="avg-line"/>` : '';
  return `<svg class="bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
    <line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" class="base-line"/>${avg}${rects}</svg>`;
}

export function progress(value, max, { warnAt = 0.8 } = {}) {
  const ratio = max > 0 ? value / max : 0;
  const state = ratio >= 1 ? 'over' : ratio >= warnAt ? 'warn' : 'ok';
  const pct = Math.min(100, Math.round(ratio * 100));
  return `<div class="progress ${state}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;
}

export function emptyState(title, text, actionHTML = '') {
  return `<div class="empty"><p class="empty-title">${esc(title)}</p><p class="muted">${esc(text)}</p>${actionHTML}</div>`;
}

export function downloadFile(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// points: [{ label, value }] — values in paise, may be negative. Draws an area line with a zero line if needed.
export function lineChart(points, { height = 140, labelEvery = 1, color = 'var(--accent)' } = {}) {
  const W = 600;
  const top = 10;
  const bottom = 22;
  const H = height;
  if (!points.length) return '';
  const vals = points.map((p) => p.value);
  let min = Math.min(0, ...vals);
  let max = Math.max(0, ...vals);
  if (min === max) max = min + 1;
  const x = (i) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 8) + 4);
  const y = (v) => top + (H - top - bottom) * (1 - (v - min) / (max - min));
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} Z`;
  const last = points[points.length - 1];
  // Labels are HTML under the chart so they don't stretch with it.
  const labels = points.map((p, i) => ((i % labelEvery === 0 || i === points.length - 1) && p.label
    ? `<span style="left:${((x(i) / W) * 100).toFixed(2)}%">${esc(p.label)}</span>` : '')).join('');
  return `<div class="line-wrap"><svg class="line-chart" style="height:${H - bottom + 2}px" viewBox="0 0 ${W} ${H - bottom + 2}" preserveAspectRatio="none" role="img">
    ${min < 0 ? `<line x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="avg-line"/>` : ''}
    <line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" class="base-line"/>
    <path d="${area}" fill="${color}" opacity="0.12"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
  </svg><span class="line-dot" style="left:${((x(points.length - 1) / W) * 100).toFixed(2)}%;top:${y(last.value).toFixed(1)}px;background:${color}"></span>
  <div class="line-labels">${labels}</div></div>`;
}
