import { test, expect, type Page } from "@playwright/test";
import { conditionsFixture } from "./recommendation";

const places = ["기준 해변", "동해 해변", "고성 해변", "선택 계곡", "동해 계곡", "고성 계곡"]
  .map((name, index) => ({ id: index + 1, name, place_kind: index < 3 ? "beach" : "valley",
    province_code: "gangwon", district_code: ["gangneung", "donghae", "goseong"][index % 3],
    lat: 37.8, lng: 128.9, address: "강원도 강릉시", region: "강릉시" }));

async function fixture(page: Page, delayValley?: Promise<void>, missingCoordinates = false) {
  const comparisons: string[] = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const id = Number(url.searchParams.get("spot_id") ?? 1);
    const selected = places.find(place => place.id === id)!;
    const condition = { ...conditionsFixture({ activity: "swim", score: 60 + id }),
      spot_id: id, place_name: selected.name };
    let data: unknown = { rows: [], items: [], total: 0, page: 1, page_size: 100, has_more: false };
    if (url.pathname.endsWith("/water-index/default-place")) data = {
      place: missingCoordinates ? { ...places[0], lat: null, lng: null } : places[0], rows: [places[0], places[4], places[5]],
      display_name: places[0].name, status: "preferred", message: "기준 장소",
    };
    else if (url.pathname.endsWith("/places") && url.searchParams.has("kind")) {
      const kind = url.searchParams.get("kind")!;
      comparisons.push(kind);
      if (kind === "valley") await delayValley;
      data = { rows: places.filter(place => place.place_kind === kind),
        total: 3, page: 1, page_size: 100, has_more: false };
    }
    else if (url.pathname.endsWith("/livecams/preview/places")) data = [selected];
    else if (url.pathname.endsWith("/water-index/recommendation")) data = {
      spot_id: id, choice: { activity: "swim", score: 60 + id, status: "partial" },
      conditions: [condition], ranked: [], reasons: [], alternatives: [], rules: [], limitations: [], reason_codes: [],
    };
    else if (url.pathname.endsWith("/water-index/conditions")) data = condition;
    else if (url.pathname.endsWith("/water-index/conditions/summary")) data = {
      rows: (url.searchParams.get("spot_ids") ?? "").split(",").map(Number).map(spotId => ({
        spot_id: spotId,
        condition_score: conditionsFixture({ activity: "swim", score: 60 + spotId }).condition_score,
        water_temperature: null,
      })), unavailable: [],
    };
    else if (url.pathname.endsWith("/quality/grade")) data = { status: "no_data", measurements: [], reason_codes: [] };
    else if (url.pathname.endsWith("/regions")) data = { provinces: [] };
    else if (url.pathname.endsWith("/places")) data = { rows: [places[0], places[3]], total: 2, page: 1, page_size: 100, has_more: false };
    await route.fulfill({ json: data });
  });
  return comparisons;
}

for (const desktop of [false, true]) {
  test(`${desktop ? "desktop" : "mobile"} compares other districts after changing place type`, async ({ page }) => {
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
      // 조회 중이라는 사실은 모바일에서 문장을 내렸습니다(카드에 상태 문단을
      // 두지 않기로 했습니다). 모바일에서는 목록이 아직 기준 장소 한 곳뿐이라는
      // 것으로 같은 상태를 확인하고, 문장은 그것을 계속 적는 데스크탑에서 봅니다.
      if (desktop)
        await expect(page.getByText("다른 지역 비교 장소 조회 중", { exact: false })).toBeVisible();
    } finally { release(); }
    await expect(names).toHaveText(places.slice(3).map(place => place.name));
    await expect(scores).toHaveText(["64", "65", "66"]);
    expect(calls).toEqual(["beach", "valley"]);
    if (desktop)
      await expect(page.getByText(/다른 시·군 우선 · 근거가 많은 곳부터 최대 2곳/)).toBeVisible();
  });
}

test("missing coordinates do not prevent comparisons with other regions", async ({ page }) => {
  await fixture(page, undefined, true);
  // 선택 규칙 문장(「다른 시·군 우선 …」)은 모바일 카드에서 내렸으므로, 좌표가
  // 없어도 비교 목록이 실제로 채워지는지로 확인합니다. 데스크탑은 위 검사에서
  // 그 문장까지 봅니다.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("#today");
  await expect(page.locator(".td-spot-name")).toHaveText(places.slice(0, 3).map(place => place.name));
  await expect(page.getByText(/다른 시·군 우선/)).toBeVisible();
});
