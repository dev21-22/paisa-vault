# Paisa Vault

A private, encrypted expense tracker for your phone and laptop. It is free, works offline, and has no accounts, servers, ads or tracking.

## Features

- **Quick add:** amount, category, account and note. The amount box does sums (`250+120`), and the app remembers which category each merchant goes in.
- **Fill from a bank SMS:** paste a bank or UPI SMS and it fills in the amount, merchant, date and payment method. This happens on your device only.
- **Home:** this month's spending, income and savings, today and this week, budget left, a safe-to-spend amount per day, bills due, and recent entries.
- **Transactions:** search (by note, category, `#tag` or amount), filters, grouping by day, and editing or deleting with Undo.
- **Reports:** spending by category (donut chart), daily spending with an average line, a 6-month trend, spending by tag, and automatic insights (change vs last month, savings rate, biggest increase, busiest weekday).
- **Budgets:** an overall limit and per-category limits, with warnings at 80% and 100%.
- **Accounts:** cash, bank, UPI, credit cards and more, with running balances and transfers.
- **Bills & subscriptions:** weekly, monthly, quarterly or yearly. You get reminders on Home, or they can be added automatically.
- **Savings goals:** shows how much to save each month to reach a target by a date.
- **Lent & borrowed:** tracks who owes whom, including part repayments.
- **Categories:** add, rename, and change the icon and colour.
- **Salary-cycle month:** a "month" can start on any day, for example the 25th.
- **Indian formatting:** amounts show as ₹1,23,456, with lakh and crore grouping.
- **Hide amounts:** blurs every number, useful in public.
- **Light and dark mode**, and it can be installed as an app on your phone and laptop.

## Security

| What | How |
|---|---|
| Encryption | AES-256-GCM on all data, applied before it is saved |
| Password → key | PBKDF2-SHA256 with 600,000 rounds and a random salt |
| Key storage | Memory only; it is never written anywhere. Locking reloads the app and wipes it. |
| Auto-lock | After 1–30 minutes idle, optionally as soon as you switch apps, and always on reload |
| Brute force | Increasing wait times after 3 wrong passwords |
| Network | None. A strict Content-Security-Policy blocks every outside connection and script. |
| Dependencies | Zero. It uses only the browser's built-in Web Crypto. |
| Backups | Encrypted with your password (`.pvault` file) |
| App switcher | The screen is blurred when the app goes to the background |

**Forgetting your password means losing your data.** Nobody can reset it. Keep a recent backup.

This protects your data at rest and in backup files. It cannot protect you from malware on your device, or from someone using your device while the app is unlocked.

## Put it online for free (needed to use it on your phone)

The browser's encryption only works over HTTPS, so the app needs a free HTTPS host. **Only the app's code is uploaded. Your data never leaves your device.**

### Option 1: GitHub Pages
1. Create a free account at github.com and **turn on two-factor authentication**. Whoever controls this account controls the app's code.
2. Create a new repository, for example `paisa-vault`. On the free plan it must be public. That's fine, because it only contains code.
3. Upload every file in this folder except `tests/` and `package.json`, which are optional.
4. Go to **Settings → Pages → Source: Deploy from a branch → main / root**.
5. Your app will be at `https://<your-username>.github.io/paisa-vault/`.

### Option 2: Cloudflare Pages (the code can stay private)
1. Create a free Cloudflare account and turn on two-factor authentication.
2. Run `npx wrangler pages deploy . --project-name paisa-vault` in this folder, or drag the folder into **Workers & Pages → Create → Pages → Upload assets**.
3. Your app will be at `https://paisa-vault.pages.dev`.

### Install on your devices
- **Android (Chrome):** open the link, tap ⋮ and choose **Add to Home screen / Install app**.
- **iPhone (Safari):** open the link, tap Share and choose **Add to Home Screen**.
- **Laptop (Chrome or Edge):** open the link and click the install icon in the address bar.

After installing, the app works fully offline.

## Syncing phone and laptop

1. On the device with the newest data: **More → Backup & sync → Create backup file**.
2. Send the `.pvault` file to the other device by WhatsApp, Drive, email or USB. It is encrypted.
3. On the other device: **Backup & sync → Open a backup file → Merge**.

To set up a new device, choose **Restore from a backup file** on the first screen.

## Run it on your laptop without hosting

```
cd /home/daxpatel/try
python3 -m http.server 8080 --bind 127.0.0.1
```
Then open http://localhost:8080. Data stored this way is separate from the data in the hosted version. Use a backup to move it.

## Tests

```
npm test
```

## Changing features

See `CLAUDE.md`. In short, every screen is one file in `js/features/`, listed in `js/features.js`. You can also turn features off in **Settings → Features**.
