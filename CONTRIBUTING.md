# Aara — repo notes for contributors

## Architecture
- `index.html` is the entire app: markup templates, CSS and logic in one file. No build step, no runtime dependencies. Keep it that way — target users run this on cheap Android phones in low-connectivity areas.
- State lives in one object `S`; mill data persists to `localStorage` under `aara:*` via the `Store` wrapper (`get`/`set`/`del`), debounced by `persist()`. Write timestamps live under `aarat:*` — `Store.set` maintains them, `Store.del` leaves tombstones (sync needs them; never strip them).
- `Store` is a seam: local-first always, and an optional cloud adapter can attach via `Store.db` (Firestore-shaped: `collection().doc().get/set/delete`). `Store.set` must dual-write local + remote — remote failures warn but still save locally.
- `sync.js` is the optional Supabase layer (loaded lazily by `Store.init` only when `aara:cloud` config exists). It implements the adapter over PostgREST + GoTrue, email/SMS OTP, and a last-write-wins per-key merge (`pullAll`). Backend setup: `supabase/schema.sql`; owner guide: `docs/sync-setup.md`.
- Every view is a function returning an HTML string; `render()` swaps `#app.innerHTML`. Escape all user data with `esc()`.
- Actions dispatch through `data-act` (click), `data-act-change` (change), `data-act-input`/`data-li`/`data-of` (input). Add new behaviors in `ACT`/`CHANGE`/the input listener, not inline handlers.
- Stock ledger rules: an order deducts stock exactly once (`deducted` flag, `confirmOrder` must not double-deduct). Editing a saved deducted order must re-balance via `adjustStock`; cancelling/deleting/converting to job work restores via `restoreStock`. All quantity writes go through `logMove` (ledger is capped at 400 entries).
- Customer-facing documents (`docHTML`, `quoteText`, print/PDF/WhatsApp) must never leak internal cost basis, suggested rates, break-even or stock levels — the test suite checks this.
- New persisted shapes: extend `migrate()` so old/corrupt backups still load, and keep the `seq > max(order.no)` invariant.
- i18n: `KEYS` + `TR` are positional arrays — every language must have `KEYS.length` entries (the test suite checks this).

## Verify
```bash
node test/run.mjs        # ~69 assertions; drives real app functions + the sync merge against DOM/server shims
node --check sw.js && node --check sync.js
python3 -m http.server 8000   # manual smoke test
```

## Native apps
Capacitor shell — `capacitor.config.json` + `scripts/build-app.mjs` (copies assets to `www/`). `android/`/`ios/`/`www/` are gitignored and regenerated with `npm install && npm run app:add && npm run app:sync`. `index.html` detects `window.Capacitor` for Filesystem/Share. See `docs/app-build.md`.

## Deploy
GitHub Pages, `main` / root. Service worker + manifest require `http(s)` (never `file://`).

## Known intentional limits
Data is device-local unless the owner configures Supabase sync (per-key last-write-wins — fine for one mill, not multi-branch). PIN hashes are SHA-256(salt+pin); cloud sign-in is OTP. CSP allows `connect-src` only to `self` + `*.supabase.co`.
