import { test, expect } from "@playwright/test";
import { conditionsFixture, routeRecommendation } from "./recommendation";

const reading = (name: string, value: number, unit: string) => ({
  name, label: name, value, unit, status: "available", station_id: 1,
  station_name: "실험 관측소", relation: "representative_station", spatial_scope: "테스트",
  evidence: [{ provider: "FIXTURE", observed_at: new Date().toISOString(), issued_at: null, fetched_at: new Date().toISOString(), valid_until: null }],
});

test("today separates excluded activities, partial coverage and place baseline readings", async ({ page }) => {
  const swim = { ...conditionsFixture({ activity: "swim", score: 69 }), metrics: [reading("water_temperature", 21.3, "°C"), reading("wave_height", 0.4, "m")] };
  const relax = conditionsFixture({ activity: "relax", score: 82 });
  const onsen = conditionsFixture({ activity: "onsen", score: 100 });
  const surf = { ...conditionsFixture({ activity: "surf", score: 95 }), support_status: "unsupported" };
  await routeRecommendation(page, { activity: "relax", score: 82 }, {
    conditions: [swim, surf, relax, onsen],
    ranked: [
      { activity: "onsen", score: 100, dropped: true, demoted: false, rules_applied: ["essential_measurement_missing"] },
      { activity: "surf", score: 95, dropped: true, demoted: false, rules_applied: ["activity_blocked"] },
    ],
  });
  await page.goto("#today");
  await expect(page.locator(".td-hero-score-num")).toHaveText("82");
  // 숫자 옆은 「이게 지금 값인가」만 말합니다. 확보율과 부분 점수 여부는
  // 「근거 보기」 안에 그대로 있습니다(productData 의 scoreCoverageText 주석).
  await expect(page.locator(".td-hero-score")).toContainText("마지막 업데이트");
  await expect(page.locator(".td-hero-score")).not.toContainText("부분 점수");
  await expect(page.locator(".td-hero-score")).not.toContainText("근거 2/4");
  const activity = (name: string) => page.locator(".td-act").filter({ has: page.getByText(name, { exact: true }) });
  await expect(activity("온천").locator(".td-act-score")).toHaveText("–");
  await expect(activity("온천")).toContainText("추천 제외");
  await expect(activity("온천")).not.toContainText("매우 좋음");
  await expect(activity("서핑").locator(".td-act-score")).toHaveText("–");
  await expect(activity("서핑")).toContainText("활동 미지원");
  // 휴식·래프팅은 점수 목록에 줄이 없습니다(aiApi.listedActivities). 휴식은
  // 날씨만 좋으면 거의 항상 1위라 목록에 두면 추천과 어긋난 채 보이고,
  // 래프팅은 하천 자료가 없어 늘 「추천 제외」 한 줄뿐이었습니다.
  await expect(activity("휴식")).toHaveCount(0);
  await expect(activity("래프팅")).toHaveCount(0);
  // 그래도 휴식은 히어로가 될 수 있고, 그때 점수의 출처를 말합니다 -- 목록에
  // 줄이 없다고 근거가 없는 것은 아닙니다.
  await expect(page.locator(".td-hero-score .td-score-coverage")).toContainText("마지막 업데이트");
  const tile = (name: string) => page.locator(".td-hero-tiles .td-tile").filter({ has: page.getByText(name, { exact: true }) });
  await expect(tile("수온").locator(".td-tile-value")).toHaveText("21.3°C");
  await expect(tile("파고").locator(".td-tile-value")).toHaveText("0.4m");
  await expect(page.locator(".td-hero")).toContainText("장소 관측 · 활동 점수 입력과 별도");
});

test("a missing recommended activity does not borrow a numeric swim score for the hero", async ({ page }) => {
  await routeRecommendation(page, null, { conditions: [conditionsFixture({ activity: "swim", score: 99 })], ranked: [{ activity: "swim", score: 99, dropped: true, rules_applied: ["essential_measurement_missing"] }] });
  await page.goto("#today");
  await expect(page.locator(".td-hero-score-num")).toHaveText("–");
  await expect(page.locator(".td-hero-score")).not.toContainText("99");
});

test("tide events keep their actual KST dates across midnight", async ({ page }) => {
  await page.route("**/api/data/tides/events?**", route => route.fulfill({ json: {
    rows: [], status: "available", next_low: { event_at: "2026-09-20T14:30:00Z" },
    next_high: { event_at: "2026-09-20T16:30:00Z", height: 0.5, unit: "m" },
  } }));
  await page.goto("#today");
  await expect(page.locator(".td-tide-now")).toContainText("간조 9/20 23:30 KST");
  await expect(page.locator(".td-tide-now")).toContainText("만조 9/21 01:30 KST");
});
