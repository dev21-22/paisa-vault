// FEATURE REGISTRY — the single place that lists every screen of the app.
//
// To add a feature:    create js/features/<id>.js exporting `render(root, ctx)`, then add an entry below.
// To remove a feature: delete its entry (and file). Its data stays in the vault untouched.
// To hide a feature:   users can switch any non-core feature off in Settings -> Features.
//
// Fields:
//   id       unique key, also the file name in js/features/
//   title    name shown in navigation
//   icon     key into ICONS in js/ui.js
//   nav      'main' = bottom bar on phones, 'more' = inside the More screen
//   core     true = cannot be switched off
//   on       default on/off for new vaults
//   blurb    one line shown in Settings -> Features

export const FEATURES = [
  { id: 'home',         title: 'Home',          icon: 'home',     nav: 'main', core: true,  on: true, blurb: 'Month at a glance, bills due, recent spending.' },
  { id: 'transactions', title: 'Transactions',  icon: 'list',     nav: 'main', core: true,  on: true, blurb: 'Every expense, income and transfer, with search and filters.' },
  { id: 'reports',      title: 'Reports',       icon: 'chart',    nav: 'main', core: false, on: true, blurb: 'Charts by category, day and month, with insights.' },
  { id: 'budgets',      title: 'Budgets',       icon: 'target',   nav: 'more', core: false, on: true, blurb: 'Monthly limits per category with warnings.' },
  { id: 'accounts',     title: 'Accounts',      icon: 'wallet',   nav: 'more', core: false, on: true, blurb: 'Cash, bank, UPI and cards with running balances.' },
  { id: 'recurring',    title: 'Bills & subscriptions', icon: 'repeat', nav: 'more', core: false, on: true, blurb: 'Rent, EMIs, subscriptions. Reminders or auto-add.' },
  { id: 'goals',        title: 'Savings goals', icon: 'flag',     nav: 'more', core: false, on: true, blurb: 'Save towards a target amount by a date.' },
  { id: 'debts',        title: 'Lent & borrowed', icon: 'people', nav: 'more', core: false, on: true, blurb: 'Track money you gave or took from friends and family.' },
  { id: 'categories',   title: 'Categories',    icon: 'tag',      nav: 'more', core: true,  on: true, blurb: 'Add, rename or recolour categories.' },
  { id: 'backup',       title: 'Backup & sync', icon: 'shield',   nav: 'more', core: true,  on: true, blurb: 'Encrypted backup file to move data between phone and laptop. CSV export.' },
  { id: 'settings',     title: 'Settings',      icon: 'gear',     nav: 'more', core: true,  on: true, blurb: 'Password, auto-lock, privacy and features.' },
];

export function defaultFeatureState() {
  return Object.fromEntries(FEATURES.map((f) => [f.id, f.on]));
}

export function enabledFeatures(state) {
  return FEATURES.filter((f) => f.core || state.features[f.id] !== false);
}

export function isOn(state, id) {
  const f = FEATURES.find((x) => x.id === id);
  return !!f && (f.core || state.features[id] !== false);
}

export function loadFeature(id) {
  return import(`./features/${id}.js`);
}
