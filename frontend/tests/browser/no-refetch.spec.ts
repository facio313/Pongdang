import { test, expect } from "@playwright/test";

/** 같은 사실을 다시 묻지 않는지 봅니다.
 *
 *  이 앱은 같은 라우트(#home)에서 폭 1080px 을 경계로 컴포넌트를 **통째로**
 *  갈아 끼우고(useIsDesktop), 해시가 바뀌면 화면 전체를 다시 마운트합니다
 *  (App.tsx 의 key). 예전에는 그때마다 기본 해수욕장 · 추천 · 수질 · 명소 ·
 *  웹캠이 처음부터 다시 나갔습니다 -- 화면이 말하는 사실은 그대로인데
 *  네트워크만 다시 때린 것입니다.
 *
 *  이제 조회 기억(useResource)이 모듈 스코프에 있고, 조회 키에 섞여 있던
 *  마운트 시각 · 셔플 시드도 페이지가 한 번만 정합니다. 그래서 폭을 오가도,
 *  탭을 갔다 와도 추가 요청이 없어야 합니다. */

/** 정착 판정. 히어로가 실제로 값을 말할 때까지 기다립니다 -- networkidle
 *  만으로는 근거 만료 재조회가 끼어드는지 알 수 없습니다. */
async function settledHome(page: import("@playwright/test").Page, desktop: boolean) {
  const score = page.locator(desktop ? ".hd-hero-score-num" : ".hm-hero-score-num");
  await expect(score).not.toBeEmpty();
  await expect(score.locator('[aria-label="점수 조회 중"]')).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

test("폭을 오가도 같은 자료를 다시 묻지 않는다", async ({ page }) => {
  const asked: string[] = [];
  // **성공한 조회만** 셉니다. 실패한 조회는 다시 물어볼 수 있어야 하고
  // (useResource 의 조회 기억은 성공만 담습니다), 이 계약 서버에는 Windy 키가
  // 없어 라이브캠 목록이 늘 실패합니다 -- 그 재시도까지 금지하면 「실패를
  // 기억한다」는 반대쪽 잘못을 검사하는 셈이 됩니다.
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.ok()) asked.push(response.url());
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("#home");
  await settledHome(page, false);
  const mobileScore = await page.locator(".hm-hero-score-num").innerText();

  asked.length = 0;
  for (let round = 0; round < 3; round++) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await settledHome(page, true);
    // 폭이 달라졌다고 다른 사실을 말하면 안 됩니다.
    await expect(page.locator(".hd-hero-score-num")).toHaveText(mobileScore);
    await page.setViewportSize({ width: 390, height: 1000 });
    await settledHome(page, false);
    await expect(page.locator(".hm-hero-score-num")).toHaveText(mobileScore);
  }
  expect(asked, `폭 전환이 ${asked.length}건을 다시 물었습니다`).toEqual([]);
});

test("탭을 갔다 와도 홈이 같은 자료를 다시 묻지 않는다", async ({ page }) => {
  const asked: string[] = [];
  // **성공한 조회만** 셉니다. 실패한 조회는 다시 물어볼 수 있어야 하고
  // (useResource 의 조회 기억은 성공만 담습니다), 이 계약 서버에는 Windy 키가
  // 없어 라이브캠 목록이 늘 실패합니다 -- 그 재시도까지 금지하면 「실패를
  // 기억한다」는 반대쪽 잘못을 검사하는 셈이 됩니다.
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.ok()) asked.push(response.url());
  });
  await page.goto("#home");
  await settledHome(page, false);
  const score = await page.locator(".hm-hero-score-num").innerText();

  const placeDetails = page.waitForResponse((response) =>
    response.url().includes("/api/data/place-details?") && response.ok(),
  );
  await page.goto("#spots");
  // The region catalog can wait in the read queue after the first network idle.
  // Finish that initial lookup before measuring requests made on home reentry.
  await expect(page.getByRole("combobox", { name: "시군 선택" })).toBeEnabled();
  // The details read can also sit in the queue past an initial networkidle.
  // Count home reentry only after the spots page's own response has finished.
  await (await placeDetails).finished();
  await page.waitForLoadState("networkidle");
  asked.length = 0;
  await page.goto("#home");
  await settledHome(page, false);
  await expect(page.locator(".hm-hero-score-num")).toHaveText(score);
  expect(asked, `홈 복귀가 ${asked.length}건을 다시 물었습니다`).toEqual([]);
});

/** 지도 목록이 줄마다 조건을 묻지 않는지 봅니다.
 *
 *  예전에는 데스크탑 지도의 지점 줄(SpotRow)이 저마다 useConditions 를 불렀고,
 *  지도에 들어가는 것만으로 조건 조회가 줄 수만큼 나갔습니다(서버가 100곳까지
 *  내려주므로 최대 100건). 서버의 연결 슬롯은 네 개뿐이라 그 요청들은 서로를
 *  굶겼고, 만료된 근거를 만나면 줄마다 1ms 재조회 루프까지 돌았습니다.
 *
 *  이제 목록 전체를 묶어서 묻습니다. 요청 수가 **줄 수를 따라 늘지 않는 것**이
 *  이 검사의 핵심입니다. */
test("지도 목록은 줄마다 조건을 묻지 않는다", async ({ page }) => {
  const conditionCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/water-index/conditions"))
      conditionCalls.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("#map");
  await expect(page.locator(".mk-spot").first()).toBeVisible();
  await page.waitForLoadState("networkidle");

  const spotRows = await page.locator(".mk-spot").count();
  expect(spotRows).toBeGreaterThan(1);
  // 단건 조회는 **고른 지점 하나**에만 허용됩니다. 나머지는 요약 묶음입니다.
  const single = conditionCalls.filter((url) => url.includes("conditions?"));
  const batched = conditionCalls.filter((url) => url.includes("conditions/summary"));
  expect(
    batched.length,
    `요약을 ${batched.length}번 물었습니다 -- 묶음은 목록당 한 번이어야 합니다`,
  ).toBeLessThanOrEqual(1);
  expect(
    single.length,
    `줄마다 조건을 물었습니다(줄 ${spotRows}개, 단건 조회 ${single.length}건)`,
  ).toBeLessThanOrEqual(2);
});

/** 가만히 둔 지도가 스스로 다시 묻지 않는지 봅니다.
 *
 *  근거의 valid_until 이 이미 지난 상태에서 재조회 지연에 하한이 없으면
 *  (예전의 `Math.max(1, delay)`) 왕복 속도로 무한 재조회가 돕니다. 화면은
 *  멈추고 서버는 계속 맞습니다. 하한(REFRESH_MIN)이 살아 있으면 가만히 둔
 *  동안 추가 요청이 없어야 합니다. */
test("가만히 둔 지도는 조건을 다시 묻지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("#map");
  await expect(page.locator(".mk-spot").first()).toBeVisible();
  await page.waitForLoadState("networkidle");

  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/water-index/conditions"))
      asked.push(request.url());
  });
  await page.waitForTimeout(8000);
  expect(
    asked,
    `가만히 둔 8초 동안 ${asked.length}건을 다시 물었습니다`,
  ).toEqual([]);
});
