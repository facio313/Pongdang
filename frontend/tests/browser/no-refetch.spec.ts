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

  await page.goto("#spots");
  await page.waitForLoadState("networkidle");
  asked.length = 0;
  await page.goto("#home");
  await settledHome(page, false);
  await expect(page.locator(".hm-hero-score-num")).toHaveText(score);
  expect(asked, `홈 복귀가 ${asked.length}건을 다시 물었습니다`).toEqual([]);
});
