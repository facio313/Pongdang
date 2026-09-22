import { defineConfig } from "@playwright/test";
const frontendPort = Number(process.env.PONGDANG_TEST_FRONTEND_PORT ?? 5177);
const backendPort = Number(process.env.PONGDANG_TEST_BACKEND_PORT ?? 8099);
for (const port of [frontendPort, backendPort]) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Browser test ports must be integers between 1024 and 65535");
  }
}
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}/pongdang/`,
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "PYTHONPATH=. uv run python tests/browser_contract_server.py",
      cwd: "../backend",
      port: backendPort,
      env: {
        PONGDANG_BROWSER_TEST: "1",
        PONGDANG_TEST_FRONTEND_PORT: String(frontendPort),
        PONGDANG_TEST_BACKEND_PORT: String(backendPort),
      },
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      port: frontendPort,
      env: {
        APP_BASE_PATH: "/pongdang/",
        APP_API_TARGET: `http://127.0.0.1:${backendPort}`,
      },
      reuseExistingServer: false,
    },
  ],
});
