# Aara — Sawmill Manager for India

A web app for Indian sawmill owners. It runs in any browser, works offline after the first visit, and can be installed to the home screen on Android, iPhone, Windows and Mac.

## Features

- **Login and sign up** with mobile number and PIN, mill details, WBI licence number and GSTIN. Terms of Use and a Privacy Policy (DPDP Act 2023) must be accepted; WhatsApp/SMS alerts are a separate, optional consent.
- **People**: owners, co-owners (share %) and labour (daily, monthly or piece-rate wages). Add, edit, remove, attendance for today or any past day, mark-all-present, and a monthly wage-bill estimate.
- **Auctions**: where government timber is sold (HP, J&K, MP, Maharashtra, Kerala, AP, Haryana, UP, West Bengal forest corporations and the Kandla hub), how each auction works, and a personal auction diary.
- **Stock**: 48 Indian and imported timbers with Hindi names and indicative ₹/CFT. Track logs and sawn stock in CFT with low-stock alerts and an in/out ledger.
- **Orders and estimates**: CFT from sawn size (L ft × W in × T in ÷ 144), round logs (Hoppus quarter-girth rule) or running feet. Suggested rate from cost + margin, break-even warning, GST 18% (CGST+SGST or IGST), advance and balance, send straight to WhatsApp or print/PDF. Stock stays honest: confirming deducts, editing re-balances, cancelling or deleting restores. Supports job work (chirai).
- **Your data, portable**: one-tap JSON export and import — moving to a new phone is a two-minute job. Backup reminders if you have not exported in a while.
- **13 languages**: English, Hindi, Marathi, Gujarati, Punjabi, Bengali, Tamil, Telugu, Kannada, Malayalam, Odia, Assamese, Urdu.
- **Offline-first**: a service worker caches the app so it opens and works with no connection. Deep links like `./#orders` and `./#stock` open straight into a tab.

## Run it

It is static files with no build step.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Serve over `http://` or `https://` (not `file://`) so the service worker and offline mode work.

Run the test suite (no dependencies, DOM-shimmed):

```bash
node test/run.mjs   # or: npm test
```

## Files

- `index.html` — the whole app (markup, styles and logic; no build step)
- `sw.js` — service worker (offline cache, including fonts)
- `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — installable PWA bits
- `test/run.mjs` — smoke + logic tests that drive the real app functions
- `.github/workflows/test.yml` — CI gate on every push
- `docs/blueprint.md` — research notes and the recommended production stack

To publish, enable **GitHub Pages** (Settings → Pages → Deploy from branch → `main` / root).

Data is stored in the browser (`localStorage`) on the device. Use **More → Export backup** to save a copy.

## Status

This is a working prototype. Before public launch:

1. Lawyer review of Terms and Privacy; fill in company name and grievance officer.
2. Native-speaker review of the translations.
3. Move data to a server with phone OTP login (see [docs/blueprint.md](docs/blueprint.md) for the recommended Flutter + Supabase stack).

Wood rates are indicative and auction details should be confirmed with each forest corporation.
