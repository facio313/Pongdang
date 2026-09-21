import { test, expect, type Page } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";
const year = Number(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 4));
const subscription = {
  id, spot_id: 11, spot_name: "TEST 수온 해변", year, timezone: "Asia/Seoul",
  minimum_temperature_c: 22, channel: "in_app", destination: null,
  active: true, revision: 1, updated_at: new Date().toISOString(),
  condition_state: "unknown", last_evaluated_at: new Date().toISOString(), delivery_configuration: "in_app",
};
const evidence = { spot_id: 11, minimum_temperature_c: 22, reason_codes: ["station_mapping_missing_or_ambiguous"] };
const event = { id: "event-one", subscription_id: id, subscription_revision: 1, year, kind: "temperature_preference_met", state: "active", created_at: new Date().toISOString(), evidence, delivery_state: "accepted", attempts: 1, last_error: null };

async function fixture(page: Page) {
  await page.route("**/api/data/places?**", route => route.fulfill({ json: { rows: [{ id: 11, name: "TEST 수온 해변", place_kind: "beach" }], total: 1, page: 1, page_size: 100, has_more: false } }));
  await page.route("**/api/data/notifications/subscriptions?**", route => route.fulfill({ json: { rows: [subscription], limit: 25, offset: 0 } }));
  await page.route("**/api/data/notifications/events?**", route => route.fulfill({ json: { rows: [event], limit: 25, offset: 0 } }));
  await page.route(`**/api/data/notifications/subscriptions/${id}/evaluations?**`, route => route.fulfill({ json: { rows: [{ id: 1, subscription_id: id, subscription_revision: 1, evaluated_at: new Date().toISOString(), condition_state: "unknown", evidence }], limit: 1, offset: 0 } }));
}

test("notification history explains missing data and distinguishes provider acceptance from receipt", async ({ page }) => {
  await fixture(page);
  await page.goto("#first-swim");
  await expect(page.getByRole("region", { name: "내 알림 구독" })).toContainText("수온 자료 확인 필요");
  await page.getByRole("button", { name: "평가·알림 보기" }).click();
  await expect(page.getByRole("region", { name: "최근 평가 근거" })).toContainText("이 장소를 대표하는 수온 관측소 연결이 없거나 모호합니다");
  const alerts = page.getByRole("region", { name: "발생한 알림", exact: true });
  await expect(alerts).toContainText("메일 서비스 접수됨");
  await expect(alerts).toContainText("실제 수신 완료를 뜻하지 않습니다");
  await expect(alerts.getByRole("cell", { name: "메일 서비스 접수됨", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("editing uses the server revision and cancellation refreshes subscription state", async ({ page }) => {
  await fixture(page);
  let current: Omit<typeof subscription, "last_evaluated_at"> & { last_evaluated_at: string | null } = { ...subscription };
  const updates: Record<string, unknown>[] = [];
  await page.route("**/api/data/notifications/subscriptions?**", route => route.fulfill({ json: { rows: [current] } }));
  await page.route(`**/api/data/notifications/subscriptions/${id}?**`, route => {
    expect(new URL(route.request().url()).searchParams.get("expected_revision")).toBe("1");
    const body = route.request().postDataJSON();
    updates.push(body);
    current = { ...current, ...body, revision: 2, condition_state: "unknown", last_evaluated_at: null };
    return route.fulfill({ json: current });
  });
  await page.route(`**/api/data/notifications/subscriptions/${id}`, route => {
    expect(route.request().method()).toBe("DELETE");
    current = { ...current, active: false };
    return route.fulfill({ status: 204 });
  });
  await page.goto("#first-swim");
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByLabel("선호 수온 기준 · °C").fill("24");
  await page.getByRole("button", { name: "알림 구독 수정 저장" }).click();
  await expect(page.getByRole("region", { name: "내 알림 구독" })).toContainText("첫 평가 대기");
  expect(updates).toHaveLength(1);
  expect(updates[0].minimum_temperature_c).toBe(24);
  await page.getByRole("button", { name: "평가·알림 보기" }).click();
  await expect(page.getByRole("region", { name: "최근 평가 근거" })).toContainText("현재 구독 설정의 첫 평가를 기다리고 있습니다");
  await expect(page.getByRole("region", { name: "최근 평가 근거" })).not.toContainText("관측소 연결이 없거나 모호합니다");
  await page.getByRole("button", { name: "해지", exact: true }).click();
  await expect(page.getByRole("region", { name: "내 알림 구독" })).toContainText("구독 해지됨");
  await expect(page.getByRole("button", { name: "해지", exact: true })).toBeDisabled();
});

test("failed private reads never appear as an empty subscription or alert list", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/data/notifications/subscriptions?**", route => route.fulfill({ status: 401, json: { detail: "SSO_AUTHENTICATION_REQUIRED" } }));
  await page.route("**/api/data/notifications/events?**", route => route.fulfill({ status: 503, json: { detail: "NOTIFICATIONS_UNAVAILABLE" } }));
  await page.goto("#first-swim");
  const subscriptions = page.getByRole("region", { name: "내 알림 구독" });
  await expect(subscriptions.getByRole("alert")).toContainText("기존 SSO 로그인이 필요합니다");
  await expect(subscriptions).not.toContainText("저장된 알림 구독이 없습니다");
  await expect(page.getByRole("region", { name: "발생한 알림", exact: true }).getByRole("alert")).toBeVisible();
  await expect(page.getByRole("region", { name: "발생한 알림", exact: true })).not.toContainText("발생한 알림이 없습니다");
});

test("new worker events appear on the next automatic refresh", async ({ page }) => {
  await page.clock.install();
  await fixture(page);
  let available = false;
  await page.route("**/api/data/notifications/events?**", route => route.fulfill({ json: {
    rows: available ? [{ ...event, delivery_state: "available_in_app" }] : [],
  } }));
  await page.goto("#first-swim");
  const alerts = page.getByRole("region", { name: "발생한 알림", exact: true });
  await expect(alerts).toContainText("이 페이지에 발생한 알림이 없습니다");
  available = true;
  await page.clock.fastForward(600000);
  await expect(alerts).toContainText("앱 내 알림 생성됨");
  await expect(alerts).not.toContainText("이 페이지에 발생한 알림이 없습니다");
});

for (const width of [390, 1440]) {
  test(`today shows the selected place's actual alert state at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    const requests: URL[] = [];
    await page.route("**/api/data/notifications/subscriptions?**", route => {
      requests.push(new URL(route.request().url()));
      return route.fulfill({ json: { rows: [{ ...subscription, condition_state: "met" }] } });
    });
    await page.goto("#today");
    const summary = page.getByRole("region", { name: "첫 입수 · 수온 알림" });
    await expect(summary).toContainText("수온 기준 충족");
    await expect(summary).toContainText("메일 서비스 접수됨");
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(url => Number(url.searchParams.get("spot_id")) > 0 && url.searchParams.get("year") === String(year))).toBe(true);
    await expect(page.locator("body")).not.toContainText("첫 입수 알림 트리거");
  });
}
