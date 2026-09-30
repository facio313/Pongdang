import { test, expect, type Page } from "@playwright/test";
import type { PlaceDetails } from "../../src/placeDetails";
import { byWidth, isDesktopWidth } from "./viewports";

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
  details: [
    { section: "intro", key: "usetime", label: "이용시간", value: "09:00–18:00" },
    { section: "intro", key: "parking", label: "주차시설", value: "주차장 30면" },
    { section: "intro", key: "infocenter", label: "문의및안내", value: "033-000-0000" },
    { section: "info", key: "pets", label: "반려동물 안내", value: "목줄 착용" },
  ],
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
    await expect(page.locator(".place-distance strong")).toHaveText("0 m");
    await expect(page.locator(".place-distance")).toContainText(`기준: ${places[0].name}`);
    await expect(info.getByRole("link", { name: storedDetail.homepage! })).toHaveAttribute("href", storedDetail.homepage!);
    await expect(info.getByRole("heading", { name: "추가 상세정보 1개", exact: true })).toBeVisible();
    await expect(info.locator(".place-details-extra .place-detail-item")).toHaveCount(1);
    await expect(info.getByText("목줄 착용", { exact: true })).toBeVisible();
    await expect(info).toContainText("출처: 한국관광공사 TourAPI");
    await expect(info).toContainText("수집일:");
    await expect(info).not.toContainText("API 가 아직 없습니다");
    await expect(page.locator("body")).not.toContainText("아직 실연동되지 않은 항목");
    if (isDesktopWidth(width)) {
      const introduction = await info.locator(".place-details-introduction").boundingBox();
      const extra = await info.locator(".place-details-extra").boundingBox();
      expect(introduction).not.toBeNull();
      expect(extra).not.toBeNull();
      expect(extra!.x).toBeGreaterThan(introduction!.x + introduction!.width);
      expect(Math.abs(extra!.y - introduction!.y)).toBeLessThan(1);
      expect(Math.abs(extra!.height - introduction!.height)).toBeLessThan(1);
    }
    await expect(page.locator(byWidth(width, ".pd-foot-body", ".pd-dk-foot-body"))).toHaveText("");
    expect(reads).toEqual([[41]]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`${width}px list batches details once and reuses them across layout changes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const reads = await mockStoredPlaces(page);
    await page.goto("#spots");
    const rows = page.locator(byWidth(width, ".sp-row-hours", ".sk-row-hours"));
    await expect(rows).toHaveCount(3);
    await expect(rows).toContainText(["09:00–18:00", "09:00–18:00", "09:00–18:00"]);
    if (isDesktopWidth(width)) await expect(page.locator("body")).not.toContainText("아직 실연동되지 않은 항목");
    expect(reads).toEqual([[41, 42, 43]]);
    await page.setViewportSize({ width: byWidth(width, 1440, 390), height: 1000 });
    await expect(page.locator(byWidth(width, ".sk-row-hours", ".sp-row-hours"))).toHaveCount(3);
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

for (const width of [390, 1440]) {
  test(`${width}px distance follows the home reference selection across changes and reloads without device location or directions`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
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
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("pongdang.product-place.v1")) {
        sessionStorage.setItem("pongdang.product-place.v1", JSON.stringify({
          mode: "selected", spotId: 43, district: "", search: "", page: 1,
        }));
      }
    });
    const routeCalls: string[] = [];
    page.on("request", (request) => {
      if (/directions|route-recommendation/.test(request.url())) routeCalls.push(request.url());
    });
    await page.goto("#spots?spot_id=41");
    const distance = page.locator(".place-distance");
    await expect(distance.locator("strong")).toHaveText("11.1 km");
    await expect(distance).toContainText(`기준: ${places[2].name}`);
    await expect(page.getByRole("button", { name: "현재 위치로 거리 보기" })).toHaveCount(0);
    await expect(page.getByText("좌표로 계산한 직선거리이며 도로 이동거리가 아닙니다.", { exact: true })).toHaveCount(0);

    await page.goto("#home");
    await page.getByRole("button", { name: `${places[2].name} · 장소 바꾸기`, exact: true }).click();
    await page.getByLabel("홈·오늘 기준 장소", { exact: true }).selectOption("42");
    await page.goto("#spots?spot_id=41");
    await expect(distance.locator("strong")).toHaveText("1.1 km");
    await expect(distance).toContainText(`기준: ${places[1].name}`);
    await page.reload();
    await expect(distance.locator("strong")).toHaveText("1.1 km");
    await expect(distance).toContainText(`기준: ${places[1].name}`);
    expect(await page.evaluate(() => Reflect.get(window, "locationRequests"))).toBe(0);
    expect(routeCalls).toEqual([]);
  });
}

test("an unavailable selected origin never borrows default coordinates or shows an empty distance row", async ({ page }) => {
  await mockStoredPlaces(page);
  await page.addInitScript(() => {
    sessionStorage.setItem("pongdang.product-place.v1", JSON.stringify({
      mode: "selected", spotId: 42, district: "", search: "", page: 1,
    }));
  });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/data/livecams/preview/places?spot_id=42", async (route) => {
    await pending;
    return route.fulfill({ json: [{ ...places[1], lat: null }] });
  });
  await page.goto("#spots?spot_id=41");
  try {
    await expect(page.getByRole("region", { name: "명소 상세정보" })).toContainText("09:00–18:00");
    await expect(page.locator(".place-distance")).toHaveCount(0);
  } finally {
    release();
  }
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".place-distance")).toHaveCount(0);
  await page.route("**/api/data/livecams/preview/places?spot_id=42", (route) => route.fulfill({ status: 503, json: { detail: "offline unavailable origin" } }));
  await page.reload();
  await expect(page.getByRole("region", { name: "명소 상세정보" })).toContainText("09:00–18:00");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".place-distance")).toHaveCount(0);
});

test("desktop related places show coordinate distances from the selected place", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockStoredPlaces(page);
  await page.goto("#spots?spot_id=41");
  await expect(page.locator(".sk-nearby-name")).toHaveText(["OFFLINE TEST 이웃 해변", "OFFLINE TEST 먼 해변"]);
  await expect(page.locator(".sk-nearby-distance")).toHaveText(["1.1 km", "11.1 km"]);
  await expect(page.locator(".sk-nearby-note")).toContainText("이 명소의 좌표를 기준");
});
