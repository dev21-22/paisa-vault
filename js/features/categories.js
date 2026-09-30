import { esc, icon, openSheet, closeSheet, toast, confirmSheet, $, $$ } from '../ui.js';
import { uid } from '../store.js';

const COLORS = ['#E07A3F', '#4F9D69', '#3F7AE0', '#C850C0', '#D4A017', '#8C6BD1', '#D9534F', '#2BA5A5', '#E0569B', '#5A7BB5', '#7A6A58', '#2E9E63', '#1F7A8C', '#8A8F98'];
const EMOJI = ['🍽️', '🛒', '⛽', '🚕', '🛍️', '💡', '🏠', '💊', '📚', '🎬', '📱', '🏦', '🎁', '👕', '✈️', '🐶', '🧒', '💇', '🏋️', '☕', '🍺', '🔧', '🙏', '💼', '📈', '💰', '📦', '➕'];

export function render(root, ctx) {
  const { state } = ctx;
  const count = (id) => state.txns.filter((t) => t.categoryId === id).length;
  const section = (kind, title) => `
    <div class="card">
      <div class="row-between"><h2 class="card-title">${title}</h2><button type="button" class="btn btn-small" data-new="${kind}">${icon('plus', 16)} Add</button></div>
      <div class="cat-list">${state.categories.filter((c) => c.kind === kind).map((c) => `
        <button type="button" class="cat-item" data-cat="${esc(c.id)}">
          <span class="txn-ic" style="--c:${esc(c.color)}">${esc(c.icon)}</span>
          <span class="grow">${esc(c.name)}</span><span class="muted small">${count(c.id)}</span>
        </button>`).join('')}</div>
    </div>`;
  root.innerHTML = `<div class="stack">${section('expense', 'Expense categories')}${section('income', 'Income categories')}</div>`;
  $$('[data-new]', root).forEach((b) => (b.onclick = () => edit(ctx, null, b.dataset.new)));
  $$('[data-cat]', root).forEach((b) => (b.onclick = () => edit(ctx, state.categories.find((c) => c.id === b.dataset.cat))));
}

function edit(ctx, cat, kind = cat?.kind) {
  const { state } = ctx;
  let color = cat?.color || COLORS[state.categories.length % COLORS.length];
  let emoji = cat?.icon || '📦';
  const panel = openSheet(cat ? 'Edit category' : 'New category', `
    <form class="form" id="cf" novalidate>
      <label class="field"><span class="label">Name</span><input id="cf-name" maxlength="30" value="${esc(cat?.name || '')}"></label>
      <div class="field"><span class="label">Icon</span><div class="pick-grid" id="cf-emoji">${EMOJI.map((e) => `<button type="button" class="pick ${e === emoji ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}</div></div>
      <div class="field"><span class="label">Colour</span><div class="pick-grid" id="cf-color">${COLORS.map((c) => `<button type="button" class="pick swatch ${c === color ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}</div></div>
      <p class="error" id="cf-err" role="alert" hidden></p>
      <div class="row-between">
        ${cat ? `<button type="button" class="btn btn-danger-ghost" id="cf-del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);
  $$('[data-e]', panel).forEach((b) => (b.onclick = () => { emoji = b.dataset.e; $$('[data-e]', panel).forEach((x) => x.classList.toggle('on', x === b)); }));
  $$('[data-c]', panel).forEach((b) => (b.onclick = () => { color = b.dataset.c; $$('[data-c]', panel).forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#cf', panel).onsubmit = (e) => {
    e.preventDefault();
    const name = $('#cf-name', panel).value.trim();
    if (!name) { const er = $('#cf-err', panel); er.textContent = 'Give the category a name.'; er.hidden = false; return; }
    if (cat) Object.assign(cat, { name, icon: emoji, color });
    else state.categories.push({ id: uid(), name, icon: emoji, color, kind });
    ctx.save();
    closeSheet();
    toast('Category saved');
    ctx.refresh();
  };
  $('#cf-del', panel)?.addEventListener('click', async () => {
    const others = state.categories.filter((c) => c.kind === cat.kind && c.id !== cat.id);
    if (!others.length) { toast('Keep at least one category of each type.'); return; }
    const n = state.txns.filter((t) => t.categoryId === cat.id).length;
    const fallback = others.find((c) => /^other/i.test(c.name)) || others[0];
    const msg = n ? `${n} transaction${n === 1 ? '' : 's'} will move to "${fallback.name}".` : 'This category has no transactions.';
    if (!(await confirmSheet(`Delete "${cat.name}"?`, msg))) return;
    state.txns.forEach((t) => { if (t.categoryId === cat.id) t.categoryId = fallback.id; });
    state.recurring.forEach((r) => { if (r.categoryId === cat.id) r.categoryId = fallback.id; });
    delete state.budgets[cat.id];
    state.categories = state.categories.filter((c) => c.id !== cat.id);
    ctx.save();
    toast('Category deleted');
    ctx.refresh();
  });
}
