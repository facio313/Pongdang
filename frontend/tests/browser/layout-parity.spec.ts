import { test, expect, type Page } from "@playwright/test";
import {
  DESKTOP_WIDTH,
  MOBILE_MAX_WIDTH,
  MOBILE_WIDTH,
  TABLET_WIDTH,
  isDesktopWidth,
} from "./viewports";

/** 폭이 달라도 같은 화면이 같은 사실을 말하는지 봅니다.
 *
 *  이 앱은 제품 화면 다섯 개를 **폭별 별도 컴포넌트**로 구현합니다
 *  (useIsDesktop, 구현 가이드 §1). 그래서 한쪽만 고친 커밋이 다른 쪽을 조용히
 *  뒤에 남길 수 있고, 실제로 그렇게 깨진 적이 있습니다 -- today-sync.spec.ts
 *  의 「추천 판단이 서버로 옮겨 갈 때 이 탭은 데스크탑만 따라갔습니다」.
 *
 *  기존 스펙들은 폭을 저마다 선언하고, 기본 뷰포트는 390 입니다. 두 폭을 함께
 *  도는 매트릭스가 없어 한쪽 누락을 잡아 주는 장치가 없었습니다. 이 파일이
 *  그 자리입니다.
 *
 *  검사하는 것은 **화면이 반드시 말해야 하는 사실**이지 마크업이 아닙니다.
 *  두 레이아웃은 마크업과 CSS 를 공유하지 않기로 되어 있으므로, 같은 DOM 을
 *  기대하면 규칙과 싸우게 됩니다. */

/** 폭별 대표 선택자. 같은 사실을 가리키는 서로 다른 마크업입니다. */
const SELECTOR = {
  heroScore: { mobile: ".hm-hero-score-num", desktop: ".hd-hero-score-num" },
  todayHero: { mobile: ".td-hero-score-num", desktop: ".td-hero-score-num" },
  mapRow: { mobile: ".mp-spotrow", desktop: ".mk-spot" },
  spotsRow: { mobile: ".sp-row", desktop: ".sk-row" },
} as const;

function pick(width: number, pair: { mobile: string; desktop: string }) {
  return isDesktopWidth(width) ? pair.desktop : pair.mobile;
}

/** 모든 구간을 한 번씩 밟습니다 -- 모바일, 태블릿 구간(지금은 모바일 레이아웃),
 *  분기점 바로 아래, 그리고 데스크탑. */
const WIDTHS = [MOBILE_WIDTH, TABLET_WIDTH, MOBILE_MAX_WIDTH, DESKTOP_WIDTH];

async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } });

    test("네비게이션은 한 벌만 보인다", async ({ page }) => {
      await page.goto("#home");
      const tabbar = page.locator(".pd-tabbar");
      const desktopNav = page.locator(".pd-dk-nav");
      if (isDesktopWidth(width)) {
        await expect(desktopNav).toBeVisible();
        await expect(tabbar).toHaveCount(0);
      } else {
        await expect(tabbar).toBeVisible();
        await expect(desktopNav).toHaveCount(0);
      }
    });

    test("홈은 오늘의 활동과 점수를 말한다", async ({ page }) => {
      await page.goto("#home");
      await settled(page);
      // 점수 자리가 비어 있지 않아야 합니다. 값이 없으면 «–» 이지 공백이
      // 아닙니다(데이터 표기 규칙).
      await expect(page.locator(pick(width, SELECTOR.heroScore))).not.toBeEmpty();
    });

    test("오늘 탭은 히어로 점수를 말한다", async ({ page }) => {
      await page.goto("#today");
      await settled(page);
      await expect(page.locator(pick(width, SELECTOR.todayHero))).not.toBeEmpty();
    });

    test("지도는 고르기 전에도 목록의 점수를 말한다", async ({ page }) => {
      await page.goto("#map");
      const row = page.locator(pick(width, SELECTOR.mapRow));
      await expect(row.first()).toBeVisible();
      await settled(page);
      // 예전에는 모바일 지도가 고른 지점 하나만 점수를 갖고 나머지는 전부
      // «–» 였습니다. 화면은 그것을 「선택한 장소를 조회한 값」이라고만
      // 적어 두었고, 그래서 지도를 열어도 어디가 좋은지 알 수 없었습니다.
      const scores = await row.locator(".pd-num, .pd-dk-num").allInnerTexts();
      expect(
        scores.some((text) => /\d/.test(text)),
        `${width}px 지도 목록이 점수를 하나도 말하지 않습니다: ${JSON.stringify(scores.slice(0, 8))}`,
      ).toBe(true);
    });

    test("지도에서 명소 상세로 갈 수 있다", async ({ page }) => {
      await page.goto("#map");
      await expect(page.locator(pick(width, SELECTOR.mapRow)).first()).toBeVisible();
      await settled(page);
      // 모바일 지도에는 상세로 가는 길이 없어, 고른 장소의 운영 안내 · 사진 ·
      // 주변 명소를 보려면 명소 탭에서 같은 장소를 다시 찾아야 했습니다.
      await expect(
        page.locator(`a[href^="#spots?spot_id="]`).first(),
      ).toBeVisible();
    });

    test("지도에 확대 · 축소 · 현재 위치가 있다", async ({ page }) => {
      await page.goto("#map");
      await settled(page);
      for (const label of ["확대", "축소", "현재 위치로 이동"]) {
        await expect(
          page.getByRole("button", { name: label }),
          `${width}px 지도에 「${label}」 컨트롤이 없습니다`,
        ).toBeVisible();
      }
    });

    test("명소 목록의 줄마다 상세로 가는 길이 있다", async ({ page }) => {
      await page.goto("#spots");
      const row = page.locator(pick(width, SELECTOR.spotsRow)).first();
      await expect(row).toBeVisible();
      await expect(row.locator(`a[href^="#spots?spot_id="]`).first()).toBeVisible();
    });
  });
}
