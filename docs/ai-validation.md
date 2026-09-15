# Luna concierge implementation verification — 2026-09-15

## Initial implementation verification and boundaries

Implementation is on `codex/luna-concierge`. The current checkout's original
untracked files (including `* 2.*` copies and `backend/.byeori/`) were preserved.
During this initial verification, no commit, push, CI dispatch, merge, production
deployment, production DB access, upstream collection call or paid OpenAI call
was performed. The later user-authorized local live check is recorded below.

| Verification | Observed result |
|---|---|
| Python runtime | Python 3.14.4, locked runtime dependencies; httpx moved to runtime |
| Backend Ruff lint | Passed |
| Backend Ruff formatting | 124 files already formatted |
| Entire backend pytest suite | **1018 passed**, 2 upstream test-client deprecation warnings, 24.05 seconds |
| Database used | Dedicated local PostgreSQL 18 cluster, loopback port 55439, disposable `pongdang_test` only |
| Real SQL tool integration | 12 tests within full suite: all 10 registered tools, actual ingestion storage and reads, unchanged rows/schema, station exclusion |
| Isolated tool fixtures | 38 tests within full suite; actual condition/Twin reading code and nonempty forecast/tide/quality/camera projections |
| Frontend runtime | Node.js 24.19.0 |
| Frontend lint | Passed |
| Frontend unit/render/client tests | **23 passed** |
| Frontend typecheck and `/pongdang/` Vite build | Passed in isolated copy of managed source plus this implementation |
| WebKit browser smoke | **13 scenarios passed**, desktop 1280×900 and mobile 390×844 |
| Credential checks | 127 production bundle files have no backend API-key variable/test-key markers; implementation/config examples pass credential-pattern check |
| Compose configuration | YAML parsed; asserted AI_API_KEY is passed only to backend |
| Deployment script | `bash -n ops/pongdang-deploy` passed |
| Diff whitespace | `git diff --check` passed |

The ordinary frontend checkout build is affected by **pre-existing untracked**
`frontend/src/ActivityAssessmentPanel 2.tsx` and
`frontend/src/activityAssessmentApi 2.ts`, which have unresolved imports and
resulting type errors. Those files were not edited, removed or hidden by changing
compiler rules. The managed source was verified in an isolated copy excluding
only the original untracked artifacts. This does not claim those artifacts build.

Docker CLI/engine and nginx executable were unavailable, so no actual container
build/Compose smoke/nginx syntax execution was performed here. Existing CI retains
its normal container smoke and deploy gate; it has not run for these uncommitted
changes. Tests report deprecations in the installed FastAPI/Starlette HTTP test
client; there are no test failures.

## What the tests prove

- Configuration defaults, explicit disabling, blank/mismatched model/price handling.
- Authentication/Origin/grant rejection before model work and budget reservation;
  legacy paid explanation shares the global admission cap.
- A local Responses transport fixture chooses a place search, then actual
  conditions/Water Twin reads, then evidence-ID composition. The test checks real
  SQL-service execution, server facts, call IDs and closed DB connections during
  provider waits. The fixture does not establish live Luna intent accuracy.
- Current-turn evidence, optional activity clarification, concrete time-context
  preservation, KST midnight/weekend behavior, unknown units/issue times,
  missing/stale/partial/unknown states and station-versus-travel-place semantics.
- Strict schema validation, forged references/free factual prose/roles/extra
  fields, repeated/unknown/oversized function calls, malformed or duplicate JSON,
  refusal/incomplete/token exhaustion and transport errors.
- Atomic daily reservations, three model-attempt accounting, idempotent observed
  usage, retained unknown reservations, cross-process concurrency/principal rate
  limits, lease expiry, cancellation, and additive v6→v7 migration.
- Browser input → final response sections/facts/sources → real feature requests;
  cancellation, duplicate prevention, new conversation, missing-key/auth errors,
  keyboard use, mobile overflow and safe rendering.

Default smoke is unpaid: `python -m app.ai.smoke` exits without loading credentials
or making API calls. Only explicit `python -m app.ai.smoke --live` attempts at most
two paid Responses requests and one capabilities tool. Live smoke was not run
during the initial implementation verification.

## Follow-up local live verification — 2026-09-15

After the user added `AI_API_KEY` to the ignored root `.env`, the backend loaded
the key through `backend/.env` (a symlink to `../.env`). The key value was not
printed or included in the verification artifacts. The effective provider was
OpenAI and the model was `gpt-5.6-luna`, with matching configured pricing.

The local loopback `pongdang` database was explicitly migrated from schema v6 to
v7 with `python -m app.schema --initialize`. This adds AI accounting tables and
columns; it does not seed or replace collection evidence. It is separate from
the disposable `pongdang_test` database used by automated tests.

| Check | Observed result |
|---|---|
| Real OpenAI Responses → capabilities → validated final answer | **Passed**, request ID `5735480e0c8b45c182ed17e11a34eca0` |
| Provider attempts / observed usage records | 2 / 2 |
| Actual reported input / output tokens | 2624 / 91 |
| Usage × configured rate estimate | 636 microUSD (USD 0.000636); not a final provider invoice |
| Retained conservative reservation | 40000 microUSD (USD 0.04) |
| Current local place search for 경포, swim, limit 3 | 3 real candidates; `candidate_limit_not_exhaustive` preserved |
| Current conditions for the first candidate | 2 facts, `unknown` preserved; no invented condition or safety result |
| Local frontend / API health / readiness | HTTP 200 through Vite on loopback port 5173 |
| Browser AI status without local SSO configuration | HTTP 503 `AUTH_NOT_CONFIGURED` |
| Local operator CLI and shared budget regression tests | **101 passed**, using an offline provider and disposable PostgreSQL; Ruff passed |
| Frontend SSO configuration guidance | **25 tests passed**, lint passed; actual browser shows the missing SSO linkage message and preserves the draft |

The successful live check used an ephemeral process-only admission salt for the
operator invocation, without starting an authenticated HTTP server or persisting
SSO configuration. The reproducible CLI now uses explicit `--live --local`
instead: a fixed non-personal operator rate bucket shares the ordinary global
concurrency limit and daily reservation/usage accounting. It is limited to a
loopback `pongdang` or `pongdang_test` DB and creates no SSO principal or secret.
This CLI refinement was verified with an offline provider; no additional paid
requests were made after the two successful live attempts.

This establishes real model access and the capabilities function loop, plus
separate real local data reads. It does not establish live multi-turn place
query accuracy or authenticated browser/ingress end-to-end operation. Local SSO
proxy secret and allowed origins are not configured. An existing trusted
Bonifacio SSO ingress must supply the verified identity/grants before browser AI
chat can be used. No production SSO configuration or deployment was changed.
The UI now recognizes only the two defined SSO configuration error codes and
explains the missing login linkage instead of suggesting a generic retry. Other
response details remain hidden; existing HTTP 401/403 handling is preserved.

## Local browser operator preview — 2026-09-15

The user requested interactive local browser access without an installed local
SSO bridge. `python -m app.ai.local --session-file <new-private-file>` now creates
a distinct loopback operator app. A one-time, five-minute launch capability is
exchanged for a two-hour HttpOnly/SameSite cookie. This is limited to local AI
chat/status and the existing operator accounting bucket; no SSO user/grants or
API key are put in the browser. Normal `app.main:create_app` still requires SSO,
does not register the launch endpoints, and does not accept the local cookie.
Personal notification routes retain the SSO dependency even in the local app.

Actual Vite proxy verification found that its string proxy shorthand changes the
upstream Host. The development config now explicitly uses `changeOrigin: false`
and fixes `127.0.0.1:5173` with `strictPort`. The full localhost path then returned
HTTP 200 for bootstrap and required the temporary session for AI status. The
browser displayed the explicit local operator status and enabled question input.

The first real browser question about today's swimming conditions and sources at
경포 made three Luna calls and ran `search_places`, `place_conditions`, and
`forecast_compare`. It preserved unknown support/safety and missing mapped
measurements, but reached `ai_model_call_limit` before a final model plan. The
shared conversation loop was refined to use the last available attempt for a
structured final answer once current-turn tool results exist, keeping the same
three-attempt cap. Tool requests that violate that final-only step are rejected
before execution; first-turn data questions still require actual reads.

Before that final-attempt refinement, the complete backend suite passed
**1056 tests**, including the 25 new local HTTP/session boundary tests, with two
existing upstream deprecation warnings. Frontend lint, **27 tests**, and the
isolated managed-source TypeScript/production build passed with the final Vite
proxy configuration. The original untracked frontend copies remain preserved.

The same browser question was then repeated with the final-attempt refinement:

| Final live browser check | Observed result |
|---|---|
| Request ID | `f18d612f48ef4e35ba6b5fa69041be87` |
| Model attempts / actual tool reads | 3 / 2 |
| Final provider result | OpenAI, `fallback=False`, no failure reason codes |
| Processing time | 6947 ms |
| Reported input / output tokens | 14454 / 227 |
| Paid attempts across the two browser verification questions | 6 total, retaining normal budget reservations |
| Final related backend regression | **113 passed**, including chat, local access, real SQL tools, smoke, and budget tests on disposable `pongdang_test` |
| Final code checks | Ruff and whitespace checks passed |

The running preview uses the final local server and keeps the temporary browser
session available for the user. API keys and SSO configuration were not changed.
This verifies interactive localhost access and the real model/read/final-answer
path; it does not claim production deployment or production SSO verification.

## Reproduction and operation

Backend checks require a dedicated `pongdang_test` database and the test PostgreSQL
variables; never point the full suite at the production database. Run the existing
`uv run --frozen ruff check .`, `uv run --frozen ruff format --check .`, and
`uv run --frozen pytest` from `backend` after configuring that disposable database.
Frontend checks are `npm run lint`, `npm test` and
`APP_BASE_PATH=/pongdang/ npm run build` under Node.js 24.

The browser harness and instructions are in
[`frontend/tests/browser/README.md`](../frontend/tests/browser/README.md).
The feature/read/evidence mapping is in
[`ai-feature-matrix.md`](ai-feature-matrix.md).
Exact server key location, current-release recreation commands, old explicit
settings, schema migration and unverified installed SSO/host timeout boundaries
are in [`ai-concierge.md`](ai-concierge.md).

## Commit-content verification — 2026-09-15

The Luna release was extracted into a separate checkout based on the latest
`main`, with 46 selected source, test, configuration and documentation files.
Concurrent uncommitted travel/webcam changes and original duplicate artifacts
remain in the user's working directory and are not part of this release.

For this exact standalone commit content, backend Ruff lint/formatting and
**823 backend tests** passed against a newly created disposable `pongdang_test`
cluster; frontend lint, **27 tests**, TypeScript, and the `/pongdang/` production
build passed. This test count excludes the original untracked duplicate test
files present in earlier whole-working-directory runs. Scanning the selected
files against the actual local environment secret values found no matches.
