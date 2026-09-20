import { test, expect } from "@playwright/test";

const waterPlaces = [
  { id: 11, name: "TEST 해변", place_kind: "beach", address: "강릉", region: "강릉", lat: 37.8, lng: 128.9 },
  { id: 12, name: "TEST 계곡", place_kind: "valley", address: "강릉", region: "강릉", lat: 37.8, lng: 128.9 },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/data/notifications/subscriptions?**", route =>
    route.fulfill({ json: { rows: [] } }));
  await page.route("**/api/data/datasets/spots?**", route =>
    route.fulfill({ json: { rows: [{ id: 99, name: "TEST 해변 음식점", type: "beach_search_result" }], total: 1 } }));
});

test("first-swim choices use classified water places and save the selected real ID", async ({ page }) => {
  const searches: string[] = [];
  const saves: { spot_id: number }[] = [];
  await page.route("**/api/data/livecams/preview/places?**", route => {
    searches.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    return route.fulfill({ json: waterPlaces });
  });
  await page.route("**/api/data/notifications/subscriptions", route => {
    saves.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { id: "test-subscription" } });
  });
  await page.goto("#first-swim");
  const select = page.getByLabel("알림 장소");
  await expect(select.locator("option")).toHaveText(["선택", "TEST 해변", "TEST 계곡"]);
  await expect(select).not.toContainText("음식점");
  await expect(page.getByRole("button", { name: "앱 내 알림 구독 저장" })).toBeDisabled();
  await select.selectOption("12");
  await page.getByLabel("선호 수온 기준 · °C").fill("20");
  await page.getByRole("button", { name: "앱 내 알림 구독 저장" }).click();
  await expect(page.getByRole("status").filter({ hasText: "알림 구독을 저장했습니다" })).toBeVisible();
  expect(searches).toEqual(["강릉"]);
  expect(saves).toHaveLength(1);
  expect(saves[0].spot_id).toBe(12);
  await expect(page.locator(".feature-page")).toContainText("검색 결과는 최대 100곳");
});

test("a new empty search clears the prior selection and prevents stale or unclassified saves", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/data/livecams/preview/places?**", route => {
    const query = new URL(route.request().url()).searchParams.get("q");
    return route.fulfill({ json: query === "음식점" ? [] : waterPlaces });
  });
  await page.route("**/api/data/notifications/subscriptions", route => {
    posts += 1;
    return route.fulfill({ status: 201, json: { id: "unexpected" } });
  });
  await page.goto("#first-swim");
  const select = page.getByLabel("알림 장소");
  await select.selectOption("11");
  await page.getByLabel("선호 수온 기준 · °C").fill("20");
  await page.getByLabel("장소 검색", { exact: true }).fill("음식점");
  await expect(select).toHaveValue("");
  await expect(select.locator("option")).toHaveText(["선택"]);
  await expect(page.getByRole("button", { name: "앱 내 알림 구독 저장" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "검색 조건에 해당하는 물놀이 장소가 없습니다" })).toBeVisible();
  // Even a manipulated select cannot submit an ID outside the classified rows.
  await select.evaluate((element: HTMLSelectElement) => {
    element.add(new Option("TEST 해변 음식점", "99"));
    element.value = "99";
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await select.evaluate((element: HTMLSelectElement) => element.form!.requestSubmit());
  await expect(page.getByRole("alert")).toContainText("분류가 확인된 해변·계곡을 목록에서 선택해 주세요");
  expect(posts).toBe(0);
});

test("a rejected place classification stays a failure instead of showing saved", async ({ page }) => {
  await page.route("**/api/data/livecams/preview/places?**", route => route.fulfill({ json: waterPlaces }));
  await page.route("**/api/data/notifications/subscriptions", route =>
    route.fulfill({ status: 422, json: { detail: "WATER_PLACE_REQUIRED" } }));
  await page.goto("#first-swim");
  await page.getByLabel("알림 장소").selectOption("11");
  await page.getByLabel("선호 수온 기준 · °C").fill("20");
  await page.getByRole("button", { name: "앱 내 알림 구독 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("첫 입수 알림은 분류가 확인된 해변·계곡에서만 저장할 수 있습니다");
  await expect(page.locator(".feature-page")).not.toContainText("알림 구독을 저장했습니다");
});
