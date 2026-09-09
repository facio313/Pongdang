# Pongdang

- Pongdang is the independent competition project. Multtara is archived legacy:
  never import its modules, require its repository, connect to its database,
  attach its Docker networks or reuse its credentials in this application.
- The standalone Compose stack is frontend, backend and PostgreSQL 18. Both
  `pongdang_data` (collection) and `pongdang_demo` (synthetic examples) live in
  the app database. Keep schema changes additive and explicit via `app.schema`.
- `/api/data` reads Pongdang collection records only; `/api/demo` reads synthetic
  examples only. The retired `/api/collector` must return 404, not proxy a legacy DB.
  Never fill a missing collection result with demo rows.
- `app.ingestion` owns the provider-independent normalized batch contract and
  atomic, idempotent storage. API adapters implement `Provider.fetch` and remain
  independent of SQL/UI. No upstream provider or recurring scheduler is enabled
  yet; do not claim the JSON import facility is an active API integration.
  Credentials, network timeouts/quotas and mapping belong in future server-only
  adapters. Never introduce an HTTP SQL/import endpoint or arbitrary URL fetcher.
- Provider record IDs, timezones, fetch/observation/expiry times, units and missing
  values must be preserved. Conflicting evidence must not overwrite a batch;
  failed fetches must not create success records or extend existing validity.
- `app.seed_demo --confirm-demo-only` is an explicit, atomic, idempotent operation
  using local reference coordinates. Never seed on HTTP requests or app startup.
  Keep existing demo schema/version and records intact. Synthetic rows retain
  their scenarios/notices; safety stays unknown, scores NULL, calibration inactive.
- Keep the UI plain and table-first, with data browsing and data information.
  Default to clearly labeled demo data, populated tables expanded, all allowlisted
  columns and bounded 100-row pages. `?data=data` selects independent collection.
  Legacy URL selection `?data=collector` maps to this local selection only.
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
  and demo seeding with only the standalone stack and no shared database.
- `ops/` contains installation templates; deployment does not self-update its SSH
  gate. Install reviewed changes to the host script separately.
- `backend/app/data_catalog.json` is the table/column/query allowlist. Existing
  table identifiers and optional provider-specific columns are retained for demo
  compatibility, not as dependencies on a legacy service or fixed future API.
- SQL reads remain bounded and read-only. Do not expose credentials, user/session
  tables, unfiltered provider payloads or arbitrary SQL. A stale heartbeat is not
  a running collector, and missing/unknown data never implies safe conditions.
