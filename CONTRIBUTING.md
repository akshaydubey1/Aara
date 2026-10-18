# Aara — repo notes for contributors

## Architecture
- `index.html` is the entire app: markup templates, CSS and logic in one file. No build step, no runtime dependencies. Keep it that way — target users run this on cheap Android phones in low-connectivity areas.
- State lives in one object `S`; mill data persists to `localStorage` under `aara:*` via the `Store` wrapper, debounced by `persist()`. Persistence is split per record: `Store.setMill(scope, data)` writes `core_<sc>` (settings/profile), `idx_<sc>` (id manifest), and `ord_/per_/cus_/stk_/byp_/auc_/mov_/adv_<sc>_<id>` rows; `Store.getMill` reassembles (manifest ∪ keyspace scan). A legacy monolithic `mill_<sc>` doc is still read as a fallback. Write timestamps live under `aarat:*` — `Store.set`/`setMany` maintain them, `Store.del` leaves tombstones (sync needs them; never strip them). `scope()` picks the record namespace: account mobile on device, mill id when joined in cloud mode.
- `Store` is a seam: local-first always, and an optional cloud adapter can attach via `Store.db` (Firestore-shaped: `collection().doc().get/set/delete`). `Store.set` must dual-write local + remote — remote failures warn but still save locally.
- `sync.js` is the optional Supabase layer (loaded lazily by `Store.init` only when `aara:cloud` config exists). Mill-scoped: `mill_members`/`mill_invites`/`mill_data`, roles owner/partner/munshi, OTP auth with persisted refresh tokens (silent renewal + 401 retry → device-mode fallback). Merge is last-write-wins per record key; the DB trigger `mill_data_guard` stamps server time and rejects munshi writes to `core_`/`per_` or non-att tombstones. `join_mill()` redeems invites atomically; joining clears local mill-scope keys first so a joiner can never clobber the mill. Device-local keys (`accounts`, `fail_*`, cloud config/session) never sync. Backend setup: `supabase/schema.sql`; owner guide: `docs/sync-setup.md`.
- Every view is a function returning an HTML string; `render()` swaps `#app.innerHTML`. Escape all user data with `esc()`.
- Actions dispatch through `data-act` (click), `data-act-change` (change), `data-act-input`/`data-li`/`data-of` (input). Add new behaviors in `ACT`/`CHANGE`/the input listener, not inline handlers.
- Stock ledger rules: an order deducts stock exactly once (`deducted` flag, `confirmOrder` must not double-deduct). Editing a saved deducted order must re-balance via `adjustStock`; cancelling/deleting/converting to job work restores via `restoreStock`. All quantity writes go through `logMove` (ledger is capped at 400 entries).
- Customer-facing documents (`docHTML`, `quoteText`, print/PDF/WhatsApp) must never leak internal cost basis, suggested rates, break-even or stock levels — the test suite checks this.
- New persisted shapes: extend `migrate()` so old/corrupt backups still load, and keep the `seq > max(order.no)` invariant.
- i18n: `KEYS` + `TR` are positional arrays — every language must have `KEYS.length` entries (the test suite checks this).

## Verify
```bash
node test/run.mjs        # ~92 assertions; drives real app functions + the sync merge against DOM/server shims
node --check sw.js && node --check sync.js
python3 -m http.server 8000   # manual smoke test
```

## Native apps
Capacitor shell — `capacitor.config.json` + `scripts/build-app.mjs` (copies assets to `www/`). `android/`/`ios/`/`www/` are gitignored and regenerated with `npm install && npm run app:add && npm run app:sync`. `index.html` detects `window.Capacitor` for Filesystem/Share. See `docs/app-build.md`.

## Deploy
GitHub Pages, `main` / root. Service worker + manifest require `http(s)` (never `file://`).

## Known intentional limits
Data is device-local unless the owner configures Supabase sync (per-key last-write-wins — fine for one mill, not multi-branch). PIN hashes are SHA-256(salt+pin); cloud sign-in is OTP. CSP allows `connect-src` only to `self` + `*.supabase.co`.
