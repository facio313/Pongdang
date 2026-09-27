import { test, expect, type Page } from "@playwright/test";

async function anonymous(page: Page) {
  await page.route("**/api/data/notifications/**", route => route.fulfill({ status: 401, json: { detail: "SSO_AUTHENTICATION_REQUIRED" } }));
  await page.route("**/api/data/travel/preferences", route => route.fulfill({ status: 401, json: { detail: "SSO_AUTHENTICATION_REQUIRED" } }));
}

for (const width of [390, 1440]) {
  test(`anonymous notification login starts navigation and cancellation stays anonymous at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await anonymous(page);
    const inlineSsoCalls: string[] = [];
    page.on("request", request => { if (request.url().includes("/sso/api/")) inlineSsoCalls.push(request.url()); });
    await page.route("**/pongdang/auth/continue", route => route.fulfill({
      status: 503, contentType: "text/html", body: "<h1>Test login unavailable</h1>",
    }));
    await page.goto("#today");
    const summary = page.getByRole("region", { name: "첫 입수 · 수온 알림" });
    await expect(summary).toContainText("기존 SSO 로그인이 필요합니다");
    await expect(page.locator("body")).not.toContainText("Failed to fetch");
    await summary.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page).toHaveURL(/\/pongdang\/auth\/continue$/);
    await expect(page.getByRole("heading", { name: "Test login unavailable" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/#today$/);
    await expect(summary.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(inlineSsoCalls).toEqual([]);
  });
}

test("OAuth callback restores the requested screen and rereads saved notification settings and history", async ({ page }) => {
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
  await page.route("**/pongdang/auth/continue", route => returned ? route.continue() : route.fulfill({
    // Model the login challenge here; real ingress redirects are checked on site.
    // Playwright does not reroute subsequent requests in a mocked redirect chain.
    contentType: "text/html", body: '<a href="/pongdang/auth/continue">Test OAuth return</a>',
  }));
  await page.goto("#first-swim");
  const subscriptions = page.getByRole("region", { name: "내 알림 구독", exact: true });
  await expect(subscriptions.getByRole("button", { name: "로그인", exact: true })).toBeVisible();
  const before = { subscriptions: subscriptionReads, events: eventReads };
  await subscriptions.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/pongdang\/auth\/continue$/);
  returned = true;
  await page.getByRole("link", { name: "Test OAuth return" }).click();
  await expect(page).toHaveURL(/\/pongdang\/#first-swim$/);
  await expect(subscriptions).toContainText("저장된 테스트 해변");
  await expect(subscriptions).toContainText("23°C");
  await expect(page.getByRole("region", { name: "발생한 알림", exact: true })).toContainText("앱 내 알림 생성됨");
  expect(subscriptionReads).toBeGreaterThan(before.subscriptions);
  expect(eventReads).toBeGreaterThan(before.events);
  await expect(subscriptions.getByRole("button", { name: "로그인", exact: true })).toHaveCount(0);
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
