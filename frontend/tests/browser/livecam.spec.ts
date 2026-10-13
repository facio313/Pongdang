import { test, expect, type Page } from "@playwright/test";

type CatalogRequest = {
  page: number;
  category?: string;
  shuffle_seed: number;
};

// These are offline test records with official-shaped per-camera URLs. Tests
// inspect the links without visiting Windy or claiming the fixture IDs are live.
function fixtureCamera(index: number, category = "beach") {
  const id = String(1700000000 + index);
  return {
    provider_camera_id: id,
    title: `OFFLINE TEST 물 풍경 ${index}`,
    country_code: "KR",
    region: "OFFLINE TEST 지역",
    city: "OFFLINE TEST 도시",
    provider_status: "active",
    categories: [category],
    provider_updated_at: new Date().toISOString(),
    public_page: `https://windy.com/webcams/${id}`,
    live_player: index % 3 === 0 ? `https://webcams.windy.com/webcams/public/embed/player/${id}/live` : null,
    timelapse_player: index % 3 === 2 ? null : `https://webcams.windy.com/webcams/public/embed/player/${id}/day`,
    timelapse_period: index % 3 === 2 ? null : "day",
    photo_available: true,
    thumbnail_url: index % 4 === 2 ? null : index % 4 === 0 ? `https://images.windy.com/${id}.jpg` : `/api/data/livecams/thumbnails/${id}`,
    thumbnail_saved_at: index % 4 === 2 ? null : "2026-01-01T00:00:00Z",
    distance_km: null,
    relationship: "unknown",
    playback_verified: false,
    nearby_place: null,
  };
}

const homePlace = {
  id: 41, name: "OFFLINE TEST 기준 해변", place_kind: "beach",
  address: "강원특별자치도 강릉시", region: "강릉시", lat: 37.8, lng: 128.9,
};

type HomeCameraOptions = {
  catalogRows?: ReturnType<typeof fixtureCamera>[];
  nearbyFailure?: { status: number; detail: string };
  noPlace?: boolean;
  beforePlaceReply?: () => Promise<void>;
  beforeNearbyReply?: () => Promise<void>;
};

/** 장소 조회와 전국 목록을 구분해, 성공한 빈 주변 조회만 대체 목록을 여는지 봅니다. */
async function mockNearbyCameras(
  page: Page,
  nearbyRows: ReturnType<typeof fixtureCamera>[],
  options: HomeCameraOptions = {},
) {
  const requests: { spot_id?: number; page?: number; shuffle_seed?: number }[] = [];
  await page.context().route(/https:\/\/(?:[^/]+\.)?windy\.com\//, (route) => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Offline Windy player fixture</title>",
  }));
  // 현재 홈은 default-place의 place/rows를 사용합니다. 다른 기능의 자료 유무가
  // 웹캠 회귀 테스트의 기준 장소를 바꾸지 않도록 이 경로를 명시적으로 고정합니다.
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: { detail: "OFFLINE_TEST" } }));
  await page.route("**/api/data/water-index/default-place", async (route) => {
    await options.beforePlaceReply?.();
    await route.fulfill({ json: {
      place: options.noPlace ? null : homePlace,
      rows: options.noPlace ? [] : [homePlace],
      display_name: homePlace.name,
      status: options.noPlace ? "no_places" : "preferred",
      message: options.noPlace ? "수집된 해수욕장이 없습니다." : "기준 해변",
    } });
  });
  await page.route("**/api/data/livecams/thumbnails/*", (route) => route.fulfill({ status: 404 }));
  await page.route("**/api/data/livecams/preview", async (route) => {
    const body = route.request().postDataJSON() as { spot_id?: number; page?: number; shuffle_seed?: number };
    requests.push(body);
    const nearby = body.spot_id !== undefined;
    if (nearby) {
      expect(body).toEqual({ spot_id: homePlace.id });
      await options.beforeNearbyReply?.();
      if (options.nearbyFailure) {
        return route.fulfill({ status: options.nearbyFailure.status, json: { detail: options.nearbyFailure.detail } });
      }
    } else {
      expect(Object.keys(body).sort()).toEqual(["page", "shuffle_seed", "stored_only"]);
      expect(body.page).toBe(1);
      expect(Number.isInteger(body.shuffle_seed)).toBe(true);
      expect(body.shuffle_seed).toBeGreaterThanOrEqual(0);
      expect(body.shuffle_seed).toBeLessThanOrEqual(4294967295);
    }
    const rows = nearby ? nearbyRows : options.catalogRows ?? [];
    await route.fulfill({ json: {
      contract_version: "livecams.preview.v1",
      scope: nearby ? "place" : "korea_list",
      place: nearby ? homePlace : null,
      rows,
      total: rows.length,
      truncated: false,
      radius_km: nearby ? 10 : null,
      fetched_at: "2026-01-01T00:00:00Z",
      storage: "database",
      valid_until: null,
      cached: false,
      page: 1,
      page_size: 25,
      has_more: false,
      category: null,
      shuffle_seed: body.shuffle_seed ?? null,
      matched_total: nearby ? rows.length : 0,
      matching_status: nearby ? "available" : "not_requested",
    } });
  });
  return requests;
}

async function mockCatalog(page: Page, beforeReply?: (request: CatalogRequest, number: number) => Promise<void>) {
  const requests: CatalogRequest[] = [];
  const seeds: number[] = [];
  const providerRequests: string[] = [];
  const thumbnailRequests: string[] = [];
  page.context().on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith("windy.com"))
      providerRequests.push(request.url());
  });
  await page.context().route(/https:\/\/(?:[^/]+\.)?windy\.com\//, (route) => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Offline Windy player fixture</title>",
  }));
  // The catalog view is independent of the rest of the application and the DB.
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, json: { detail: "OFFLINE_TEST" } }));
  await page.route("**/api/data/livecams/thumbnails/*", async (route) => {
    expect(route.request().method()).toBe("GET");
    const path = new URL(route.request().url()).pathname;
    expect(path).toMatch(/^\/pongdang\/api\/data\/livecams\/thumbnails\/\d+$/);
    thumbnailRequests.push(path);
    const index = Number(path.split("/").at(-1)) - 1700000000;
    await route.fulfill(index % 4 === 3 ? { status: 404 } : {
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#4c8eb3"/><text x="20" y="95" fill="white" font-size="20">OFFLINE TEST PHOTO</text></svg>',
    });
  });
  await page.route("**/api/data/livecams/preview", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON() as CatalogRequest;
    expect(Object.keys(body).sort()).toEqual(
      ["page", "shuffle_seed", ...(body.category ? ["category"] : [])].sort(),
    );
    expect(Number.isInteger(body.shuffle_seed)).toBe(true);
    expect(body.shuffle_seed).toBeGreaterThanOrEqual(0);
    expect(body.shuffle_seed).toBeLessThanOrEqual(4294967295);
    expect(Number.isInteger(body.page)).toBe(true);
    expect(body.page).toBeGreaterThanOrEqual(1);
    expect(body.page).toBeLessThanOrEqual(5);
    requests.push(body);
    if (!seeds.includes(body.shuffle_seed)) seeds.push(body.shuffle_seed);
    const offset = seeds.indexOf(body.shuffle_seed) * 100 + (body.page - 1) * 25;
    await beforeReply?.(body, requests.length);
    await route.fulfill({ json: {
      contract_version: "livecams.preview.v1",
      scope: "korea_list",
      place: null,
      rows: Array.from({ length: 25 }, (_, index) => fixtureCamera(offset + index + 1, body.category)),
      total: 50,
      truncated: true,
      radius_km: null,
      fetched_at: "2026-01-01T00:00:00Z",
      storage: "database",
      valid_until: null,
      cached: requests.length > 1,
      page: body.page,
      page_size: 25,
      has_more: body.page < 2,
      category: body.category ?? null,
      shuffle_seed: body.shuffle_seed,
      matched_total: 0,
      matching_status: "not_requested",
    } });
  });
  return { requests, providerRequests, thumbnailRequests };
}

test("random water webcam catalog preserves its shuffle across filters and local pages", async ({ page }) => {
  const { requests, providerRequests } = await mockCatalog(page);
  await page.goto("#livecam");
  await expect(page.locator(".lc-catalog-table tbody tr")).toHaveCount(25);
  await expect(page.locator(".livecam-hub")).toContainText(/랜덤|무작위/);
  await expect(page.getByRole("columnheader", { name: "수집 장소와 거리" })).toHaveCount(0);
  await expect(page.locator(".livecam-hub")).not.toContainText("10km");
  await expect(page.locator(".livecam-hub")).not.toContainText("가까운 순");
  expect(requests).toHaveLength(1);
  const seed = requests[0].shuffle_seed;
  expect(requests[0].page).toBe(1);
  expect(requests[0].category).toBeUndefined();

  await page.getByRole("combobox", { name: "카메라 분류" }).selectOption("coast");
  await expect(page.locator(".lc-catalog-table tbody tr").first()).toContainText("해안");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({ page: 1, category: "coast", shuffle_seed: seed });

  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator(".lc-catalog-table tbody tr").first()).toContainText("OFFLINE TEST 물 풍경 26");
  expect(requests).toHaveLength(3);
  expect(requests[2]).toEqual({ page: 2, category: "coast", shuffle_seed: seed });
  await expect(page.getByRole("button", { name: "다음", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "다른 풍경 보기", exact: true }).click();
  await expect(page.locator(".lc-catalog-table tbody tr").first()).toContainText("OFFLINE TEST 물 풍경 101");
  expect(requests).toHaveLength(4);
  expect(requests[3].page).toBe(1);
  expect(requests[3].category).toBe("coast");
  expect(requests[3].shuffle_seed).not.toBe(seed);
  await expect(page.getByRole("navigation", { name: "웹캠 페이지" })).toContainText("1 / 2");
  expect(providerRequests).toEqual([]);
  await page.screenshot({ path: "test-results/livecam-random-catalog.png", fullPage: true });
});

for (const width of [390, 1440]) {
  test(`home at ${width}px reads saved cameras without nearby lookup and reuses the catalog`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const cameras = [11, 12, 13, 14].map(index => fixtureCamera(index));
    const requests = await mockNearbyCameras(page, [], {
      catalogRows: cameras, noPlace: true,
      nearbyFailure: { status: 429, detail: "WINDY_DAILY_BUDGET" },
    });
    await page.goto("");
    const cards = page.locator(width < 1080 ? "a.hm-cam" : "a.hd-cam");
    await expect(cards).toHaveCount(3);
    await expect(page.getByText("저장된 물 풍경", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ page: 1, stored_only: true });
    expect(requests[0].spot_id).toBeUndefined();
    for (const [index, camera] of cameras.slice(0, 3).entries()) {
      await expect(cards.nth(index)).toHaveAttribute("href", camera.live_player ?? camera.timelapse_player ?? camera.public_page);
      await expect(cards.nth(index)).toHaveAttribute("target", "_blank");
    }
    await page.getByRole("link", { name: width < 1080 ? "전체 라이브캠" : "전체 화면으로 →", exact: true }).click();
    await expect(page.locator(".lc-catalog-table tbody tr")).toHaveCount(4);
    expect(requests).toHaveLength(1);
  });
}

test("home displays an empty saved catalog without searching nearby", async ({ page }) => {
  const requests = await mockNearbyCameras(page, [], { noPlace: true });
  await page.goto("");
  await expect(page.locator(".hm-cam.is-empty")).toContainText("열 수 있는 라이브캠이 없습니다.");
  expect(requests).toHaveLength(1);
  expect(requests[0].spot_id).toBeUndefined();
});

for (const failure of [
  { status: 401, detail: "UNAUTHORIZED", message: "로그인 또는 접근 권한을 확인해 주세요." },
  { status: 404, detail: "WEBCAM_CATALOG_EMPTY", message: "저장된 웹캠 목록이 없습니다." },
  { status: 503, detail: "WEBCAM_CATALOG_UNAVAILABLE", message: "저장된 웹캠 목록을 불러오지 못했습니다." },
]) {
  test(`home preserves saved catalog error ${failure.status} without another lookup`, async ({ page }) => {
    await mockNearbyCameras(page, []);
    const requests: unknown[] = [];
    await page.route("**/api/data/livecams/preview", route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: failure.status, json: { detail: failure.detail } });
    });
    await page.goto("");
    await expect(page.locator(".hm-cam.is-empty")).toContainText(failure.message);
    await expect(page.locator("a.hm-cam")).toHaveCount(0);
    expect(requests).toHaveLength(1);
  });
}

test("stored thumbnails use local lazy images and failed or unsafe sources never retry the catalog", async ({ page }) => {
  await page.clock.install();
  const { requests, providerRequests, thumbnailRequests } = await mockCatalog(page);
  await page.goto("#livecam");
  const rows = page.locator(".lc-catalog-table tbody tr");
  await expect(rows).toHaveCount(25);
  const photo = rows.first().getByRole("img", { name: "OFFLINE TEST 물 풍경 1 대표 이미지" });
  await photo.scrollIntoViewIfNeeded();
  await expect(photo).toHaveAttribute("src", "/pongdang/api/data/livecams/thumbnails/1700000001");
  await expect(photo).toHaveAttribute("loading", "lazy");
  await expect(photo).toHaveJSProperty("naturalWidth", 320);
  await expect(photo).toHaveCSS("object-fit", "cover");
  await expect(rows.first()).toContainText("이미지 저장");
  for (const index of [1, 2, 3]) {
    await rows.nth(index).locator(".webcam-thumbnail").scrollIntoViewIfNeeded();
    await expect(rows.nth(index)).toContainText("대표 이미지 없음");
    await expect(rows.nth(index).locator(".webcam-thumbnail-photo")).toHaveCount(0);
  }
  await expect.poll(() => thumbnailRequests.filter(path => path.endsWith("/1700000003")).length).toBe(1);
  expect(thumbnailRequests.some(path => path.endsWith("/1700000002") || path.endsWith("/1700000004"))).toBe(false);
  expect(providerRequests).toEqual([]);
  await page.clock.fastForward(11 * 60 * 1000);
  await expect(photo).toHaveJSProperty("naturalWidth", 320);
  expect(thumbnailRequests.filter(path => path.endsWith("/1700000003"))).toHaveLength(1);
  expect(requests).toHaveLength(1);
  const popupPromise = page.waitForEvent("popup");
  await rows.first().getByRole("link", { name: "OFFLINE TEST 물 풍경 1 카메라 열기", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(fixtureCamera(1).timelapse_player!);
  await popup.close();
  expect(requests).toHaveLength(1);
  expect(providerRequests).toEqual([fixtureCamera(1).timelapse_player]);
});

test("stored catalogs remain playable after ten minutes and clicks never reload the catalog", async ({ page }) => {
  await page.clock.install();
  const { requests, providerRequests } = await mockCatalog(page);
  await page.goto("#livecam");
  await expect(page.locator(".lc-catalog-table tbody tr")).toHaveCount(25);
  await expect(page.locator(".livecam-hub")).toContainText("저장된 목록");
  await page.clock.fastForward(11 * 60 * 1000);
  await expect(page.locator(".livecam-hub")).not.toContainText("목록 유효기간이 지났습니다");
  expect(requests).toHaveLength(1);
  expect(providerRequests).toEqual([]);

  for (const [index, linkName, expectedUrl] of [
    [0, "타임랩스 열기 ↗", fixtureCamera(1).timelapse_player],
    [1, "원본 페이지 ↗", fixtureCamera(2).public_page],
    [2, "실시간 안내 · 미검증 ↗", fixtureCamera(3).live_player],
  ] as const) {
    const row = page.locator(".lc-catalog-table tbody tr").nth(index);
    const popupPromise = page.waitForEvent("popup");
    await row.getByRole("link", { name: linkName, exact: true }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(expectedUrl!);
    await popup.close();
    expect(requests).toHaveLength(1);
  }
  expect(providerRequests).toEqual([
    fixtureCamera(1).timelapse_player,
    fixtureCamera(2).public_page,
    fixtureCamera(3).live_player,
  ]);
});

test("direct entry to the webcam list requests its catalog once", async ({ page }) => {
  const { requests, providerRequests } = await mockCatalog(page);
  await page.goto("#livecam");
  await expect(page.getByRole("heading", { name: "물 풍경 웹캠", exact: true })).toBeVisible();
  await expect(page.locator(".lc-catalog-table tbody tr")).toHaveCount(25);
  expect(requests).toHaveLength(1);
  expect(requests[0].page).toBe(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".livecam-hub")).not.toContainText("429");
  expect(providerRequests).toEqual([]);
});
