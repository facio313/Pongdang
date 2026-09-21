import { test, expect, type Page } from "@playwright/test";

const places = [
  { id: 41, name: "OFFLINE TEST 첫 해변" },
  { id: 42, name: "OFFLINE TEST 두 번째 해변" },
  { id: 43, name: "OFFLINE TEST 미관측 해변" },
  { id: 44, name: "OFFLINE TEST 만료된 해변" },
].map(place => ({ ...place, place_kind: "beach", region: "강릉시", province_code: "gangwon", district_code: "gangneung" }));

// Intercept every API call: these navigation tests do not use a DB or providers.
async function fixture(page: Page, options: { classified?: boolean; subscriptionFailure?: boolean; expiresInMs?: number } = {}) {
  const subscriptionReads: URL[] = [];
  const temperatureReads: URL[] = [];
  const now = Date.now();
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname.split("/api/")[1];
    if (path === "data/places") return route.fulfill({ json: { rows: places, page: 1, page_size: 100, total: places.length, has_more: false } });
    if (path === "data/livecams/preview/places") return route.fulfill({ json: options.classified === false ? [] : places.filter(place => place.id === Number(url.searchParams.get("spot_id"))) });
    if (path === "data/datasets/spots") return route.fulfill({ json: { rows: places.filter(place => place.id === Number(url.searchParams.get("filter_value"))).map(place => ({ ...place, type: "tourism" })), total: 1 } });
    if (path === "data/water-index/default-place") return route.fulfill({ json: { place: places[0], rows: places, status: "resolved" } });
    if (path === "data/attachments" || path === "data/place-details") return route.fulfill({ json: { items: [] } });
    if (path === "data/regions") return route.fulfill({ json: { provinces: [{ code: "gangwon", label: "강원도", districts: [{ code: "gangneung", label: "강릉시" }] }] } });
    if (path === "data/travel/signals") return route.fulfill({ json: { rows: [] } });
    if (path === "data/water-temperature") {
      expect(route.request().method()).toBe("GET");
      temperatureReads.push(url);
      const spotId = Number(url.searchParams.get("spot_id"));
      const missing = spotId === 43;
      return route.fulfill({ json: { rows: [{
        spot_id: spotId,
        stations: missing ? [] : [{ station_id: spotId, spot_id: spotId, source_id: `TEST-${spotId}`, name: `OFFLINE TEST 관측소 ${spotId}`, relation: "representative_station", mapping: { valid_from: new Date(now - 86400000).toISOString(), valid_until: new Date(now + 86400000).toISOString() } }],
        layers: missing ? [] : [{ station_id: spotId, provider: "OFFLINE TEST", name: "water_temperature", numeric_value: spotId === 41 ? 22 : 18.5, unit: "degC", mode: "observation", is_missing: false, observed_at: new Date(now - 60000).toISOString(), valid_until: new Date(now + (spotId === 44 ? -1000 : options.expiresInMs ?? 3600000)).toISOString(), status: spotId === 44 ? "stale" : "observation" }],
      }] } });
    }
    if (path === "data/notifications/subscriptions") {
      expect(route.request().method()).toBe("GET");
      subscriptionReads.push(url);
      return options.subscriptionFailure
        ? route.fulfill({ status: 503, json: { detail: "NOTIFICATIONS_UNAVAILABLE" } })
        : route.fulfill({ json: { rows: [], limit: 1, offset: 0 } });
    }
    return route.fulfill({ status: 503, json: { detail: "offline fixture: optional service unavailable" } });
  });
  return { subscriptionReads, temperatureReads };
}

for (const width of [390, 1440]) {
  test(`${width}px each beach has its own brief temperature and the existing link opens its evidence`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const { subscriptionReads: reads, temperatureReads } = await fixture(page);
    await page.goto("#home");
    const beaches = page.locator(width < 1080 ? ".hm-picks-row" : ".hd-beaches");
    const section = page.locator(width < 1080 ? ".pd-card" : ".pd-dk-row").filter({ has: beaches });
    await expect(section.locator(width < 1080 ? ".pd-card-title" : "h2")).toContainText("해변 명소 · 첫 입수");
    expect((await section.innerText()).match(/첫 입수/g)).toHaveLength(1);
    await expect(beaches).not.toContainText("첫 입수");
    await expect(beaches.getByRole("link")).toHaveCount(4);
    await expect(beaches.getByRole("button")).toHaveCount(0);
    const summaries = beaches.locator(".first-swim-preview");
    await expect(summaries).toHaveText([
      "22°C", "18.5°C", "수온 미확인", "18.5°C · 이전 관측",
    ]);
    const nameRows = beaches.locator(".first-swim-name-row");
    await expect(nameRows).toHaveCount(4);
    await expect(beaches.locator(".hd-beach-category")).toHaveCount(0);
    for (const row of await nameRows.all()) {
      const name = await row.locator(".hm-pick-name, .hd-beach-name").boundingBox();
      const temperature = await row.locator(".first-swim-preview").boundingBox();
      expect(name).not.toBeNull();
      expect(temperature).not.toBeNull();
      expect(temperature!.y).toBeGreaterThanOrEqual(name!.y);
      expect(temperature!.y).toBeLessThan(name!.y + 20);
      expect(temperature!.x).toBeGreaterThan(name!.x);
    }
    await expect(section.getByRole("link", { name: "첫 입수 안내", exact: true })).toHaveCount(0);
    expect(temperatureReads).toHaveLength(4);
    expect(temperatureReads.every(url => url.searchParams.get("mode") === "observation" && url.searchParams.get("page_size") === "1")).toBe(true);
    expect(reads).toHaveLength(0);
    await section.screenshot({ path: `test-results/first-swim-home-${width}.png` });
    await beaches.getByRole("link", { name: new RegExp(places[1].name) }).click();
    await expect(page).toHaveURL(/#spots\?spot_id=42$/);
    const guide = page.getByRole("region", { name: "첫 입수 안내", exact: true });
    await expect(guide).toBeVisible();
    await expect(guide).toContainText("관측 수온 18.5°C");
    await expect(guide).toContainText("OFFLINE TEST 관측소 42");
    await expect(guide).toContainText("대표 관측소 자료");
    await expect(guide).not.toContainText("22°C");
    await expect(guide).not.toContainText("OFFLINE TEST 관측소 41");
    await expect(guide).toContainText("내 수온 기준");
    await expect(guide).toContainText("올해 최초 입수 가능일을 뜻하지 않습니다");
    await expect(guide).toContainText("수온 기준 충족은 입수 안전 판정이 아닙니다");
    await expect(guide).toContainText("이 장소의 올해 알림 구독이 없습니다");
    await expect(guide.getByRole("link", { name: "알림 설정·이력 보기 →" })).toHaveAttribute("href", "#first-swim");
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every(url => url.searchParams.get("spot_id") === "42" && url.searchParams.has("year"))).toBe(true);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guide.screenshot({ path: `test-results/first-swim-detail-${width}.png` });
  });

  test(`${width}px unclassified places do not acquire a water alert guide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { subscriptionReads: reads, temperatureReads } = await fixture(page, { classified: false });
    await page.goto("#spots?spot_id=42");
    await expect(page.getByRole("heading", { name: places[1].name, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "첫 입수 안내", exact: true })).toHaveCount(0);
    expect(reads).toHaveLength(0);
    expect(temperatureReads).toHaveLength(0);
  });
}

test("the explanation remains readable when private subscription status fails", async ({ page }) => {
  await fixture(page, { subscriptionFailure: true });
  await page.goto("#spots?spot_id=41&section=first-swim");
  const guide = page.getByRole("region", { name: "첫 입수 안내", exact: true });
  await expect(guide).toContainText("원하는 수온을 직접 정하고");
  await expect(guide).toContainText("관측 수온 22°C");
  await expect(guide.getByRole("alert")).toBeVisible();
  await expect(guide).not.toContainText("이 장소의 올해 알림 구독이 없습니다");
});

test("a visible beach keeps its last temperature and labels expired evidence", async ({ page }) => {
  await page.clock.install();
  const { temperatureReads } = await fixture(page, { expiresInMs: 60000 });
  await page.goto("#home");
  const first = page.locator(".first-swim-preview").first();
  await expect(first).toHaveText("22°C");
  await page.clock.fastForward(61000);
  await expect(first).toHaveText("22°C · 이전 관측");
  expect(temperatureReads).toHaveLength(4);
});
