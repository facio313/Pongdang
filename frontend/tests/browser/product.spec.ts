import { test, expect } from "@playwright/test";

test("home and today use normalized evidence, and preserve unknown scores", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("");
  await expect(page.locator(".hm-hero-place")).toContainText("OFFLINE TEST");
  await expect(page.locator(".hm-hero-score-num")).toHaveText("–");
  await expect(page.locator(".hm-tile-value").first()).toHaveText("21.3°C");
  await expect(page.locator(".hm-tile-value").nth(1)).toHaveText("0.4m");
  await page.getByRole("link", { name: "오늘", exact: true }).click();
  await expect(page.locator(".td-hero-score-num")).toHaveText("–");
  await expect(page.locator(".td-hero-note")).toContainText("대표 관측소");
  await expect(page.locator(".td-tile-value").nth(2)).toHaveText("21.3°C");
  await expect(page.locator(".td-tide-now")).not.toContainText("12:34");
  await page.screenshot({
    path: "test-results/today-connected.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("preference → recommendation → persisted plan → selected plan detail", async ({
  page,
}) => {
  await page.goto("#recommend");
  await page
    .getByRole("button", { name: "태그로 바로 받기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "온천", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "온천", exact: true }).first().click();
  await page.getByRole("button", { name: "다음 · 카드로 확정하기" }).click();
  for (let index = 0; index < 6; index++)
    await page.getByRole("button", { name: "패스", exact: true }).click();
  await page.getByRole("button", { name: "취향 저장하고 코스 보기" }).click();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
  await page.route("**/api/data/travel/plans", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { detail: "fixture failure" } })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "내 코스에 저장", exact: true })
    .click();
  await expect(page.getByRole("alert").last()).toContainText(
    "서버에 연결하지 못했거나",
  );
  await expect(
    page.getByRole("button", { name: "저장됨", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/data/travel/plans");
  await page
    .getByRole("button", { name: "내 코스에 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "저장됨", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "내 코스", exact: true }).click();
  await expect(page.locator(".mc-row")).toHaveCount(1);
  await page.reload();
  await page.locator(".mc-row").click();
  await expect(page.locator(".mc-detail")).toContainText("OFFLINE TEST");
  await page.getByRole("link", { name: "코스 상세 열기" }).click();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
  await page.reload();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
  await page.screenshot({
    path: "test-results/recommend-connected.png",
    fullPage: true,
  });
});

test("map adds an actual place and requests a route only on explicit submit", async ({
  page,
}) => {
  let routeCalls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/travel/routes/recommend")) routeCalls++;
  });
  await page.goto("#map");
  await expect(page.locator(".mp-spot-name")).toContainText(
    "경포 OFFLINE TEST",
  );
  await expect(
    page.getByRole("link", { name: "길찾기", exact: true }),
  ).toHaveAttribute("href", /map.kakao.com\/link\/to/);
  await page.getByRole("button", { name: "코스에 넣기" }).click();
  await expect(page.locator(".mp-stop-name")).toHaveCount(1);
  expect(routeCalls).toBe(0);
  const origin = await page
    .getByLabel("출발지", { exact: true })
    .locator("option")
    .nth(2)
    .getAttribute("value");
  await page.getByLabel("출발지", { exact: true }).selectOption(origin!);
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
  await page.getByLabel("출발시각 · KST").fill(`${tomorrow}T09:00`);
  await page.getByRole("button", { name: "선택 코스 경로 계산" }).click();
  await expect(page.locator(".mp-searchbar.is-course")).toContainText(
    "분 이동",
  );
  expect(routeCalls).toBe(1);
  await expect(
    page.locator(".mp-note").filter({ hasText: "출발 기준 교통 자료" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/map-connected.png",
    fullPage: true,
  });
});

test("empty and unauthenticated data stay explicit", async ({ page }) => {
  await page.route("**/api/data/datasets/spots?**", (route) =>
    route.fulfill({ json: { rows: [], total: 0 } }),
  );
  await page.goto("");
  await expect(page.locator(".hm-tile-value").first()).toHaveText("–");
  await page.route("**/api/data/travel/**", (route) =>
    route.fulfill({
      status: 401,
      json: { detail: "SSO_AUTHENTICATION_REQUIRED" },
    }),
  );
  await page.goto("#my-courses");
  await expect(page.locator(".mc-row")).toHaveCount(0);
  await expect(page.locator(".mc-note").first()).toContainText(
    "기존 SSO 로그인이 필요합니다.",
  );
});

test("chat answers reach the travel contract and the actual response is displayed", async ({
  page,
}) => {
  let body:
    | { travel?: { request?: { transport?: string; companion_type?: string } } }
    | undefined;
  page.on("request", (request) => {
    if (request.url().endsWith("/ai/chat")) body = request.postDataJSON();
  });
  await page.goto("#recommend");
  await page.getByRole("button", { name: "대화로 추천받기" }).click();
  await page.getByRole("button", { name: "구경만 할래요" }).click();
  await page.getByRole("button", { name: "혼자 반나절" }).click();
  const response = page.waitForResponse((response) =>
    response.url().endsWith("/ai/chat"),
  );
  await page.getByRole("button", { name: "대중교통", exact: true }).click();
  const result = await (await response).json();
  await expect(page.locator(".rc-frame")).toHaveAttribute("aria-busy", "false");
  expect(body?.travel?.request?.transport).toBe("transit");
  expect(body?.travel?.request?.companion_type).toBe("solo");
  await expect(page.locator(".pd-ai-basis")).toContainText(result.answer);
  await page.getByRole("button", { name: "코스 보기", exact: false }).click();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
});

test("favorites and explicit notification settings use owner-scoped APIs", async ({
  page,
}) => {
  await page.goto("#map");
  await expect(page.locator(".mp-spot-name")).toContainText(
    "경포 OFFLINE TEST",
  );
  await page.getByRole("link", { name: "즐겨찾기 저장" }).click();
  await expect(page.locator(".feature-page table tbody tr")).toHaveCount(1);
  await page.goto("#first-swim");
  await page
    .getByLabel("알림 장소")
    .selectOption({ label: "강릉 경포 OFFLINE TEST 해변" });
  await page.getByLabel("선호 수온 기준 · °C").fill("19.5");
  await page.getByRole("button", { name: "앱 내 알림 구독 저장" }).click();
  await expect(page.getByRole("status")).toContainText(
    "알림 구독을 저장했습니다",
  );
  await expect(page.locator(".feature-page table tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".feature-page table")).toContainText("19.5");
});

test("a new place never displays the previous place’s observations", async ({
  page,
}) => {
  await page.goto("#map");
  await expect(page.locator(".mp-tile-value").first()).toHaveText("21.3°C");
  await page.getByRole("searchbox", { name: "장소명·지역 검색" }).fill("온천");
  await expect(page.locator(".mp-spot-name")).toContainText("온천");
  await expect(page.locator(".mp-tile-value").first()).toHaveText("–");
  await expect(page.locator(".mp-tile-value").nth(1)).toHaveText("–");
});

test("a proposed alternative changes a saved plan only after explicit apply", async ({
  page,
}) => {
  await page.goto("#my-courses");
  await page.locator(".mc-row").first().click();
  await page.getByRole("link", { name: "코스 상세 열기" }).click();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
  const id = new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get(
    "plan_id",
  );
  const before = await (
    await page.request.get(`api/data/travel/plans/${id}`)
  ).json();
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PUT" &&
      request.url().endsWith(`/travel/plans/${id}`)
    )
      writes++;
  });
  await page.getByRole("button", { name: "최신 조건으로 대안 조회" }).click();
  await expect(page.locator(".rc-swap-what").last()).toContainText(
    "OFFLINE TEST",
  );
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "대안으로 바꾸기" }).click();
  await expect(page.locator(".rc-stop-name").first()).toContainText(
    "OFFLINE TEST",
  );
  expect(writes).toBe(1);
  const after = await (
    await page.request.get(`api/data/travel/plans/${id}`)
  ).json();
  expect(after.plan_id).toBe(before.plan_id);
  expect(after.revision).toBe(before.revision + 1);
});
