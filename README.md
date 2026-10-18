# Aara — Sawmill Manager for India

A web app for Indian sawmill owners. It runs in any browser and can be installed to the home screen on Android, iPhone, Windows and Mac.

## Features

- **Login and sign up** with mobile number and PIN, mill details, WBI licence number and GSTIN. Terms of Use and a Privacy Policy (DPDP Act 2023) must be accepted; WhatsApp/SMS alerts are a separate, optional consent.
- **People**: owners, co-owners (share %) and labour (daily, monthly or piece-rate wages). Add, edit, remove, daily attendance and monthly wage-bill estimate.
- **Auctions**: where government timber is sold (HP, J&K, MP, Maharashtra, Kerala, AP, Haryana, UP, West Bengal forest corporations and the Kandla hub), how each auction works, and a personal auction diary.
- **Stock**: 48 Indian and imported timbers with Hindi names and indicative ₹/CFT. Track logs and sawn stock in CFT with low-stock alerts and an in/out ledger.
- **Orders and estimates**: CFT from sawn size (L ft × W in × T in ÷ 144), round logs (Hoppus quarter-girth rule) or running feet. Suggested rate from cost + margin, break-even warning, GST 18% (CGST+SGST or IGST), advance and balance, WhatsApp-ready quote. Confirming an order reduces stock. Supports job work (chirai).
- **13 languages**: English, Hindi, Marathi, Gujarati, Punjabi, Bengali, Tamil, Telugu, Kannada, Malayalam, Odia, Assamese, Urdu.

## Run it

It is a single static page with no build step.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

To publish, enable **GitHub Pages** (Settings → Pages → Deploy from branch → `main` / root).

Data is stored in the browser (`localStorage`) on the device. Use **More → Export backup** to save a copy.

## Status

This is a working prototype. Before public launch:

1. Lawyer review of Terms and Privacy; fill in company name and grievance officer.
2. Native-speaker review of the translations.
3. Move data to a server with phone OTP login (see [docs/blueprint.md](docs/blueprint.md) for the recommended Flutter + Supabase stack).

Wood rates are indicative and auction details should be confirmed with each forest corporation.
