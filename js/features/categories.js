import { esc, icon, openSheet, closeSheet, toast, confirmSheet, $, $$ } from '../ui.js';
import { uid } from '../store.js';

const COLORS = ['#E07A3F', '#4F9D69', '#3F7AE0', '#C850C0', '#D4A017', '#8C6BD1', '#D9534F', '#2BA5A5', '#E0569B', '#5A7BB5', '#7A6A58', '#2E9E63', '#1F7A8C', '#8A8F98'];
const EMOJI = ['🍽️', '🛒', '⛽', '🚕', '🛍️', '💡', '🏠', '💊', '📚', '🎬', '📱', '🏦', '🎁', '👕', '✈️', '🐶', '🧒', '💇', '🏋️', '☕', '🍺', '🔧', '🙏', '💼', '📈', '💰', '📦', '➕'];

export function render(root, ctx) {
  const { state } = ctx;
  const count = (id) => state.txns.filter((t) => t.categoryId === id || t.splits?.some((p) => p.categoryId === id)).length;
  const section = (kind, title) => `
    <div class="card">
      <div class="row-between"><h2 class="card-title">${title}</h2><button type="button" class="btn btn-small" data-new="${kind}">${icon('plus', 16)} Add</button></div>
      <div class="cat-list">${state.categories.filter((c) => c.kind === kind).map((c) => `
        <button type="button" class="cat-item" data-cat="${esc(c.id)}">
          <span class="txn-ic" style="--c:${esc(c.color)}">${esc(c.icon)}</span>
          <span class="grow">${esc(c.name)}</span><span class="muted small">${count(c.id)}</span>
        </button>`).join('')}</div>
    </div>`;
  const cats = Object.fromEntries(state.categories.map((c) => [c.id, c]));
  const rules = `
    <div class="card">
      <div class="row-between"><h2 class="card-title">Auto-category rules</h2><button type="button" class="btn btn-small" id="rule-add">${icon('plus', 16)} Add rule</button></div>
      <p class="muted small">When a note contains the words, that category is picked for you, including for pasted SMS and imported statements. Common Indian merchants like Swiggy, Zomato, Uber, Jio, Amazon and BigBasket are recognised even without a rule.</p>
      ${(state.rules || []).length ? `<div class="rule-list">${state.rules.map((r) => `
        <div class="rule"><span>Contains <strong>"${esc(r.match)}"</strong> → ${esc(cats[r.categoryId]?.icon || '')} ${esc(cats[r.categoryId]?.name || 'deleted category')}</span>
          <button type="button" class="icon-btn" data-rule-del="${esc(r.id)}" aria-label="Delete rule">${icon('trash', 16)}</button></div>`).join('')}</div>` : '<p class="muted small">No rules yet. Example: "milkman" → Groceries.</p>'}
    </div>`;
  root.innerHTML = `<div class="stack">${section('expense', 'Expense categories')}${section('income', 'Income categories')}${rules}</div>`;
  $$('[data-new]', root).forEach((b) => (b.onclick = () => edit(ctx, null, b.dataset.new)));
  $('#rule-add', root).onclick = () => editRule(ctx);
  $$('[data-rule-del]', root).forEach((b) => (b.onclick = () => {
    const i = state.rules.findIndex((r) => r.id === b.dataset.ruleDel);
    const [removed] = state.rules.splice(i, 1);
    ctx.save();
    toast('Rule deleted', () => { state.rules.splice(i, 0, removed); ctx.save(); ctx.refresh(); });
    ctx.refresh();
  }));
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
    const n = state.txns.filter((t) => t.categoryId === cat.id || t.splits?.some((p) => p.categoryId === cat.id)).length;
    const fallback = others.find((c) => /^other/i.test(c.name)) || others[0];
    const msg = n ? `${n} transaction${n === 1 ? '' : 's'} will move to "${fallback.name}".` : 'This category has no transactions.';
    if (!(await confirmSheet(`Delete "${cat.name}"?`, msg))) return;
    state.txns.forEach((t) => {
      if (t.categoryId === cat.id) t.categoryId = fallback.id;
      t.splits?.forEach((p) => { if (p.categoryId === cat.id) p.categoryId = fallback.id; });
    });
    state.rules = (state.rules || []).filter((r) => r.categoryId !== cat.id);
    if (state.budgetRollover) delete state.budgetRollover[cat.id];
    state.recurring.forEach((r) => { if (r.categoryId === cat.id) r.categoryId = fallback.id; });
    delete state.budgets[cat.id];
    state.categories = state.categories.filter((c) => c.id !== cat.id);
    ctx.save();
    toast('Category deleted');
    ctx.refresh();
  });
}

function editRule(ctx) {
  const { state } = ctx;
  const panel = openSheet('New auto-category rule', `
    <form class="form" id="rf" novalidate>
      <label class="field"><span class="label">If the note contains</span><input id="rf-match" maxlength="40" placeholder="e.g. milkman, ramesh, club"></label>
      <label class="field"><span class="label">Use category</span><select id="rf-cat">
        <optgroup label="Expense">${state.categories.filter((c) => c.kind === 'expense').map((c) => `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</optgroup>
        <optgroup label="Income">${state.categories.filter((c) => c.kind === 'income').map((c) => `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</optgroup>
      </select></label>
      <label class="check"><input type="checkbox" id="rf-apply" checked> Also re-categorise past entries that match</label>
      <p class="error" id="rf-err" role="alert" hidden></p>
      <div class="row-end"><button type="submit" class="btn btn-primary">Save rule</button></div>
    </form>`);
  $('#rf', panel).onsubmit = (e) => {
    e.preventDefault();
    const match = $('#rf-match', panel).value.trim().toLowerCase();
    if (match.length < 2) { const er = $('#rf-err', panel); er.textContent = 'Type at least 2 letters.'; er.hidden = false; return; }
    const categoryId = $('#rf-cat', panel).value;
    const kind = state.categories.find((c) => c.id === categoryId)?.kind;
    (state.rules ||= []).unshift({ id: uid(), match, categoryId });
    let changed = 0;
    if ($('#rf-apply', panel).checked) {
      for (const t of state.txns) {
        if (t.type === kind && !t.splits?.length && t.note && t.note.toLowerCase().includes(match) && t.categoryId !== categoryId) { t.categoryId = categoryId; changed++; }
      }
    }
    ctx.save();
    closeSheet();
    toast(changed ? `Rule saved. ${changed} past entr${changed === 1 ? 'y' : 'ies'} updated.` : 'Rule saved');
    ctx.refresh();
  };
}
