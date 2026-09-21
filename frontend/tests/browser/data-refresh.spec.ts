import { test, expect, type Page } from "@playwright/test";

const NOW = new Date("2026-09-21T03:00:00Z");
const place = { id: 1, name: "갱신 테스트 해변", place_kind: "beach", region: "강릉시", address: "강원도 강릉시", lat: 37.8, lng: 128.9 };
const job = { request_id: "refresh-test", status: "queued", requested_at: NOW.toISOString(), finished_at: null as string | null, failed_jobs: [] as string[] };

function conditions(score: number, validUntil: string) {
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
    else if (path.endsWith("/places")) data = { rows: [place], total: 1, page: 1, page_size: 100, has_more: false };
    await route.fulfill({ json: data });
  });
  return { reads, current, recommendationReads: () => reads.filter((path) => path.endsWith("/water-index/recommendation")).length };
}

test("expired scores clear immediately but automatic data reads wait ten minutes", async ({ page }) => {
  const mocked = await mockCommon(page, 10000);
  await page.goto("#home");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
  await expect.poll(() => mocked.reads.filter((path) => path.endsWith("/conditions/series")).length).toBe(1);
  expect(mocked.reads.filter((path) => path.endsWith("/conditions"))).toHaveLength(0);
  await page.clock.fastForward(10001);
  await expect(page.locator(".hm-hero-score-num")).toHaveText("–");
  await page.clock.fastForward(580000);
  expect(mocked.recommendationReads()).toBe(1);
  await page.clock.fastForward(11000);
  await expect.poll(mocked.recommendationReads).toBe(2);
  await expect(page.locator(".hm-hero-score-num")).toHaveText("–");
});

test("a failed automatic refresh waits another ten minutes instead of retrying expired cache", async ({ page }) => {
  await mockCommon(page);
  let requests = 0;
  await page.route("**/api/data/water-index/recommendation?**", (route) => {
    requests += 1;
    return requests === 1 ? route.fallback()
      : route.fulfill({ status: 503, json: { detail: "unavailable" } });
  });
  await page.goto("#home");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
  await page.clock.fastForward(600100);
  await expect.poll(() => requests).toBe(2);
  await page.clock.fastForward(30000);
  expect(requests).toBe(2);
});

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
  await panel.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(panel.getByRole("button", { name: "새로고침 중…" })).toBeDisabled();
  expect(submitted).toBe(1);
  expect(mocked.recommendationReads()).toBe(1);
  await page.clock.fastForward(3100);
  await expect.poll(() => polls).toBe(1);
  expect(mocked.recommendationReads()).toBe(1);
  // Closing and reopening the menu must not restart the job or its polling.
  await panel.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "사이드 메뉴 열기" }).click();
  await expect(panel.getByRole("button", { name: "새로고침 중…" })).toBeDisabled();
  await page.clock.fastForward(3100);
  await expect(panel.getByRole("status")).toHaveText("최신 자료와 점수를 갱신했습니다.");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("81");
  expect(submitted).toBe(1);
  expect(mocked.recommendationReads()).toBe(2);
  expect(mocked.reads.filter((path) => path.endsWith("/water-index/default-place"))).toHaveLength(2);
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
  await panel.getByRole("button", { name: "새로고침", exact: true }).click();
  await page.clock.fastForward(3100);
  await expect(panel.getByRole("button", { name: "상태 다시 확인" })).toBeEnabled();
  expect(mocked.recommendationReads()).toBe(1);
  await panel.getByRole("button", { name: "상태 다시 확인" }).click();
  await expect(panel.getByRole("status")).toHaveText("일부 자료 또는 점수를 갱신하지 못했습니다. 다시 시도해 주세요.");
  await expect.poll(mocked.recommendationReads).toBe(2);
  expect(submitted).toBe(1);
});

test("owner-only notification reads follow ten minutes and the shared manual completion signal", async ({ page }) => {
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
  await panel.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(panel.getByRole("button", { name: "새로고침 중…" })).toBeDisabled();
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
