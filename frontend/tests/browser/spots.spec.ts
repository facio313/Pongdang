import { test, expect } from "@playwright/test";
import { serverRecommendation } from "./recommendation";

// 명소 탭에는 브라우저 검사가 없었습니다. 예시 목록(spotsCatalog)을 걷어내고
// 실제 장소를 읽도록 바꾸면서, 지어낸 값이 되돌아오지 않는지를 여기서 지킵니다.

test("the spots list shows real places and never the invented total", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("#spots");

  const response = await page.request.get("api/data/livecams/preview/places?q=");
  const places = await response.json();
  expect(Array.isArray(places)).toBe(true);

  await expect(page.locator(".sp-hero-title")).toContainText("강릉 명소");
  // 예전에는 목록이 5건인데 히어로가 «128곳» 이라고 적었습니다.
  await expect(page.locator(".sp-hero-sub")).toContainText(String(places.length));
  await expect(page.locator(".sp-hero-sub")).not.toContainText("128");
  await expect(page.locator(".sp-row")).toHaveCount(places.length);
  if (places.length)
    await expect(page.locator(".sp-row-name").first()).not.toBeEmpty();

  // 지어낸 거리 · 운영시간은 화면에서 사라져야 합니다.
  const list = page.locator(".spots-page");
  await expect(list).not.toContainText("1.2km");
  await expect(list).not.toContainText("10:00–21:00");
  await expect(list).not.toContainText("상시 개방");
  // 없는 동작을 약속하지 않습니다.
  await expect(list).not.toContainText("20개 단위");
  expect(errors).toEqual([]);
});

test("a spot's score is fetched on the detail page and is – rather than 0 when absent", async ({ page }) => {
  const response = await page.request.get("api/data/livecams/preview/places?q=");
  const places = await response.json();
  test.skip(!places.length, "수집된 장소가 없으면 상세를 열 수 없습니다");
  const place = places[0];

  await page.goto(`#spots?spot_id=${place.id}`);
  await expect(page.locator(".sd-hero-name")).toContainText(place.name);

  // 점수는 서버가 고른 활동의 것입니다(water-index/recommendation).
  const recommendation = await serverRecommendation(page, place.id);
  await expect(page.locator(".sd-score-num")).toHaveText(
    recommendation.choice ? String(recommendation.choice.score) : "–",
  );

  // 서버에 컬럼이 없는 항목은 지어내지 않고 «–» 로 둡니다.
  const info = page.locator(".sd-info").first();
  await expect(info).toContainText("운영");
  await expect(info).toContainText("–");
  await expect(page.locator(".spot-detail")).toContainText("내려주는 API 가 아직 없습니다");
  // 예시 상수의 소개문·거리는 사라져야 합니다.
  await expect(page.locator(".spot-detail")).not.toContainText("현재 위치에서");
});

test("the spots map pins only verified coordinates and scores only the chosen pin", async ({ page }) => {
  await page.goto("#spots?view=map");
  const response = await page.request.get("api/data/livecams/preview/places?q=");
  const places: { lat: number | null; lng: number | null }[] = await response.json();
  const mappable = places.filter((place) => place.lat !== null && place.lng !== null);

  await expect(page.locator(".sp-sheet-head")).toContainText(`${mappable.length}곳`);
  // 고르기 전에는 점수를 약속하지 않습니다 -- 0 이 아니라 «–» 입니다.
  const badges = page.locator(".sp-sheet-badge");
  for (let index = 0; index < (await badges.count()); index += 1)
    await expect(badges.nth(index)).toHaveText("–");
  // 분류 필터는 서버가 실제로 유도하는 두 값뿐입니다.
  await expect(page.locator(".sp-filters")).toContainText("해변");
  await expect(page.locator(".sp-filters")).not.toContainText("카페");
});
