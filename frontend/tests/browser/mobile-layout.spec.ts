import { test, expect, type Page } from "@playwright/test";
import {
  DESKTOP_MIN,
  MOBILE_MAX_WIDTH,
  MOBILE_WIDTH,
  TABLET_WIDTH,
} from "./viewports";

// 모바일 레이아웃이 유효한 구간의 폭만 씁니다. 숫자를 직접 적으면 분기점이
// 움직일 때 조용히 어긋납니다 -- 데스크탑 기준이 960 으로 내려간 뒤 여기 있던
// 979 · 1079 는 데스크탑을 그리고 있었고, 그래서 `.pd-tabbar` 가 없었습니다.
for (const width of [MOBILE_WIDTH, TABLET_WIDTH, MOBILE_MAX_WIDTH]) {
  test.describe(`${width}px mobile layout`, () => {
    test.use({ viewport: { width, height: 985 } });

    test("the home activity link stays readable and opens today's score explanation", async ({ page }) => {
      await page.goto("#home");
      await page.waitForLoadState("networkidle");
      const actions = page.locator(".hm-hero-actions");
      // 히어로에는 진입이 둘입니다 -- 오늘 근거 보기와 코스 만들기(데스크탑
      // 히어로와 같은 구성). 둘 다 한 줄에 들어가고 넘치지 않아야 합니다.
      const link = actions.locator(":scope > a").first();
      await expect(link).toHaveText("오늘 후보 활동 4가지 보기 →");
      await expect(actions.locator(":scope > a").nth(1)).toHaveText("코스 만들기");
      const layout = await actions.evaluate(element => {
        const cta = element.querySelector("a")!;
        return {
          height: cta.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(getComputedStyle(cta).lineHeight),
          contentWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        };
      });
      expect(layout.height).toBeLessThanOrEqual(layout.lineHeight + 1);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.contentWidth + 1);
      // Main moved detailed evidence into Today; the existing home CTA must
      // still lead to a working explanation at every mobile breakpoint.
      await link.click();
      await expect(page).toHaveURL(/#today$/);
      // 「오늘」 탭의 근거 손잡이는 details 가 아니라 말풍선입니다(InfoPopover)
      // -- 한 화면에 손잡이가 다섯이라, 펴면 카드가 늘어나 아래가 밀려났습니다.
      const trigger = page.getByRole("button", { name: "퐁당 점수란?" });
      const explanation = page.getByRole("dialog", { name: "퐁당 점수란?" });
      await expect(explanation).toBeHidden();
      // 열어도 아래 내용이 밀려나지 않아야 합니다 -- 그것이 말풍선으로 바꾼 이유입니다.
      const below = page.locator(".td-hero").first();
      const beforeTop = (await below.boundingBox())!.y;
      await trigger.click();
      await expect(explanation).toBeVisible();
      await expect(explanation).toContainText("안전 판정이 아니며");
      expect((await below.boundingBox())!.y).toBe(beforeTop);
      // Esc 로 닫히고 초점이 손잡이로 돌아옵니다.
      await page.keyboard.press("Escape");
      await expect(explanation).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/score-help-${width}.png`, fullPage: true });
    });

    test("the last content and course actions can clear the fixed bottom tabs", async ({ page }) => {
      // 지도(코스 뷰 포함)는 페이지가 스크롤되지 않는 풀스크린 지도 화면입니다.
      // 본문이 문서 흐름을 타지 않고 지도 위 시트 안에서 스크롤하므로, 탭바를
      // 비켜 가는 방법도 다릅니다 -- 흐름의 슬롯이 아니라 **시트의 스크롤
      // 상자 자체**가 탭바 위에서 끝납니다. 확인하는 사실은 그대로입니다:
      // 마지막 내용이 탭 위에 남고, 눌러야 하는 것이 눌립니다.
      const sheetRoutes = new Set(["#map?view=course"]);
      for (const route of ["#home", "#today", "#recommend", "#map?view=course"]) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await expect(page.locator(".pd-tabbar")).toBeVisible();

        if (sheetRoutes.has(route)) {
          // 시트를 펴고 끝까지 내린 뒤, 스크롤 상자가 탭바 위에서 끝나는지와
          // 마지막 내용이 탭바에 가리지 않는지를 봅니다.
          await page.getByRole("button", { name: /자세히|접기/ }).click();
          const layout = await page.locator(".pd-sheet-body").evaluate(body => {
            body.scrollTop = body.scrollHeight;
            const bar = document.querySelector(".pd-tabbar")!.getBoundingClientRect();
            const last = body.lastElementChild!.getBoundingClientRect();
            return {
              tabTop: bar.top,
              scrollPortBottom: body.getBoundingClientRect().bottom,
              contentBottom: last.bottom,
              pageOverflow:
                document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight,
            };
          });
          expect(layout.scrollPortBottom, `${route}: the sheet must stop scrolling above the tabs`)
            .toBeLessThanOrEqual(layout.tabTop);
          expect(layout.contentBottom, `${route}: last content must remain above the tabs`)
            .toBeLessThanOrEqual(layout.tabTop);
          expect(layout.pageOverflow, `${route}: the fullscreen map page must not scroll`)
            .toBeLessThanOrEqual(1);
          continue;
        }

        // 문서 높이가 **멈춘 뒤에** 바닥까지 내려가 잽니다. 본문은 networkidle
        // 뒤에도 조금씩 자랍니다 -- 늦게 도착한 근거 한 줄이 붙습니다. 자라는
        // 중에 한 번만 내리면 스크롤 위치가 그만큼 뒤처져, 탭바 슬롯이 자리를
        // 제대로 잡고 있어도 마지막 내용이 탭 아래로 들어간 것처럼 보입니다.
        let previousHeight = -1;
        await expect
          .poll(
            async () => {
              const height = await page.evaluate(
                () => document.documentElement.scrollHeight,
              );
              const stable = height === previousHeight;
              previousHeight = height;
              return stable;
            },
            { timeout: 10000 },
          )
          .toBe(true);
        await page.evaluate(() => {
          const root = document.documentElement;
          window.scrollTo({ top: root.scrollHeight, behavior: "instant" });
        });
        const layout = await page.locator(".pd-tabbar-slot").evaluate(slot => {
          const bar = slot.querySelector("nav")!.getBoundingClientRect();
          const lastContent = slot.previousElementSibling!;
          const lastText = lastContent.querySelector(".pd-foot") ?? lastContent;
          return {
            tabTop: bar.top,
            slotHeight: slot.getBoundingClientRect().height,
            reservedHeight: window.innerHeight - bar.top,
            contentBottom: lastText.getBoundingClientRect().bottom,
          };
        });
        expect(layout.slotHeight, `${route}: fixed tabs and bottom offset need reserved space`).toBeGreaterThanOrEqual(layout.reservedHeight + 11);
        expect(layout.contentBottom, `${route}: last content must remain above the tabs`).toBeLessThanOrEqual(layout.tabTop - 11);
      }
      await page.screenshot({ path: `test-results/bottom-tabs-${width}.png`, fullPage: true });
    });
  });
}

// 분기점 **바로 위** 한 픽셀에서 데스크탑이 되는지 봅니다. 분기점 자체를
// breakpoints.ts 에서 읽으므로 값이 움직여도 이 검사는 여전히 경계를 봅니다.
test(`${DESKTOP_MIN}px keeps the existing desktop navigation layout`, async ({ page }) => {
  await page.setViewportSize({ width: DESKTOP_MIN, height: 985 });
  await page.goto("#home");
  await expect(page.locator(".pd-desktop")).toBeVisible();
  await expect(page.locator(".pd-dk-nav")).toBeVisible();
  await expect(page.locator(".pd-tabbar")).toHaveCount(0);
});

// 그 아래 한 픽셀은 모바일이어야 합니다. 두 검사가 붙어 있어야 분기점이
// 한쪽으로 새는 것을 잡습니다 -- 예전에는 위쪽만 있어서, 기준이 내려갔을 때
// 960~1079 에서 하단 탭바와 상단 네비가 함께 뜨는 것을 아무도 보지 못했습니다.
test(`${MOBILE_MAX_WIDTH}px keeps the mobile tab bar and no desktop nav`, async ({ page }) => {
  await page.setViewportSize({ width: MOBILE_MAX_WIDTH, height: 985 });
  await page.goto("#home");
  await expect(page.locator(".pd-tabbar")).toBeVisible();
  await expect(page.locator(".pd-dk-nav")).toHaveCount(0);
});


/** 부드러운 스크롤이 멈출 때까지. 자리를 재기 전에 기다립니다 -- 움직이는
 *  중에 재면 어느 순간의 값인지 알 수 없습니다. */
async function scrollSettled(page: Page) {
  await expect.poll(async () => {
    const first = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(120);
    const second = await page.evaluate(() => window.scrollY);
    return first === second;
  }).toBe(true);
}

for (const width of [MOBILE_WIDTH, TABLET_WIDTH, MOBILE_MAX_WIDTH]) {
  test(`${width}px 취향은 아래로 쌓이고, 지금 단계의 버튼은 탭바에 가리지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("#recommend");
    await page.getByRole("button", { name: "+ 더 고르기" }).click();
    await expect(page.getByRole("button", { name: "해변", exact: true })).toBeVisible();
    const blocks = page.locator(".rc-taste-tags.rc-block");
    for (let opened = 1; opened <= 10; opened++) {
      // 열린 덩어리는 **사라지지 않습니다**. 다음을 누를 때마다 하나씩 늘어납니다.
      await expect(blocks).toHaveCount(opened);
      const next = page.getByRole("button", { name: /^(다음|다음 · 카드로 확정하기)$/ });
      const lastCategory = (await next.innerText()).includes("카드");
      await scrollSettled(page);
      const layout = await next.evaluate(button => ({
        bottom: button.getBoundingClientRect().bottom,
        tabTop: document.querySelector(".pd-tabbar")!.getBoundingClientRect().top,
        noteBottom: [...button.closest(".pd-card")!.querySelectorAll(".pd-note")]
          .find(note => note.textContent?.includes("travel-keywords.v1"))!
          .getBoundingClientRect().bottom,
      }));
      // 근거 문구는 버튼 위에 있고, 버튼은 고정 탭바에 가리지 않습니다.
      expect(layout.noteBottom).toBeLessThanOrEqual(layout.bottom);
      expect(layout.bottom).toBeLessThanOrEqual(layout.tabTop - 12);
      // A real pointer click (without Playwright's automatic scrolling) catches interception.
      const rect = await next.boundingBox();
      await page.mouse.click(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
      if (lastCategory) break;
    }
    await expect(page.getByRole("heading", { name: "이건 어떠세요?" })).toBeVisible();
    // 첫 카테고리에서 고른 자리는 그대로 남아 있어, 되짚지 않고 고칠 수 있습니다.
    await expect(page.getByRole("button", { name: "해변", exact: true })).toBeVisible();
  });
}
