import { test, expect } from "@playwright/test";
import { conditionsFixture, routeRecommendation } from "./recommendation";

const NOW = new Date("2026-09-20T23:10:00+09:00");
const high = {
  event_id: "high", kind: "high", event_at: "2026-09-20T23:20:00+09:00",
  height: 25, unit: "cm", station_name: "묵호", provider: "khoa_tide_extrema",
  state: "available", spatial_relation: "nearby_station_context", distance_km: 33.488,
};
const low = { ...high, event_id: "low", kind: "low", height: 24, event_at: "2026-09-21T01:30:00+09:00" };

for (const width of [390, 1440]) {
  test(`${width}px home shows tide order and expands scoring criteria from each metric label`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install({ time: NOW });
    const choice = { activity: "swim", score: 63.3 };
    const base = conditionsFixture(choice);
    await routeRecommendation(page, choice, { conditions: [{ ...base, condition_score: {
      ...base.condition_score,
      components: [{ metric: "water_temperature", label: "수온", value: 24, unit: "°C", score: 80,
        status: "evaluated", reason_codes: [], source_ids: [], criterion: "수온 참고 구간 · 24°C→80점" },
      { metric: "air_temperature", label: "외부 기온", value: 19.9, unit: "°C", score: 0,
        status: "evaluated", reason_codes: [], source_ids: ["beach-preferences-2016"],
        criterion: "논문 범위 참고 + 0/100 환산·보간 제품 가정 · 캐나다 국내 해변 방문 선호 구간을 시간별 참고값으로 전이; 입수 쾌적성 아님 · 21°C→0점, 25°C→100점, 30°C→100점, 33°C→0점 · 절점 사이 선형 보간" },
      { metric: "wind_speed", label: "풍속", value: 3, unit: "m/s", score: 90,
        status: "evaluated", reason_codes: [], source_ids: [], criterion: "풍속 참고 구간 · 3m/s→90점" }],
      sources: [{ id: "beach-preferences-2016", title: "Rutty & Scott (2016)", url: "https://doi.org/10.3390/atmos7020030",
        usage: "4.2절 캐나다 국내 해변 여행 응답의 선호 기온 25–30°C, 추위 21°C·더위 33°C 경계를 참고. 0/100점·선형 보간과 한국 시간별 방문 조건으로의 전이는 제품 가정이며 입수 수온 기준 아님." }],
    } }] });
    let tideRequests = 0;
    await page.route("**/api/data/tides/events?**", (route) => {
      tideRequests++;
      return route.fulfill({ json: { status: "available", rows: [low, high], next_high: high, next_low: low } });
    });
    await page.goto("#home");
    const tides = page.getByRole("region", { name: "다음 간조·만조" });
    await expect(tides.locator("li strong")).toHaveText(["만조", "간조"]);
    await expect(tides).toContainText("9/20 23:20 KST");
    await expect(tides).toContainText("9/21 01:30 KST");
    await expect(tides.locator("li").first()).toContainText("조위 25cm");
    await expect(tides.locator("li").first()).toContainText("묵호 · 33.5km");
    await expect(tides.locator("li").first()).toContainText("해당 해변의 직접 예측이 아닙니다");
    await expect(page.locator(".pd-header .pd-data-refresh, .pd-dk-nav .pd-data-refresh")).toHaveCount(0);
    const temperature = page.locator(".pd-cbar").filter({ hasText: "외부 기온" });
    await expect(temperature).toContainText("19.9°C");
    await expect(temperature.locator(".pd-cbar-score")).toHaveText("0");
    await expect(page.getByText("자료 없음이나 활동 금지를 뜻하지 않습니다", { exact: false })).toHaveCount(0);
    await expect(page.locator(".pd-cbar-criterion:visible")).toHaveCount(0);
    await page.screenshot({ path: `test-results/home-criteria-collapsed-${width}.png`, fullPage: true });
    const temperatureToggle = temperature.getByRole("button", { name: "외부 기온", exact: true });
    await expect(temperatureToggle).toHaveAttribute("aria-expanded", "false");
    await temperatureToggle.click();
    await expect(temperatureToggle).toHaveAttribute("aria-expanded", "true");
    const temperatureCriteria = temperature.locator(".pd-cbar-criterion");
    await expect(temperatureCriteria).toBeVisible();
    await expect(temperatureCriteria).toHaveAttribute("id", await temperatureToggle.getAttribute("aria-controls") ?? "");
    await expect(temperatureCriteria).toContainText("점수 기준 · 미보정 참고값");
    await expect(temperatureCriteria).toContainText("21°C→0점");
    await expect(temperature.getByRole("link")).toHaveAttribute("href", "https://doi.org/10.3390/atmos7020030");
    await expect(temperatureCriteria).toContainText("한국 시간별 방문 조건으로의 전이는 제품 가정");
    for (const [label, criterion, score] of [["수온", "24°C→80점", "80"], ["풍속", "3m/s→90점", "90"]]) {
      const row = page.locator(".pd-cbar").filter({ has: page.getByRole("button", { name: label, exact: true }) });
      const toggle = row.getByRole("button", { name: label, exact: true });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(row.locator(".pd-cbar-criterion")).toBeVisible();
      await expect(row.locator(".pd-cbar-criterion")).toContainText(criterion);
      await expect(row.locator(".pd-cbar-score")).toHaveText(score);
      await toggle.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(row.locator(".pd-cbar-criterion")).toBeHidden();
      await expect(temperatureCriteria).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/home-tides-${width}.png`, fullPage: true });
    await temperatureToggle.press("Space");
    await expect(temperatureToggle).toHaveAttribute("aria-expanded", "false");
    await expect(temperatureCriteria).toBeHidden();
    await expect(temperature.locator(".pd-cbar-score")).toHaveText("0");
    await page.clock.fastForward(11 * 60_000);
    await expect(tides.locator("li strong")).toHaveText(["간조"]);
    expect(tideRequests).toBe(1);
  });
}

test("home distinguishes missing tides from a failed lookup and excludes stale events", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await page.route("**/api/data/tides/events?**", (route) => route.fulfill({ json: {
    status: "no_forecast_data", rows: [{ ...high, state: "stale" }], next_high: null, next_low: null,
  } }));
  await page.goto("#home");
  const tides = page.getByRole("region", { name: "다음 간조·만조" });
  await expect(tides).toContainText("연결된 다음 간조·만조 예측이 없습니다.");
  await expect(tides.locator("time")).toHaveCount(0);
  await page.route("**/api/data/tides/events?**", (route) => route.fulfill({ status: 503, json: { detail: "unavailable" } }));
  await page.reload();
  await expect(tides.getByRole("alert")).toBeVisible();
  await expect(tides).not.toContainText("연결된 다음 간조·만조 예측이 없습니다.");
  await expect(tides.locator("time")).toHaveCount(0);
});
