import { test, expect } from "@playwright/test";
import { MOBILE_WIDTH } from "./viewports";

/** 마스코트는 장식이 아니라 항목 표지입니다(mascots.ts). 그래서 이 스펙이 보는
 *  것은 「예뻐 보이는가」가 아니라 두 가지 사실입니다.
 *
 *  1. 이미지가 **실제로 열리는가**. 배포는 `/pongdang/` 하위이므로 누가
 *     `/mascot/...` 절대경로를 쓰면 404 입니다. 그런데 404 여도 <img> 요소는
 *     그대로 그려져서, toBeVisible 류 검사는 통과합니다. 그래서 디코드 결과
 *     (naturalWidth)를 봅니다. baseURL 이 /pongdang/ 인 것이 이 검사의 전제입니다.
 *  2. 모바일 화면에 표지가 **남아 있는가**. 예전에 모바일은 명소 탭 하나를 빼고
 *     표지가 하나도 없었습니다(핸드오프의 모바일 시안 자체가 한 번만 그렸기
 *     때문입니다). 리팩터 중에 다시 조용히 사라지는 것을 막습니다.
 *
 *  개수는 «정확히»가 아니라 «최소»로 둡니다 -- 접힌 자리의 표지는 lazy 이고,
 *  화면을 늘리는 변경마다 숫자를 고쳐 다니게 하면 검사가 짐이 됩니다. */

const mascots = (page: import("@playwright/test").Page) =>
  page.locator('img[src*="mascot/"]');

/** 스크롤해야 보이는 표지는 loading="lazy" 이므로, 세다 · 디코드를 확인하기
 *  전에 문서 끝까지 한 번 내려 전부 받게 합니다. */
async function loadLazyImages(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
}

/** 열리지 않은 표지의 src 목록. 빈 배열이어야 합니다. */
async function brokenMascots(page: import("@playwright/test").Page) {
  return mascots(page).evaluateAll((nodes) =>
    (nodes as HTMLImageElement[])
      .filter((node) => !node.complete || node.naturalWidth === 0)
      .map((node) => node.getAttribute("src") ?? ""),
  );
}

test("마스코트 24포즈가 모두 실제로 열린다", async ({ page }) => {
  // #desktop-kit 이 MASCOT_ROLES 를 전부 그립니다. 용도가 늘면 이 검사가 그
  // 파일 하나만 보고도 새 포즈의 경로를 확인합니다.
  await page.setViewportSize({ width: MOBILE_WIDTH, height: 1200 });
  await page.goto("#desktop-kit");
  await loadLazyImages(page);
  expect(await mascots(page).count()).toBeGreaterThanOrEqual(16);
  expect(await brokenMascots(page)).toEqual([]);
});

/** 모바일 화면별 최소 표지 개수. 첫 화면에서 스크롤 없이 셀 수 있는 것만
 *  헤아리지 않고, lazy 까지 받은 뒤의 수를 봅니다.
 *
 *  #today = 히어로 1 + 활동 타일 5 + 운영 시간대 2. */
const EXPECTED: Record<string, number> = {
  "#home": 4,
  "#today": 8,
  "#spots": 1,
  "#recommend": 1,
  "#map": 1,
};

for (const [route, least] of Object.entries(EXPECTED)) {
  test(`모바일 ${route} 에 마스코트 표지가 남아 있다`, async ({ page }) => {
    await page.setViewportSize({ width: MOBILE_WIDTH, height: 844 });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await loadLazyImages(page);
    expect(await mascots(page).count()).toBeGreaterThanOrEqual(least);
    expect(await brokenMascots(page)).toEqual([]);
  });
}

test("표지에는 동작이 붙지 않는다", async ({ page }) => {
  // 표지를 링크 · 버튼으로 감싸 그 자체를 탭 대상으로 만들지 않습니다(20px
  // 표지는 44px 터치 타깃 규칙을 만족할 수 없습니다). 취향 칩처럼 «컨트롤 안의
  // 라벨»로 들어가는 자리는 정상이므로, 그런 칩이 없는 「오늘」에서 봅니다.
  // animation 도 붙이지 않습니다 -- prefers-reduced-motion 이 덮어야 할 것을
  // 애초에 만들지 않습니다.
  await page.setViewportSize({ width: MOBILE_WIDTH, height: 844 });
  await page.goto("#today");
  await loadLazyImages(page);
  const problems = await mascots(page).evaluateAll((nodes) =>
    (nodes as HTMLImageElement[])
      .filter(
        (node) =>
          node.closest("a, button") !== null ||
          getComputedStyle(node).animationName !== "none",
      )
      .map((node) => node.getAttribute("src") ?? ""),
  );
  expect(problems).toEqual([]);
});
