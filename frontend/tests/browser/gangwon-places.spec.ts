import { test, expect, type Page } from "@playwright/test";
import { conditionsFixture } from "./recommendation";

const places = Array.from({ length: 105 }, (_, index) => ({
  id: index + 1,
  name: `PAGE TEST ${String(index + 1).padStart(3, "0")}`,
  place_kind: index === 104 ? "valley" : "beach",
  province_code: "gangwon",
  district_code: index < 100 ? "gangneung" : "sokcho",
  region: index < 100 ? "51:150" : "51:210",
  address: index < 100 ? "강원특별자치도 강릉시" : "강원도 속초시",
  lat: 37.8 + index / 1000,
  lng: 128.9,
}));
const linkedPlace = { ...places[0], id: 999, name: "LINKED OUTSIDE PAGE", type: "beach", catalog_verification: null };

async function mockCatalog(page: Page) {
  const queries: Record<string, string>[] = [];
  const photos: number[][] = [];
  const summaries: number[][] = [];
  await page.route("**/api/data/regions", route => route.fulfill({ json: {
    provinces: [{ code: "gangwon", label: "강원특별자치도", districts: [
      { code: "gangneung", label: "강릉시" }, { code: "sokcho", label: "속초시" },
    ] }],
  } }));
  await page.route("**/api/data/places?**", route => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(Object.fromEntries(query));
    expect(query.get("province")).toBe("gangwon");
    expect(query.get("page_size")).toBe("100");
    const result = places.filter(place =>
      (!query.get("district") || place.district_code === query.get("district")) &&
      (!query.get("kind") || place.place_kind === query.get("kind")) &&
      (!query.get("q") || place.name.includes(query.get("q")!)),
    );
    const currentPage = Number(query.get("page") ?? 1);
    return route.fulfill({ json: {
      rows: result.slice((currentPage - 1) * 100, currentPage * 100),
      total: result.length, page: currentPage, page_size: 100, has_more: currentPage * 100 < result.length,
    } });
  });
  await page.route("**/api/data/water-index/default-place", route => route.fulfill({ json: {
    place: linkedPlace, rows: [linkedPlace], display_name: linkedPlace.name,
    status: "preferred", message: "TEST default outside this page",
  } }));
  await page.route("**/api/data/datasets/spots?**", route => route.fulfill({ json: {
    rows: [linkedPlace], total: 1,
  } }));
  await page.route("**/api/data/attachments?**", route => {
    photos.push(new URL(route.request().url()).searchParams.get("spot_ids")!.split(",").map(Number));
    return route.fulfill({ json: { items: [] } });
  });
  await page.route("**/api/data/water-index/conditions/summary?**", route => {
    const ids = new URL(route.request().url()).searchParams.get("spot_ids")!.split(",").map(Number);
    summaries.push(ids);
    return route.fulfill({ json: { rows: ids.map(spot_id => ({
      spot_id, place_name: null, support_status: "unknown", safety_status: "unknown", expires_at: null,
    })), unavailable: [] } });
  });
  await page.route("**/api/data/water-index/conditions?**", route => route.fulfill({ json: {
    ...conditionsFixture({ activity: "swim", score: 72 }),
    spot_id: Number(new URL(route.request().url()).searchParams.get("spot_id")),
  } }));
  return { queries, photos, summaries };
}

for (const width of [390, 1440]) {
  test(`Gangwon places at ${width}px page beyond 100 and reset the page for district and kind filters`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests = await mockCatalog(page);
    await page.goto("#spots");
    const rows = page.locator(width < 1080 ? ".sp-row" : ".sk-row");
    const pagination = page.getByRole("navigation", { name: "장소 목록 페이지" });
    await expect(rows).toHaveCount(100);
    await expect(rows.first()).toContainText("강릉시");
    await expect(rows.first()).not.toContainText("51:150");
    await expect(pagination).toContainText("전체 105곳 · 1/2페이지 · 현재 100곳");
    await expect(rows.filter({ hasText: linkedPlace.name })).toHaveCount(0);
    await pagination.getByRole("button", { name: "다음", exact: true }).click();
    await expect(rows).toHaveCount(5);
    await expect(rows.first()).toContainText("PAGE TEST 101");
    await expect(rows.first()).toContainText("속초시");
    await expect(rows.first()).not.toContainText("51:210");
    await expect(pagination).toContainText("전체 105곳 · 2/2페이지 · 현재 5곳");
    await expect(pagination.getByRole("button", { name: "다음", exact: true })).toBeDisabled();
    await expect.poll(() => requests.photos.some(ids => ids.includes(105))).toBe(true);
    expect(requests.photos.every(ids => ids.length <= 100 && !ids.includes(999))).toBe(true);

    await page.getByLabel("시군 선택").selectOption("sokcho");
    await expect(pagination).toContainText("전체 5곳 · 1/1페이지 · 현재 5곳");
    await page.getByLabel("장소 분류", { exact: true }).selectOption("valley");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("PAGE TEST 105");
    expect(requests.queries.at(-1)).toMatchObject({ province: "gangwon", district: "sokcho", kind: "valley", page: "1" });
    await expect(pagination.getByRole("button", { name: "이전", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("desktop map keeps an explicit outside-page selection while summaries remain limited to the current page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const requests = await mockCatalog(page);
  await page.goto("#map?spot_id=999");
  await expect(page.locator(".mk-detail-name")).toHaveText(linkedPlace.name);
  await expect(page.locator(".mk-spot")).toHaveCount(101);
  await expect.poll(() => requests.summaries.flat().length).toBe(100);
  expect(requests.summaries.every(ids => ids.length <= 25 && ids.every(id => id <= 100))).toBe(true);
  const pagination = page.getByRole("navigation", { name: "장소 목록 페이지" });
  await expect(pagination).toContainText("전체 105곳 · 1/2페이지 · 현재 100곳");
  await pagination.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator(".mk-spot")).toHaveCount(5);
  await expect(page.locator(".mk-detail-name")).toHaveText("PAGE TEST 101");
  await expect.poll(() => requests.summaries.some(ids => ids.includes(105))).toBe(true);
  expect(requests.summaries.flat()).not.toContain(999);
});

test("mobile map preserves a linked place and switches to the next page when paginating", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const requests = await mockCatalog(page);
  await page.goto("#map?spot_id=999");
  await expect(page.locator(".mp-spot-name")).toHaveText(linkedPlace.name);
  const pagination = page.getByRole("navigation", { name: "장소 목록 페이지" });
  await expect(pagination).toContainText("전체 105곳 · 1/2페이지 · 현재 100곳");
  await pagination.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator(".mp-spot-name")).toHaveText("PAGE TEST 101");
  await expect(pagination).toContainText("전체 105곳 · 2/2페이지 · 현재 5곳");
  await page.getByLabel("시군 선택").selectOption("sokcho");
  await expect(pagination).toContainText("전체 5곳 · 1/1페이지 · 현재 5곳");
  expect(requests.queries.at(-1)).toMatchObject({ district: "sokcho", page: "1" });
});
