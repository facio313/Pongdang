import { test, expect } from "@playwright/test";

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
  await page.goto("");
  await expect(page.locator(".hm-hero-place")).toContainText(beach.name);
  await expect(page.locator(".hm-hero-score-num")).toHaveText("73");
  await expect(page.locator(".home-page")).toContainText("경포 자료가 부족");
  expect(ids).toEqual([987]);
  await page.goto("#today");
  await expect(page.locator(".td-hero .td-lbl")).toContainText(beach.name);
  await expect(page.locator(".td-sbar")).toContainText("부산");
});

test("default beach errors are visible and never leave the placeholder checking state", async ({ page }) => {
  await page.route("**/api/data/water-index/default-place", route => route.fulfill({ status: 503, json: { detail: "unavailable" } }));
  await page.goto("");
  await expect(page.locator(".hm-hero-place")).toContainText("강릉 경포대 해수욕장");
  await expect(page.locator(".home-page")).toContainText("서버에 연결하지 못했거나");
  await expect(page.locator(".home-page")).not.toContainText("장소 확인 중");
});
