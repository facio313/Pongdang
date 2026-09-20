import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

const forecastsPath = "**/api/data/water-forecast/forecasts?**";
const week = (page: Page) => page.getByRole("region", { name: "7일 예보", exact: true });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function scoredForecasts(page: Page) {
  await page.route("**/api/data/water-index/conditions?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.get("mode") !== "forecast") return route.continue();
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: {
      ...data,
      condition_score: {
        label: "활동 조건 참고 점수", model_id: "fixture", model_version: "1",
        methodology: "fixture", status: "partial", score: 64.2, coverage: 0.5,
        available_components: 2, total_components: 4,
        components: [], sources: [], reason_codes: [],
      },
    } });
  });
}

test("the selected forecast date requests its own bounded KST day and keeps overlapping intervals", async ({ page }) => {
  await scoredForecasts(page);
  const queries: URLSearchParams[] = [];
  await page.route(forecastsPath, async (route) => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query);
    const from = query.get("from")!;
    const date = from.slice(0, 10);
    await route.fulfill({ json: {
      rows: [{
        source_key: `overlapping-${date}`, station_name: `DATE ${date}`,
        provider: "OFFLINE TEST", state: "available",
        // This interval begins on the previous KST day but overlaps the
        // selected day. Filtering only the start date would lose real rows.
        target_start_at: new Date(Date.parse(from) - 3600000).toISOString(),
        target_end_at: new Date(Date.parse(from) + 7200000).toISOString(),
        inputs: [{ name: "wave_height", numeric_value: 0.4, text_value: null, unit: "m", state: "current" }],
      }],
      total: 1, status: "available",
    } });
  });
  await page.goto("#today");
  const forecast = week(page);
  await expect(forecast.locator(".td-bar")).toHaveCount(7);
  await expect(forecast.locator(".td-bar-score").first()).toHaveText("64.2");
  await expect(forecast.locator(".td-bar-detail")).toContainText("근거 2/4");
  await expect(forecast.getByLabel("선택 날짜 예보 목록")).toContainText("DATE ");
  const firstDay = queries[0].get("from")!;
  const lastDay = new Date(Date.parse(`${firstDay.slice(0, 10)}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10);
  await forecast.locator(".td-bar").last().click();
  await expect(forecast.getByLabel("선택 날짜 예보 목록")).toContainText(`DATE ${lastDay}`);
  expect(queries.some((query) => query.get("from") === `${lastDay}T00:00:00+09:00`)).toBe(true);
  for (const query of queries) {
    expect(query.get("from")).toMatch(/T00:00:00\+09:00$/);
    expect(query.get("until")).toMatch(/T00:00:00\+09:00$/);
    expect(Date.parse(query.get("until")!) - Date.parse(query.get("from")!)).toBe(86400000);
    expect(query.get("page")).toBe("1");
    expect(query.get("page_size")).toBe("100");
    expect(query.get("activity")).toBeTruthy();
  }
  await expect(forecast).not.toContainText("선택 날짜의 자료가 없습니다");
});

test("a pending raw forecast read becomes an explicit error without hiding the independent score", async ({ page }) => {
  await scoredForecasts(page);
  const release = deferred();
  await page.route(forecastsPath, async (route) => {
    await release.promise;
    await route.fulfill({ status: 503, json: { detail: "fixture failure" } });
  });
  await page.goto("#today");
  const forecast = week(page);
  try {
    await expect(forecast.getByLabel("선택 날짜 예보 목록")).toContainText("예보 목록을 조회하고 있습니다");
    await expect(forecast).not.toContainText("예보 목록이 비어 있습니다");
    await expect(forecast.locator(".td-bar-score").first()).toHaveText("64.2");
  } finally {
    release.resolve();
  }
  await expect(forecast.getByRole("alert")).toContainText("예보 목록 조회 실패");
  await expect(forecast.locator(".td-bar-score").first()).toHaveText("64.2");
  await expect(forecast).not.toContainText("예보 목록이 비어 있습니다");
  await expect(forecast).not.toContainText("선택 날짜의 자료가 없습니다");
});

test("a successful empty raw list does not deny an existing date score", async ({ page }) => {
  await scoredForecasts(page);
  await page.route(forecastsPath, (route) => route.fulfill({
    json: { rows: [], total: 0, status: "no_forecast_data" },
  }));
  await page.goto("#today");
  const forecast = week(page);
  await expect(forecast.locator(".td-bar-score").first()).toHaveText("64.2");
  await expect(forecast.getByLabel("선택 날짜 예보 목록")).toContainText("선택 날짜로 조회한 예보 목록이 비어 있습니다");
  await expect(forecast.getByLabel("선택 날짜 예보 목록")).toContainText("위 점수의 산정 근거는 점수 상세에서 확인할 수 있습니다");
  await expect(forecast.getByRole("alert")).toHaveCount(0);
  await expect(forecast).not.toContainText("선택 날짜의 자료가 없습니다");
});

test("score loading and score failures remain separate from a successful empty raw list", async ({ page }) => {
  const release = deferred();
  await page.route("**/api/data/water-index/conditions?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "forecast") return route.continue();
    await release.promise;
    await route.fulfill({ status: 503, json: { detail: "fixture failure" } });
  });
  await page.route(forecastsPath, (route) => route.fulfill({
    json: { rows: [], total: 0, status: "no_forecast_data" },
  }));
  await page.goto("#today");
  const forecast = week(page);
  try {
    await expect(forecast.locator(".td-bar-detail")).toContainText("예보 점수 조회 중");
    await expect(forecast.locator(".td-bar-score").first()).toHaveText("조회 중");
    await expect(forecast.locator(".td-bar-detail")).not.toContainText("미산정");
  } finally {
    release.resolve();
  }
  await expect(forecast.getByRole("alert")).toContainText("예보 점수 조회 실패");
  await expect(forecast.locator(".td-bar-score").first()).toHaveText("조회 실패");
  await expect(forecast.getByLabel("선택 날짜 예보 목록")).toContainText("예보 목록이 비어 있습니다");
  await expect(forecast).not.toContainText("예보 목록 조회 실패");
});
