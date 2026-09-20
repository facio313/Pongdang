import { test, expect } from "@playwright/test";
import { conditionsFixture, routeRecommendation } from "./recommendation";

test("home uses the selected fallback beach ID, name and conditions consistently", async ({ page }) => {
  const beach = { id: 987, name: "해운대해수욕장", place_kind: "beach", region: "부산", address: null, lat: 35.16, lng: 129.16 };
  await page.route("**/api/data/water-index/default-place", route => route.fulfill({ json: {
    place: beach, rows: [beach], display_name: beach.name, status: "fallback", message: "경포 자료가 부족하여 다른 해수욕장의 수집 자료를 표시합니다.",
  } }));
  const ids: number[] = [];
  await page.route("**/api/data/water-index/conditions?**", route => {
    ids.push(Number(new URL(route.request().url()).searchParams.get("spot_id")));
    return route.fulfill({ json: {
      spot_id: 987, place_name: beach.name, activity: "swim", mode: "observation", at: new Date().toISOString(),
      metrics: [], context_metrics: [], safety_status: "unknown", support_status: "unknown", reason_codes: [],
      condition_score: { label: "활동 조건 참고 점수", model_id: "fixture", model_version: "1", methodology: "fixture", score: 73, status: "partial", coverage: 0.5, available_components: 2, total_components: 4, components: [], sources: [], reason_codes: [] },
    } });
  });
  await routeRecommendation(page, { activity: "swim", score: 73 });
  await page.goto("");
  await expect(page.locator(".hm-hero-place")).toContainText(beach.name);
  await expect(page.locator(".hm-hero-score-num")).toHaveText("73");
  await expect(page.locator(".home-page")).toContainText("경포 자료가 부족");
  // 시간대 예보는 히어로가 값을 말한 뒤에 나갑니다. 조회 기억(useResource)이
  // 들어오면서 첫 페인트가 빨라져 이 자리에서 아직 안 나간 상태가 되므로,
  // 순서에 기대지 않고 실제로 나갈 때까지 기다립니다 -- 확인하려는 것은
  // 「언제」가 아니라 **모든 조회가 고른 장소 id 를 쓰는가**입니다.
  await expect.poll(() => ids.length).toBeGreaterThan(0);
  expect(new Set(ids)).toEqual(new Set([987]));
  await page.goto("#today");
  await expect(page.locator(".td-hero .pd-lbl")).toContainText(beach.name);
  await expect(page.locator(".td-hero .pd-header")).toContainText("부산");
});

test("default beach errors are visible and never leave the placeholder checking state", async ({ page }) => {
  await page.route("**/api/data/water-index/default-place", route => route.fulfill({ status: 503, json: { detail: "unavailable" } }));
  await page.goto("");
  await expect(page.locator(".hm-hero-place")).toContainText("장소 선택 필요");
  await expect(page.locator(".hm-hero-place")).not.toContainText("강릉 경포대 해수욕장");
  await expect(page.locator(".home-page")).toContainText("요청을 처리하지 못했습니다");
  await expect(page.locator(".home-page")).not.toContainText("장소 확인 중");
});

for (const width of [390, 1440]) {
  test(`${width}px home and today share a selected reference place across pages and reloads`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const places = Array.from({ length: 105 }, (_, index) => ({
      id: index + 1001, name: `기준 장소 TEST ${String(index + 1).padStart(3, "0")}`,
      place_kind: "beach", region: index < 100 ? "강릉" : "속초", address: null,
      province_code: "gangwon", district_code: index < 100 ? "gangneung" : "sokcho",
      lat: 37.8, lng: 128.9,
    }));
    let emptyDistrict = false;
    let releaseFailedDistrict!: () => void;
    const heldDistrict = new Promise<void>(resolve => { releaseFailedDistrict = resolve; });
    const queriedIds: number[] = [];
    await page.route("**/api/data/regions", route => route.fulfill({ json: {
      provinces: [{ code: "gangwon", label: "강원특별자치도", districts: [
        { code: "gangneung", label: "강릉시" }, { code: "sokcho", label: "속초시" },
        { code: "yanggu", label: "양구군" },
      ] }],
    } }));
    await page.route("**/api/data/water-index/default-place", route => route.fulfill({ json: {
      place: places[0], rows: [places[0]], display_name: places[0].name,
      status: "preferred", message: "TEST default reference",
    } }));
    await page.route("**/api/data/places?**", async route => {
      const query = new URL(route.request().url()).searchParams;
      expect(query.get("page_size")).toBe("100");
      expect(query.get("province")).toBe("gangwon");
      if (query.get("district") === "sokcho") {
        await heldDistrict;
        return route.fulfill({ status: 503, json: { detail: "fixture unavailable" } });
      }
      const rows = places.filter(place => (!query.get("district") || query.get("district") === place.district_code) &&
        (!query.get("q") || place.name.includes(query.get("q")!)));
      const currentPage = Number(query.get("page"));
      if (query.get("district") === "yanggu") emptyDistrict = true;
      return route.fulfill({ json: { rows: rows.slice((currentPage - 1) * 100, currentPage * 100),
        total: rows.length, page: currentPage, page_size: 100, has_more: currentPage * 100 < rows.length } });
    });
    await page.route("**/api/data/livecams/preview/places?spot_id=**", route => {
      const id = Number(new URL(route.request().url()).searchParams.get("spot_id"));
      return route.fulfill({ json: places.filter(place => place.id === id) });
    });
    await page.route("**/api/data/water-index/recommendation?**", route => {
      const id = Number(new URL(route.request().url()).searchParams.get("spot_id"));
      queriedIds.push(id);
      const choice = { activity: "swim", score: id === places[0].id ? 73 : 42 };
      return route.fulfill({ json: {
        contract_version: "water-recommendation.v1", spot_id: id, at: new Date().toISOString(),
        as_of: new Date().toISOString(), mode: "observation", choice: { ...choice, status: "evaluated" },
        conditions: [{ ...conditionsFixture(choice), spot_id: id }], ranked: [], reasons: [], tide: null,
        alternatives: [], rules: [], limitations: [], reason_codes: [],
      } });
    });
    await page.goto("#home");
    const homeScore = page.locator(width < 1080 ? ".hm-hero-score-num" : ".hd-hero-score-num");
    await expect(homeScore).toHaveText("73");
    const selector = page.locator(".product-place-selector");
    await selector.locator("summary").click();
    await expect(selector.getByLabel("홈·오늘 기준 장소").locator("option")).toHaveCount(101);
    await selector.getByRole("button", { name: "다음", exact: true }).click();
    await expect(homeScore).toHaveText("–");
    await expect(selector.getByLabel("홈·오늘 기준 장소").locator("option")).toHaveCount(6);
    await selector.getByLabel("홈·오늘 기준 장소").selectOption(String(places[104].id));
    await expect(homeScore).toHaveText("42");
    await expect.poll(() => queriedIds.includes(places[104].id)).toBe(true);
    await page.goto("#today");
    await expect(page.locator(width < 1080 ? ".td-hero" : ".pd-dk-nav")).toContainText(places[104].name);
    await page.reload();
    await expect(page.locator(width < 1080 ? ".td-hero" : ".pd-dk-nav")).toContainText(places[104].name);
    await page.locator(".product-place-selector summary").click();
    await expect(page.getByLabel("홈·오늘 기준 장소")).toHaveValue(String(places[104].id));
    await page.getByLabel("시군 선택").selectOption("sokcho");
    try {
      await expect(page.locator(".product-place-selector").getByRole("status")).toContainText("장소 조회 중");
      await expect(page.locator(width < 1080 ? ".td-hero" : ".pd-dk-nav")).not.toContainText(places[104].name);
      await expect(page.getByLabel("홈·오늘 기준 장소")).toBeDisabled();
    } finally { releaseFailedDistrict(); }
    await expect(page.locator(".product-place-selector").getByRole("alert")).toContainText("요청을 처리하지 못했습니다");
    await page.getByLabel("시군 선택").selectOption("yanggu");
    await expect.poll(() => emptyDistrict).toBe(true);
    await expect(page.getByRole("status").filter({ hasText: "선택한 지역·검색어에 해당하는 장소가 없습니다." })).toBeVisible();
    await expect(page.locator(width < 1080 ? ".td-hero" : ".pd-dk-nav")).not.toContainText(places[104].name);
    await expect(page.getByLabel("홈·오늘 기준 장소")).toBeDisabled();
    await page.goto("#home");
    await expect(homeScore).toHaveText("–");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
