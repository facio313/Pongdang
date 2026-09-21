import { test, expect, type Page } from "@playwright/test";
import type { PlaceDetails } from "../../src/placeDetails";

const places = [
  { id: 41, name: "OFFLINE TEST 해변", lat: 37.8, lng: 128.9 },
  { id: 42, name: "OFFLINE TEST 이웃 해변", lat: 37.81, lng: 128.9 },
  { id: 43, name: "OFFLINE TEST 먼 해변", lat: 37.9, lng: 128.9 },
].map((place) => ({ ...place, address: "강원특별자치도 강릉시", region: "강릉시", province_code: "gangwon", district_code: "gangneung", place_kind: "beach" }));

const storedDetail: PlaceDetails = {
  spot_id: 41, status: "available", provider: "한국관광공사 TourAPI", source_id: "fixture-41", content_type: "12",
  fetched_at: "2026-09-20T12:00:00Z", source_modified_at: "2026-09-19T12:00:00Z",
  refresh_pending: false, refresh_failed: false,
  opening_hours: "09:00–18:00", rest_days: "매주 월요일", opening_period: null, opening_date: "1982-05-01",
  parking: "주차장 30면", facilities: "샤워실\n화장실", contact: "033-000-0000", homepage: "https://example.test/place",
  overview: '<img src=x onerror="alert(1)"> 원문 소개',
  details: [{ section: "info", key: "pets", label: "반려동물 안내", value: "목줄 착용" }],
};

/** Every API response is intercepted; these tests never access a provider or DB. */
async function mockStoredPlaces(page: Page, detail: () => PlaceDetails = () => storedDetail) {
  const reads: number[][] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.split("/api/")[1];
    if (path === "data/place-details") {
      expect(route.request().method()).toBe("GET");
      const ids = url.searchParams.get("spot_ids")!.split(",").map(Number);
      reads.push(ids);
      return route.fulfill({ json: { items: ids.map((id) => ({ ...detail(), spot_id: id })) } });
    }
    if (path === "data/places") return route.fulfill({ json: { rows: places, total: places.length, page: 1, page_size: 100, has_more: false } });
    if (path === "data/livecams/preview/places") return route.fulfill({ json: places.filter((place) => place.id === Number(url.searchParams.get("spot_id"))) });
    if (path === "data/datasets/spots") return route.fulfill({ json: {
      rows: places.filter((place) => place.id === Number(url.searchParams.get("filter_value"))).map((place) => ({ ...place, type: "tourism", catalog_verification: null })), total: 1,
    } });
    if (path === "data/attachments") return route.fulfill({ json: { items: [] } });
    if (path === "data/travel/signals") return route.fulfill({ json: { rows: [] } });
    if (path === "data/regions") return route.fulfill({ json: { provinces: [{ code: "gangwon", label: "강원도", districts: [{ code: "gangneung", label: "강릉시" }] }] } });
    if (path === "data/water-index/default-place") return route.fulfill({ json: { place: places[0], rows: places } });
    return route.fulfill({ status: 503, json: { detail: "offline fixture: optional service unavailable" } });
  });
  return reads;
}

for (const width of [390, 1440]) {
  test(`${width}px detail reads stored fields, preserves original text, and distinguishes opening date from season`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const reads = await mockStoredPlaces(page);
    await page.goto("#spots?spot_id=41");
    const info = page.getByRole("region", { name: "명소 상세정보" });
    await expect(info).toContainText("09:00–18:00");
    await expect(info).toContainText("매주 월요일");
    await expect(info).toContainText("주차장 30면");
    await expect(info).toContainText("샤워실");
    await expect(info).toContainText("033-000-0000");
    await expect(info.locator("dt").filter({ hasText: /^개장일$/ }).locator("..")).toContainText("1982-05-01");
    const season = info.locator("dt").filter({ hasText: /^개장 기간$/ }).locator("..");
    await expect(season).toContainText("정보 미제공");
    await expect(season).not.toContainText("1982");
    await expect(info).toContainText(storedDetail.overview!);
    await expect(info.locator("img,script")).toHaveCount(0);
    await expect(info.getByRole("link", { name: storedDetail.homepage! })).toHaveAttribute("href", storedDetail.homepage!);
    await info.locator("summary").click();
    await expect(info).toContainText("목줄 착용");
    await expect(info).toContainText("출처: 한국관광공사 TourAPI");
    await expect(info).toContainText("수집일:");
    await expect(info).not.toContainText("API 가 아직 없습니다");
    await expect(page.locator("body")).not.toContainText("아직 실연동되지 않은 항목");
    expect(reads).toEqual([[41]]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`${width}px list batches details once and reuses them across layout changes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const reads = await mockStoredPlaces(page);
    await page.goto("#spots");
    const rows = page.locator(width < 1080 ? ".sp-row-hours" : ".sk-row-hours");
    await expect(rows).toHaveCount(3);
    await expect(rows).toContainText(["09:00–18:00", "09:00–18:00", "09:00–18:00"]);
    if (width >= 1080) await expect(page.locator("body")).not.toContainText("아직 실연동되지 않은 항목");
    expect(reads).toEqual([[41, 42, 43]]);
    await page.setViewportSize({ width: width < 1080 ? 1440 : 390, height: 1000 });
    await expect(page.locator(width < 1080 ? ".sk-row-hours" : ".sp-row-hours")).toHaveCount(3);
    await page.waitForLoadState("networkidle");
    expect(reads).toEqual([[41, 42, 43]]);
  });
}

test("collection states remain distinct and a failed refresh keeps stored details", async ({ page }) => {
  let detail: PlaceDetails = { ...storedDetail, status: "pending", fetched_at: null, refresh_pending: true, opening_hours: null, rest_days: null, opening_period: null, opening_date: null, parking: null, facilities: null, contact: null, homepage: null, overview: null, details: [] };
  await mockStoredPlaces(page, () => detail);
  await page.goto("#spots?spot_id=41");
  const info = page.getByRole("region", { name: "명소 상세정보" });
  await expect(info).toContainText("상세정보를 아직 수집하지 않았습니다.");
  await expect(info).not.toContainText("이전에 저장한 정보");
  for (const [status, message] of [
    ["empty", "제공처에서 상세정보를 제공하지 않았습니다."],
    ["failed", "상세정보 수집에 실패했습니다."],
    ["unmatched", "이 장소와 연결된 관광 상세정보가 없습니다."],
    ["unsupported", "이 장소는 상세정보 수집 대상이 아닙니다."],
  ] as const) {
    detail = { ...detail, status, refresh_pending: false, refresh_failed: status === "failed" };
    await page.reload();
    await expect(info).toContainText(message);
    await expect(info).not.toContainText("이전에 저장한 정보");
  }
  detail = { ...storedDetail, refresh_pending: true };
  await page.reload();
  await expect(info).toContainText("09:00–18:00");
  await expect(info).toContainText("변경된 상세정보의 수집을 기다리는 동안 이전에 저장한 정보를 표시합니다.");
  detail = { ...storedDetail, refresh_failed: true, homepage: "javascript:alert(1)" };
  await page.reload();
  await expect(info).toContainText("09:00–18:00");
  await expect(info).toContainText("최신 상세정보 수집에 실패하여 이전에 저장한 정보를 표시합니다.");
  await expect(info.getByRole("link")).toHaveCount(0);
  await expect(info).toContainText("javascript:alert(1)");
});

test("distance requires an explicit location click and uses coordinates without a directions request", async ({ page }) => {
  await mockStoredPlaces(page);
  await page.addInitScript(() => {
    let requests = 0;
    Object.defineProperty(window, "locationRequests", { get: () => requests });
    Object.defineProperty(navigator, "geolocation", { value: {
      getCurrentPosition: (success: PositionCallback) => {
        requests += 1;
        success({ coords: { latitude: 37.9, longitude: 128.9 } } as GeolocationPosition);
      },
    } });
  });
  const routeCalls: string[] = [];
  page.on("request", (request) => {
    if (/directions|route-recommendation/.test(request.url())) routeCalls.push(request.url());
  });
  await page.goto("#spots?spot_id=41");
  const distance = page.locator(".place-distance");
  await expect(distance.locator("strong")).toHaveText("–");
  expect(await page.evaluate(() => Reflect.get(window, "locationRequests"))).toBe(0);
  await page.getByRole("button", { name: "현재 위치로 거리 보기" }).click();
  await expect(distance.locator("strong")).toHaveText("11.1 km");
  await expect(distance).toContainText("기준: 현재 위치");
  expect(await page.evaluate(() => Reflect.get(window, "locationRequests"))).toBe(1);
  expect(routeCalls).toEqual([]);
});

test("desktop related places show coordinate distances from the selected place", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockStoredPlaces(page);
  await page.goto("#spots?spot_id=41");
  await expect(page.locator(".sk-nearby-name")).toHaveText(["OFFLINE TEST 이웃 해변", "OFFLINE TEST 먼 해변"]);
  await expect(page.locator(".sk-nearby-distance")).toHaveText(["1.1 km", "11.1 km"]);
  await expect(page.locator(".sk-nearby-note")).toContainText("이 명소의 좌표를 기준");
});
