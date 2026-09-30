import { test, expect, type Page } from "@playwright/test";
import { byWidth } from "./viewports";

const places = [
  { id: 41, name: "OFFLINE TEST 첫 해변" },
  { id: 42, name: "OFFLINE TEST 두 번째 해변" },
  { id: 43, name: "OFFLINE TEST 미관측 해변" },
  { id: 44, name: "OFFLINE TEST 만료된 해변" },
].map(place => ({ ...place, place_kind: "beach", region: "강릉시", province_code: "gangwon", district_code: "gangneung" }));

// Intercept every API call: these navigation tests do not use a DB or providers.
async function fixture(page: Page, options: { classified?: boolean; subscriptionFailure?: boolean; expiresInMs?: number; nearby?: boolean } = {}) {
  const subscriptionReads: URL[] = [];
  const temperatureReads: URL[] = [];
  const summaryReads: URL[] = [];
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
    if (path === "data/water-index/conditions/summary") {
      summaryReads.push(url);
      const ids = (url.searchParams.get("spot_ids") ?? "").split(",").map(Number);
      return route.fulfill({ json: { mode: "observation", activity: "swim", unavailable: [], rows: ids.map(id => {
        const context = options.nearby && id === 42;
        const value = context ? 24.3 : id === 41 ? 22 : id === 44 ? 17.5 : 18.5;
        return { spot_id: id, water_temperature: id === 43 ? null : {
          name: "water_temperature", value, unit: "°C", status: "available",
          station_id: context ? 13 : id, station_name: context ? "OFFLINE TEST 주변 관측소" : `OFFLINE TEST 관측소 ${id}`,
          relation: context ? "nearby_station_context" : id === 41 ? "station_observation_point" : "representative_station",
          distance_km: context ? 4.056 : 0,
          evidence: [{ provider: "OFFLINE TEST", mode: "observation", numeric_value: value, unit: "degC", is_missing: false,
            observed_at: new Date(now - 120000).toISOString(),
            valid_until: new Date(now + (id === 44 ? -1000 : options.expiresInMs ?? (context ? -1000 : 3600000))).toISOString() }],
        } };
      }) } });
    }
    if (path === "data/water-temperature") {
      expect(route.request().method()).toBe("GET");
      temperatureReads.push(url);
      const spotId = Number(url.searchParams.get("spot_id"));
      const missing = spotId === 43 || (options.nearby && spotId === 42);
      return route.fulfill({ json: { rows: [{
        spot_id: spotId,
        stations: missing ? [] : [{ station_id: spotId, spot_id: spotId, source_id: `TEST-${spotId}`, name: `OFFLINE TEST 관측소 ${spotId}`, relation: spotId === 41 ? "station_observation_point" : "representative_station", mapping: { valid_from: new Date(now - 86400000).toISOString(), valid_until: new Date(now + 86400000).toISOString() } }],
        layers: missing ? [] : [{ station_id: spotId, provider: "OFFLINE TEST", name: "water_temperature", numeric_value: spotId === 41 ? 22 : spotId === 44 ? 17.5 : 18.5, unit: "degC", mode: "observation", is_missing: false, observed_at: new Date(now - 60000).toISOString(), valid_until: new Date(now + (spotId === 44 ? -1000 : options.expiresInMs ?? 3600000)).toISOString(), status: spotId === 44 ? "stale" : "observation" }],
      }] } });
    }
    if (path === "data/water-index/conditions") {
      const spotId = Number(url.searchParams.get("spot_id"));
      const context = options.nearby && spotId === 42 && url.searchParams.get("mode") === "observation";
      return route.fulfill({ json: {
        spot_id: spotId, mode: url.searchParams.get("mode"), activity: "swim", at: new Date(now).toISOString(),
        metrics: [], reason_codes: [], environment_score: null,
        context_metrics: context ? [{
          name: "water_temperature", label: "수온", value: 24.3, unit: "°C", status: "available",
          station_id: 13, station_name: "OFFLINE TEST 주변 관측소", relation: "nearby_station_context", distance_km: 4.056,
          evidence: [{ provider: "OFFLINE TEST", mode: "observation", numeric_value: 24.3, unit: "degC", is_missing: false,
            observed_at: new Date(now - 120000).toISOString(), valid_until: new Date(now + (options.expiresInMs ?? -1000)).toISOString() }],
        }] : [],
      } });
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
  return { subscriptionReads, temperatureReads, summaryReads };
}

for (const width of [390, 1440]) {
  test(`${width}px each beach has its own brief temperature and the existing link opens its evidence`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const { subscriptionReads: reads, temperatureReads, summaryReads } = await fixture(page);
    await page.goto("#home");
    const beaches = page.locator(byWidth(width, ".hm-picks-row", ".hd-beaches"));
    const section = page.locator(byWidth(width, ".pd-card", ".pd-dk-row")).filter({ has: beaches });
    await expect(section.locator(byWidth(width, ".pd-card-title", "h2"))).toContainText("해변 명소");
    await expect(section).not.toContainText("첫 입수");
    await expect(beaches).not.toContainText("첫 입수");
    await expect(beaches.getByRole("link")).toHaveCount(3);
    await expect(beaches.getByRole("button")).toHaveCount(0);
    const summaries = beaches.locator(".first-swim-preview");
    await expect.poll(async () => (await summaries.allTextContents()).sort()).toEqual([
      "수온 22°C", "수온 18.5°C", "수온 17.5°C",
    ].sort());
    await expect(beaches).not.toContainText(places[2].name);
    await expect(beaches).not.toContainText("수온 미확인");
    const nameRows = beaches.locator(".first-swim-name-row");
    await expect(nameRows).toHaveCount(3);
    await expect(beaches.locator(".hd-beach-category")).toHaveCount(0);
    for (const row of await nameRows.all()) {
      const name = await row.locator(".hm-pick-name, .hd-beach-name").boundingBox();
      const temperature = await row.locator(".first-swim-preview").boundingBox();
      expect(name).not.toBeNull();
      expect(temperature).not.toBeNull();
      expect(temperature!.y).toBeGreaterThanOrEqual(name!.y);
      const bounds = await row.boundingBox();
      expect(temperature!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(temperature!.x + temperature!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    }
    await expect(section.getByRole("link", { name: "첫 입수 안내", exact: true })).toHaveCount(0);
    expect(temperatureReads).toHaveLength(0);
    expect(summaryReads).toHaveLength(1);
    expect(summaryReads[0].searchParams.get("spot_ids")).toBe("41,42,43,44");
    expect(reads).toHaveLength(0);
    await section.screenshot({ path: `test-results/first-swim-home-${width}.png` });
    await beaches.getByRole("link", { name: new RegExp(places[1].name) }).click();
    await expect(page).toHaveURL(/#spots\?spot_id=42$/);
    const guide = page.getByRole("region", { name: "첫 입수 안내", exact: true });
    await expect(guide).toBeVisible();
    await expect(guide).toContainText("주변 수온 18.5°C");
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
    if (width === 1440) {
      const observation = await guide.locator(".first-swim-observation").boundingBox();
      const explanation = await guide.locator(".first-swim-explanation").boundingBox();
      expect(observation).not.toBeNull();
      expect(explanation).not.toBeNull();
      expect(Math.abs(explanation!.y - observation!.y)).toBeLessThan(1);
      expect(Math.abs(explanation!.height - observation!.height)).toBeLessThan(1);
    }
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
  await expect(guide).toContainText("수온 22°C");
  await expect(guide.getByRole("alert")).toBeVisible();
  await expect(guide).not.toContainText("이 장소의 올해 알림 구독이 없습니다");
});

test("a visible beach keeps its concise temperature label after expiry", async ({ page }) => {
  await page.clock.install();
  const { temperatureReads } = await fixture(page, { expiresInMs: 60000 });
  await page.goto("#home");
  const first = page.getByRole("link", { name: new RegExp(places[0].name) }).locator(".first-swim-preview");
  await expect(first).toHaveText("수온 22°C");
  await page.clock.fastForward(61000);
  await expect(first).toHaveText("수온 22°C");
  expect(temperatureReads).toHaveLength(0);
});

for (const width of [390, 1440]) {
  test(`${width}px temperature is concise on the card with nearby and stale evidence in detail`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page, { nearby: true });
    await page.goto("#home");
    const beach = page.getByRole("link", { name: new RegExp(places[1].name) });
    await expect(beach.locator(".first-swim-preview")).toHaveText("수온 24.3°C");
    await beach.click();
    const guide = page.getByRole("region", { name: "첫 입수 안내", exact: true });
    await expect(guide).toContainText("주변 수온 24.3°C");
    await expect(guide).toContainText("OFFLINE TEST 주변 관측소");
    await expect(guide).toContainText("4.1 km · 직선거리");
    await expect(guide).toContainText("관측 시각");
    await expect(guide).toContainText("KST");
    await expect(guide).toContainText("이전 관측");
    await expect(guide).toContainText("첫 입수 알림 기준에는 사용하지 않습니다");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("nearby observations keep a concise card label without another source request", async ({ page }) => {
  await page.clock.install();
  const { temperatureReads } = await fixture(page, { nearby: true, expiresInMs: 60000 });
  await page.goto("#home");
  const preview = page.getByRole("link", { name: new RegExp(places[1].name) }).locator(".first-swim-preview");
  await expect(preview).toHaveText("수온 24.3°C");
  await page.clock.fastForward(61000);
  await expect(preview).toHaveText("수온 24.3°C");
  expect(temperatureReads).toHaveLength(0);
});
