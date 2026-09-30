# Paisa Vault

A private, encrypted expense tracker for your phone and laptop. It is free, works offline, and has no accounts, servers, ads or tracking.

## Features

**Adding entries**
- **Quick add:** amount, category, account and note. The amount box does sums (`250+120`).
- **One-tap frequent entries:** items you add often (tea ₹20, metro ₹40) appear as buttons.
- **Split transactions:** one DMart bill can be divided across Groceries and Household.
- **Fill from a bank SMS:** paste a bank or UPI SMS to fill in the amount, merchant, date, *and the right account* (matched by its last 4 digits).
- **Smart categories:** your own rules ("contains milkman → Groceries"), then your past entries, then 150+ common Indian merchants (Swiggy, Zomato, Uber, Jio, BigBasket, IRCTC and more).

**Multiple bank accounts and cards**
- **Account details:** bank name, last 4 digits, colour, and grouping (banks, cards, cash & wallets, investments, loans).
- **Per-account screen:** balance, 90-day balance chart, money in and out this month, recent entries.
- **Update balance:** enter what your bank app shows, and a correction is added so the two match. Corrections don't count as income or spending.
- **Credit cards:** statement date, due date, bill amount, unbilled amount, limit used (with a warning above 30%), a "Pay card bill" button, and reminders on Home.
- **Minimum balance alerts** for bank accounts.
- **Net worth:** what you own minus what you owe, with a 12-month chart. You can leave accounts out of it.
- **Closed accounts** are hidden but keep their history.
- **Bank statement import (CSV):** works with HDFC, SBI, ICICI, Axis, Kotak and other formats. It cleans up UPI and NEFT descriptions, fills in categories, skips duplicates, and records ATM withdrawals as transfers to Cash.

**Planning**
- **Budgets:** an overall limit and per-category limits, with 80% and 100% warnings and optional **rollover** (unspent money carries into next month).
- **Safe-to-spend per day** and a **spending pace** warning ("at this pace you'll overspend by ₹X").
- **Bills & subscriptions:** weekly, monthly, quarterly or yearly, as reminders or added automatically.
- **Subscription detection:** spots repeating payments you haven't set up yet, like Netflix or a gym.
- **30-day cash forecast:** money coming in and going out, the balance afterwards, and a warning if your balance might go below zero.
- **Savings goals** with a monthly amount needed; **lent & borrowed** tracking with part repayments.

**Understanding your money**
- **Reports:** category donut, daily bars with an average line, 6-month trend, **spending calendar** (with no-spend days), spending by account and by tag, and automatic insights.
- **Search** by note, category, `#tag` or amount, with filters by type, category, account and amount range.

**Everyday comfort**
- Salary-cycle month (it can start on any day), Indian ₹ formatting, hide-amounts mode, and light/dark themes.
- Installs as an app on phone and laptop and works offline.

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
