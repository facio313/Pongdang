import { test, expect } from "@playwright/test";
import { conditionsFixture, routeRecommendation } from "./recommendation";

test.use({ viewport: { width: 1440, height: 1000 } });

function metric(name: string, value: number, unit: string) {
  return { name, label: name, value, unit, status: "available", station_id: 1, station_name: "시험 관측소", relation: "representative_station", spatial_scope: null, evidence: [] };
}

function ranked(activity: string, score: number, dropped = false) {
  return { activity, score, status: "partial", coverage: 0.5, available_components: 2, total_components: 4, dropped, demoted: false, rules_applied: [] };
}

test("desktop today separates recommendation eligibility, partial scores and the place baseline", async ({ page }) => {
  const swim = {
    ...conditionsFixture({ activity: "swim", score: 79 }),
    metrics: [metric("water_temperature", 26.4, "°C"), metric("wave_height", 0.8, "m"), metric("air_temperature", 27.2, "°C")],
  };
  await routeRecommendation(page, { activity: "relax", score: 75 }, {
    choice: { activity: "relax", score: 75, status: "partial" },
    conditions: [swim, conditionsFixture({ activity: "surf", score: 96 }), conditionsFixture({ activity: "relax", score: 75 }), { ...conditionsFixture({ activity: "onsen", score: 99 }), support_status: "unsupported" }],
    ranked: [ranked("swim", 79), ranked("surf", 96, true), ranked("relax", 75), ranked("onsen", 99)],
  });
  await page.goto("#today");
  await expect(page.locator(".td-hero-score-num")).toHaveText("75");
  await expect(page.locator(".td-hero-score .td-score-coverage")).toHaveText("부분 점수 · 근거 2/4 (50%)");
  const surf = page.locator(".td-activity").filter({ has: page.locator(".td-activity-name", { hasText: "서핑" }) });
  const onsen = page.locator(".td-activity").filter({ has: page.locator(".td-activity-name", { hasText: "온천" }) });
  await expect(surf.locator(".td-activity-score")).toHaveText("–");
  await expect(onsen.locator(".td-activity-score")).toHaveText("–");
  await expect(surf.locator(".td-activity-grade")).toContainText("추천 제외");
  await expect(onsen.locator(".td-activity-grade")).toHaveText("활동 미지원");
  await expect(surf.locator(".td-activity-grade")).not.toContainText("매우 좋음");
  await expect(onsen.locator(".td-activity-grade")).not.toContainText("매우 좋음");
  const relax = page.locator(".td-activity").filter({ has: page.locator(".td-activity-name", { hasText: "휴식" }) });
  await expect(relax.locator(".td-activity-score")).toHaveText("75");
  await expect(relax.locator(".td-score-coverage")).toHaveText("부분 점수 · 근거 2/4 (50%)");
  await expect(page.locator(".td-hero-tiles")).toContainText("26.4°C");
  await expect(page.locator(".td-hero-tiles")).toContainText("0.8m");
  await expect(page.locator(".pd-desktop")).toContainText("장소 관측 · 활동 점수 입력과 별도");
});

test("desktop baseline keeps the provider mode and distinguishes a failed read from missing values", async ({ page }) => {
  await page.route("**/api/data/water-index/recommendation?**", route =>
    route.fulfill({ status: 503, json: { detail: "fixture failure" } }));
  await page.goto("#today");
  await expect(page.locator(".td-hero-tiles .td-tile-value").first()).toHaveText("조회 실패");
  await page.unroute("**/api/data/water-index/recommendation?**");
  await routeRecommendation(page, { activity: "relax", score: 75 }, {
    conditions: [{ ...conditionsFixture({ activity: "swim", score: 65 }), mode: "forecast" }, conditionsFixture({ activity: "relax", score: 75 })],
  });
  await page.reload();
  await expect(page.locator(".td-hero-tiles .td-tile-value").first()).toHaveText("–");
  await expect(page.locator(".pd-desktop")).toContainText("장소 예보 · 활동 점수 입력과 별도");
  await expect(page.locator(".td-hero-tiles")).not.toContainText("조회 실패");
});

test("desktop weekly forecasts show errors, missing evidence and partial coverage independently", async ({ page }) => {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  await routeRecommendation(page, { activity: "swim", score: 73 });
  await page.route("**/api/data/water-index/conditions?**", route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get("mode") !== "forecast") return route.continue();
    const at = query.get("at")!;
    const date = new Date(at).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    if (date === today) return route.fulfill({ status: 503, json: { detail: "fixture failure" } });
    const conditions = conditionsFixture({ activity: "swim", score: 74 });
    return route.fulfill({ json: {
      ...conditions, mode: "forecast", at,
      condition_score: date === tomorrow ? conditions.condition_score
        : { ...conditions.condition_score, status: "unavailable", score: null, coverage: 0, available_components: 0 },
    } });
  });
  await page.goto("#today");
  const week = page.getByRole("region", { name: "이번 주 예보" });
  await expect(week.locator(".td-day-grade").first()).toHaveText("조회 실패");
  await expect(week.locator(".td-day-score").nth(1)).toHaveText("74");
  await expect(week.locator(".td-day").nth(1).locator(".td-score-coverage")).toHaveText("부분 점수 · 근거 2/4 (50%)");
  await expect(week.locator(".td-day-score").nth(2)).toHaveText("–");
  await expect(week.locator(".td-day-grade").nth(2)).toHaveText("평가값 없음");
});

test("desktop tides and official windows retain both dates across midnight", async ({ page }) => {
  const low = { event_id: "low", kind: "low", event_at: "2026-09-20T23:20:00+09:00", height: 0.2, unit: "m", station_name: "시험 조위관측소", state: "predicted", provider: "KHOA" };
  const high = { ...low, event_id: "high", kind: "high", event_at: "2026-09-21T01:30:00+09:00", height: 0.8 };
  await page.route("**/api/data/tides/events?**", route =>
    route.fulfill({ json: { rows: [low, high], next_low: low, next_high: high, status: "available" } }));
  await page.route("**/api/data/tides/windows?**", route => route.fulfill({ json: { rows: [{ state: "official_operating_window", start_at: "2026-09-20T23:50:00+09:00", end_at: "2026-09-21T00:40:00+09:00", scope: "fixture" }] } }));
  await page.goto("#today");
  await expect(page.locator(".td-tide-state")).toContainText("간조 9/20 23:20 KST");
  await expect(page.locator(".td-tide-state")).toContainText("만조 9/21 01:30 KST");
  await expect(page.locator(".td-tide-reason").first()).toHaveText("9/20 23:50 KST–9/21 00:40 KST");
});
