# Paisa Vault — notes for making changes

Private, encrypted, offline expense tracker (PWA). Plain HTML/CSS/JS ES modules with **no dependencies and no build step**. The owner's data is extremely sensitive, so security rules below are non-negotiable.

## Layout
```
index.html            Shell + strict CSP meta tag
css/app.css           All styles. Colours are tokens on :root with dark variants; use tokens, never literal colours
sw.js                 Offline cache. Add every new file to FILES and bump VERSION on every release
js/app.js             Boot, setup/unlock/restore screens, navigation, auto-lock
js/store.js           Encrypted IndexedDB vault, in-memory `state`, defaultState(), migrate()
js/features.js        FEATURE REGISTRY: every screen is listed here
js/features/<id>.js   One screen per file; exports render(root, ctx)
js/txn-form.js        Shared add/edit transaction sheet
js/components.js      Shared UI pieces (transaction rows, period nav)
js/ui.js              esc(), icons, sheets, toasts, confirmSheet(), SVG charts
js/calc.js            Pure calculations (totals, balances, evalAmount, suggestions)
js/lib/               crypto.js, money.js (paise), dates.js (YYYY-MM-DD + periods), sms.js
tests/core.test.js    node --test (npm test)
```

## Adding a feature
1. Create `js/features/<id>.js` exporting `render(root, ctx)`. `ctx` = `{ state, save, go, refresh, params, openTxnForm, rebuildShell, applyTheme, lock }`.
2. Add an entry to `FEATURES` in `js/features.js` (`nav: 'main'` for the phone's bottom bar, max 3 main items besides Home/More; otherwise `'more'`).
3. If it stores new data, add the key to `defaultState()` **and** `migrate()` in `store.js` so existing vaults keep working.
4. Add the file to `FILES` in `sw.js` and bump `VERSION`.
5. Add tests for any logic to `tests/` and run `npm test`.

Removing a feature: delete its registry entry, file, and `sw.js` line. Leave its data in the vault (harmless) unless the owner asks to purge it.

## Conventions
- Money is **integer paise** everywhere (`toPaise`, `formatINR`, `money()` helper). Never store floats.
- Dates are local `YYYY-MM-DD` strings (`iso()`); never use `toISOString()` for dates (UTC shift in IST).
- Month = period from `settings.periodStartDay`; use `currentPeriod(state, offset)`.
- Mutate `state`, then `ctx.save()` (debounced, encrypted write), then `ctx.refresh()`.
- Destructive actions use `confirmSheet()` or a toast with Undo; never `alert/confirm/prompt`.
- Every form field has an id; errors are shown inline in a `.error` element with plain-language text.

## Security rules (must keep)
- **Escape all user text with `esc()`** before putting it in `innerHTML`, including names, notes, tags, category names.
- No external scripts, fonts, CDNs, analytics or network calls. Do not loosen the CSP in `index.html`.
- Never write decrypted data, the password, or the key to localStorage, sessionStorage, cookies, logs or the service worker cache.
- The only plaintext files allowed out of the app are CSV exports the user explicitly requests (with a warning).
- Keep crypto on Web Crypto (AES-256-GCM, PBKDF2-SHA256 ≥ 600k). Changing the format needs a migration path for existing vaults and backup files.
