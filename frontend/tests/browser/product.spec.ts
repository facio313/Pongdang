import { test, expect } from "@playwright/test";
import { ACTIVITY_LABEL, headlineOf, routeRecommendation, serverRecommendation } from "./recommendation";

test("home and today render calculated server condition scores and their evidence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("");
  await expect(page.locator(".hm-hero-place")).toContainText("강릉 경포대 해수욕장");
  const placeResponse = await page.request.get("api/data/datasets/spots?page_size=100&q=강릉");
  const places = await placeResponse.json();
  const place = places.rows.find((item: { name: string }) => item.name.includes("경포"));
  const response = await page.request.get(`api/data/water-index/conditions?spot_id=${place.id}&activity=swim&mode=observation`);
  const conditions = await response.json();
  expect(conditions.environment_score).toBeNull();
  expect(conditions.condition_score.score).toEqual(expect.any(Number));

  // 홈 히어로는 수영 한 종목도, 화면이 고른 최고점도 아닙니다. **서버가**
  // 규칙으로 고른 활동입니다(water-index/recommendation). 화면이 따로 고르지
  // 않는다는 것이 이 검사의 요지이므로, 기대값을 다시 계산하지 않고 그 응답을
  // 그대로 읽습니다.
  const recommendation = await serverRecommendation(page, place.id);
  const best = recommendation.choice!;
  const bestLabel = ACTIVITY_LABEL[best.activity];
  // 고른 활동의 조건 응답. 아래 항목 막대가 이 구성을 따릅니다.
  const bestConditions = await (
    await page.request.get(`api/data/water-index/conditions?spot_id=${place.id}&activity=${best.activity}&mode=observation`)
  ).json();

  await expect(page.locator(".hm-hero-score-num")).toHaveText(String(best.score));
  // 무엇의 점수인지를 화면이 말해야 합니다. 예전에는 「퐁당 72」뿐이었습니다.
  await expect(page.locator(".hm-hero-sentence")).toContainText(headlineOf(best.activity));
  await expect(page.locator(".hm-hero-score .pd-grade-chip")).toContainText(`${bestLabel} 적합도`);
  // 척도 위 상대 위치. 색만으로 전하지 않으므로 aria-label 에 점수와 등급이 함께 있습니다.
  await expect(page.locator(".pd-hero .pd-gauge")).toHaveAttribute("aria-label", new RegExp(`^${best.score}점 .+ · 100점 만점$`));
  // 왜 이 활동인가. 서버가 사유 코드를 준 경우에만 줄이 섭니다 -- 없으면 화면이
  // 문장을 지어내지 않는다는 뜻이므로 그쪽도 사실입니다.
  if (recommendation.reasons.length)
    await expect(page.locator(".pd-hero .pd-why-line").first()).toBeVisible();
  await expect(page.locator(".hm-hero-note")).toContainText("근거 확보");

  // 「오늘 한눈에」는 이제 그 점수를 이루는 항목들입니다. 항목 구성은 활동마다
  // 다르므로 고정 네 칸이 아니라 서버가 준 components 를 그대로 따릅니다.
  const components = bestConditions.condition_score.components;
  await expect(page.locator(".pd-cbar")).toHaveCount(components.length);
  const bar = (label: string) =>
    page.locator(".pd-cbar").filter({ has: page.getByText(label, { exact: true }) });
  await expect(bar(components[0].label).locator(".pd-cbar-label")).toHaveText(components[0].label);
  // 수질은 점수 입력이 아니므로 항목 줄에서 빠지고, 그 사실을 배지로 밝힙니다.
  await expect(page.locator(".hm-glance-aside-value")).toHaveText("2등급 · 과거");
  await expect(page.locator(".hm-glance-aside")).toContainText("점수 미반영");
  await expect(page.locator(".pd-cbars")).not.toContainText("수질");
  await expect(page.locator(".home-page .pd-body")).toContainText("300일 전 과거 자료");
  // 히어로 관측 패널은 이름과 값이 <dt>/<dd> 로 나뉩니다(예전에는 한 문장
  // 안의 「기온 24.7°C」였습니다). 값이 어느 이름에 붙는지까지 확인합니다.
  const heroMetric = (name: string) =>
    page.locator(".hm-hero-metrics div").filter({ has: page.getByText(name, { exact: true }) });
  await expect(heroMetric("기온").locator("dd")).toHaveText("24.7°C");
  await expect(heroMetric("수온").locator("dd")).toHaveText("21.3°C");
  await expect(page.getByRole("table", { name: "오늘 시간대별 수집 예보" })).toBeVisible();
  await page.getByRole("link", { name: "오늘", exact: true }).click();
  await expect(page.locator(".td-hero-score-num")).toHaveText(String(conditions.condition_score.score));
  await expect(page.locator(".td-hero-note")).toContainText("대표 관측소");
  await expect(page.locator(".td-tile-value").nth(2)).toHaveText("21.3°C");
  await expect(page.locator(".td-tile-value").nth(3)).toHaveText("2등급 · 과거");
  await expect(page.getByRole("heading", { name: "수질 등급 · 최근 검사 · A8" })).toBeVisible();
  await expect(page.locator(".td-act")).toHaveCount(5);
  // 근거는 활동 6개의 <details> 6줄이 아니라 하나로 합치고 활동을 셀렉트로
  // 고릅니다. 기본값이 수영이므로 그대로 펴서 확인합니다.
  await page.getByText("분야별 근거 확인", { exact: true }).click();
  const activityDetails = page.locator("details.td-basis");
  await expect(activityDetails.getByLabel("활동")).toHaveValue("swim");
  await activityDetails.getByText("분야별 점수·산정 기준·출처", { exact: true }).click();
  await expect(activityDetails).toContainText("수온 21.3°C");
  await expect(activityDetails).toContainText("산술평균");
  // 활동을 바꾸면 그 활동의 근거로 갈립니다.
  await activityDetails.getByLabel("활동").selectOption("surf");
  await expect(activityDetails.getByLabel("활동")).toHaveValue("surf");
  await expect(page.locator(".td-tide-now")).not.toContainText("12:34");
  await page.screenshot({
    path: "test-results/today-connected.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("home and map use actual category-classified beaches when only the address contains the city", async ({ page }) => {
  const selectedPlace = { id: 71, name: "경포", place_kind: "beach", region: "", address: "강원특별자치도 강릉시 창해로", lat: 37.8, lng: 128.9 };
  await page.route("**/api/data/water-index/default-place", (route) => route.fulfill({ json: {
    place: selectedPlace, rows: [selectedPlace], display_name: "강릉 경포대 해수욕장", status: "preferred", message: "기본 해수욕장 자료",
  } }));
  await page.route("**/api/data/livecams/preview/places?**", (route) => route.fulfill({ json: [{
    id: 71, name: "경포", place_kind: "beach", region: "", address: "강원특별자치도 강릉시 창해로", lat: 37.8, lng: 128.9,
  }] }));
  // This is the collected provider's raw type, not the classified product type.
  await page.route("**/api/data/datasets/spots?**", (route) => route.fulfill({ json: { rows: [
    { id: 99, name: "강릉 약국", type: "pharmacy_search_result", region: "강릉" },
    { id: 71, name: "경포", type: "beach_search_result", region: "", address: "강원특별자치도 강릉시 창해로" },
  ], total: 2 } }));
  const requestedIds: number[] = [];
  await page.route("**/api/data/water-index/conditions?**", (route) => {
    requestedIds.push(Number(new URL(route.request().url()).searchParams.get("spot_id")));
    return route.fulfill({ json: {
      spot_id: 71, activity: "swim", mode: "observation", at: new Date().toISOString(),
      safety_status: "unknown", environment_score: null, metrics: [], reason_codes: [],
      condition_score: { label: "활동 조건 참고 점수", model_id: "fixture", model_version: "1", methodology: "fixture", status: "partial", score: 67.1, coverage: 0.75, available_components: 3, total_components: 4, components: [], sources: [], reason_codes: [] },
    } });
  });
  await routeRecommendation(page, { activity: "swim", score: 67.1 });
  await page.goto("");
  await expect(page.locator(".hm-hero-place")).toContainText("경포");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("67.1");
  await page.goto("#map");
  await expect(page.locator(".mp-spot-name")).toHaveText("경포");
  await expect(page.locator(".mp-spot-score-num")).toHaveText("67.1");
  expect(requestedIds.length).toBeGreaterThan(0);
  expect(requestedIds.every((id) => id === 71)).toBe(true);
});

test("missing observations use an explicitly labelled forecast and never bypass a restriction", async ({ page }) => {
  let blocked = false;
  let forecasts = 0;
  // 관측 점수가 없을 때 예보로 물러서는 것은 이제 서버가 합니다
  // (recommendation_api.read_activity). 화면은 그 결과를 예보라고 밝혀 그리고,
  // 공식 제한이면 점수를 만들지 않는지만 봅니다.
  await page.route("**/api/data/water-index/conditions?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") === "forecast" && url.searchParams.get("at")?.endsWith("Z"))
      forecasts++;
    await route.continue();
  });
  const envelope = () => ({
    spot_id: 1, place_name: "OFFLINE TEST", activity: "swim",
    mode: blocked ? "observation" : "forecast", at: new Date().toISOString(),
    as_of: new Date().toISOString(), safety_status: blocked ? "restricted" : "unknown",
    support_status: "unknown", restriction_refs: [], environment_score: null,
    metrics: [], context_metrics: [], display_metrics: [], missing_metrics: [],
    required_evidence: [], reason_codes: [],
    condition_score: {
      label: "활동 조건 참고 점수", model_id: "browser-fixture", model_version: "1",
      methodology: "fixture", score: blocked ? null : 81,
      status: blocked ? "blocked" : "partial",
      coverage: blocked ? 0 : 0.25, available_components: blocked ? 0 : 1,
      total_components: 4, components: [], sources: [], reason_codes: [],
    },
  });
  await routeRecommendation(
    page,
    () => (blocked ? null : { activity: "swim", score: 81 }),
    { get conditions() { return [envelope()]; } },
  );
  await page.goto("");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("81");
  await expect(page.locator(".hm-hero-note")).toContainText("예보 기준");
  await expect(page.locator(".hm-hero-note")).toContainText("25% (1/4개)");
  await expect(page.locator(".hm-hero-note")).toContainText("안전 판정이 아닙니다");
  blocked = true;
  forecasts = 0;
  await page.reload();
  await expect(page.locator(".hm-hero-note")).toContainText("공식 제한 또는 활동 미지원으로 계산 보류");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("–");
  // 제한 상태를 예보로 우회하지 않습니다.
  expect(forecasts).toBe(0);
});

test("forecast date changes display that date's server score and clear unavailable days", async ({ page }) => {
  const targetDates: string[] = [];
  await page.route("**/api/data/water-index/conditions?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") !== "forecast") return route.continue();
    const at = url.searchParams.get("at")!;
    targetDates.push(at);
    const response = await route.fetch();
    const data = await response.json();
    const kst = new Date(Date.parse(at) + 9 * 3600000).toISOString();
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const isToday = kst.slice(0, 10) === today;
    await route.fulfill({ json: { ...data, condition_score: {
      ...data.condition_score, score: isToday ? 64.2 : null,
      status: isToday ? "partial" : "unavailable", coverage: isToday ? 0.5 : 0,
      available_components: isToday ? 2 : 0, total_components: 4,
    } } });
  });
  await page.goto("#today");
  await expect(page.locator(".td-bar-score").first()).toHaveText("64.2");
  await expect(page.locator(".td-bar-score").nth(1)).toHaveText("–");
  await page.locator(".td-bar").nth(1).click();
  await expect(page.locator(".td-bar-detail")).toContainText("평가값 없음");
  await expect(page.locator(".td-bar-detail .pd-grade-chip-num")).toHaveText("–");
  await page.locator(".td-bar").first().click();
  await expect(page.locator(".td-bar-detail .pd-grade-chip-num")).toHaveText("64.2");
  expect(new Set(targetDates.filter((value) => value.endsWith("T03:00:00.000Z"))).size).toBe(7);
  await page.unrouteAll({ behavior: "wait" });
});

test("mobile weekly forecast reports failed reads instead of missing scores", async ({ page }) => {
  await page.route("**/api/data/water-index/conditions?**", (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "forecast")
      return route.continue();
    return route.fulfill({ status: 503, json: { detail: "test read timeout" } });
  });
  await page.goto("#today");
  await expect(page.locator(".td-bar-score")).toHaveText(Array(7).fill("조회 실패"));
  await expect(page.getByRole("button", { name: /오늘 .*조회 실패/ })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "다시 시도해 주세요." })).toBeVisible();
});

test("saved course scores use its actual date and never query unsupported history", async ({ page }) => {
  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const savedAt = day + "T15:30:00+09:00";
  const request = { activity: "swim", dates: [day], preferred_tags: [] };
  const item = { item_id: "today-stop", spot_id: 999, name: "선택 날짜 TEST", arrival_at: savedAt, departure_at: null, role: "visit", unknown_conditions: [] };
  const plan = { plan_id: "current-plan", request, days: [{ date: day, items: [item] }], input_stops: [], status: "partial", route_status: "unplanned", unresolved: [] };
  const oldPlan = { ...plan, plan_id: "old-plan", request: { ...request, dates: ["2000-01-01"] }, days: [{ date: "2000-01-01", items: [{ ...item, item_id: "old-stop", spot_id: 998, arrival_at: null }] }] };
  await page.route("**/api/data/travel/plans?**", (route) => route.fulfill({ json: { rows: [plan, oldPlan] } }));
  const targets: string[] = [];
  await page.route("**/api/data/water-index/conditions?**", async (route) => {
    const url = new URL(route.request().url());
    targets.push(url.searchParams.get("at")!);
    await route.fulfill({ json: {
      spot_id: 999, activity: "swim", mode: "forecast", at: savedAt,
      safety_status: "unknown", environment_score: null, metrics: [], reason_codes: [],
      condition_score: { label: "활동 조건 참고 점수", model_id: "fixture", model_version: "1", methodology: "fixture", status: "partial", score: 73.5, coverage: 0.5, available_components: 2, total_components: 4, components: [], sources: [], reason_codes: [] },
    } });
  });
  await page.goto("#my-courses");
  await expect(page.locator(".mc-row")).toHaveCount(2);
  expect(targets).toEqual([]);
  await page.locator(".mc-row").first().click();
  await expect(page.locator(".mc-row").first().locator(".mc-score-badge")).toHaveText("73.5");
  await expect(page.locator(".pd-card:has(.mc-detail-list)")).toContainText("첫 장소 참고점수");
  await expect(page.locator(".pd-card:has(.mc-detail-list)")).toContainText(savedAt);
  expect(targets.length).toBeGreaterThan(0);
  expect(targets.every((target) => target === savedAt)).toBe(true);
  targets.length = 0;
  await page.locator(".mc-row").nth(1).click();
  await expect(page.locator(".mc-row").nth(1).locator(".mc-score-badge")).toHaveText("–");
  await expect(page.locator(".pd-card:has(.mc-detail-list)")).toContainText("현재 기준 앞뒤 31일");
  expect(targets).toEqual([]);
});

test("a current score clears at its source expiry while refreshed evidence is loading", async ({ page }) => {
  const now = new Date("2026-09-16T03:00:00Z");
  await page.clock.install({ time: now });
  let requests = 0;
  let release!: () => void;
  const refresh = new Promise<void>((resolve) => { release = resolve; });
  // 만료는 추천 응답이 싣고 온 근거의 유효기간으로 잽니다. 두 번째 조회는
  // 붙잡아 두어, 갱신을 기다리는 동안 지난 점수가 남지 않는지 봅니다.
  const evidence = {
    provider: "TEST", observed_at: now.toISOString(), issued_at: null,
    fetched_at: now.toISOString(), valid_until: new Date(now.getTime() + 10000).toISOString(),
  };
  await page.route("**/api/data/water-index/recommendation?**", async (route) => {
    const number = ++requests;
    if (number > 1) await refresh;
    const fresh = number === 1;
    await route.fulfill({ json: {
      contract_version: "water-recommendation.v1", model_id: "pongdang-activity-recommendation",
      model_version: "1.0.0", scientific_validation: "not_evaluated",
      spot_id: 1, place_name: "TEST", place_kind: "beach",
      at: now.toISOString(), as_of: now.toISOString(), mode: "observation",
      choice: fresh ? { activity: "swim", score: 75, status: "partial" } : null,
      ranked: [], reasons: [], tide: null, alternatives: [],
      rules: [], limitations: [], reason_codes: [],
      conditions: [{
        spot_id: 1, place_name: "TEST", activity: "swim", mode: "observation",
        at: now.toISOString(), as_of: now.toISOString(), safety_status: "unknown",
        support_status: "unknown", restriction_refs: [], environment_score: null,
        context_metrics: [], display_metrics: [], missing_metrics: [],
        required_evidence: [], reason_codes: [],
        metrics: fresh ? [{ name: "water_temperature", label: "수온", station_id: 2,
          status: "available", value: 21, unit: "°C", relation: "representative_station",
          station_name: "TEST", evidence: [evidence] }] : [],
        condition_score: { label: "활동 조건 참고 점수", model_id: "fixture", model_version: "1",
          methodology: "fixture", status: fresh ? "partial" : "unavailable",
          score: fresh ? 75 : null, coverage: fresh ? 0.25 : 0,
          available_components: fresh ? 1 : 0, total_components: 4,
          components: fresh ? [{ metric: "water_temperature", label: "수온", value: 21,
            unit: "°C", score: 75, weight: 1, station_id: 2, status: "evaluated",
            reason_codes: [], criterion: "fixture" }] : [],
          sources: [], reason_codes: [] },
      }],
    } });
  });
  await page.goto("");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("75");
  await page.clock.fastForward(10001);
  await expect(page.locator(".hm-hero-score-num")).toHaveText("–");
  await expect.poll(() => requests).toBeGreaterThan(1);
  release();
  await expect(page.locator(".hm-hero-note")).toContainText("계산에 필요한 근거 부족");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("–");
});

test("preference → recommendation → persisted plan → selected plan detail", async ({
  page,
}) => {
  await page.goto("#recommend");
  await page
    .getByRole("button", { name: "태그로 바로 받기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "온천", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "온천", exact: true }).first().click();
  await page.getByRole("button", { name: "다음 · 카드로 확정하기" }).click();
  // 카드 수는 추천 후보가 바뀌면 함께 바뀝니다(갯벌이 빠지며 여섯에서 다섯이
  // 됐습니다). 횟수를 박아 두면 마지막 카드가 사라진 뒤를 누르게 되므로,
  // 화면이 세는 「N / M번째 카드」를 읽고 한 장씩 넘어간 것을 확인하며 누릅니다.
  const counter = page.getByText(/\d+ \/ \d+\s*번째 카드입니다/);
  const total = Number((await counter.innerText()).match(/\/\s*(\d+)/)![1]);
  for (let index = 1; index <= total; index++) {
    await expect(counter).toContainText(`${index} / ${total}`);
    await page.getByRole("button", { name: "패스", exact: true }).click();
  }
  await page.getByRole("button", { name: "취향 저장하고 코스 보기" }).click();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
  await page.route("**/api/data/travel/plans", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { detail: "fixture failure" } })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "내 코스에 저장", exact: true })
    .click();
  await expect(page.getByRole("alert").last()).toContainText(
    "요청을 처리하지 못했습니다",
  );
  await expect(
    page.getByRole("button", { name: "저장됨", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/data/travel/plans");
  await page
    .getByRole("button", { name: "내 코스에 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "저장됨", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "내 코스", exact: true }).click();
  await expect(page.locator(".mc-row")).toHaveCount(1);
  await page.reload();
  await page.locator(".mc-row").click();
  await expect(page.locator(".pd-card:has(.mc-detail-list)")).toContainText("OFFLINE TEST");
  await page.getByRole("link", { name: "코스 상세 열기" }).click();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
  await page.reload();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
  await page.screenshot({
    path: "test-results/recommend-connected.png",
    fullPage: true,
  });
});

test("map adds an actual place and requests a route only on explicit submit", async ({
  page,
}) => {
  let routeCalls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/travel/routes/recommend")) routeCalls++;
  });
  await page.goto("#map");
  await expect(page.locator(".mp-spot-name")).toContainText(
    "경포 OFFLINE TEST",
  );
  await expect(
    page.getByRole("link", { name: "길찾기", exact: true }),
  ).toHaveAttribute("href", /map.kakao.com\/link\/to/);
  await page.getByRole("button", { name: "코스에 넣기" }).click();
  await expect(page.locator(".mp-stop-name")).toHaveCount(1);
  expect(routeCalls).toBe(0);
  const originSelect = page.getByLabel("출발 장소", { exact: true });
  await expect(originSelect).toBeVisible();
  const origin = await originSelect
    .locator("option:not([value=''])")
    .nth(1)
    .getAttribute("value");
  await originSelect.selectOption(origin!);
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
  await page.getByLabel("출발 날짜와 시각").fill(`${tomorrow}T09:00`);
  await page.getByRole("button", { name: "선택 코스 경로 계산" }).click();
  await expect(page.locator(".mp-searchbar.is-course")).toContainText(
    "분 이동",
  );
  expect(routeCalls).toBe(1);
  await expect(
    page.locator(".map-page .pd-note").filter({ hasText: "출발 기준 교통 자료" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/map-connected.png",
    fullPage: true,
  });
});

test("empty and unauthenticated data stay explicit", async ({ page }) => {
  await page.route("**/api/data/water-index/default-place", (route) => route.fulfill({ json: {
    place: null, rows: [], display_name: "강릉 경포대 해수욕장", status: "no_places", message: "수집된 해수욕장이 없습니다. 수집기와 해변 자료 연동을 확인해야 합니다.",
  } }));
  await page.route("**/api/data/livecams/preview/places?**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/data/datasets/spots?**", (route) =>
    route.fulfill({ json: { rows: [], total: 0 } }),
  );
  await page.goto("");
  // 고를 활동이 없으면 «–» 입니다. 0 점이나 「안전함」으로 바뀌지 않습니다.
  await expect(page.locator(".hm-hero-score-num")).toHaveText("–");
  await expect(page.locator(".hm-hero-sentence")).toContainText("활동이 없어요");
  await expect(page.locator(".hm-glance-aside-value")).toHaveText("검사 자료 없음");
  await expect(page.locator(".home-page")).toContainText("점수를 이루는 항목을 읽지 못했습니다");
  await expect(page.locator(".hm-hero-place")).toContainText("강릉 경포대 해수욕장");
  await expect(page.locator(".home-page")).not.toContainText("장소 확인 중");
  await expect(page.locator(".home-page")).toContainText("수집된 해수욕장이 없습니다");
  await page.route("**/api/data/travel/**", (route) =>
    route.fulfill({
      status: 401,
      json: { detail: "SSO_AUTHENTICATION_REQUIRED" },
    }),
  );
  await page.goto("#my-courses");
  await expect(page.locator(".mc-row")).toHaveCount(0);
  await expect(page.locator(".mc-lead").first()).toContainText(
    "기존 SSO 로그인이 필요합니다.",
  );
});

test("chat answers reach the travel contract and the actual response is displayed", async ({
  page,
}) => {
  let body:
    | {
        message?: string;
        history?: { role: string; content: string }[];
        travel?: { action?: string; request?: { transport?: string } };
      }
    | undefined;
  page.on("request", (request) => {
    if (request.url().endsWith("/ai/chat")) body = request.postDataJSON();
  });
  await page.goto("#recommend");
  await page.getByRole("button", { name: "대화로 추천받기" }).click();
  // 예전에는 화면이 고정 3턴 대본을 들고 있어서, 칩을 세 번 누르면 대화가
  // 끝났습니다. 서버가 무엇을 되묻든 다음 질문이 정해져 있었던 것이라 대화가
  // 아니라 설문이었습니다. 이제 사람이 실제로 적어 보냅니다.
  const composer = page.getByLabel("컨시어지에게 보낼 내용");
  const send = page.getByRole("button", { name: "보내기" });
  await composer.fill("혼자 반나절 구경만 할래요");
  const first = page.waitForResponse((response) =>
    response.url().endsWith("/ai/chat"),
  );
  await send.click();
  await first;
  await expect(page.locator(".recommend-page")).toHaveAttribute("aria-busy", "false");

  await composer.fill("대중교통");
  const response = page.waitForResponse((response) =>
    response.url().endsWith("/ai/chat"),
  );
  await send.click();
  const result = await (await response).json();
  await expect(page.locator(".recommend-page")).toHaveAttribute("aria-busy", "false");
  expect(body?.travel?.action).toBe("conversation");
  expect(body?.message).toBe("대중교통");
  // 앞 턴이 히스토리로 함께 갑니다 -- 대화가 한 번씩 끊기지 않습니다.
  expect(
    body?.history?.some((turn) => turn.content === "혼자 반나절 구경만 할래요"),
  ).toBe(true);
  await expect(page.locator(".pd-ai-basis")).toContainText(/후보 \d+곳/);
  await expect(page.locator(".rc-chat")).toContainText(result.answer);
  await expect(page.locator(".rc-chat")).toContainText("OFFLINE TEST");
});

test("chat exchange dialog shows the sanitized model trace", async ({ page }) => {
  await page.route("**/api/data/ai/chat", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      json: {
        answer: "이번 여행은 이렇게 골라보시면 좋겠어요.",
        clarification: null,
        status: "available",
        fallback: false,
        reason_codes: [],
        model_trace: [
          { kind: "tool", name: "travel_recommend", arguments: { limit: 5 } },
          {
            kind: "plan",
            plan: { intent: "explain", clarification: null, sections: [] },
            error: null,
          },
        ],
      },
    });
  });
  await page.goto("#recommend");
  await page.getByRole("button", { name: "대화로 추천받기" }).click();
  await page.getByLabel("컨시어지에게 보낼 내용").fill("차량");
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(page.locator(".recommend-page")).toHaveAttribute("aria-busy", "false");
  await page.getByRole("button", { name: "주고받은 기록" }).click();
  const dialog = page.getByRole("dialog", { name: "주고받은 기록" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("travel_recommend");
  await expect(dialog).toContainText("explain");
  await expect(dialog).not.toContainText("37.123456789");
});

test("favorites and explicit notification settings use owner-scoped APIs", async ({
  page,
}) => {
  await page.goto("#map");
  await expect(page.locator(".mp-spot-name")).toContainText(
    "경포 OFFLINE TEST",
  );
  await page.getByRole("link", { name: "즐겨찾기 저장" }).click();
  await expect(page.locator(".feature-page table tbody tr")).toHaveCount(1);
  await page.goto("#first-swim");
  await page
    .getByLabel("알림 장소")
    .selectOption({ label: "강릉 경포 OFFLINE TEST 해변" });
  await page.getByLabel("선호 수온 기준 · °C").fill("19.5");
  // Keep the post-save refresh pending so both status messages coexist.
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route("**/api/data/notifications/subscriptions?**", async (route) => {
    await refreshGate;
    await route.continue();
  });
  await page.getByRole("button", { name: "앱 내 알림 구독 저장" }).click();
  try {
    await expect(
      page.getByRole("status").filter({ hasText: "알림 구독을 저장했습니다" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "실제 자료 조회 중" }),
    ).toBeVisible();
  } finally {
    releaseRefresh();
  }
  await expect(page.locator(".feature-page table tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".feature-page table")).toContainText("19.5");
});

test("a new place never displays the previous place’s observations", async ({
  page,
}) => {
  await page.goto("#map");
  await expect(page.locator(".mp-tile-value").first()).toHaveText("21.3°C");
  let release!: () => void;
  const nextPlace = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/data/water-index/conditions?**", async (route) => {
    await nextPlace;
    await route.continue();
  });
  await page.getByRole("searchbox", { name: "장소명·지역 검색" }).fill("계곡");
  try {
    await expect(page.locator(".mp-spot-name")).toContainText("계곡");
    await expect(page.locator(".mp-tile-value").first()).toHaveText("–");
    await expect(page.locator(".mp-tile-value").nth(1)).toHaveText("–");
  } finally {
    release();
  }
});

test("a proposed alternative changes a saved plan only after explicit apply", async ({
  page,
}) => {
  await page.goto("#my-courses");
  await page.locator(".mc-row").first().click();
  await page.getByRole("link", { name: "코스 상세 열기" }).click();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
  const id = new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get(
    "plan_id",
  );
  const before = await (
    await page.request.get(`api/data/travel/plans/${id}`)
  ).json();
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PUT" &&
      request.url().endsWith(`/travel/plans/${id}`)
    )
      writes++;
  });
  await page.getByRole("button", { name: "최신 조건으로 대안 조회" }).click();
  await expect(page.locator(".rc-swap-what").last()).toContainText(
    "OFFLINE TEST",
  );
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "대안으로 바꾸기" }).click();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
  expect(writes).toBe(1);
  const after = await (
    await page.request.get(`api/data/travel/plans/${id}`)
  ).json();
  expect(after.plan_id).toBe(before.plan_id);
  expect(after.revision).toBe(before.revision + 1);
});

test("추천 취향 항목은 서버 카탈로그에서 오고, 없는 이름을 만들지 않는다", async ({
  page,
}) => {
  // 태그 열두 개가 파일 안 상수였습니다 -- 「SUP」 · 「갯벌 체험」 · 「바다 뷰
  // 카페」 · 「주차 편한 곳」 · 「샤워장」 · 「반려동물」. 서버 카탈로그에 없는
  // 이름이라 골라도 서버가 할 수 있는 일이 없었고, 같은 함수가 바로 옆에서
  // travel/keywords 를 이미 조회하고 있었습니다.
  const catalogue = await (await page.request.get("api/data/travel/keywords")).json();
  const pickable = ["place_type", "activity", "companion", "atmosphere"];
  const served: string[] = catalogue.categories
    .filter((category: { id: string }) => pickable.includes(category.id))
    .flatMap((category: { options: { label: string }[] }) =>
      category.options.map((option) => option.label),
    );

  await page.goto("#recommend");
  await page.getByRole("button", { name: "태그로 바로 받기", exact: true }).click();
  const buttons = page.locator(".rc-tags .rc-tag");
  const labels = await buttons.allInnerTexts();
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels)
    expect(served, `서버에 없는 선택 항목: ${label}`).toContain(label.trim());
  // 카테고리 라벨도 서버가 준 것이며, 상한도 서버 값을 그대로 적습니다.
  await expect(page.locator(".recommend-page")).toContainText("장소 유형 · 최대 4개");

  // 활동 카드도 서버가 발행한 활동입니다.
  const activityLabels: string[] = catalogue.categories
    .find((category: { id: string }) => category.id === "activity")
    .options.map((option: { label: string }) => option.label);
  await page.getByRole("button", { name: "다음 · 카드로 확정하기" }).click();
  const counter = page.getByText(/\d+ \/ \d+\s*번째 카드입니다/);
  await expect(counter).toContainText(`/ ${activityLabels.length}`);
  await expect(page.locator(".rc-swipe-name")).toHaveText(activityLabels[0]);
});
