import { test, expect } from "@playwright/test";

/** 여섯 화면을 두 폭에서 한 번씩 열어 보는 스모크입니다.
 *
 *  이 앱은 같은 라우트에서 폭으로 컴포넌트를 통째로 갈아 끼웁니다. 그래서 한쪽
 *  폭만 고친 변경이 다른 쪽에 오류로 남아도 단위 검사에는 걸리지 않습니다.
 *  여기서는 **양쪽 모두 오류 없이 그려지는지**와, 첫 프레임의 잘못된 판단이
 *  화면에 남지 않는지만 봅니다. 값의 정확성은 각 화면의 전용 검사가 봅니다. */

const ROUTES = ["#home", "#today", "#spots", "#map", "#recommend", "#my-courses"];

/** 조회 전에만 할 수 있는 말들. 정착한 화면에 남아 있으면 안 됩니다. */
const BEFORE_ASKING = ["근거가 부족해 점수를 내지 못했어요"];

for (const [name, width] of [
  ["mobile", 390],
  ["desktop", 1440],
] as const) {
  test(`${name} 화면들이 오류 없이 그려진다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`${page.url()} ${error.message}`));
    for (const route of ROUTES) {
      await page.goto(route);
      // 근거 만료 재조회가 돌 수 있으므로 networkidle 만으로는 정착을 알 수
      // 없습니다. 히어로가 실제로 값을 말할 때까지 기다립니다.
      if (route === "#home" || route === "#today")
        await expect(
          page.locator(width < 1080 ? ".pd-hero h1" : ".pd-desktop h1"),
        ).not.toBeEmpty();
      await page.waitForLoadState("networkidle");
      const body = await page.locator("body").innerText();
      for (const phrase of BEFORE_ASKING)
        expect(body, `${route} 에 조회 전 판단이 남았습니다`).not.toContain(phrase);
      await page.screenshot({
        path: `test-results/visual-${name}${route.replace("#", "-")}.png`,
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });
}

test("셸 밖 화면에도 제품 화면으로 돌아갈 길이 있다", async ({ page }) => {
  // 사이드 메뉴의 「지점 즐겨찾기」·「알림 설정」·「데이터 출처」는 셸(AppShell ·
  // DesktopShell) 밖 화면으로 갑니다. 탭바도 네비도 없어서, 들어가면 제품
  // 화면으로 돌아갈 길이 하나도 없었습니다.
  for (const route of ["#favorites", "#first-swim", "#info", "#livecam", "#tide"]) {
    await page.goto(route);
    await expect(
      page.getByRole("link", { name: /퐁당 앱으로|앱 화면/ }).first(),
      `${route} 에 복귀 링크가 없습니다`,
    ).toBeVisible();
  }
});
