import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1000 } });

test("a missing desktop spot finishes loading and exposes no add or map action", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/data/datasets/spots?**", async route => {
    await pending;
    await route.fulfill({ json: { rows: [], total: 0 } });
  });
  await page.goto("#spots?spot_id=999999999");
  try {
    await expect(page.locator(".sk-detail-name").getByLabel("장소 조회 중")).toBeVisible();
    await expect(page.getByRole("button", { name: "내 코스에 추가", exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator(".sk-detail-name")).toHaveText("장소를 찾지 못했습니다");
  await expect(page.locator(".sk-detail-name").getByLabel("장소 조회 중")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "내 코스에 추가", exact: true })).toHaveCount(0);
  await expect(page.locator(".sk-detail-map-link")).toHaveCount(0);
});

test("the desktop detail map link selects that same place", async ({ page }) => {
  const response = await page.request.get("api/data/livecams/preview/places?q=");
  const places = await response.json();
  expect(places.length).toBeGreaterThan(1);
  const place = places.at(-1);
  await page.goto(`#spots?spot_id=${place.id}`);
  await expect(page.locator(".sk-detail-name")).toHaveText(place.name);
  const mapLink = page.getByRole("link", { name: "지도 탭에서 보기" });
  await expect(mapLink).toHaveAttribute("href", `#map?spot_id=${place.id}`);
  await mapLink.click();
  await expect(page.locator(".mk-detail-name")).toHaveText(place.name);
});

test("a failed desktop draft request remains an error rather than successful navigation", async ({ page }) => {
  const response = await page.request.get("api/data/livecams/preview/places?q=");
  const [place] = await response.json();
  expect(place).toBeTruthy();
  const selectedIds: number[][] = [];
  await page.route("**/api/data/travel/plans/draft", route => {
    selectedIds.push(route.request().postDataJSON().stops.map((stop: { spot_id: number }) => stop.spot_id));
    return route.fulfill({ status: 503, json: { detail: "fixture failure" } });
  });
  await page.goto(`#spots?spot_id=${place.id}`);
  await page.getByRole("button", { name: "내 코스에 추가", exact: true }).click();
  await expect(page.locator(".sk-detail-body").getByRole("alert")).toContainText("요청을 처리하지 못했습니다");
  expect(selectedIds).toEqual([[place.id]]);
  await expect(page).toHaveURL(new RegExp(`#spots\\?spot_id=${place.id}$`));
  await expect(page.getByRole("link", { name: "코스 초안 보기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "내 코스에 추가", exact: true })).toBeEnabled();
});

test("desktop detail adds a real beach station with empty region", async ({ page }) => {
  const places = await (await page.request.get("api/data/livecams/preview/places?q=관측")).json();
  const place = places.find((item: { name: string }) => item.name === "강릉 OFFLINE TEST 관측 해수욕장");
  expect(place).toBeTruthy();
  await page.goto(`#spots?spot_id=${place.id}`);
  await expect(page.locator(".sk-detail-name")).toHaveText(place.name);
  const draftResponse = page.waitForResponse(response => response.url().endsWith("travel/plans/draft"));
  await page.getByRole("button", { name: "내 코스에 추가", exact: true }).click();
  const response = await draftResponse;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().request.region).toBeUndefined();
  expect((await response.json()).input_stops.map((stop: { spot_id: number }) => stop.spot_id)).toEqual([place.id]);
  await expect(page.locator(".sk-note[role=status]")).toContainText("코스 초안에 추가했습니다");
  await page.getByRole("link", { name: "코스 초안 보기" }).click();
  await expect(page.locator(".mp-stop-name")).toHaveText(place.name);
});
