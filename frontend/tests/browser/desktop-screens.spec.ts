import { test, expect } from "@playwright/test";
import { serverRecommendation } from "./recommendation";

// 데스크탑 오늘 · 지도 · 내 코스는 훅이 하나도 없는 통짜 더미 화면이었습니다.
// 점수 82 · 수온 22.1°C · 「3곳 · 12.0km · 4h 30m」 같은 값이 파일 안 상수로
// 적혀 있었고, 같은 라우트의 모바일은 그동안 실제 수집값을 읽고 있었습니다.
// 여기서는 그 상수가 되돌아오지 않는지를 지킵니다.
test.use({ viewport: { width: 1440, height: 1000 } });

/** 예시 상수에만 있던 값들. 화면 어디에도 남아 있으면 안 됩니다. */
const INVENTED = [
  "22.1°C",
  "21.8°C",
  "21.2°C",
  "12.0km",
  "4h 30m",
  "3h 00m",
  "6.4km",
  "5.1km",
  "2.7km",
  "4.2km",
  "09:20",
  "14:30",
  "5월 18일",
  "작년보다 6일 늦음",
];

test("desktop today reads the same server values as mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("#today");
  await expect(page.locator(".pd-desktop")).toBeVisible();

  const placeResponse = await page.request.get("api/data/datasets/spots?page_size=100&q=강릉");
  const places = await placeResponse.json();
  const place = places.rows.find((item: { name: string }) => item.name.includes("경포"));

  // 활동은 서버가 고릅니다(water-index/recommendation). 화면이 다시 고르지
  // 않는다는 것이 요지이므로 기대값을 재계산하지 않고 응답을 읽습니다.
  const recommendation = await serverRecommendation(page, place.id);
  await expect(page.locator(".td-hero-score-num")).toHaveText(
    recommendation.choice ? String(recommendation.choice.score) : "–",
  );

  // 히어로 타일은 실제 관측값입니다. 예전에는 「맑음 · 0.6m · 22.1°C · –」 였습니다.
  await expect(page.locator(".td-hero-tiles")).toContainText("수질 · 점수 미반영");
  // 주간 예보는 일곱 칸이며 값이 없는 날은 –입니다.
  await expect(page.locator(".td-day")).toHaveCount(7);
  // 추천 후보 다섯 가지입니다. 갯벌은 동해안에 없어 후보에서 빠졌습니다
  // (models.RECOMMENDED_ACTIVITIES).
  await expect(page.locator(".td-activity")).toHaveCount(5);

  const body = page.locator(".pd-desktop");
  for (const value of INVENTED) await expect(body).not.toContainText(value);
  // 고지 문구가 반대 방향으로 거짓말하지 않아야 합니다.
  await expect(body).not.toContainText("레이아웃 확인용 예시");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/today-desktop.png", fullPage: true });
});

test("desktop map lists real places and scores only the chosen one", async ({ page }) => {
  await page.goto("#map");
  const response = await page.request.get("api/data/livecams/preview/places?q=");
  const places: { lat: number | null; lng: number | null }[] = await response.json();
  const mappable = places.filter((place) => place.lat !== null && place.lng !== null);

  await expect(page.locator(".mk-side-kick")).toContainText(`${mappable.length}곳`);
  await expect(page.locator(".mk-spot")).toHaveCount(mappable.length);
  // 눌러도 아무 일이 없던 활동 필터는 사라지고 실제로 목록을 바꾸는 검색이 있습니다.
  await expect(page.locator(".mk-hero-search input")).toBeVisible();
  await expect(page.locator(".mk-hero")).not.toContainText("주차 · 샤워장");

  const body = page.locator(".pd-desktop");
  for (const value of INVENTED) await expect(body).not.toContainText(value);
  await page.screenshot({ path: "test-results/map-desktop.png", fullPage: true });
});

test("desktop courses says there is no saved course rather than showing one", async ({ page }) => {
  await page.route("**/api/data/travel/plans**", (route) =>
    route.fulfill({ json: { rows: [] } }),
  );
  await page.goto("#my-courses");
  await expect(page.locator(".cd-hero-title")).toContainText("저장한 코스가 없습니다");
  await expect(page.locator(".pd-desktop")).toContainText("아직 저장한 코스가 없습니다");
  await expect(page.locator(".cd-item")).toHaveCount(0);
  // 이동 거리 · 소요 시간은 API 에 없습니다. «–» 이며 0 이 아닙니다.
  await expect(page.locator(".cd-hero-summary")).toContainText("–");

  const body = page.locator(".pd-desktop");
  for (const value of INVENTED) await expect(body).not.toContainText(value);
  // 눌러도 아무 일이 없던 버튼들은 사라져야 합니다.
  await expect(body).not.toContainText("순서 바꾸기");
  await page.screenshot({ path: "test-results/courses-desktop.png", fullPage: true });
});
