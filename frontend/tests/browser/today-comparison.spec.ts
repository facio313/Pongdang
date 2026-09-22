import { test, expect, type Page } from "@playwright/test";
import { conditionsFixture } from "./recommendation";

const places = ["기준 해변", "가까운 해변", "두 번째 해변", "선택 계곡", "가까운 계곡", "두 번째 계곡"]
  .map((name, index) => ({ id: index + 1, name, place_kind: index < 3 ? "beach" : "valley",
    lat: 37.8, lng: 128.9, address: "강원도 강릉시", region: "강릉시" }));

async function fixture(page: Page, delayValley?: Promise<void>, unavailable = false) {
  const comparisons: number[] = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const id = Number(url.searchParams.get("spot_id") ?? 1);
    const selected = places.find(place => place.id === id)!;
    const condition = { ...conditionsFixture({ activity: "swim", score: 60 + id }),
      spot_id: id, place_name: selected.name };
    let data: unknown = { rows: [], items: [], total: 0, page: 1, page_size: 100, has_more: false };
    if (url.pathname.endsWith("/water-index/default-place")) data = {
      place: places[0], rows: [places[0], places[4], places[5]],
      display_name: places[0].name, status: "preferred", message: "기준 장소",
    };
    else if (url.pathname.endsWith("/places/nearby")) {
      comparisons.push(id);
      if (id === 4) await delayValley;
      data = { rows: unavailable ? [] : id === 1 ? places.slice(1, 3) : places.slice(4),
        status: unavailable ? "coordinates_unavailable" : "ready" };
    }
    else if (url.pathname.endsWith("/livecams/preview/places")) data = [selected];
    else if (url.pathname.endsWith("/water-index/recommendation")) data = {
      spot_id: id, choice: { activity: "swim", score: 60 + id, status: "partial" },
      conditions: [condition], ranked: [], reasons: [], alternatives: [], rules: [], limitations: [], reason_codes: [],
    };
    else if (url.pathname.endsWith("/water-index/conditions")) data = condition;
    else if (url.pathname.endsWith("/quality/grade")) data = { status: "no_data", measurements: [], reason_codes: [] };
    else if (url.pathname.endsWith("/regions")) data = { provinces: [] };
    else if (url.pathname.endsWith("/places")) data = { rows: [places[0], places[3]], total: 2, page: 1, page_size: 100, has_more: false };
    await route.fulfill({ json: data });
  });
  return comparisons;
}

for (const desktop of [false, true]) {
  test(`${desktop ? "desktop" : "mobile"} compares the reference and its nearest peers after changing place type`, async ({ page }) => {
    await page.setViewportSize(desktop ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const calls = await fixture(page, pending);
    await page.goto("#today");
    const names = page.locator(".td-spot-name");
    const scores = page.locator(desktop ? ".td-spot-score" : ".td-score-badge");
    await expect(names).toHaveText(places.slice(0, 3).map(place => place.name));
    await expect(scores).toHaveText(["61", "62", "63"]);
    await page.getByText("장소 바꾸기", { exact: true }).click();
    await page.getByLabel("홈·오늘 기준 장소", { exact: true }).selectOption("4");
    try {
      await expect(names).toHaveText([places[3].name]);
      await expect(page.getByText("주변 비교 장소 조회 중", { exact: false })).toBeVisible();
    } finally { release(); }
    await expect(names).toHaveText(places.slice(3).map(place => place.name));
    await expect(scores).toHaveText(["64", "65", "66"]);
    expect(calls).toEqual([1, 4]);
    await expect(page.getByText(/기준 장소 \+ 가까운 동일 유형 장소 최대 2곳/)).toBeVisible();
  });
}

test("missing coordinates keep only the reference in the comparison", async ({ page }) => {
  await fixture(page, undefined, true);
  await page.goto("#today");
  await expect(page.locator(".td-spot-name")).toHaveText([places[0].name]);
  await expect(page.getByText(/기준 장소의 좌표가 없어 주변 비교 장소를 찾을 수 없습니다/)).toBeVisible();
});
