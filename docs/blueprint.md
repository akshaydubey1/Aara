# Aara — Sawmill Management App: Research & Production Blueprint

_Prepared 18 Oct 2026. The working product is `index.html` — a single-page PWA._

## 1. What the app does today

| Section | Features |
|---|---|
| Login / Sign up | Mobile + 4–6 digit PIN (salted hash), mill name, owner, state, district, licence no., GSTIN validation. Separate, unbundled consents: Terms & Privacy (required) and WhatsApp/SMS alerts (optional). Change-PIN and 5-attempt lockout. Sample mill for demos (`#demo` deep links). |
| Terms & Privacy | Draft Terms of Use + DPDP Act 2023 privacy notice (needs lawyer review; fill company name, grievance officer). |
| People | Owners, co-owners (share %, PAN; warns if shares ≠ 100%), labour (role, daily / monthly / piece-rate wage, ESIC/UAN, last 4 of Aadhaar only, worker consent tick). Attendance register for any date, advances, wage-paid tracking, monthly wage-bill estimate, Excel export. |
| Auctions | Directory of 10 timber sale sources with how each auction works and official links. Personal diary (Watching → Registered → EMD paid → Won/Lost → Lifted), countdowns, EMD, checklist. |
| Stock | 48 species + by-products (sawdust, firewood, off-cuts — qty in kg/bundles/tractor-loads). Weighted-average landed cost, sell rates, low-stock alerts, in/out ledger, custom woods (removal blocked while referenced). Yard estimator for log stacks. |
| Orders & estimates | CFT by sawn size (L ft × W in × T in ÷ 144), round log (Hoppus quarter-girth or true volume) or running feet. Timber sale vs job work (chirai) vs by-product sale. Suggested rate = (buy + wastage + sawing + labour) × (1 + margin), loss warning before confirm. Transport, discount, GST (CGST+SGST or IGST), advance, balance, receivables. Customer book with dues and payment allocation to oldest orders. Stock ledger stays honest: confirm deducts once, editing re-balances, cancel/delete restores. |
| Profit engine | Per-order profit with cost basis frozen at confirmation. Monthly P&L: revenue, material cost, wages, overheads, net, break-even CFT, real vs assumed processing rate, wood-wise margins. |
| Documents | Letterhead estimates — HSN, amount in words, payment details, logo, terms — as PDF (vendored, works offline), print, WhatsApp/email/SMS/copy. No internal cost data on customer documents. |
| WhatsApp | Templates, send queue, customer broadcasts, provider config placeholder for API sending. |
| Data safety | Auto-backups on a schedule with retention, manual backup, validated import (merge or replace, current data saved first), data repair tool, Excel exports. |
| Settings | Mill profile, letterhead/bank/payment details, licence expiry alert, pricing defaults, overheads, 13 languages (incl. RTL Urdu). |
| Architecture | Local-first `localStorage` under a `Store` seam; every cloud write also lands locally. Optional `sync.js` (Supabase REST, last-write-wins per key, email/SMS OTP) attaches through that seam — `supabase/schema.sql` + docs/sync-setup.md. Capacitor shell for native apps — capacitor.config.json + docs/app-build.md. |

## 2. Research findings used
- **GST**: logs (HSN 4403) and sawn timber (HSN 4407) at 18% from 22 Sep 2025; firewood (4401) exempt.
- **Volume**: Hoppus foot = (quarter girth in inches)² × length (ft) ÷ 144. 1 Hoppus ft = 1.273 cu ft; 1 m³ = 35.315 CFT.
- **Licensing**: Wood-Based Industries (Establishment & Regulation) Guidelines 2016 (MoEFCC, from the Godavarman case). State Level Committee approval needed for new or renewed licences; licences now issued for 5 years; no new WBI within 1 km of notified forests (varies by state rules).
- **Auctions**: HPSFDC e-auction (hpfdceauction.co.in) and Kanlog open auctions; JKFDC monthly calendar, 21-day lifting; MPRVVN girth-class lots, EMD 10%; FDCM e-auction since 2017 plus Ballarshah retail sale 23rd–30th; Kerala ~33 sales depots, teak graded by girth/length/soundness; APFDC Red Sanders via MSTC; Haryana uses Maharashtra's portal.
- **Rates**: market listings show teak ₹1,000–3,500/CFT, sheesham ₹1,200–1,800, sal ₹1,800, pine ₹700–1,100, mango ₹500, Malaysian sal ₹1,450; imported green sawn timber around ₹510–580/CFT at Gandhidham.
- **Privacy**: DPDP Rules 2025 notified 13–14 Nov 2025; consent manager registration from Nov 2026; core consent, notice, breach (72 h to Board) and erasure duties from 13 May 2027.

## 3. Production path

Two tracks now exist:

- **Interim (done)**: the PWA + optional Supabase sync (`sync.js`) + Capacitor shells for the Play Store / App Store. One codebase; the native layer adds file/share integration only.
- **Full rewrite (if the product outgrows a single page)**: Flutter, one codebase for Android, iOS, web, Windows and macOS. Offline-first local SQLite (Drift) with background sync. Supabase (Postgres + Row Level Security per mill) in the Mumbai region for data localisation — the interim `mill_data` schema maps onto it directly.

Either way:
- **Login**: phone OTP via MSG91 or Twilio Verify (email OTP already works through the sync layer), plus PIN/biometric unlock on device. Roles: Owner, Co-owner, Munshi (accounts), Supervisor.
- **Messaging**: WhatsApp Business API (Gupshup/Interakt) for quotes, auction reminders, wage slips.
- **Billing**: GST e-invoice (IRP) integration once turnover crosses the threshold.
- **Auctions feed**: a small scraper/RSS job collecting notices from corporation sites daily; human review before publishing.
- **Subscription payments**: Razorpay (UPI AutoPay).

## 4. Launch checklist
1. Lawyer review of Terms and Privacy; appoint grievance officer; DPDP consent records.
2. Native-speaker review of all 13 translations.
3. Verify each auction source and link with the corporation before launch; add Gujarat, Karnataka, Tamil Nadu, Odisha, Chhattisgarh, Assam.
4. Pilot with 10–20 mills in two states (e.g. MP and Punjab); measure estimate time and stock accuracy.
5. Store listings: Play Store (AAB via the Capacitor shell) and App Store, with the privacy story — data stays on device unless the owner configures sync.
6. Pricing: free tier (1 mill, 10 workers), paid tier for multi-user, WhatsApp API, invoices.
