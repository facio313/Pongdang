import { test, expect } from "@playwright/test";

for (const width of [390, 1440]) {
  test.describe(`${width}px saved courses read states`, () => {
    test.use({ viewport: { width, height: 1000 } });
    const screen = width < 1080 ? ".my-courses-page" : ".pd-desktop";

    test.beforeEach(async ({ page }) => {
      await page.route("**/api/data/travel/sessions?**", route =>
        route.fulfill({ json: { rows: [] } }));
    });

    for (const status of [403, 503]) {
      test(`a ${status} response leaves the course count unknown`, async ({ page }) => {
        await page.route("**/api/data/travel/plans?**", route =>
          route.fulfill({ status, json: { detail: "fixture failure" } }));
        await page.goto("#my-courses");
        const body = page.locator(screen);
        await expect(body).toContainText("개수 미확인");
        await expect(body).toContainText("조회 실패");
        await expect(body.locator(".mc-lead[role=alert], .cd-note[role=alert]").first()).toBeVisible();
        await expect(body).not.toContainText(/(?:^|[^\d])0개/);
        await expect(body).not.toContainText("저장한 코스가 없습니다");
        await expect(body.locator(".mc-row, .cd-saved")).toHaveCount(0);
      });
    }

    test("only a completed empty response confirms zero courses", async ({ page }) => {
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      await page.route("**/api/data/travel/plans?**", async route => {
        await pending;
        await route.fulfill({ json: { rows: [] } });
      });
      await page.goto("#my-courses");
      const body = page.locator(screen);
      try {
        await expect(body).toContainText("조회 중");
        await expect(body).toContainText("저장 코스를 불러오는 중입니다.");
        await expect(body).not.toContainText(/(?:^|[^\d])0개/);
        await expect(body).not.toContainText("저장한 코스가 없습니다");
      } finally {
        release();
      }
      await expect(body).toContainText(width < 1080 ? "저장 0개" : "저장한 코스 0개");
      await expect(body).toContainText("아직 저장한 코스가 없습니다");
      await expect(body).not.toContainText("개수 미확인");
      await expect(body).not.toContainText("저장 코스를 불러오는 중입니다");
      await expect(body.locator(".mc-lead[role=alert], .cd-note[role=alert]")).toHaveCount(0);
    });
  });
}
