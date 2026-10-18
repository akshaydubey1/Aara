# Aara — Sawmill Manager for India

A web app for Indian sawmill owners. It runs in any browser, works offline after the first visit, can be installed to the home screen, and can be wrapped as a native Android/iOS app.

## Features

- **Login and sign up** with mobile number and PIN (hashed, with lockout after failed attempts), mill details, licence number and GSTIN. Terms of Use and a Privacy Policy (DPDP Act 2023) must be accepted; WhatsApp/SMS alerts are a separate, optional consent.
- **People**: owners, co-owners (share %) and labour (daily, monthly or piece-rate wages). Attendance register for any day, advances, wage-paid tracking, monthly wage-bill estimate, and Excel export.
- **Auctions**: how government timber auctions work across the major forest corporations, plus a personal auction diary with EMD tracking.
- **Stock**: 48 Indian and imported timbers plus by-products (sawdust, firewood, off-cuts). Logs and sawn stock in CFT with weighted-average landed cost, sell rates, low-stock alerts and a full in/out ledger.
- **Orders and estimates**: CFT from sawn size (L ft × W in × T in ÷ 144), round logs (Hoppus quarter-girth or true cylinder) or running feet. Suggested rate from cost + margin, loss warning before confirming, GST (CGST+SGST or IGST), advance and balance, receivables, customer book with dues, job work (chirai), by-product sales. Stock stays honest: confirming deducts once, editing re-balances, cancelling or deleting restores.
- **Profit engine**: per-order profit with frozen cost basis, monthly P&L (revenue, material, wages, overheads, break-even CFT, processing cost vs your rate formula), wood-wise margins.
- **Letterhead quotations**: customer-facing estimate documents — HSN codes, amount in words, payment details, your terms and logo — as PDF, print, WhatsApp, email, SMS or copied text. Internal costs and margins never leave the office.
- **WhatsApp workflows**: message templates, a send queue, customer broadcasts, and a provider config placeholder for API sending.
- **Your data, portable**: automatic scheduled backups, one-tap JSON export, validated import with merge or replace, a data-repair tool, and Excel exports for orders, stock, people and auctions.
- **Optional cloud sync**: the same mill on a second phone or a computer, with email/SMS sign-in codes — powered by Supabase when configured, fully optional. See [docs/sync-setup.md](docs/sync-setup.md).
- **13 languages**: English, Hindi, Marathi, Gujarati, Punjabi, Bengali, Tamil, Telugu, Kannada, Malayalam, Odia, Assamese, Urdu.
- **Offline-first**: a service worker caches the app (including fonts and the PDF engine) so it opens and works with no connection. Deep links like `./#orders` and `./#demo` open straight into a tab or the sample mill.

## Run it

It is static files with no build step.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Serve over `http://` or `https://` (not `file://`) so the service worker and offline mode work.

Try the sample mill instantly with `http://localhost:8000/#demo` — or deep-link a tab: `#demo/stock`, `#demo/orders`, `#demo/estimate`, `#demo/share`.

Run the test suite (no dependencies, DOM-shimmed):

```bash
node test/run.mjs   # or: npm test
```

## Native app

Android and iOS builds are thin Capacitor shells around the same code — see [docs/app-build.md](docs/app-build.md).

```bash
npm install && npm run app:add && npm run app:sync
```

## Files

- `index.html` — the whole app (markup, styles and logic; no build step)
- `sw.js` — service worker (offline cache, including fonts)
- `sync.js` — optional Supabase sync layer (loaded only when configured)
- `vendor/` — vendored PDF libraries so letterhead PDFs work offline
- `supabase/schema.sql` — one-time backend setup for sync
- `capacitor.config.json`, `scripts/build-app.mjs` — native app shell
- `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — installable PWA bits
- `test/run.mjs` — smoke + logic tests that drive the real app functions
- `.github/workflows/test.yml` — CI gate on every push
- `docs/` — blueprint (production path), sync setup, native app builds

To publish, enable **GitHub Pages** (Settings → Pages → Deploy from branch → `main` / root).

Data is stored in the browser (`localStorage`) on the device — and optionally in your own Supabase project when sync is configured. Use **More → Backup & restore** to keep a downloaded copy too.

## Status

Working software with an automated test suite. Before public launch:

1. Lawyer review of Terms and Privacy; fill in company name and grievance officer.
2. Native-speaker review of the translations.
3. For multi-device use beyond the optional Supabase sync, see [docs/blueprint.md](docs/blueprint.md) for the production stack notes.

Wood rates are indicative and auction details should be confirmed with each forest corporation.
