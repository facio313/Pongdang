import { test, expect, type Page } from "@playwright/test";
import { conditionsFixture } from "./recommendation";
import { byWidth } from "./viewports";

const beaches = ["안목해변", "경포해수욕장", "강문해변", "정동진해변"].map((name, index) => ({
  id: index + 1, name, place_kind: "beach", province_code: "gangwon", district_code: "gangneung",
  region: "강릉시", address: "강원특별자치도 강릉시", lat: 37.8, lng: 128.9,
}));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lp0AAAAASUVORK5CYII=", "base64");

async function fixture(page: Page, pendingSummary = false) {
  const locales: string[] = [];
  const photoRequests: number[][] = [];
  await page.addInitScript(() => localStorage.setItem("pongdang.travel-language", "ko"));
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname.split("/api/")[1];
    if (path === "data/places") {
      const locale = url.searchParams.get("locale")!;
      locales.push(locale);
      const rows = locale === "en" ? [{ ...beaches[0], name: "Anmok Beach (안목해변)" }] : beaches;
      return route.fulfill({ json: { rows, total: rows.length, page: 1, page_size: Number(url.searchParams.get("page_size")), has_more: false } });
    }
    if (path === "data/regions") return route.fulfill({ json: { provinces: [] } });
    if (path === "data/water-index/default-place") return route.fulfill({ json: {
      place: beaches[0], rows: beaches, display_name: beaches[0].name, status: "preferred", message: "OFFLINE TEST",
    } });
    if (path === "data/attachments") {
      const ids = url.searchParams.get("spot_ids")!.split(",").map(Number);
      photoRequests.push(ids);
      return route.fulfill({ json: { items: ids.map(id => ({
        id, spot_id: id, name: beaches[id - 1].name, url: `/api/data/attachments/${id}/file`,
        license: "Type1", attribution: "OFFLINE TEST", source_url: "https://example.test/photo",
      })) } });
    }
    if (/^data\/attachments\/\d+\/file$/.test(path)) return route.fulfill({ body: png, contentType: "image/png" });
    if (path === "data/water-index/conditions/summary") {
      const now = Date.now();
      return route.fulfill({ json: { rows: url.searchParams.get("spot_ids")!.split(",").map(Number).map(id => ({
        spot_id: id, condition_score: pendingSummary
          ? { score: null, status: "unavailable", reason_codes: ["condition_projection_pending"] }
          : { score: 60 + id, status: "partial" },
        water_temperature: {
          name: "water_temperature", value: 20 + id, unit: "°C", status: "available",
          station_id: id, station_name: "OFFLINE TEST", relation: "station_observation_point", distance_km: 0,
          evidence: [{ provider: "OFFLINE TEST", mode: "observation", numeric_value: 20 + id, unit: "degC", is_missing: false,
            observed_at: new Date(now - 60000).toISOString(), valid_until: new Date(now + 3600000).toISOString() }],
        },
      })), unavailable: [] } });
    }
    if (path === "data/water-index/recommendation") return route.fulfill({ json: {
      spot_id: 1, choice: { activity: "swim", score: 71, status: "partial" },
      conditions: [conditionsFixture({ activity: "swim", score: 71 })], ranked: [], reasons: [], rules: [], alternatives: [], reason_codes: [],
    } });
    if (path === "data/place-details") return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 503, json: { detail: "Optional offline fixture service unavailable" } });
  });
  return { locales, photoRequests, finishCalculation: () => { pendingSummary = false; } };
}

test("a pending score refreshes after publication without a page reload", async ({ page }) => {
  await page.clock.install();
  const requests = await fixture(page, true);
  await page.goto("#spots");
  const row = page.locator(".sp-row").filter({ hasText: "안목해변" });
  await expect(row).toContainText("조건 자료 준비 중");
  requests.finishCalculation();
  await page.clock.fastForward(31000);
  await expect(row).toContainText("61");
  await expect(row).not.toContainText("조건 자료 준비 중");
});

for (const width of [390, 1440]) {
  test(`${width}px Korean home and list display place names, scores and loaded photos`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests = await fixture(page);
    await page.goto("#home");
    const home = page.locator(byWidth(width, ".hm-picks-row", ".hd-beaches"));
    await expect(home.getByRole("link")).toHaveCount(4);
    await expect(home).toContainText("안목해변");
    await expect(home).not.toContainText("Anmok");
    await expect(home).not.toContainText("공용 바다 이미지");
    await expect.poll(() => home.locator("img").evaluateAll(images => images.filter(image => image.complete && image.naturalWidth > 0).length)).toBe(4);
    expect(requests.photoRequests.every(ids => ids.length <= 100)).toBe(true);
    expect(requests.locales).toEqual(["ko"]);

    await page.goto("#spots");
    const rows = page.locator(byWidth(width, ".sp-row", ".sk-row"));
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: "안목해변" })).toContainText("61");
    await expect.poll(() => rows.locator("img").evaluateAll(images => images.filter(image => image.complete && image.naturalWidth > 0).length)).toBe(4);
    await page.evaluate(() => {
      localStorage.setItem("pongdang.travel-language", "en");
      window.dispatchEvent(new StorageEvent("storage", { key: "pongdang.travel-language" }));
    });
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Anmok Beach (안목해변)");
    expect(requests.locales.at(-1)).toBe("en");
  });
}
