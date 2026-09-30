// Splitting bills with friends and family. Pure functions, amounts in paise.
// 'me' is always the id for you. Balances are tracked between you and each person
// (money between two friends that doesn't involve you is not tracked).

export const ME = 'me';

// Divide `total` among `who` (ids) using a split mode. Returns { [id]: paise } or throws a user-facing Error.
//   equal:   input ignored
//   exact:   input[id] = paise
//   percent: input[id] = percent number (must add up to 100)
//   shares:  input[id] = weight number (e.g. 2, 1, 1)
export function computeShares(total, who, mode = 'equal', input = {}) {
  if (!(total > 0)) throw new Error('Enter an amount above ₹0.');
  if (!who.length) throw new Error('Pick at least one person to split with.');
  const out = {};
  if (mode === 'exact') {
    let sum = 0;
    for (const id of who) {
      const v = Math.round(Number(input[id]) || 0);
      if (v < 0) throw new Error('Amounts cannot be negative.');
      out[id] = v;
      sum += v;
    }
    if (sum !== total) throw new Error(`The amounts add up to ₹${(sum / 100).toLocaleString('en-IN')}, but the bill is ₹${(total / 100).toLocaleString('en-IN')}.`);
    return out;
  }
  let weights;
  if (mode === 'percent') {
    weights = who.map((id) => Number(input[id]) || 0);
    const sum = weights.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.001) throw new Error(`Percentages add up to ${+sum.toFixed(2)}%. They need to add up to 100%.`);
  } else if (mode === 'shares') {
    weights = who.map((id) => Number(input[id]) || 0);
    if (weights.some((w) => w < 0)) throw new Error('Shares cannot be negative.');
    if (!weights.some((w) => w > 0)) throw new Error('Give at least one person a share.');
  } else {
    weights = who.map(() => 1);
  }
  const wsum = weights.reduce((a, b) => a + b, 0);
  // Floor everyone's part, then hand the leftover paise out one by one so the total is exact.
  let given = 0;
  const raw = who.map((id, i) => {
    const exact = (total * weights[i]) / wsum;
    const f = Math.floor(exact);
    given += f;
    return { id, f, rem: exact - f };
  });
  let left = total - given;
  const order = [...raw].sort((a, b) => b.rem - a.rem || who.indexOf(a.id) - who.indexOf(b.id));
  for (const r of order) { if (left <= 0) break; if (weights[who.indexOf(r.id)] > 0) { r.f += 1; left--; } }
  for (const r of raw) out[r.id] = r.f;
  return out;
}

// What each shared expense and settlement means between you and one person.
// Positive = they owe you. Only entries in `groupId` if given (null = everything).
export function balances(state, groupId = null) {
  const bal = {};
  const add = (pid, v) => { bal[pid] = (bal[pid] || 0) + v; };
  for (const s of state.shared || []) {
    if (groupId && s.groupId !== groupId) continue;
    if (s.paidBy === ME) {
      for (const [pid, v] of Object.entries(s.shares)) if (pid !== ME) add(pid, v);
    } else if (s.shares[ME]) {
      add(s.paidBy, -s.shares[ME]);
    }
  }
  for (const p of state.settlements || []) {
    if (groupId && p.groupId !== groupId) continue;
    add(p.personId, p.direction === 'in' ? -p.amount : p.amount);
  }
  for (const k of Object.keys(bal)) if (bal[k] === 0) delete bal[k];
  return bal;
}

export function totalsOwed(bal) {
  let owedToYou = 0;
  let youOwe = 0;
  for (const v of Object.values(bal)) { if (v > 0) owedToYou += v; else youOwe += -v; }
  return { owedToYou, youOwe, net: owedToYou - youOwe };
}

// Group overview: total spent by the group, your share, and who paid how much.
export function groupSummary(state, groupId) {
  const list = (state.shared || []).filter((s) => s.groupId === groupId);
  let total = 0;
  let myShare = 0;
  const paid = {};
  const share = {};
  for (const s of list) {
    total += s.amount;
    myShare += s.shares[ME] || 0;
    paid[s.paidBy] = (paid[s.paidBy] || 0) + s.amount;
    for (const [id, v] of Object.entries(s.shares)) share[id] = (share[id] || 0) + v;
  }
  return { count: list.length, total, myShare, paid, share, balances: balances(state, groupId) };
}

// Everything that involves one person, newest first, with its effect on the balance.
export function personActivity(state, personId) {
  const out = [];
  for (const s of state.shared || []) {
    let effect = 0;
    if (s.paidBy === ME && s.shares[personId]) effect = s.shares[personId];
    else if (s.paidBy === personId && s.shares[ME]) effect = -s.shares[ME];
    else if (!(personId in s.shares) && s.paidBy !== personId) continue;
    out.push({ kind: 'expense', item: s, date: s.date, effect, created: s.created || 0 });
  }
  for (const p of state.settlements || []) {
    if (p.personId !== personId) continue;
    out.push({ kind: 'settlement', item: p, date: p.date, effect: p.direction === 'in' ? -p.amount : p.amount, created: p.created || 0 });
  }
  return out.sort((a, b) => (a.date === b.date ? b.created - a.created : a.date < b.date ? 1 : -1));
}

const fmt = (p) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// A UPI "pay me" link. Most UPI apps open it and pre-fill the amount.
export function upiLink(upiId, name, amount, note) {
  if (!upiId) return '';
  const q = new URLSearchParams({ pa: upiId, pn: name || 'Paisa Vault user', am: (amount / 100).toFixed(2), cu: 'INR' });
  if (note) q.set('tn', note.slice(0, 50));
  return `upi://pay?${q.toString()}`;
}

// Friendly reminder text listing what the person owes.
export function reminderText(state, personId, { myName = '', upiId = '' } = {}) {
  const person = (state.people || []).find((p) => p.id === personId);
  const bal = balances(state)[personId] || 0;
  if (!person || bal <= 0) return '';
  const lines = personActivity(state, personId).filter((a) => a.kind === 'expense' && a.effect > 0).slice(0, 6)
    .map((a) => `• ${a.item.desc} (${a.item.date.slice(8, 10)}/${a.item.date.slice(5, 7)}): ${fmt(a.effect)}`);
  let t = `Hi ${person.name}, a gentle reminder: you owe me ${fmt(bal)}.`;
  if (lines.length) t += `\n${lines.join('\n')}`;
  if (upiId) t += `\n\nUPI: ${upiId}\n${upiLink(upiId, myName, bal, 'Settle up')}`;
  t += '\n\nThanks!';
  return t;
}
