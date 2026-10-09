import { test, expect } from "@playwright/test";
import { conditionsFixture, routeRecommendation } from "./recommendation";

const reading = (name: string, value: number, unit: string) => ({
  name, label: name, value, unit, status: "available", station_id: 1,
  station_name: "실험 관측소", relation: "representative_station", spatial_scope: "테스트",
  evidence: [{ provider: "FIXTURE", observed_at: new Date().toISOString(), issued_at: null, fetched_at: new Date().toISOString(), valid_until: null }],
});

for (const width of [390, 1440]) {
  test(`${width}px cold-weather onsen alternative keeps rest and does not assert an on-site bath`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const onsen = conditionsFixture({ activity: "onsen", score: 93.7 });
    const rest = conditionsFixture({ activity: "relax", score: 63.3 });
    const metrics = [reading("air_temperature", 8, "°C"), reading("water_temperature", 12, "°C"), reading("wave_height", 1.8, "m")];
    const components = metrics.map((metric, index) => ({
      metric: metric.name, label: ["외부 기온", "야외 수온", "해양 파고"][index], value: metric.value, unit: metric.unit,
      score: [94, 95, 92][index], status: "evaluated", weight: 1, reason_codes: [], source_ids: [], criterion: "소프트웨어 검증용 조건",
    }));
    const swim = { ...conditionsFixture({ activity: "swim", score: 27 }), metrics };
    await routeRecommendation(page, { activity: "onsen", score: 93.7 }, {
      conditions: [swim, rest, { ...onsen, metrics, condition_score: { ...onsen.condition_score, score_basis: "onsen_alternative", label: "온천 대안 추천 점수", status: "evaluated", available_components: 3, total_components: 3, coverage: 1, components } }],
      ranked: [
        { activity: "onsen", score: 93.7, dropped: false, demoted: false, rules_applied: [] },
        { activity: "swim", score: 27, dropped: true, demoted: false, rules_applied: ["water_too_cold_for_immersion"] },
      ],
      reasons: [
        { code: "onsen_weather_alternative", activity: "onsen" },
        { code: "onsen_alternative_factor", activity: "onsen", label: "외부 기온", value: 8, unit: "°C" },
        { code: "onsen_alternative_factor", activity: "onsen", label: "야외 수온", value: 12, unit: "°C" },
        { code: "onsen_alternative_factor", activity: "onsen", label: "해양 파고", value: 1.8, unit: "m" },
      ],
    });
    await page.goto("#today");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("온천으로 몸 녹이기");
    const tile = page.locator(width < 768 ? ".td-act" : ".td-activity");
    await expect(tile).toHaveCount(5);
    await expect(tile.filter({ has: page.getByText("휴식", { exact: true }) })).toContainText("63.3");
    await expect(tile.filter({ has: page.getByText("온천", { exact: true }) })).toContainText("93.7");
    await expect(tile.filter({ has: page.getByText("온천", { exact: true }) })).toContainText("날씨 기반 대안");
    await expect(page.locator("body")).toContainText("야외 수온 12°C");
    await expect(page.locator("body")).toContainText("시설 영업과 욕조 상태는 별도로 확인");
    await page.screenshot({ path: `../output/playwright/onsen-rest-20261008/cold-onsen-${width}.png`, fullPage: true });
  });
}

test("today separates excluded activities, partial coverage and place baseline readings", async ({ page }) => {
  const swim = { ...conditionsFixture({ activity: "swim", score: 69 }), metrics: [reading("water_temperature", 21.3, "°C"), reading("wave_height", 0.4, "m")] };
  const relax = conditionsFixture({ activity: "relax", score: 82 });
  const onsen = conditionsFixture({ activity: "onsen", score: 100 });
  const walk = { ...conditionsFixture({ activity: "walk", score: 95 }), support_status: "unsupported" };
  const surf = { ...conditionsFixture({ activity: "surf", score: 95 }), support_status: "unsupported" };
  await routeRecommendation(page, { activity: "relax", score: 82 }, {
    conditions: [swim, surf, relax, onsen, walk],
    ranked: [
      { activity: "onsen", score: 100, dropped: true, demoted: false, rules_applied: ["essential_measurement_missing"] },
      { activity: "walk", score: 95, dropped: true, demoted: false, rules_applied: ["activity_blocked"] },
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
  await expect(activity("물길 따라 걷기").locator(".td-act-score")).toHaveText("–");
  await expect(activity("물길 따라 걷기")).toContainText("활동 미지원");
  // 휴식·래프팅은 점수 목록에 줄이 없습니다(aiApi.listedActivities). 휴식은
  // 날씨만 좋으면 거의 항상 1위라 목록에 두면 추천과 어긋난 채 보이고,
  // 래프팅은 하천 자료가 없어 늘 「추천 제외」 한 줄뿐이었습니다.
  await expect(activity("휴식").locator(".td-act-score")).toHaveText("82");
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
