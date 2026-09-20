import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1000 } });

test("desktop course URLs show the empty course flow and a working recommendation link", async ({ page }) => {
  await page.goto("#map?view=course");
  await expect(page.locator(".map-page")).toBeVisible();
  await expect(page.locator(".mk-stage")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "코스 경로", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".map-page")).toContainText("추천에서 장소를 고르거나 지도에서 코스에 넣어 주세요.");
  await expect(page.getByRole("button", { name: "선택 코스 경로 계산" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "내 코스에 저장", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "추천에서 편집" }).click();
  await expect(page).toHaveURL(/#recommend$/);
  await expect(page.getByRole("button", { name: "이 조건으로 후보 찾기" })).toBeVisible();
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
  await expect(page.locator(".mp-stop-name")).toHaveText(place.name);
  await expect(page.getByRole("button", { name: "선택 코스 경로 계산" })).toBeEnabled();
  expect(routeCalls).toBe(0);
});

test("desktop course URLs preserve plan_id and use the existing explicit route request", async ({ page }) => {
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
  const routeRequests: { request: { must_include: number[] }; candidate_ranks: number[] }[] = [];
  page.on("request", request => {
    if (request.url().endsWith("/travel/routes/recommend")) routeRequests.push(request.postDataJSON());
  });
  await page.goto(`#map?view=course&plan_id=${planId}`);
  await expect(page.locator(".mp-stop-name")).toHaveText(place.name);
  await expect(page.getByRole("button", { name: "저장됨", exact: true })).toBeDisabled();
  expect(routeRequests).toHaveLength(0);
  const origin = places.find((item: { id: number; lat: number | null; lng: number | null }) => item.id !== place.id && item.lat !== null && item.lng !== null);
  expect(origin).toBeTruthy();
  await page.getByLabel("출발 장소", { exact: true }).selectOption(String(origin.id));
  await page.getByLabel("출발 날짜와 시각").fill(`${date}T09:00`);
  await page.getByRole("button", { name: "선택 코스 경로 계산" }).click();
  await expect(page.locator(".mp-searchbar.is-course")).toContainText("분 이동");
  expect(routeRequests).toHaveLength(1);
  expect(routeRequests[0].request.must_include).toEqual([place.id]);
  expect(routeRequests[0].candidate_ranks).toHaveLength(1);
  await expect(page).toHaveURL(new RegExp(`#map\\?view=course&plan_id=${planId}$`));
  await page.reload();
  await expect(page.locator(".mp-stop-name")).toHaveText(place.name);
});
