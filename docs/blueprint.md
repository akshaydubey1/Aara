# Aara — Sawmill Management App: Research & Production Blueprint

_Prepared 18 Oct 2026. The working prototype is the "Aara Sawmill Manager" artifact._

## 1. What the prototype does today
| Section | Features |
|---|---|
| Login / Sign up | Mobile + 4–6 digit PIN (hashed), mill name, owner, state, district, WBI licence no., GSTIN validation. Separate, unbundled consents: Terms & Privacy (required) and WhatsApp/SMS alerts (optional). Sample mill for demos. |
| Terms & Privacy | Draft Terms of Use + DPDP Act 2023 privacy notice (needs lawyer review; fill company name, grievance officer). |
| People | Owners, co-owners (share %, PAN; warns if shares ≠ 100%), labour (role, daily / monthly / piece-rate wage, ESIC/UAN, last 4 of Aadhaar only, worker consent tick). Add, edit, remove, active/inactive, daily attendance, monthly wage-bill estimate. |
| Auctions | Directory of 10 timber sale sources (HP, J&K, MP, Maharashtra, Kerala, AP, Haryana, UP, WB forest corporations + Kandla hub) with how each auction works and official links. Personal auction diary with status (Watching → Registered → EMD paid → Won/Lost → Lifted), countdowns, EMD. "Before you bid" checklist. |
| Stock | 48 species (Indian hardwood, conifer, plantation, imported, restricted) with Hindi names, uses and indicative ₹/CFT. Tick what you stock; logs vs sawn; buy/sell rates; low-stock alerts; stock in/out ledger; custom woods. |
| Orders & estimates | CFT by sawn size (L ft × W in × T in ÷ 144), round log (Hoppus quarter-girth or true volume) or running feet. Timber sale vs job work (chirai). Suggested rate = (buy + wastage + sawing + labour) × (1 + margin), break-even warning, stock check. Transport, discount, GST 18% (CGST+SGST or IGST), advance, balance. Confirm reduces stock. WhatsApp-ready quote text. |
| Settings | Mill profile, licence expiry alert, pricing defaults, 13 languages (EN, HI, MR, GU, PA, BN, TA, TE, KN, ML, OR, AS, UR with RTL), JSON backup, delete account. |

## 2. Research findings used
- **GST**: logs (HSN 4403) and sawn timber (HSN 4407) at 18% from 22 Sep 2025; firewood (4401) exempt.
- **Volume**: Hoppus foot = (quarter girth in inches)² × length (ft) ÷ 144. 1 Hoppus ft = 1.273 cu ft; 1 m³ = 35.315 CFT.
- **Licensing**: Wood-Based Industries (Establishment & Regulation) Guidelines 2016 (MoEFCC, from the Godavarman case). State Level Committee approval needed for new or renewed licences; licences now issued for 5 years; no new WBI within 1 km of notified forests (varies by state rules).
- **Auctions**: HPSFDC e-auction (hpfdceauction.co.in) and Kanlog open auctions; JKFDC monthly calendar, 21-day lifting; MPRVVN girth-class lots, EMD 10%; FDCM e-auction since 2017 plus Ballarshah retail sale 23rd–30th; Kerala ~33 sales depots, teak graded by girth/length/soundness, record ₹2.07 lakh/m³ at Chaliyam (Apr 2026); APFDC Red Sanders via MSTC; Haryana uses Maharashtra's portal.
- **Rates**: market listings show teak ₹1,000–3,500/CFT, sheesham ₹1,200–1,800, sal ₹1,800, pine ₹700–1,100, mango ₹500, Malaysian sal ₹1,450; imported green sawn timber around ₹510–580/CFT at Gandhidham.
- **Privacy**: DPDP Rules 2025 notified 13–14 Nov 2025; consent manager registration from Nov 2026; core consent, notice, breach (72 h to Board) and erasure duties from 13 May 2027.

## 3. Recommended production stack (Android, iOS, Windows, macOS, web)
- **App**: Flutter, one codebase for Android, iOS, web, Windows and macOS. Offline-first with local SQLite (Drift) and background sync, because many mills have patchy internet.
- **Backend**: Supabase (Postgres + Row Level Security per mill) hosted in the Mumbai region for data localisation; or Firebase if the team prefers.
- **Login**: phone OTP via MSG91 or Twilio Verify, plus PIN/biometric unlock on device. Roles: Owner, Co-owner, Munshi (accounts), Supervisor.
- **Messaging**: WhatsApp Business API (Gupshup/Interakt) for quotes, auction reminders, wage slips.
- **Billing**: GST e-invoice (IRP) integration once turnover crosses the threshold; PDF invoices.
- **Auctions feed**: a small scraper/RSS job that collects notices from corporation sites daily and pushes alerts by state and species; human review before publishing.
- **Payments for subscription**: Razorpay (UPI AutoPay).

## 4. Launch checklist
1. Lawyer review of Terms and Privacy; appoint grievance officer; DPDP consent records.
2. Native-speaker review of all 13 translations.
3. Verify each auction source and link with the corporation before launch; add Gujarat, Karnataka, Tamil Nadu, Odisha, Chhattisgarh, Assam.
4. Pilot with 10–20 mills in two states (e.g. MP and Punjab); measure estimate time and stock accuracy.
5. Pricing: free tier (1 mill, 10 workers), paid tier for multi-user, WhatsApp, invoices.
