import { esc, money, icon, progress, openSheet, closeSheet, toast, confirmSheet, emptyState, $, $$ } from '../ui.js';
import { evalAmount } from '../calc.js';
import { uid } from '../store.js';
import { iso, daysBetween, prettyDate } from '../lib/dates.js';
import { fromPaise } from '../lib/money.js';

export function render(root, ctx) {
  const { state } = ctx;
  const today = iso();
  root.innerHTML = `
  <div class="stack">
    <div class="row-between"><p class="muted">Save towards things that matter: an emergency fund, a trip, a new phone.</p>
      <button type="button" class="btn btn-small" id="g-add">${icon('plus', 16)} New goal</button></div>
    ${state.goals.length ? `<div class="goal-grid">${state.goals.map((g) => {
      const left = g.target - g.saved;
      let plan = '';
      if (left > 0 && g.deadline) {
        const days = daysBetween(today, g.deadline);
        const months = Math.max(1, Math.ceil(days / 30.4));
        plan = days < 0 ? '<span class="neg">Deadline passed</span>' : `Save ${money(Math.ceil(left / months))} a month to reach it by ${esc(prettyDate(g.deadline))}`;
      }
      return `<div class="card goal">
        <div class="row-between"><strong>${esc(g.name)}</strong>${left <= 0 ? '<span class="pill pill-good">Reached</span>' : ''}</div>
        <div class="big-num">${money(g.saved)} <span class="muted small">of ${money(g.target)}</span></div>
        ${progress(g.saved, g.target, { warnAt: 2 })}
        <p class="muted small">${plan || (left > 0 ? `${money(left)} to go` : 'Well done.')}</p>
        <div class="row-end">
          <button type="button" class="btn btn-small btn-ghost" data-edit="${esc(g.id)}">Edit</button>
          <button type="button" class="btn btn-small" data-add="${esc(g.id)}">${icon('plus', 16)} Add money</button>
        </div>
      </div>`;
    }).join('')}</div>` : emptyState('No goals yet', 'Create a goal and add money to it whenever you save.')}
  </div>`;

  $('#g-add', root).onclick = () => edit(ctx, null);
  $$('[data-edit]', root).forEach((b) => (b.onclick = () => edit(ctx, state.goals.find((g) => g.id === b.dataset.edit))));
  $$('[data-add]', root).forEach((b) => (b.onclick = () => contribute(ctx, state.goals.find((g) => g.id === b.dataset.add))));
}

function contribute(ctx, g) {
  const panel = openSheet(`Add to ${g.name}`, `
    <form class="form" id="gc" novalidate>
      <label class="amount-field"><span class="rupee">₹</span><input id="gc-amt" inputmode="decimal" placeholder="0" aria-label="Amount"></label>
      <p class="hint">Use a negative number to take money out.</p>
      <p class="error" id="gc-err" role="alert" hidden></p>
      <div class="row-end"><button type="submit" class="btn btn-primary">Save</button></div>
    </form>`);
  $('#gc', panel).onsubmit = (e) => {
    e.preventDefault();
    const v = evalAmount($('#gc-amt', panel).value);
    if (!v || isNaN(v)) { const er = $('#gc-err', panel); er.textContent = 'Enter an amount.'; er.hidden = false; return; }
    g.saved = Math.max(0, g.saved + v);
    (g.contributions ||= []).push({ date: iso(), amount: v });
    ctx.save();
    closeSheet();
    toast(g.saved >= g.target ? `Goal reached: ${g.name}!` : 'Saved');
    ctx.refresh();
  };
}

function edit(ctx, g) {
  const { state } = ctx;
  const panel = openSheet(g ? 'Edit goal' : 'New goal', `
    <form class="form" id="gf" novalidate>
      <label class="field"><span class="label">Goal name</span><input id="gf-name" maxlength="50" value="${esc(g?.name || '')}" placeholder="e.g. Emergency fund"></label>
      <div class="grid-2">
        <label class="field"><span class="label">Target ₹</span><input id="gf-target" inputmode="decimal" value="${g ? fromPaise(g.target) : ''}"></label>
        <label class="field"><span class="label">Already saved ₹</span><input id="gf-saved" inputmode="decimal" value="${g ? fromPaise(g.saved) : ''}" placeholder="0"></label>
        <label class="field"><span class="label">Target date (optional)</span><input id="gf-date" type="date" value="${esc(g?.deadline || '')}"></label>
      </div>
      <p class="error" id="gf-err" role="alert" hidden></p>
      <div class="row-between">
        ${g ? `<button type="button" class="btn btn-danger-ghost" id="gf-del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);
  const err = (m) => { const e = $('#gf-err', panel); e.textContent = m; e.hidden = false; };
  $('#gf', panel).onsubmit = (e) => {
    e.preventDefault();
    const name = $('#gf-name', panel).value.trim();
    const target = evalAmount($('#gf-target', panel).value);
    const savedRaw = $('#gf-saved', panel).value.trim();
    const saved = savedRaw ? evalAmount(savedRaw) : 0;
    if (!name) return err('Give the goal a name.');
    if (!(target > 0)) return err('Enter a target above ₹0.');
    if (isNaN(saved) || saved < 0) return err('Saved amount must be 0 or more.');
    const rec = { id: g?.id || uid(), name, target, saved, deadline: $('#gf-date', panel).value || null, contributions: g?.contributions || [] };
    if (g) Object.assign(g, rec); else state.goals.push(rec);
    ctx.save();
    closeSheet();
    toast('Goal saved');
    ctx.refresh();
  };
  $('#gf-del', panel)?.addEventListener('click', async () => {
    if (!(await confirmSheet('Delete goal?', `"${g.name}" will be removed.`))) return;
    state.goals = state.goals.filter((x) => x.id !== g.id);
    ctx.save();
    toast('Goal deleted');
    ctx.refresh();
  });
}
