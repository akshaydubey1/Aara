# Aara — repo notes for contributors

## Architecture
- `index.html` is the entire app: markup templates, CSS and logic in one file. No build step, no dependencies. Keep it that way — target users run this on cheap Android phones in low-connectivity areas.
- State lives in one object `S`; mill data persists to `localStorage` under `aara:*` via the `Store` wrapper (`get`/`set`/`del`), debounced by `persist()`.
- Every view is a function returning an HTML string; `render()` swaps `#app.innerHTML`. Escape all user data with `esc()`.
- Actions dispatch through `data-act` (click), `data-act-change` (change), `data-act-input`/`data-li`/`data-of` (input). Add new behaviors in `ACT`/`CHANGE`/the input listener, not inline handlers.
- Stock ledger rules: an order deducts stock exactly once (`deducted` flag). Editing a saved deducted order must re-balance via `adjustStock`; cancelling/deleting/converting to job work restores via `restoreStock`. All quantity writes go through `logMove` (ledger is capped at 400 entries).
- New persisted shapes: extend `migrate()` so old/corrupt backups still load.
- i18n: `KEYS` + `TR` are positional arrays — every language must have `KEYS.length` entries (the test suite checks this).

## Verify
```bash
node test/run.mjs        # 26+ assertions, drives real app functions against DOM shims
node --check sw.js
python3 -m http.server 8000   # manual smoke test
```

## Deploy
GitHub Pages, `main` / root. Service worker + manifest require `http(s)` (never `file://`).

## Known intentional limits
Data is device-local only (OTP + server sync is the production plan in `docs/blueprint.md`). PIN hashes are SHA-256(salt+pin) — fine for a prototype, replace with server-side OTP in production.
