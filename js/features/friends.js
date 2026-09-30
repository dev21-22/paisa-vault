// Split with friends: people, groups, balances, settle up and reminders.

import { esc, money, icon, openSheet, closeSheet, toast, confirmSheet, emptyState, $, $$ } from '../ui.js';
import { balances, totalsOwed, groupSummary, personActivity, ME } from '../lib/split.js';
import { openSharedForm, openSettle, openReminder, addPerson, personName } from '../share-form.js';
import { uid } from '../store.js';
import { prettyDate } from '../lib/dates.js';

const GROUP_ICONS = ['✈️', '🏠', '👨‍👩‍👧', '🎉', '🍽️', '🏖️', '💼', '🎓', '🚗', '⚽'];

function balText(v, name) {
  if (v > 0) return `<span class="pos">${esc(name)} owes you ${money(v)}</span>`;
  if (v < 0) return `<span class="neg">You owe ${esc(name)} ${money(-v)}</span>`;
  return '<span class="muted">Settled up</span>';
}
const shortBal = (v) => (v > 0 ? `<span class="pos">owes you ${money(v)}</span>` : v < 0 ? `<span class="neg">you owe ${money(-v)}</span>` : '<span class="muted">settled up</span>');
const balAmt = (v) => (v > 0 ? `<span class="pos amt-strong">+${money(v)}</span>` : v < 0 ? `<span class="neg amt-strong">−${money(-v)}</span>` : '<span class="muted small">settled</span>');

export function render(root, ctx) {
  if (ctx.params.person && ctx.state.people.some((p) => p.id === ctx.params.person)) return renderPerson(root, ctx, ctx.params.person);
  if (ctx.params.group && ctx.state.groups.some((g) => g.id === ctx.params.group)) return renderGroup(root, ctx, ctx.params.group);
  const { state } = ctx;
  const bal = balances(state);
  const t = totalsOwed(bal);
  const groups = state.groups.filter((g) => !g.archived);
  const people = [...state.people].sort((a, b) => Math.abs(bal[b.id] || 0) - Math.abs(bal[a.id] || 0) || a.name.localeCompare(b.name));

  root.innerHTML = `
  <div class="stack">
    <div class="kpis kpis-3">
      <div class="kpi"><span class="label">Owed to you</span><span class="num pos">${money(t.owedToYou)}</span></div>
      <div class="kpi"><span class="label">You owe</span><span class="num ${t.youOwe ? 'neg' : ''}">${money(t.youOwe)}</span></div>
      <div class="kpi"><span class="label">Overall</span><span class="num ${t.net < 0 ? 'neg' : t.net > 0 ? 'pos' : ''}">${t.net >= 0 ? '' : '−'}${money(Math.abs(t.net))}</span></div>
    </div>

    <div class="row-wrap">
      <button type="button" class="btn btn-primary" id="fr-add">${icon('plus', 18)} Split a bill</button>
      <button type="button" class="btn" id="fr-paidfor">I paid for someone</button>
      <button type="button" class="btn" id="fr-settle">${icon('check', 18)} Settle up</button>
      <button type="button" class="btn" id="fr-group">${icon('plus', 18)} New group</button>
    </div>

    <div class="card">
      <div class="row-between"><h2 class="card-title">Groups</h2><span class="muted small">Trips, flatmates, family</span></div>
      ${groups.length ? `<div class="acc-list">${groups.map((g) => {
        const sm = groupSummary(state, g.id);
        const gt = totalsOwed(sm.balances);
        return `<button type="button" class="acc" data-group="${esc(g.id)}">
          <span class="group-ic">${esc(g.icon || '👥')}</span>
          <span class="acc-main"><strong>${esc(g.name)}</strong><span class="muted small">${g.memberIds.length + 1} people · ${sm.count} bill${sm.count === 1 ? '' : 's'} · total ${money(sm.total)}</span></span>
          <span class="acc-bal">${balAmt(gt.net)}</span>
        </button>`;
      }).join('')}</div>` : emptyState('No groups yet', 'Make a group for a trip, your flat or family, so everyone in it is picked in one tap.', '<button type="button" class="btn btn-small" id="fr-group2">Create a group</button>')}
    </div>

    <div class="card">
      <div class="row-between"><h2 class="card-title">People</h2><button type="button" class="btn btn-small" id="fr-person">${icon('plus', 16)} Add person</button></div>
      ${people.length ? `<div class="acc-list">${people.map((p) => `
        <button type="button" class="acc" data-person="${esc(p.id)}">
          <span class="avatar" style="--h:${hue(p.name)}">${esc(initials(p.name))}</span>
          <span class="acc-main"><strong>${esc(p.name)}</strong><span class="small">${balText(bal[p.id] || 0, p.name)}</span></span>
          <span class="acc-bal">${balAmt(bal[p.id] || 0)}</span>
        </button>`).join('')}</div>` : emptyState('No one here yet', 'Add friends or family, or just type their name when you split a bill.')}
    </div>

    ${state.groups.some((g) => g.archived) ? `<p class="muted small">${state.groups.filter((g) => g.archived).length} finished group(s) hidden.</p>` : ''}
  </div>`;

  $('#fr-add', root).onclick = () => openSharedForm();
  $('#fr-paidfor', root).onclick = () => openSharedForm(null, { onlyThem: true, personIds: [] });
  $('#fr-settle', root).onclick = () => openSettle();
  $('#fr-group', root).onclick = () => editGroup(ctx, null);
  $('#fr-group2', root)?.addEventListener('click', () => editGroup(ctx, null));
  $('#fr-person', root).onclick = () => editPerson(ctx, null);
  $$('[data-group]', root).forEach((b) => (b.onclick = () => ctx.go('friends', { group: b.dataset.group })));
  $$('[data-person]', root).forEach((b) => (b.onclick = () => ctx.go('friends', { person: b.dataset.person })));
}

function activityRow(a, perspectiveId) {
  if (a.kind === 'settlement') {
    const p = a.item;
    return `<div class="act-row"><span class="act-ic pos">${icon('check', 16)}</span>
      <span class="act-main"><strong>${p.direction === 'in' ? `${esc(personName(p.personId))} paid you` : `You paid ${esc(personName(p.personId))}`}</strong><span class="muted small">${esc(prettyDate(p.date))} · settle up</span></span>
      <span class="small">${money(p.amount)}</span></div>`;
  }
  const s = a.item;
  const others = Object.keys(s.shares).filter((id) => id !== ME).length;
  const effect = perspectiveId ? a.effect : null;
  return `<button type="button" class="act-row as-link" data-shared="${esc(s.id)}"><span class="act-ic">${icon('people', 16)}</span>
    <span class="act-main"><strong>${esc(s.desc)}</strong><span class="muted small">${esc(prettyDate(s.date))} · ${esc(personName(s.paidBy))} paid ${money(s.amount)} · ${others + (s.shares[ME] != null ? 1 : 0)} people</span></span>
    <span class="small">${effect == null ? money(s.shares[ME] || 0) : effect > 0 ? `<span class="pos">+${money(effect)}</span>` : effect < 0 ? `<span class="neg">−${money(-effect)}</span>` : '<span class="muted">—</span>'}</span></button>`;
}

function renderPerson(root, ctx, id) {
  const { state } = ctx;
  const p = state.people.find((x) => x.id === id);
  const b = balances(state)[id] || 0;
  const acts = personActivity(state, id);
  root.innerHTML = `
  <div class="stack">
    <button type="button" class="btn-link" id="fr-back">${icon('chevL', 16)} Split with friends</button>
    <div class="card person-hero">
      <div class="row-between">
        <div class="row-wrap" style="align-items:center"><span class="avatar big" style="--h:${hue(p.name)}">${esc(initials(p.name))}</span>
          <div><h2 class="card-title">${esc(p.name)}</h2>${p.phone ? `<span class="muted small">${esc(p.phone)}</span>` : ''}</div></div>
        <button type="button" class="btn btn-small" id="fr-edit">${icon('edit', 16)} Edit</button>
      </div>
      <div class="big-num">${b > 0 ? `<span class="pos">${money(b)}</span>` : b < 0 ? `<span class="neg">${money(-b)}</span>` : money(0)}</div>
      <p class="small">${balText(b, p.name)}</p>
      <div class="row-wrap">
        <button type="button" class="btn btn-small btn-primary" id="fr-split">${icon('plus', 16)} Split a bill</button>
        <button type="button" class="btn btn-small" id="fr-pf">I paid for ${esc(p.name)}</button>
        ${b ? '<button type="button" class="btn btn-small" id="fr-st">Settle up</button>' : ''}
        ${b > 0 ? '<button type="button" class="btn btn-small" id="fr-rm">Send reminder</button>' : ''}
      </div>
    </div>
    <div class="card">
      <h2 class="card-title">History</h2>
      ${acts.length ? `<div class="act-list">${acts.map((a) => activityRow(a, id)).join('')}</div>` : emptyState('Nothing yet', 'Bills you share with them will show here.')}
    </div>
  </div>`;
  $('#fr-back', root).onclick = () => ctx.go('friends');
  $('#fr-edit', root).onclick = () => editPerson(ctx, p);
  $('#fr-split', root).onclick = () => openSharedForm(null, { personIds: [id] });
  $('#fr-pf', root).onclick = () => openSharedForm(null, { personIds: [id], onlyThem: true });
  $('#fr-st', root)?.addEventListener('click', () => openSettle(id));
  $('#fr-rm', root)?.addEventListener('click', () => openReminder(id));
  bindShared(root, state);
}

function renderGroup(root, ctx, id) {
  const { state } = ctx;
  const g = state.groups.find((x) => x.id === id);
  const sm = groupSummary(state, id);
  const members = [ME, ...g.memberIds];
  const acts = [...state.shared.filter((s) => s.groupId === id).map((s) => ({ kind: 'expense', item: s, date: s.date, created: s.created })),
    ...state.settlements.filter((p) => p.groupId === id).map((p) => ({ kind: 'settlement', item: p, date: p.date, created: p.created }))]
    .sort((a, b) => (a.date === b.date ? (b.created || 0) - (a.created || 0) : a.date < b.date ? 1 : -1));
  const maxPaid = Math.max(1, ...members.map((m) => sm.paid[m] || 0));

  root.innerHTML = `
  <div class="stack">
    <button type="button" class="btn-link" id="fr-back">${icon('chevL', 16)} Split with friends</button>
    <div class="card group-hero">
      <div class="row-between">
        <h2 class="card-title"><span class="group-ic">${esc(g.icon || '👥')}</span> ${esc(g.name)}${g.archived ? ' <span class="pill">Finished</span>' : ''}</h2>
        <button type="button" class="btn btn-small" id="fr-edit">${icon('edit', 16)} Edit</button>
      </div>
      <div class="kpis kpis-3 kpis-flat">
        <div><span class="label">Group spent</span><span class="num">${money(sm.total)}</span></div>
        <div><span class="label">Your share</span><span class="num">${money(sm.myShare)}</span></div>
        <div><span class="label">Bills</span><span class="num">${sm.count}</span></div>
      </div>
      <div class="row-wrap">
        <button type="button" class="btn btn-small btn-primary" id="fr-split">${icon('plus', 16)} Add a bill</button>
        <button type="button" class="btn btn-small" id="fr-st">Settle up</button>
      </div>
    </div>

    <div class="card">
      <h2 class="card-title">Balances with you</h2>
      <div class="acc-list">${g.memberIds.map((pid) => `
        <div class="acc">
          <span class="avatar" style="--h:${hue(personName(pid))}">${esc(initials(personName(pid)))}</span>
          <span class="acc-main"><strong>${esc(personName(pid))}</strong><span class="small">${shortBal(sm.balances[pid] || 0)}</span></span>
          ${(sm.balances[pid] || 0) > 0 ? `<button type="button" class="btn btn-small" data-rm="${esc(pid)}">Remind</button>` : ''}
          ${sm.balances[pid] ? `<button type="button" class="btn btn-small" data-st="${esc(pid)}">Settle</button>` : ''}
        </div>`).join('')}</div>
    </div>

    ${sm.count ? `<div class="card">
      <h2 class="card-title">Who paid what</h2>
      <div class="cat-bars">${members.map((m) => `<div class="cat-bar"><span class="cat-name">${esc(personName(m))}</span>
        <span class="cat-track"><span style="width:${Math.max(2, ((sm.paid[m] || 0) / maxPaid) * 100)}%;background:hsl(${hue(personName(m))} 70% 60%)"></span></span>
        <span class="cat-amt">${money(sm.paid[m] || 0)}</span></div>`).join('')}</div>
      <p class="muted small">Each person's share of the bills: ${members.map((m) => `${esc(personName(m))} ${money(sm.share[m] || 0)}`).join(' · ')}</p>
    </div>` : ''}

    <div class="card">
      <h2 class="card-title">Bills</h2>
      ${acts.length ? `<div class="act-list">${acts.map((a) => activityRow(a, null)).join('')}</div>` : emptyState('No bills yet', 'Add the first bill for this group.')}
    </div>
  </div>`;
  $('#fr-back', root).onclick = () => ctx.go('friends');
  $('#fr-edit', root).onclick = () => editGroup(ctx, g);
  $('#fr-split', root).onclick = () => openSharedForm(null, { groupId: id });
  $('#fr-st', root).onclick = () => openSettle(null, id);
  $$('[data-st]', root).forEach((b) => (b.onclick = () => openSettle(b.dataset.st, id)));
  $$('[data-rm]', root).forEach((b) => (b.onclick = () => openReminder(b.dataset.rm)));
  bindShared(root, state);
}

function bindShared(root, state) {
  $$('[data-shared]', root).forEach((b) => (b.onclick = () => {
    const s = state.shared.find((x) => x.id === b.dataset.shared);
    if (s) openSharedForm(s);
  }));
}

function editPerson(ctx, p) {
  const { state } = ctx;
  const panel = openSheet(p ? 'Edit person' : 'Add person', `
    <form class="form" id="pf" novalidate>
      <label class="field"><span class="label">Name</span><input id="pf-name" maxlength="40" value="${esc(p?.name || '')}"></label>
      <label class="field"><span class="label">WhatsApp number (optional)</span><input id="pf-phone" inputmode="tel" maxlength="16" value="${esc(p?.phone || '')}" placeholder="98765 43210"></label>
      <p class="hint">Only used to open WhatsApp with a reminder when you choose to.</p>
      <p class="error" id="pf-err" role="alert" hidden></p>
      <div class="row-between">
        ${p ? `<button type="button" class="btn btn-danger-ghost" id="pf-del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);
  $('#pf', panel).onsubmit = (e) => {
    e.preventDefault();
    const name = $('#pf-name', panel).value.trim();
    if (!name) { const er = $('#pf-err', panel); er.textContent = 'Enter a name.'; er.hidden = false; return; }
    const phone = $('#pf-phone', panel).value.trim();
    if (p) Object.assign(p, { name, phone });
    else { const n = addPerson(name); n.phone = phone; }
    ctx.save();
    closeSheet();
    toast('Saved');
    ctx.refresh();
  };
  $('#pf-del', panel)?.addEventListener('click', async () => {
    const used = state.shared.some((s) => s.paidBy === p.id || p.id in s.shares) || state.settlements.some((x) => x.personId === p.id);
    if (used) { await confirmSheet('Can\'t delete yet', `${p.name} is part of shared bills. Delete those bills first.`, { yes: 'OK', danger: false }); return; }
    if (!(await confirmSheet(`Delete ${p.name}?`, 'They will be removed from your people and groups.'))) return;
    state.people = state.people.filter((x) => x.id !== p.id);
    state.groups.forEach((g) => { g.memberIds = g.memberIds.filter((m) => m !== p.id); });
    ctx.save();
    toast('Deleted');
    ctx.go('friends');
  });
}

function editGroup(ctx, g) {
  const { state } = ctx;
  let members = g ? [...g.memberIds] : [];
  let gIcon = g?.icon || GROUP_ICONS[0];
  const panel = openSheet(g ? 'Edit group' : 'New group', `
    <form class="form" id="gf" novalidate>
      <label class="field"><span class="label">Group name</span><input id="gf-name" maxlength="40" value="${esc(g?.name || '')}" placeholder="e.g. Goa trip, Flat 402, Family"></label>
      <div class="field"><span class="label">Icon</span><div class="pick-grid">${GROUP_ICONS.map((x) => `<button type="button" class="pick ${x === gIcon ? 'on' : ''}" data-i="${x}">${x}</button>`).join('')}</div></div>
      <div class="field"><span class="label">Members (you're always in)</span><div class="chips" id="gf-m"></div>
        <div class="add-person"><input id="gf-new" maxlength="40" placeholder="Add a person by name" aria-label="New member name"><button type="button" class="btn btn-small" id="gf-add">${icon('plus', 16)} Add</button></div></div>
      ${g ? `<label class="check"><input type="checkbox" id="gf-arch" ${g.archived ? 'checked' : ''}> Finished (hide this group, keep its history)</label>` : ''}
      <p class="error" id="gf-err" role="alert" hidden></p>
      <div class="row-between">
        ${g ? `<button type="button" class="btn btn-danger-ghost" id="gf-del">${icon('trash', 18)} Delete</button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">Save group</button>
      </div>
    </form>`);
  const renderM = () => {
    $('#gf-m', panel).innerHTML = state.people.map((p) => `<button type="button" class="chip ${members.includes(p.id) ? 'on' : ''}" data-m="${esc(p.id)}" style="--chip:var(--accent)">${esc(p.name)}</button>`).join('') || '<span class="muted small">Add people below.</span>';
    $$('[data-m]', panel).forEach((b) => (b.onclick = () => { const id = b.dataset.m; members = members.includes(id) ? members.filter((x) => x !== id) : [...members, id]; renderM(); }));
  };
  renderM();
  $$('[data-i]', panel).forEach((b) => (b.onclick = () => { gIcon = b.dataset.i; $$('[data-i]', panel).forEach((x) => x.classList.toggle('on', x === b)); }));
  const addNew = () => { const p = addPerson($('#gf-new', panel).value); if (p && !members.includes(p.id)) members.push(p.id); $('#gf-new', panel).value = ''; renderM(); };
  $('#gf-add', panel).onclick = addNew;
  $('#gf-new', panel).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } };
  $('#gf', panel).onsubmit = (e) => {
    e.preventDefault();
    const name = $('#gf-name', panel).value.trim();
    const err = (m) => { const er = $('#gf-err', panel); er.textContent = m; er.hidden = false; };
    if (!name) return err('Give the group a name.');
    if (!members.length) return err('Add at least one other person.');
    const rec = { id: g?.id || uid(), name, icon: gIcon, memberIds: members, archived: g ? $('#gf-arch', panel).checked : false };
    if (g) Object.assign(g, rec); else state.groups.push(rec);
    ctx.save();
    closeSheet();
    toast('Group saved');
    if (g) ctx.refresh(); else ctx.go('friends', { group: rec.id });
  };
  $('#gf-del', panel)?.addEventListener('click', async () => {
    if (state.shared.some((s) => s.groupId === g.id)) { await confirmSheet('This group has bills', 'Tick "Finished" to hide it instead. Its bills and balances are kept.', { yes: 'OK', danger: false }); return; }
    if (!(await confirmSheet(`Delete ${g.name}?`, 'The group is removed. People in it are kept.'))) return;
    state.groups = state.groups.filter((x) => x.id !== g.id);
    ctx.save();
    toast('Group deleted');
    ctx.go('friends');
  });
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
}
function hue(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
