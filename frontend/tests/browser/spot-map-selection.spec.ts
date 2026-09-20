import { test, expect, type Page } from "@playwright/test";
import { conditionsFixture } from "./recommendation";

const defaultPlace = {
  id: 1, name: "지도 기본 해변", place_kind: "beach", region: "강릉",
  address: null, lat: 37.8, lng: 128.9,
};
const linkedPlace = {
  id: 999, name: "상세에서 고른 해변", type: "beach", region: "강릉",
  catalog_verification: null, address: null, lat: 37.9, lng: 128.8,
};

async function routeMapCatalog(page: Page) {
  await page.route("**/api/data/livecams/preview/places?**", route =>
    route.fulfill({ json: [defaultPlace] }));
  await page.route("**/api/data/water-index/default-place", route =>
    route.fulfill({ json: {
      place: defaultPlace, rows: [defaultPlace], display_name: defaultPlace.name,
      status: "available", message: null,
    } }));
  await page.route("**/api/data/attachments?**", route =>
    route.fulfill({ json: { items: [] } }));
  await page.route("**/api/data/water-index/conditions?**", route =>
    route.fulfill({ json: {
      ...conditionsFixture({ activity: "swim", score: 72 }),
      spot_id: Number(new URL(route.request().url()).searchParams.get("spot_id")),
    } }));
}

for (const width of [390, 1440]) {
  test.describe(`${width}px map spot_id selection`, () => {
    test.use({ viewport: { width, height: 1000 } });
    const selectedName = width < 1080 ? ".mp-spot-name" : ".mk-detail-name";

    test("waits for the linked place outside the list without choosing the default beach", async ({ page }) => {
      await routeMapCatalog(page);
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      await page.route("**/api/data/datasets/spots?**", async route => {
        expect(new URL(route.request().url()).searchParams.get("filter_value")).toBe("999");
        await pending;
        await route.fulfill({ json: { rows: [linkedPlace], total: 1 } });
      });
      await page.goto("#map?spot_id=999");
      try {
        await expect(page.getByText("선택한 장소를 조회하고 있습니다.", { exact: true })).toBeVisible();
        await expect(page.locator(selectedName)).toHaveCount(0);
        await expect(page.locator(".mk-spot[aria-pressed=true]")).toHaveCount(0);
        await expect(page.getByText("근거가 부족해 점수를 내지 못했어요", { exact: true })).toHaveCount(0);
      } finally {
        release();
      }
      await expect(page.locator(selectedName)).toHaveText(linkedPlace.name);
      if (width >= 1080)
        await expect(page.locator(".mk-spot[aria-pressed=true]")).toContainText(linkedPlace.name);
    });

    test("an absent linked place ends with not found and no default selection", async ({ page }) => {
      await routeMapCatalog(page);
      await page.route("**/api/data/datasets/spots?**", route =>
        route.fulfill({ json: { rows: [], total: 0 } }));
      await page.goto("#map?spot_id=999");
      await expect(page.getByText("선택한 장소를 찾을 수 없습니다.", { exact: true })).toBeVisible();
      await expect(page.locator(selectedName)).toHaveCount(0);
      await expect(page.locator(".mk-spot[aria-pressed=true]")).toHaveCount(0);
      await expect(page.getByText("선택한 장소를 조회하고 있습니다.", { exact: true })).toHaveCount(0);
      await expect(page.getByText("근거가 부족해 점수를 내지 못했어요", { exact: true })).toHaveCount(0);
    });

    test("a failed linked-place read shows the failure without selecting another beach", async ({ page }) => {
      await routeMapCatalog(page);
      await page.route("**/api/data/datasets/spots?**", route =>
        route.fulfill({ status: 503, json: { detail: "fixture failure" } }));
      await page.goto("#map?spot_id=999");
      await expect(page.getByRole("alert").filter({ hasText: "장소를 조회하지 못했습니다" })).toBeVisible();
      await expect(page.locator(selectedName)).toHaveCount(0);
      await expect(page.locator(".mk-spot[aria-pressed=true]")).toHaveCount(0);
      await expect(page.getByText("선택한 장소를 찾을 수 없습니다.", { exact: true })).toHaveCount(0);
    });
  });
}
