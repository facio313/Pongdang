import { test, expect, type Page } from "@playwright/test";
import { routeRecommendation } from "./recommendation";

const NOW = new Date("2026-09-21T03:00:00Z");
const place = { id: 1, name: "갱신 테스트 해변", place_kind: "beach", region: "강릉시", address: "강원도 강릉시", lat: 37.8, lng: 128.9 };
const job = { request_id: "refresh-test", status: "queued", requested_at: NOW.toISOString(), finished_at: null as string | null, failed_jobs: [] as string[] };

function conditions(score: number | null, validUntil: string) {
  return {
    spot_id: 1, place_name: place.name, activity: "swim", mode: "observation",
    at: NOW.toISOString(), as_of: NOW.toISOString(), safety_status: "unknown",
    support_status: "unknown", restriction_refs: [], environment_score: null,
    context_metrics: [], display_metrics: [], missing_metrics: [], required_evidence: [], reason_codes: [],
    metrics: [{ name: "water_temperature", label: "수온", station_id: 2, status: "available", value: 21,
      unit: "°C", relation: "representative_station", station_name: "TEST",
      evidence: [{ provider: "TEST", observed_at: NOW.toISOString(), issued_at: null,
        fetched_at: NOW.toISOString(), valid_until: validUntil }] }],
    condition_score: { label: "활동 조건 참고 점수", model_id: "fixture", model_version: "1",
      methodology: "fixture", status: "partial", score, coverage: 0.25, available_components: 1, total_components: 4,
      components: [{ metric: "water_temperature", label: "수온", value: 21, unit: "°C", score, weight: 1,
        station_id: 2, status: "evaluated", reason_codes: [], criterion: "fixture" }], sources: [], reason_codes: [] },
  };
}

async function mockCommon(page: Page, expiry = 3600000) {
  const reads: string[] = [];
  const current = { score: 75 };
  await page.clock.install({ time: NOW });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    reads.push(path);
    const condition = conditions(current.score, new Date(NOW.getTime() + expiry).toISOString());
    let data: unknown = { rows: [], items: [], total: 0, page: 1, page_size: 100, has_more: false };
    if (path.endsWith("/water-index/default-place")) data = { place, rows: [place], display_name: place.name, status: "preferred", message: "테스트 자료" };
    else if (path.endsWith("/water-index/recommendation")) data = {
      contract_version: "water-recommendation.v1", model_id: "pongdang-activity-recommendation", model_version: "1.0.0",
      scientific_validation: "not_evaluated", spot_id: 1, place_name: place.name, place_kind: "beach",
      at: NOW.toISOString(), as_of: NOW.toISOString(), mode: "observation",
      choice: { activity: "swim", score: current.score, status: "partial" }, ranked: [], reasons: [], tide: null,
      alternatives: [], rules: [], limitations: [], reason_codes: [], conditions: [condition],
    };
    else if (path.endsWith("/water-index/conditions/series")) data = {
      spot_id: 1, activity: "swim", as_of: NOW.toISOString(),
      rows: (new URL(route.request().url()).searchParams.get("targets") ?? "").split(",")
        .map((at) => ({ ...condition, at, mode: "forecast" })),
    };
    else if (path.endsWith("/water-index/conditions")) data = condition;
    else if (path.endsWith("/quality/grade")) data = { status: "no_data", grade: null, measurements: [], reason_codes: [] };
    else if (path.endsWith("/regions")) data = { provinces: [] };
    else if (path.endsWith("/travel/preferences")) data = { preference: { tags: [] }, revision: 0 };
    else if (path.endsWith("/travel/keywords")) data = { categories: [] };
    else if (path.endsWith("/places")) data = { rows: [place], total: 1, page: 1, page_size: 100, has_more: false };
    await route.fulfill({ json: data });
  });
  return { reads, current, recommendationReads: () => reads.filter((path) => path.endsWith("/water-index/recommendation")).length };
}

test("expired scores and hourly values remain until the thirty-minute update", async ({ page }) => {
  const mocked = await mockCommon(page, 10000);
  await page.goto("#home");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
  await expect.poll(() => mocked.reads.filter((path) => path.endsWith("/conditions/series")).length).toBe(1);
  expect(mocked.reads.filter((path) => path.endsWith("/conditions"))).toHaveLength(0);
  await page.clock.fastForward(10001);
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
  await expect(page.locator(".pd-retained-note").first()).toContainText("이전 결과");
  await expect(page.getByRole("table", { name: "오늘 시간대별 수집 예보" })).toContainText("21°C");
  await page.clock.fastForward(1780000);
  expect(mocked.recommendationReads()).toBe(1);
  await page.clock.fastForward(11000);
  await expect.poll(mocked.recommendationReads).toBe(2);
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
});

test("a failed automatic refresh retains the score and waits another thirty minutes", async ({ page }) => {
  await mockCommon(page);
  let requests = 0;
  await page.route("**/api/data/water-index/recommendation?**", (route) => {
    requests += 1;
    return requests === 1 ? route.fallback()
      : route.fulfill({ status: 503, json: { detail: "unavailable" } });
  });
  await page.goto("#home");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
  await page.clock.fastForward(1800100);
  await expect.poll(() => requests).toBe(2);
  await page.clock.fastForward(30000);
  expect(requests).toBe(2);
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
});

for (const width of [390, 1440]) {
  test(`${width}px a failed recommendation keeps independent home and today measurements available`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const mocked = await mockCommon(page);
    let unavailable = true;
    await page.route("**/api/data/water-index/recommendation?**", route => unavailable
      ? route.fulfill({ status: 503, json: { detail: "unavailable" } }) : route.fallback());
    await page.goto("#home");
    await expect(page.locator(width < 1080 ? ".hm-hero-metrics" : ".hd-hero-metrics")).toContainText("21°C");
    await expect(page.locator(width < 1080 ? ".hm-hero-sentence" : ".hd-hero-title")).toContainText("불러오지 못했");
    expect(mocked.reads.filter(path => path.endsWith("/conditions"))).toHaveLength(1);
    await page.goto("#today");
    await expect(page.locator(".td-hero-tiles")).toContainText("21°C");
    await expect(page.locator(width < 1080 ? ".td-act-score" : ".td-activity-score").first()).toHaveText("75");
    await expect(page.locator(".td-hero-score-num")).toHaveText("–");
    unavailable = false;
    await page.clock.fastForward(1800100);
    await expect(page.locator(".td-hero-score-num")).toHaveText("75");
  });

  test(`${width}px unsupported activities do not discard stored scores during an incomplete refresh`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockCommon(page);
    let incomplete = false;
    const unsupported = { ...conditions(null, NOW.toISOString()), activity: "onsen", support_status: "unsupported" };
    unsupported.condition_score.status = "blocked";
    const extra = { conditions: [conditions(75, "2026-09-22T03:00:00Z"), unsupported] };
    await routeRecommendation(page, () => incomplete ? null : { activity: "swim", score: 75 }, extra);
    await page.goto("#home");
    const hero = page.locator(width < 1080 ? ".hm-hero-score-num" : ".hd-hero-score-num");
    await expect(hero).toHaveText("75");
    incomplete = true;
    extra.conditions = [conditions(null, NOW.toISOString()), unsupported];
    await page.clock.fastForward(1800100);
    await expect(page.locator(".pd-retained-note").first()).toContainText("이전 결과");
    await expect(hero).toHaveText("75");
    await expect(page.locator(width < 1080 ? ".hm-hero-metrics" : ".hd-hero-metrics")).toContainText("21°C");
    await page.goto("#today");
    await expect(page.locator(".td-hero-score-num")).toHaveText("75");
  });

  test(`${width}px cold home keeps scores and explicitly reports failed optional lookups`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockCommon(page);
    await routeRecommendation(page, { activity: "swim", score: 75 }, {
      conditions: [conditions(75, "2026-09-22T03:00:00Z")],
      reasons: [{ code: "tide_lookup_unavailable" }],
      reason_codes: ["tide_lookup_unavailable", "alternatives_lookup_unavailable"],
    });
    const hero = page.locator(width === 390 ? ".hm-hero-score-num" : ".hd-hero-score-num");
    await page.goto("#home");
    await expect(hero).toHaveText("75");
    await expect(page.getByText("간조·만조 조회에 실패해 물때 기준은 적용하지 않았습니다. 표시된 점수는 안전 판정이 아닙니다.").first()).toBeVisible();
    await expect(page.getByText("추천 보조 자료 일부를 불러오지 못했습니다. 확인된 활동 점수와 지표를 표시합니다.")).toBeVisible();
    await page.reload();
    await expect(hero).toHaveText("75");
  });

  test(`${width}px cold reload shows the server's last publication and honors evidence revocation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockCommon(page);
    const computedAt = "2026-09-21T02:55:00Z";
    const condition = {
      ...conditions(75, "2026-09-22T03:00:00Z"), retained: true,
      projection: { status: "refreshing", computed_at: computedAt, retention_allowed: true },
    };
    await routeRecommendation(page, { activity: "swim", score: 75 }, { conditions: [condition] });
    const hero = page.locator(width === 390 ? ".hm-hero-score-num" : ".hd-hero-score-num");
    await page.goto("#home");
    await expect(hero).toHaveText("75");
    await expect(page.locator(".pd-retained-note").first()).toContainText("11:55");
    await page.reload();
    await expect(hero).toHaveText("75");
    await expect(page.locator(".pd-retained-note").first()).toContainText("11:55");

    await routeRecommendation(page, { activity: "swim", score: 55 }, { conditions: [{
      ...conditions(55, "2026-09-22T03:00:00Z"), retained: false,
      projection: { status: "ready", computed_at: NOW.toISOString(), retention_allowed: true },
    }] });
    await page.clock.fastForward(1800100);
    await expect(hero).toHaveText("55");
    await expect(page.locator(".hd-hero .pd-retained-note, .hm-hero .pd-retained-note")).toHaveCount(0);

    await routeRecommendation(page, null, { conditions: [{
      ...conditions(null, "2026-09-22T03:00:00Z"),
      projection: { status: "pending", computed_at: null, retention_allowed: false },
    }] });
    await page.clock.fastForward(1800100);
    await expect(hero).toHaveText("–");
  });

  test(`${width}px home hides header refresh and menu refresh preserves scores on empty updates and a failed place read`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockCommon(page);
    let collecting = false;
    await page.route("**/api/data/water-index/default-place", route => collecting
      ? route.fulfill({ status: 503, json: { detail: "unavailable" } }) : route.fallback());
    await page.route("**/api/data/water-index/recommendation?**", route => {
      if (!collecting) return route.fallback();
      const unavailable = conditions(75, NOW.toISOString());
      unavailable.condition_score = { ...unavailable.condition_score, score: null, status: "unavailable", components: [] };
      unavailable.metrics = [];
      return route.fulfill({ json: { choice: null, conditions: [unavailable] } });
    });
    await page.route("**/api/data/refresh", route => {
      collecting = true;
      return route.fulfill({ json: { ...job, status: "succeeded", finished_at: NOW.toISOString() } });
    });
    await page.goto("#home");
    const hero = page.locator(width < 1080 ? ".hm-hero-score-num" : ".hd-hero-score-num");
    await expect(hero).toHaveText("75");
    await expect(page.locator(".pd-header .pd-data-refresh, .pd-dk-nav .pd-data-refresh")).toHaveCount(0);
    await page.getByRole("button", { name: "사이드 메뉴 열기", exact: true }).click();
    const refresh = page.getByRole("button", { name: "데이터 새로고침", exact: true });
    await expect(refresh).toBeVisible();
    const box = await refresh.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await refresh.click();
    await expect(page.locator("#pd-menu-refresh-status")).toContainText("자료 확인 완료");
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(hero).toHaveText("75");
    await expect(page.locator(".pd-retained-note").first()).toContainText("기준");
    // The shared cache survives a tab unmount even after an insufficient read.
    await page.goto("#today");
    await page.goto("#home");
    await expect(hero).toHaveText("75");
  });
}

test("fixed hourly and weekly forecast targets remain after their source windows", async ({ page }) => {
  await mockCommon(page, -3600000);
  await page.goto("#home");
  const table = page.getByRole("table", { name: "오늘 시간대별 수집 예보" });
  await expect(table.getByRole("rowheader")).toHaveText(["09시", "12시", "15시", "18시"]);
  await expect(table.getByRole("cell").filter({ hasText: "21°C" })).toHaveCount(4);
  await page.goto("#today");
  await expect(page.locator(".td-bar-score")).toHaveText(Array(7).fill("75"));
});

test("an in-progress calculation recovers home and its hourly forecasts without reloading", async ({ page }) => {
  await mockCommon(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  let ready = false;
  let reads = 0;
  await page.route("**/api/data/water-index/recommendation?**", route => {
    reads += 1;
    if (ready) return route.fallback();
    const pending = { ...conditions(75, new Date(NOW.getTime() + 3600000).toISOString()),
      condition_score: null, metrics: [],
      projection: { status: "pending", computed_at: null, refresh_after: null } };
    return route.fulfill({ json: { spot_id: 1, choice: null, conditions: [pending],
      ranked: [], reasons: [], alternatives: [], rules: [], limitations: [], reason_codes: [] } });
  });
  await page.goto("#home");
  await expect(page.locator(".hd-hero-score-num")).toHaveText("–");
  expect(reads).toBe(1);
  ready = true;
  await page.clock.fastForward(30001);
  await expect(page.locator(".hd-hero-score-num")).toHaveText("75");
  await expect(page.locator(".hd-hour-score")).toHaveText(["75", "75", "75", "75"]);
  expect(reads).toBe(2);
});

test("home refreshes at the published deadline before its current evidence expires", async ({ page }) => {
  const mocked = await mockCommon(page);
  let calls = 0;
  await page.route("**/api/data/water-index/recommendation?**", async route => {
    calls += 1;
    await route.fulfill({ json: { spot_id: 1,
      choice: { activity: "swim", score: mocked.current.score, status: "partial" },
      conditions: [{ ...conditions(mocked.current.score, new Date(NOW.getTime() + 3600000).toISOString()),
        projection: { status: "ready", computed_at: NOW.toISOString(),
          refresh_after: new Date(NOW.getTime() + 60000).toISOString() } }],
      ranked: [], reasons: [], alternatives: [], rules: [], limitations: [], reason_codes: [],
    } });
  });
  await page.goto("#home");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
  mocked.current.score = 81;
  await page.clock.fastForward(60001);
  await expect(page.locator(".hm-hero-score-num")).toHaveText("81");
  expect(calls).toBe(2);
});

for (const desktop of [false, true]) {
  test(`${desktop ? "desktop" : "mobile"} keeps valid today scores while the next generation is computing`, async ({ page }) => {
    await mockCommon(page);
    await page.setViewportSize(desktop ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
    let published = false;
    let calls = 0;
    await page.route("**/api/data/water-index/recommendation?**", async route => {
      calls += 1;
      const score = published ? 81 : 75;
      const projection = { status: published || calls === 1 ? "ready" : "refreshing",
        computed_at: NOW.toISOString(), refresh_after: new Date(NOW.getTime() + 600000).toISOString() };
      await route.fulfill({ json: { spot_id: 1, choice: { activity: "swim", score, status: "partial" },
        conditions: [{ ...conditions(score, new Date(NOW.getTime() + 3600000).toISOString()), projection }],
        ranked: [], reasons: [], alternatives: [], rules: [], limitations: [], reason_codes: [] } });
    });
    await page.goto("#today");
    const swim = page.locator(desktop ? ".td-activity-score" : ".td-act-score").first();
    await expect(swim).toHaveText("75");
    await page.clock.fastForward(600001);
    await expect.poll(() => calls).toBe(2);
    await expect(swim).toHaveText("75");
    await expect(page.getByText(/새 자료 반영 중 · 이전 계산 결과/).first()).toBeVisible();
    await page.clock.fastForward(30001);
    await expect.poll(() => calls).toBe(3);
    await expect(swim).toHaveText("75");
    published = true;
    await page.clock.fastForward(30001);
    await expect(swim).toHaveText("81");
    expect(calls).toBe(4);
  });
}

test("weekly scores use one stored series and match dates independently of response order", async ({ page }) => {
  await mockCommon(page);
  let calls = 0;
  let targets: string[] = [];
  await page.route("**/api/data/water-index/conditions/series?**", (route) => {
    calls += 1;
    targets = new URL(route.request().url()).searchParams.get("targets")!.split(",");
    return route.fulfill({ json: { spot_id: 1, activity: "swim", as_of: NOW.toISOString(), rows:
      targets.map((at, index) => ({
        ...conditions(51 + index, new Date(NOW.getTime() + 3600000).toISOString()),
        at: new Date(at).toISOString(), mode: "forecast",
      })).reverse(),
    } });
  });
  await page.goto("#today");
  await expect(page.locator(".td-bar-score")).toHaveText(["51", "52", "53", "54", "55", "56", "57"]);
  expect(targets).toHaveLength(7);
  expect(calls).toBe(1);
  await page.locator(".td-bar").nth(1).click();
  await expect(page.locator(".td-bar-detail .pd-grade-chip-num")).toHaveText("52");
  expect(calls).toBe(1);
});

for (const desktop of [false, true]) {
  test(`${desktop ? "desktop" : "mobile"} retains elapsed hourly forecasts and today's weekly score`, async ({ page }) => {
    await page.setViewportSize(desktop ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
    await mockCommon(page, 12 * 3600000);
    await page.clock.setSystemTime(new Date("2026-09-21T12:30:00Z")); // 21:30 KST
    await page.route("**/api/data/water-index/conditions/series?**", route => {
      const targets = new URL(route.request().url()).searchParams.get("targets")!.split(",");
      const rows = targets.map((at, index) => {
        // Each target was valid for its own hour. Today has passed, tomorrow has not.
        const data = conditions(51 + index, new Date(Date.parse(at) + 3600000).toISOString());
        return {
          ...data, at, mode: "forecast", as_of: "2026-09-21T12:30:00Z",
          metrics: index === 2 ? [] : data.metrics,
          condition_score: index === 2 ? null : data.condition_score,
        };
      });
      return route.fulfill({ json: { spot_id: 1, activity: "swim", rows: rows.reverse() } });
    });
    await page.goto("#home");
    if (desktop) {
      await expect(page.locator(".hd-hour-score")).toHaveText(["51", "52", "–", "54"]);
      await expect(page.locator(".hd-hour-label")).toHaveText(["9시", "12시", "15시", "18시"]);
    } else {
      const rows = page.getByRole("table", { name: "오늘 시간대별 수집 예보" }).locator("tbody tr");
      await expect(rows.locator("th")).toHaveText(["09시", "12시", "15시", "18시"]);
      await expect(rows.nth(0).locator("td").first()).toContainText("21°C");
      await expect(rows.nth(2).locator("td").first()).toHaveText("–");
      await expect(rows.nth(3).locator("td").first()).toContainText("21°C");
    }
    await page.getByRole("link", { name: "오늘", exact: true }).click();
    await expect(page.locator(desktop ? ".td-day-score" : ".td-bar-score"))
      .toHaveText(["51", "52", "–", "54", "55", "56", "57"]);
    const today = page.locator(desktop ? ".td-day" : ".td-bar").first();
    await expect(today).toContainText("오늘");
    if (desktop) await expect(today).toContainText("부분 점수 · 근거 1/4 (25%)");
    else await expect(today).toHaveAttribute("aria-label", /부분 점수 · 근거 1\/4 \(25%\)/);
  });
}

test("manual refresh waits for completion, refreshes common reads and preserves unsaved input", async ({ page }) => {
  const mocked = await mockCommon(page);
  let submitted = 0;
  let polls = 0;
  await page.route("**/api/data/refresh", async (route) => {
    submitted += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({});
    await route.fulfill({ status: 202, json: job });
  });
  await page.route("**/api/data/refresh/refresh-test", async (route) => {
    polls += 1;
    if (polls > 1) mocked.current.score = 81;
    await route.fulfill({ json: { ...job, status: polls === 1 ? "running" : "succeeded",
      finished_at: polls === 1 ? null : new Date(NOW.getTime() + 6000).toISOString() } });
  });
  await page.goto("#home");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
  await page.getByText("장소 바꾸기", { exact: true }).click();
  await page.getByRole("searchbox", { name: "장소 검색" }).fill("아직 검색하지 않은 입력");
  await page.getByRole("button", { name: "사이드 메뉴 열기" }).click();
  const panel = page.getByRole("dialog", { name: "사이드 메뉴", exact: true });
  await panel.getByRole("button", { name: "데이터 새로고침", exact: true }).click();
  await expect(panel.getByRole("button", { name: "데이터 갱신 중…" })).toBeDisabled();
  expect(submitted).toBe(1);
  await expect.poll(mocked.recommendationReads).toBe(2);
  await page.clock.fastForward(3100);
  await expect.poll(() => polls).toBe(1);
  expect(mocked.recommendationReads()).toBe(2);
  // Closing and reopening the menu must not restart the job or its polling.
  await panel.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "사이드 메뉴 열기" }).click();
  await expect(panel.getByRole("button", { name: "데이터 갱신 중…" })).toBeDisabled();
  await page.clock.fastForward(3100);
  await expect(panel.getByRole("status")).toHaveText("자료 확인 완료 · 부족한 항목은 이전 값 유지");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("81");
  expect(submitted).toBe(1);
  expect(mocked.recommendationReads()).toBe(3);
  expect(mocked.reads.filter((path) => path.endsWith("/water-index/default-place"))).toHaveLength(3);
  await panel.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "장소 검색" })).toHaveValue("아직 검색하지 않은 입력");
});

test("partial refresh is visible as failure and a lost status read resumes the same job", async ({ page }) => {
  const mocked = await mockCommon(page);
  let submitted = 0;
  let polls = 0;
  await page.route("**/api/data/refresh", (route) => {
    submitted += 1;
    return route.fulfill({ status: 202, json: job });
  });
  await page.route("**/api/data/refresh/refresh-test", (route) => {
    polls += 1;
    return polls === 1 ? route.fulfill({ status: 503, json: { detail: "unavailable" } })
      : route.fulfill({ json: { ...job, status: "partial", finished_at: NOW.toISOString(), failed_jobs: ["weather"] } });
  });
  await page.goto("#home");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
  await page.getByRole("button", { name: "사이드 메뉴 열기" }).click();
  const panel = page.getByRole("dialog", { name: "사이드 메뉴", exact: true });
  await panel.getByRole("button", { name: "데이터 새로고침", exact: true }).click();
  await page.clock.fastForward(3100);
  await expect(panel.getByRole("button", { name: "상태 다시 확인" })).toBeEnabled();
  expect(mocked.recommendationReads()).toBe(2);
  await panel.getByRole("button", { name: "상태 다시 확인" }).click();
  await expect(panel.getByRole("status")).toHaveText("일부 자료 또는 점수를 갱신하지 못했습니다. 다시 시도해 주세요.");
  await expect.poll(mocked.recommendationReads).toBe(4);
  expect(submitted).toBe(1);
});

test("owner-only notification reads keep ten minutes and the shared manual completion signal", async ({ page }) => {
  const mocked = await mockCommon(page);
  const notificationReads = () => mocked.reads.filter((path) => path.endsWith("/notifications/subscriptions")).length;
  let finished = false;
  await page.route("**/api/data/refresh", (route) => route.fulfill({ status: 202, json: job }));
  await page.route("**/api/data/refresh/refresh-test", (route) => route.fulfill({ json: {
    ...job, status: finished ? "succeeded" : "running", finished_at: finished ? NOW.toISOString() : null,
  } }));
  await page.goto("#home");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
  await page.getByRole("button", { name: "사이드 메뉴 열기" }).click();
  const panel = page.getByRole("dialog", { name: "사이드 메뉴", exact: true });
  await panel.getByRole("button", { name: "데이터 새로고침", exact: true }).click();
  await expect(panel.getByRole("button", { name: "데이터 갱신 중…" })).toBeDisabled();
  await panel.getByRole("link", { name: "알림 설정", exact: true }).click();
  await expect(page.getByText("이 페이지에 저장된 알림 구독이 없습니다.", { exact: true })).toBeVisible();
  // StrictMode may start and abort the first owner-local read during mounting.
  const initialReads = notificationReads();
  expect(initialReads).toBeGreaterThan(0);
  finished = true;
  await page.clock.fastForward(3100);
  await expect.poll(notificationReads).toBe(initialReads + 1);
  await page.clock.fastForward(580000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(notificationReads()).toBe(initialReads + 1);
  await page.clock.fastForward(21100);
  await expect.poll(notificationReads).toBe(initialReads + 2);
});
