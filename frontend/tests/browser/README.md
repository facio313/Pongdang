# AI concierge browser smoke

`aiConcierge.smoke.mjs` exercises a built frontend in WebKit at desktop and mobile sizes. It intercepts every API request with explicit test fixtures, blocks other origins, and never calls OpenAI or reads production data. It verifies question submission, server response sections and nested evidence, actual feature route requests, selected place context, cancellation, duplicate requests, new conversations, auth failures, missing-key state, and mobile overflow.

Build and serve a local production preview with Node.js 24:

```sh
APP_BASE_PATH=/pongdang/ npm run build
APP_BASE_PATH=/pongdang/ npm run preview -- --host 127.0.0.1 --port 4178 --strictPort
```

In another terminal, use an available Playwright installation with its WebKit browser. The optional `PONGDANG_PLAYWRIGHT_MODULE` accepts an absolute module file path, including the bundled Codex runtime's `playwright/index.mjs`; otherwise Node resolves `playwright` normally. This optional browser tool is not a production dependency or part of `npm test`.

```sh
PONGDANG_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node tests/browser/aiConcierge.smoke.mjs
```

`PONGDANG_BROWSER_TEST_URL` optionally changes the local preview URL. Only loopback hostnames are accepted. The test prints its checks and screenshot paths. No key or provider account is needed. The root backend live smoke is a separate, explicit paid verification.

For the September 2026 implementation check, the existing untracked `* 2.*` user artifacts were preserved. Their unresolved imports prevent the checkout's normal TypeScript build. The same tracked source plus the new concierge files passed typecheck/build in an isolated copy excluding only those untracked artifacts; browser smoke ran against that build. This does not claim the unrelated artifacts compile.
