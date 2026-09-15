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
    live_player: null,
    timelapse_player: index % 3 === 2 ? null : `https://webcams.windy.com/webcams/public/embed/player/${id}/day`,
    timelapse_period: index % 3 === 2 ? null : "day",
    photo_available: true,
    distance_km: null,
    relationship: "unknown",
    playback_verified: false,
    nearby_place: null,
  };
}

async function mockCatalog(page: Page, beforeReply?: (request: CatalogRequest, number: number) => Promise<void>) {
  const requests: CatalogRequest[] = [];
  const seeds: number[] = [];
  const providerRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith("windy.com"))
      providerRequests.push(request.url());
  });
  await page.route(/https:\/\/(?:[^/]+\.)?windy\.com\//, (route) => route.abort());
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
      fetched_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 600000).toISOString(),
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
  return { requests, providerRequests };
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

test("home displays three random water cameras with direct links and reshuffles on request", async ({ page }) => {
  const { requests, providerRequests } = await mockCatalog(page);
  await page.goto("");
  await expect(page.locator(".hm-cam")).toHaveCount(3);
  await expect(page.locator(".home-page")).toContainText(/랜덤 물 풍경|라이브캠 물멍/);
  expect(requests).toHaveLength(1);
  const seed = requests[0].shuffle_seed;
  expect(requests[0].page).toBe(1);

  for (let index = 0; index < 3; index++) {
    const camera = fixtureCamera(index + 1);
    const card = page.locator(".hm-cam").nth(index);
    await expect(card).toContainText(camera.title);
    const href = await card.getAttribute("href");
    expect(href).toBe(camera.timelapse_player ?? camera.public_page);
    await expect(card).toHaveAttribute("target", "_blank");
    await expect(card).toHaveAttribute("rel", /noreferrer/);
  }
  await expect(page.getByRole("link", { name: "전체 라이브캠", exact: false })).toHaveAttribute("href", "#livecam");

  await page.getByRole("button", { name: "다른 풍경 보기", exact: true }).click();
  await expect(page.locator(".hm-cam")).toHaveCount(3);
  await expect(page.locator(".hm-cam").first()).toContainText("OFFLINE TEST 물 풍경 101");
  expect(requests).toHaveLength(2);
  expect(requests[1].shuffle_seed).not.toBe(seed);
  expect(requests[1].page).toBe(1);
  expect(requests[1].category).toBeUndefined();
  expect(providerRequests).toEqual([]);
  await page.screenshot({ path: "test-results/home-random-livecams.png", fullPage: true });
});

test("opening the webcam list waits for a pending home catalog before requesting another shuffle", async ({ page }) => {
  let releaseFirst!: () => void;
  const firstReply = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const { requests, providerRequests } = await mockCatalog(page, async (_body, number) => {
    if (number === 1) await firstReply;
  });
  await page.goto("");
  await expect.poll(() => requests.length).toBe(1);
  const homeSeed = requests[0].shuffle_seed;
  try {
    await page.getByRole("link", { name: "전체 라이브캠", exact: false }).click();
    await expect(page.getByRole("heading", { name: "물 풍경 웹캠", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("물 풍경 카메라를 불러오는 중");
    // A short bounded observation catches a second fetch from the newly mounted
    // page. The first response is still explicitly held throughout this window.
    await page.waitForTimeout(150);
    expect(requests).toHaveLength(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    releaseFirst();
  }
  await expect(page.locator(".lc-catalog-table tbody tr")).toHaveCount(25);
  expect(requests).toHaveLength(2);
  expect(requests[1].shuffle_seed).not.toBe(homeSeed);
  expect(requests[1].page).toBe(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".livecam-hub")).not.toContainText("429");
  expect(providerRequests).toEqual([]);
});
