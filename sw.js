// Offline support. Caches only the app's own files, never your data (your data lives encrypted in IndexedDB).
// Bump VERSION whenever app files change so phones pick up the update.
const VERSION = 'pv-1';

const FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/store.js', './js/features.js', './js/ui.js', './js/calc.js', './js/components.js', './js/txn-form.js',
  './js/lib/crypto.js', './js/lib/money.js', './js/lib/dates.js', './js/lib/sms.js',
  './js/features/home.js', './js/features/transactions.js', './js/features/reports.js', './js/features/budgets.js',
  './js/features/accounts.js', './js/features/recurring.js', './js/features/goals.js', './js/features/debts.js',
  './js/features/categories.js', './js/features/backup.js', './js/features/settings.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first (so updates arrive), falling back to the cache when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
