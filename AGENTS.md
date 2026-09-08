# Pongdang

- Keep the scaffold minimal. The initial page intentionally renders no content.
- Frontend: React + Vite + TypeScript; backend: Python + FastAPI; DB: PostgreSQL.
- Use Node.js 24 and Python 3.14. Commit dependency lockfiles with dependency changes.
- `dev` is the integration branch; `main` is production and deploys automatically after CI.
- Never commit secrets or `.env` files. Keep production DB and API ports private.
- Production URL prefix is `/pongdang/`; preserve matching Vite base and FastAPI root path.
- Run frontend lint/build and backend Ruff/tests for relevant changes.
- Backend tests require PostgreSQL. Do not introduce business models or auth without a task.
- `ops/` contains server configuration templates; deployment does not self-update the SSH gate.
- The server timer dispatches CI only when the latest main/dev SHA has no run; it never bypasses CI or retries failed runs.
