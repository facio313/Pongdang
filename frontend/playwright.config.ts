import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5177/pongdang/",
    viewport: { width: 390, height: 844 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "PYTHONPATH=. uv run python tests/browser_contract_server.py",
      cwd: "../backend",
      port: 8099,
      env: { PONGDANG_BROWSER_TEST: "1" },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5177",
      port: 5177,
      env: {
        APP_BASE_PATH: "/pongdang/",
        APP_API_TARGET: "http://127.0.0.1:8099",
      },
      reuseExistingServer: false,
    },
  ],
});
