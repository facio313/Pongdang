import { test, expect } from "@playwright/test";
import { routePreference } from "./recommendation";

test.use({ viewport: { width: 1440, height: 1000 } });

test("desktop course URLs show the empty course flow and a working recommendation link", async ({ page }) => {
  await routePreference(page, ["물 보며 쉬기"]);
  await page.goto("#map?view=course");
  await expect(page.locator(".pd-dk-mapshell")).toBeVisible();
  await expect(page.locator(".map-page")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "코스 경로", exact: true })).toHaveAttribute("aria-pressed", "true");
  // 상세로 볼 코스가 없으면 왼쪽 패널은 내 코스 목록입니다(이동 순서가 아닙니다).
  await expect(page.getByRole("complementary", { name: "내 코스 목록" })).toContainText("아직 저장한 코스가 없습니다.");
  await expect(page.getByRole("complementary", { name: "후보지" })).toContainText("추천에서 코스를 만들거나 저장한 코스를 열어 주세요.");
  await expect(page.getByRole("button", { name: "코스 생성" })).toBeDisabled();
  await page.getByRole("link", { name: "추천", exact: true }).click();
  await expect(page).toHaveURL(/#recommend$/);
});

test("desktop detail drafts retain their chosen stop when opening the course map", async ({ page }) => {
  const response = await page.request.get("api/data/livecams/preview/places?q=");
  const [place] = await response.json();
  expect(place).toBeTruthy();
  let routeCalls = 0;
  page.on("request", request => {
    if (request.url().endsWith("/travel/routes/recommend")) routeCalls++;
  });
  await page.goto(`#spots?spot_id=${place.id}`);
  await page.getByRole("button", { name: "내 코스에 추가", exact: true }).click();
  await page.getByRole("link", { name: "코스 초안 보기" }).click();
  await expect(page).toHaveURL(/#map\?view=course$/);
  // 이동 순서(왼쪽)와 후보지(오른쪽) 패널이 같은 정차지를 함께 보여줍니다.
  await expect(page.locator(".mk-course-stop-name").first()).toHaveText(place.name);
  await expect(page.getByRole("button", { name: "코스 생성" })).toBeEnabled();
  expect(routeCalls).toBe(0);
});

test("desktop course URLs preserve plan_id and don't recompute a saved plan's route", async ({ page }) => {
  const response = await page.request.get("api/data/livecams/preview/places?q=");
  const places = await response.json();
  const place = places[0];
  expect(places.length).toBeGreaterThan(1);
  const date = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const planId = "a".repeat(32);
  const savedPlan = {
    plan_id: planId, revision: 1,
    request: { dates: [date], region: "강릉", preferred_tags: [], activity: "relax", transport: "driving" },
    input_stops: [{ item_id: "saved-stop", spot_id: place.id, day: date, stay_minutes: 60 }],
    days: [{ date, items: [{ item_id: "saved-stop", spot_id: place.id, name: place.name, arrival_at: null, departure_at: null, role: "visit", unknown_conditions: [] }] }],
    status: "draft", unresolved: [], queried_at: new Date().toISOString(), route_status: "not_calculated",
  };
  await page.route(`**/api/data/travel/plans/${planId}`, route => route.fulfill({ json: savedPlan }));
  const routeRequests: unknown[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/travel/routes/recommend")) routeRequests.push(request.postDataJSON());
  });
  await page.goto(`#map?view=course&plan_id=${planId}`);
  // 이동 순서(왼쪽)와 후보지(오른쪽) 패널이 같은 정차지를 함께 보여줍니다.
  await expect(page.locator(".mk-course-stop-name").first()).toHaveText(place.name);
  // 이미 저장된 코스이므로 "코스 생성" 은 다시 누를 수 없고, 경로도 다시
  // 계산하지 않습니다.
  await expect(page.getByRole("button", { name: "저장됨", exact: true })).toBeDisabled();
  expect(routeRequests).toHaveLength(0);
  await expect(page).toHaveURL(new RegExp(`#map\\?view=course&plan_id=${planId}$`));
  await page.reload();
  await expect(page.locator(".mk-course-stop-name").first()).toHaveText(place.name);
  expect(routeRequests).toHaveLength(0);
});
