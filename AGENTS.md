# Pongdang

- Pongdang is the independent competition project. Multtara is archived legacy:
  never import its modules, require its repository, connect to its database,
  attach its Docker networks or reuse its credentials in this application.
- The standalone Compose stack is frontend, backend and PostgreSQL 18. Both
  container names and their project prefix are explicit: production uses
  `pongdang-frontend`, `pongdang-backend`, `pongdang-db`, `pongdang-collector`
  plus the one-shot `pongdang-initialize`, without numeric suffixes.
  Use `COMPOSE_PROJECT_NAME` interpolation so isolated CI projects do not collide.
  Keep the existing `postgres_data` volume and service DNS names unchanged.
  `pongdang_data` is the real collection schema. The user retired synthetic
  examples; `app.schema --remove-demo` removes only `pongdang_demo`. Keep real
  collection migrations additive and explicit via `app.schema`.
- `/api/data` reads real Pongdang collection records only. Retired `/api/demo`
  and `/api/collector` return 404. Never substitute synthetic data for missing reads.
- `app.ingestion` owns normalized evidence and atomic idempotent storage.
  `models.SourceBatch` is the live adapter contract; `worker` runs separately
  from FastAPI, with per-job DB locks, persisted due times, backoff and heartbeat.
  Approved official HTTPS endpoints and server-only credentials are required.
  New provider revisions preserve prior evidence as `superseded`; missing values
  and unknown provider issue times remain explicit. Never expose raw responses,
  arbitrary SQL, import endpoints or authenticated upstream URLs.
- Provider record IDs, timezones, fetch/observation/expiry times, units and missing
  values must be preserved. Conflicting evidence must not overwrite a batch;
  failed fetches must not create success records or extend existing validity.
- Synthetic examples and their generation modules are retired at the user's
  request. Never seed on startup or HTTP requests. Scores and safety must remain
  unknown unless separately implemented and validated; collection is not scoring.
- Keep the UI plain and table-first, with data browsing and data information.
  All routes use real `/api/data`, all allowed columns, and bounded 100-row pages.
  Old demo/collector URL selections normalize to the real collection view.
- Frontend: React + Vite + TypeScript, Node.js 24. Backend: Python 3.14 + FastAPI.
  Commit dependency lockfiles with dependency changes.
- `dev` is integration; `main` deploys automatically after CI. Never bypass CI.
  The server timer only dispatches missing CI runs for latest main/dev commits.
- Never commit secrets or `.env` files. Keep production DB/API ports private.
  The old db.bonifacio.work:15432 gateway still belongs to the legacy DB and is
  not managed by Pongdang. Changing that gateway requires a separate decision.
- Production URL is `/pongdang/`; preserve Vite base and FastAPI root path.
  Keep the existing Bonifacio SSO gate and `access-pongdang` grant independent
  of legacy Multtara. No new user/account system is introduced by this separation.
- Run frontend lint/tests/build and backend Ruff/tests. Database tests must use
  a disposable `pongdang_test` database, never production. CI verifies initialization
  and collection worker health with only the standalone stack and no shared database.
- `ops/` contains installation templates; deployment does not self-update its SSH
  gate. Install reviewed changes to the host script separately.
- `backend/app/data_catalog.json` is the table/column/query allowlist. Existing
  table identifiers and optional provider-specific columns are retained for demo
  history, not as dependencies on a legacy service or a safety scoring engine.
- SQL reads remain bounded and read-only. Do not expose credentials, user/session
  tables, unfiltered provider payloads or arbitrary SQL. A stale heartbeat is not
  a running collector, and missing/unknown data never implies safe conditions.
