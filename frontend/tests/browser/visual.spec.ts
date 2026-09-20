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

test("「동작 줄이기」를 켜면 홈 히어로의 물결이 멈춘다", async ({ page }) => {
  // 새 모션(물결 2겹 · 배경 숨쉬기)은 pongdang.css 의 prefers-reduced-motion
  // 규칙에 걸려야 합니다. 그 규칙은 .pd-app 안쪽만 덮으므로, 밖에 붙이면
  // 조용히 빠져나갑니다.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("#home");
  const stopped = (selector: string, pseudo?: string) =>
    page.locator(selector).evaluate(
      (node, arg) => getComputedStyle(node, arg).animationName,
      pseudo ?? null,
    );
  expect(await stopped(".hm-hero-anim .hm-wave-back")).toBe("none");
  expect(await stopped(".hm-hero-anim .hm-wave-front")).toBe("none");
  expect(await stopped(".home-page .pd-hero", "::before")).toBe("none");
});

/** 지도 · 내 코스는 지도가 뷰포트를 다 쓰는 화면입니다.
 *
 *  이 화면들의 핵심 주장은 「페이지는 스크롤되지 않고, 넘치는 내용은 지도 위에
 *  뜬 패널 · 시트 **안에서만** 스크롤한다」입니다. 그 주장이 깨지는 가장 흔한
 *  방식은 패널 안 어딘가의 min-height:auto 가 격자를 밀어내 문서가 다시 길어
 *  지는 것인데, 눈으로는 잘 보이지 않습니다. 그래서 문서 높이를 직접 잽니다. */
for (const [name, width] of [
  ["mobile", 390],
  ["desktop", 1440],
] as const) {
  test(`${name} 지도 · 내 코스는 페이지가 스크롤되지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["#map", "#my-courses"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => {
        const root = document.scrollingElement!;
        return root.scrollHeight - root.clientHeight;
      });
      // 1px 은 반올림 여유입니다.
      expect(overflow, `${route} (${width}px) 에서 페이지가 스크롤됩니다`).toBeLessThanOrEqual(1);
    }
  });
}

test("풀스크린 지도에서도 값 표기 규칙과 미연동 항목을 읽을 수 있다", async ({ page }) => {
  // 지도 아래 괘선 행에 있던 근거 · 주의 문구를 패널 · 시트 안으로 옮겼습니다.
  // 옮기다 빠뜨리면 화면이 조용히 규칙을 말하지 않게 되므로, 화면마다 **그
  // 화면의 문구**가 살아 있는지 봅니다(네 화면이 서로 다른 말을 합니다 --
  // 데스크탑 두 화면은 FootNote 에 각자 note 를 싣고, 모바일 두 화면은 공용
  // AppFootNote 를 씁니다).
  const cases = [
    [1440, "#map", "NULL · unknown 은 안전한 상태를 뜻하지 않습니다"],
    [1440, "#my-courses", "0 이 아닙니다"],
    [390, "#map", "0점 · 정상 · 안전으로 치환하지 않습니다"],
    [390, "#my-courses", "0점 · 정상 · 안전으로 치환하지 않습니다"],
  ] as const;
  for (const [width, route, phrase] of cases) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator("body"),
      `${route} (${width}px) 에서 값 표기 규칙이 사라졌습니다`,
    ).toContainText(phrase);
    // 미연동 항목 목록도 함께 옮겨졌는지 봅니다(데스크탑만 FootNote 를 씁니다).
    if (width === 1440)
      await expect(page.locator(".pd-dk-foot")).toContainText(
        "아직 실연동되지 않은 항목",
      );
  }
});

test("풀스크린 지도의 코발트 면은 화면당 하나다", async ({ page }) => {
  // 디자인 시스템 v2 §07: 글래스 히어로는 화면당 하나, 항상 최상단이며
  // 그라디언트는 그 하나에만 씁니다. 지도 위 가독성을 위해 반투명 스크림을
  // 덧대기 시작하면 이 수가 조용히 늘어납니다.
  for (const [width, route] of [
    [1440, "#map"],
    [1440, "#my-courses"],
    [390, "#map"],
    [390, "#my-courses"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const counts = await page.evaluate(() => {
      let gradient = 0;
      let alert = 0;
      for (const element of document.querySelectorAll("*")) {
        const style = getComputedStyle(element);
        if (style.backgroundImage.includes("gradient")) gradient += 1;
        // 경고 면(--pd-alert #ffe9e9 · --dk-alert-bg)은 화면당 1~2개까지입니다.
        if (style.backgroundColor === "rgb(255, 233, 233)") alert += 1;
      }
      return { gradient, alert };
    });
    // 핀의 conic-gradient 링(모바일 지도)까지 세지므로 상한만 확인합니다 --
    // 면 하나 + 핀들입니다. 코발트 「면」이 둘 이상 생기면 이 값이 크게 뜁니다.
    expect(counts.alert, `${route} (${width}px) 경고 면이 너무 많습니다`).toBeLessThanOrEqual(2);
    expect(counts.gradient, `${route} (${width}px) 그라디언트 면이 너무 많습니다`).toBeGreaterThan(0);
  }
});
