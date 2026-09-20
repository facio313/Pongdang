import { test, expect } from "@playwright/test";

for (const width of [390, 768, 979, 1079]) {
  test.describe(`${width}px mobile layout`, () => {
    test.use({ viewport: { width, height: 985 } });

    test("the home activity link stays readable and opens today's score explanation", async ({ page }) => {
      await page.goto("#home");
      await page.waitForLoadState("networkidle");
      const actions = page.locator(".hm-hero-actions");
      const link = actions.locator(":scope > a");
      await expect(link).toHaveText("오늘 후보 활동 5가지 보기 →");
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
      await page.getByText("퐁당 점수란?", { exact: true }).click();
      const explanation = page.locator(".pd-explainer").filter({ has: page.getByText("퐁당 점수란?", { exact: true }) });
      await expect(explanation).toHaveAttribute("open", "");
      await expect(explanation).toContainText("안전 판정이 아니며");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/score-help-${width}.png`, fullPage: true });
    });

    test("the last content and course actions can clear the fixed bottom tabs", async ({ page }) => {
      for (const route of ["#home", "#today", "#recommend", "#my-courses", "#map?view=course"]) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        await expect(page.locator(".pd-tabbar")).toBeVisible();
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
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
        if (route === "#my-courses") {
          const history = page.getByRole("link", { name: "내 기록 열기" });
          await expect(history).toBeVisible();
          await history.click({ trial: true });
          const rect = await history.boundingBox();
          expect(rect!.y + rect!.height).toBeLessThanOrEqual(layout.tabTop);
        }
      }
      await page.screenshot({ path: `test-results/bottom-tabs-${width}.png`, fullPage: true });
    });
  });
}

test("1080px keeps the existing desktop navigation layout", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 985 });
  await page.goto("#home");
  await expect(page.locator(".pd-desktop")).toBeVisible();
  await expect(page.locator(".pd-dk-nav")).toBeVisible();
  await expect(page.locator(".pd-tabbar")).toHaveCount(0);
});


for (const width of [390, 768, 1079]) {
  test(`${width}px recommendation STEP 1 CTA clears the tabs before any scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("#recommend");
    await page.getByRole("button", { name: "+ 더 고르기" }).click();
    await expect(page.getByRole("button", { name: "해변", exact: true })).toBeVisible();
    for (let index = 0; index < 10; index++) {
    const next = page.getByRole("button", { name: /^(다음|다음 · 카드로 확정하기)$/ });
    const lastCategory = (await next.innerText()).includes("카드");
    const layout = await next.evaluate(button => ({
      scrollY: window.scrollY,
      bottom: button.getBoundingClientRect().bottom,
      tabTop: document.querySelector(".pd-tabbar")!.getBoundingClientRect().top,
      noteBottom: [...document.querySelectorAll(".pd-card .pd-note")]
        .find(note => note.textContent?.includes("travel-keywords.v1"))!
        .getBoundingClientRect().bottom,
      slotTop: button.closest(".pd-action-slot")!.getBoundingClientRect().top,
    }));
    expect(layout.scrollY).toBe(0);
    expect(layout.noteBottom).toBeLessThanOrEqual(layout.slotTop);
    expect(layout.bottom).toBeLessThanOrEqual(layout.tabTop - 12);
    // A real pointer click (without Playwright's automatic scrolling) catches interception.
    const rect = await next.boundingBox();
    await page.mouse.click(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
    if (lastCategory) break;
    }
    await expect(page.getByRole("heading", { name: "이건 어떠세요?" })).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}
