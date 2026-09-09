# Pongdang

- Keep the application focused on Collector documentation and read-only data browsing.
- Keep the UI plain and table-first: no brand ornaments, hero sections, or cards.
  Default to data browsing with all allowed columns and 100-row bounded pages.
- Frontend: React + Vite + TypeScript; backend: Python + FastAPI; DB: PostgreSQL.
- Use Node.js 24 and Python 3.14. Commit dependency lockfiles with dependency changes.
- `dev` is the integration branch; `main` is production and deploys automatically after CI.
- Never commit secrets or `.env` files. Keep production DB and API ports private.
- Production URL prefix is `/pongdang/`; preserve matching Vite base and FastAPI root path.
- Production Nginx uses Bonifacio's SSO auth-request broker for `/pongdang/`. The central catalog owns `access-pongdang`; an enabled account needs that grant or implicit chief-admin access. Keep the loopback origin private and install the source `ops/nginx-location.conf` when changing the edge. Pongdang remains a read-only viewer without independent accounts.
- Run frontend lint/build and backend Ruff/tests for relevant changes.
- Backend tests require PostgreSQL. Do not introduce business models or auth without a task.
- `ops/` contains server configuration templates; deployment does not self-update the SSH gate.
- The server timer dispatches CI only when the latest main/dev SHA has no run; it never bypasses CI or retries failed runs.
- `backend/app/collector_catalog.json` is the allowlist of source tables and
  columns. Match database column grants when changing it. Never expose arbitrary
  SQL, user/session tables, credentials, raw provider responses, or legacy forecasts.
- Source reads use `multtara_explorer` on cksDB, with bounded read-only queries.
  Heartbeats older than 900 seconds are stale even when the stored state is running.
  Missing metrics, unavailable forecasts, and unknown safety are not live data or safety guarantees.
