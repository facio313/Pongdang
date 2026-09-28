import { test, expect, type Page } from "@playwright/test";

async function anonymous(page: Page) {
  await page.route("**/api/data/notifications/**", route => route.fulfill({ status: 401, json: { detail: "SSO_AUTHENTICATION_REQUIRED" } }));
  await page.route("**/api/data/travel/preferences", route => route.fulfill({ status: 401, json: { detail: "SSO_AUTHENTICATION_REQUIRED" } }));
}

for (const width of [390, 1440]) {
  test(`inline login stays on the page through failure and cancellation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await anonymous(page);
    const inlineSsoCalls: string[] = [];
    page.on("request", request => { if (request.url().includes("/sso/api/")) inlineSsoCalls.push(request.url()); });
    await page.route("**/api/auth/state", route => route.fulfill({ status: 401, json: { authenticated: false } }));
    await page.route("**/api/auth/login", route => route.fulfill({ status: 401, json: { authenticated: false, detail: "SSO_INVALID_CREDENTIALS" } }));
    await page.goto("#today");
    const summary = page.getByRole("region", { name: "첫 입수 · 수온 알림" });
    await expect(summary).toContainText("기존 SSO 로그인이 필요합니다");
    await expect(page.locator("body")).not.toContainText("Failed to fetch");
    await summary.getByRole("button", { name: "로그인", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "로그인", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("아이디", { exact: true })).toBeFocused();
    await dialog.getByLabel("아이디", { exact: true }).fill("offline-fixture");
    await dialog.getByLabel("비밀번호", { exact: true }).fill("offline-invalid");
    await dialog.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("아이디 또는 비밀번호를 확인해 주세요");
    await expect(dialog.getByLabel("비밀번호", { exact: true })).toHaveValue("");
    await expect(page).toHaveURL(/#today$/);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/#today$/);
    await expect(summary.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(inlineSsoCalls).toEqual([]);
  });
}

test("inline SSO completion rereads saved settings and history without navigating", async ({ page }) => {
  // A local browser contract only: no real identity or authentication headers.
  await anonymous(page);
  let returned = false;
  let subscriptionReads = 0;
  let eventReads = 0;
  await page.route("**/api/data/notifications/subscriptions?**", route => {
    subscriptionReads++;
    return route.fulfill(returned ? { json: { rows: [{
      id: "saved-subscription", spot_id: 11, spot_name: "저장된 테스트 해변", year: 2026,
      minimum_temperature_c: 23, channel: "in_app", active: true, revision: 1,
      condition_state: "unknown", last_evaluated_at: null,
    }] } } : { status: 401, json: { detail: "SSO_AUTHENTICATION_REQUIRED" } });
  });
  await page.route("**/api/data/notifications/events?**", route => {
    eventReads++;
    return route.fulfill(returned ? { json: { rows: [{
      id: "saved-event", subscription_id: "saved-subscription", subscription_revision: 1,
      year: 2026, kind: "temperature_preference_met", state: "active",
      created_at: "2026-09-27T00:00:00Z", evidence: { spot_id: 11, minimum_temperature_c: 23 },
      delivery_state: "available_in_app", attempts: 0, last_error: null,
    }] } } : { status: 401, json: { detail: "SSO_AUTHENTICATION_REQUIRED" } });
  });
  let stateReads = 0;
  await page.route("**/api/auth/state", route => {
    stateReads++;
    return route.fulfill({ status: returned ? 200 : 401, json: { authenticated: returned } });
  });
  await page.route("**/api/auth/login", route => {
    expect(route.request().postDataJSON()).toEqual({ username: "offline-fixture", password: "offline-password" });
    returned = true;
    return route.fulfill({ json: { authenticated: true } });
  });
  await page.goto("#first-swim");
  const subscriptions = page.getByRole("region", { name: "내 알림 구독", exact: true });
  await expect(subscriptions.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
  const before = { subscriptions: subscriptionReads, events: eventReads };
  await subscriptions.getByRole("button", { name: "로그인", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "로그인", exact: true });
  await dialog.getByLabel("아이디", { exact: true }).fill("offline-fixture");
  await dialog.getByLabel("비밀번호", { exact: true }).fill("offline-password");
  await dialog.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/pongdang\/#first-swim$/);
  await expect(subscriptions).toContainText("저장된 테스트 해변");
  await expect(subscriptions).toContainText("23°C");
  await expect(page.getByRole("region", { name: "발생한 알림", exact: true })).toContainText("앱 내 알림 생성됨");
  expect(subscriptionReads).toBeGreaterThan(before.subscriptions);
  expect(eventReads).toBeGreaterThan(before.events);
  expect(stateReads).toBe(2);
  await expect(subscriptions.getByRole("button", { name: "로그인", exact: true })).toHaveCount(0);
});

test("an unconfigured host never receives a password and keeps the inline popup", async ({ page }) => {
  await anonymous(page);
  let passwordRequests = 0;
  await page.route("**/api/auth/state", route => route.fulfill({ contentType: "text/html", body: "<html>Fallback</html>" }));
  await page.route("**/api/auth/login", route => { passwordRequests++; return route.abort(); });
  await page.goto("#today");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "로그인", exact: true });
  await dialog.getByLabel("아이디", { exact: true }).fill("offline-fixture");
  await dialog.getByLabel("비밀번호", { exact: true }).fill("offline-password");
  await dialog.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("로그인 서비스에 연결하지 못했습니다");
  await expect(page).toHaveURL(/#today$/);
  expect(passwordRequests).toBe(0);
});

test("permission denial stays in the popup and does not become an empty personal-data success", async ({ page }) => {
  await anonymous(page);
  await page.route("**/api/auth/state", route => route.fulfill({ status: 401, json: { authenticated: false } }));
  await page.route("**/api/auth/login", route => route.fulfill({ status: 403, json: { authenticated: false, detail: "SSO_GRANT_REQUIRED" } }));
  await page.goto("#first-swim");
  const subscriptions = page.getByRole("region", { name: "내 알림 구독", exact: true });
  await subscriptions.getByRole("button", { name: "로그인", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "로그인", exact: true });
  await dialog.getByLabel("아이디", { exact: true }).fill("offline-fixture");
  await dialog.getByLabel("비밀번호", { exact: true }).fill("offline-password");
  await dialog.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Pongdang 접근 권한이 없습니다");
  await expect(page).toHaveURL(/#first-swim$/);
  await expect(subscriptions).not.toContainText("저장된 알림 구독이 없습니다");
});

test("a callback with no accepted session still offers login and a forbidden read stays an access error", async ({ page }) => {
  await anonymous(page);
  await page.goto("#first-swim");
  await page.evaluate(() => sessionStorage.setItem("pd-return-path", "/pongdang/#first-swim"));
  await page.goto("auth/continue");
  await expect(page).toHaveURL(/#first-swim$/);
  const subscriptions = page.getByRole("region", { name: "내 알림 구독", exact: true });
  await expect(subscriptions.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
  await page.route("**/api/data/notifications/subscriptions?**", route => route.fulfill({ status: 403, json: { detail: "SSO_GRANT_REQUIRED" } }));
  await subscriptions.getByRole("button", { name: "상태 다시 확인" }).click();
  await expect(subscriptions.getByRole("alert")).toContainText("접근 권한이 없습니다");
  await expect(subscriptions.getByRole("button", { name: "로그인", exact: true })).toHaveCount(0);
  await expect(subscriptions).not.toContainText("저장된 알림 구독이 없습니다");
});

test("private fetch redirects do not follow the login portal or leak Failed to fetch into the page", async ({ page }) => {
  await anonymous(page);
  let followed = 0;
  await page.route("https://sso.example.invalid/**", route => { followed++; return route.abort(); });
  await page.route("**/api/data/notifications/subscriptions?**", route => route.fulfill({
    status: 302, headers: { Location: "https://sso.example.invalid/login" }, body: "",
  }));
  await page.goto("#first-swim");
  const subscriptions = page.getByRole("region", { name: "내 알림 구독", exact: true });
  await expect(subscriptions.getByRole("alert")).toContainText("기존 SSO 로그인이 필요합니다");
  await expect(subscriptions.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Failed to fetch");
  expect(followed).toBe(0);
});
