import { test, expect } from "@playwright/test";
import { routeRecommendation } from "./recommendation";

test("home uses the selected fallback beach ID, name and conditions consistently", async ({ page }) => {
  const beach = { id: 987, name: "해운대해수욕장", place_kind: "beach", region: "부산", address: null, lat: 35.16, lng: 129.16 };
  await page.route("**/api/data/water-index/default-place", route => route.fulfill({ json: {
    place: beach, rows: [beach], display_name: beach.name, status: "fallback", message: "경포 자료가 부족하여 다른 해수욕장의 수집 자료를 표시합니다.",
  } }));
  const ids: number[] = [];
  await page.route("**/api/data/water-index/conditions?**", route => {
    ids.push(Number(new URL(route.request().url()).searchParams.get("spot_id")));
    return route.fulfill({ json: {
      spot_id: 987, place_name: beach.name, activity: "swim", mode: "observation", at: new Date().toISOString(),
      metrics: [], context_metrics: [], safety_status: "unknown", support_status: "unknown", reason_codes: [],
      condition_score: { label: "활동 조건 참고 점수", model_id: "fixture", model_version: "1", methodology: "fixture", score: 73, status: "partial", coverage: 0.5, available_components: 2, total_components: 4, components: [], sources: [], reason_codes: [] },
    } });
  });
  await routeRecommendation(page, { activity: "swim", score: 73 });
  await page.goto("");
  await expect(page.locator(".hm-hero-place")).toContainText(beach.name);
  await expect(page.locator(".hm-hero-score-num")).toHaveText("73");
  await expect(page.locator(".home-page")).toContainText("경포 자료가 부족");
  // 시간대 예보는 히어로가 값을 말한 뒤에 나갑니다. 조회 기억(useResource)이
  // 들어오면서 첫 페인트가 빨라져 이 자리에서 아직 안 나간 상태가 되므로,
  // 순서에 기대지 않고 실제로 나갈 때까지 기다립니다 -- 확인하려는 것은
  // 「언제」가 아니라 **모든 조회가 고른 장소 id 를 쓰는가**입니다.
  await expect.poll(() => ids.length).toBeGreaterThan(0);
  expect(new Set(ids)).toEqual(new Set([987]));
  await page.goto("#today");
  await expect(page.locator(".td-hero .pd-lbl")).toContainText(beach.name);
  await expect(page.locator(".td-hero .pd-header")).toContainText("부산");
});

test("default beach errors are visible and never leave the placeholder checking state", async ({ page }) => {
  await page.route("**/api/data/water-index/default-place", route => route.fulfill({ status: 503, json: { detail: "unavailable" } }));
  await page.goto("");
  await expect(page.locator(".hm-hero-place")).toContainText("강릉 경포대 해수욕장");
  await expect(page.locator(".home-page")).toContainText("요청을 처리하지 못했습니다");
  await expect(page.locator(".home-page")).not.toContainText("장소 확인 중");
});
