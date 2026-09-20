import { test, expect, type Locator, type Page } from "@playwright/test";
import { finishMobileTags } from "./recommendation";
import type { Preference, TripPlan } from "../../src/travelApi";

const writeHeaders = { Origin: "http://127.0.0.1:5177" };

async function preferences(page: Page) {
  const response = await page.request.get("api/data/travel/preferences");
  expect(response.status()).toBe(200);
  return await response.json() as { preference: Preference; revision: number };
}

async function replacePreference(page: Page, preference: Preference) {
  const current = await preferences(page);
  const response = await page.request.put("api/data/travel/preferences", {
    headers: writeHeaders,
    data: { preference, expected_revision: current.revision },
  });
  expect(response.status()).toBe(200);
}

async function clickAboveTabs(page: Page, action: Locator, atEnd = false) {
  await expect(action).toBeEnabled();
  if (atEnd) {
    await page.evaluate(() => window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "instant",
    }));
  }
  await action.scrollIntoViewIfNeeded();
  const layout = await action.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return {
      top: rect.top,
      bottom: rect.bottom,
      tabTop: document.querySelector(".pd-tabbar")!.getBoundingClientRect().top,
      receivesPointer: element.contains(document.elementFromPoint(x, y)),
      x,
      y,
    };
  });
  expect(layout.top).toBeGreaterThanOrEqual(0);
  expect(layout.bottom).toBeLessThanOrEqual(layout.tabTop);
  expect(layout.receivesPointer).toBe(true);
  // Keep the measured position: locator.click() may scroll before clicking.
  await page.mouse.click(layout.x, layout.y);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1079, height: 900 }]) {
  test.describe(`${viewport.width}px mobile course actions`, () => {
    test.use({ viewport });

    test("preference, candidate and saved-course actions remain clickable above the tabs", async ({ page }) => {
      const original = (await preferences(page)).preference;
      let savedPlanId: string | undefined;
      let routeRequests = 0;
      page.on("request", request => {
        if (request.url().endsWith("/travel/routes/recommend")) routeRequests++;
      });

      try {
        await replacePreference(page, { ...original, tags: [] });
        await page.goto("#recommend");
        await page.getByRole("button", { name: "태그로 바로 받기", exact: true }).click();
        await expect(page.getByRole("button", { name: "해변", exact: true })).toBeVisible();
        await finishMobileTags(page);
        const counter = page.getByText(/\d+ \/ \d+\s*번째 카드입니다/);
        const total = Number((await counter.innerText()).match(/\/\s*(\d+)/)![1]);
        for (let index = 1; index <= total; index++) {
          await expect(counter).toContainText(`${index} / ${total}`);
          await page.getByRole("button", { name: "패스", exact: true }).click();
        }
        await expect(page.getByRole("heading", { name: "이렇게 정리했어요" })).toBeVisible();

        const preferenceSaved = page.waitForResponse(response =>
          response.url().endsWith("/travel/preferences") && response.request().method() === "PUT");
        const candidatesRead = page.waitForResponse(response =>
          response.url().endsWith("/travel/recommendations") && response.request().method() === "POST");
        await clickAboveTabs(page, page.getByRole("button", { name: "취향 저장하고 코스 보기 →" }), true);
        expect((await preferenceSaved).status()).toBe(200);
        const candidatesResponse = await candidatesRead;
        expect(candidatesResponse.status()).toBe(200);
        expect((await candidatesResponse.json()).recommendations.length).toBeGreaterThan(0);
        await expect(page.getByRole("status").filter({ hasText: "취향을 저장했습니다." })).toBeVisible();

        await clickAboveTabs(page, page.getByRole("button", { name: "이 후보로 경로 계산" }));
        await expect(page.locator(".rt-form").getByRole("alert"))
          .toHaveText("출발지를 등록 장소에서 선택해 주세요.");
        expect(routeRequests).toBe(0);

        const planSaved = page.waitForResponse(response =>
          response.url().endsWith("/travel/plans") && response.request().method() === "POST");
        await clickAboveTabs(page, page.getByRole("button", { name: "내 코스에 저장", exact: true }), true);
        const planResponse = await planSaved;
        const plan: TripPlan = await planResponse.json();
        savedPlanId = plan.plan_id ?? undefined;
        expect(planResponse.status()).toBe(201);
        expect(savedPlanId).toBeTruthy();
        await expect(page.getByRole("button", { name: "저장됨", exact: true })).toBeDisabled();

        const plansRead = page.waitForResponse(response =>
          new URL(response.url()).pathname.endsWith("/travel/plans") && response.request().method() === "GET");
        await page.getByRole("link", { name: "내 코스", exact: true }).click();
        const plansResponse = await plansRead;
        expect(plansResponse.status()).toBe(200);
        const { rows } = await plansResponse.json() as { rows: TripPlan[] };
        const savedIndex = rows.findIndex(item => item.plan_id === savedPlanId);
        expect(savedIndex).toBeGreaterThanOrEqual(0);
        await expect(page.locator(".mc-row").first()).toBeVisible();
        await clickAboveTabs(page, page.getByRole("link", { name: "내 기록 열기" }), true);
        await expect(page).toHaveURL(/#travel-history$/);
        await expect(page.getByRole("heading", { name: "지난 코스 기록 · 실제 자료 조회", exact: true })).toBeVisible();

        await page.goto("#my-courses");
        await clickAboveTabs(page, page.locator(".mc-row").nth(savedIndex));
        await expect(page.locator(".mc-detail-list")).toBeVisible();
        await clickAboveTabs(page, page.getByRole("link", { name: "코스 상세 열기" }), true);
        await expect(page).toHaveURL(new RegExp(`#recommend\\?plan_id=${savedPlanId}$`));
        await expect(page.locator(".rc-stop-name").first()).toContainText("OFFLINE TEST");
        expect(routeRequests).toBe(0);
      } finally {
        if (savedPlanId) {
          const response = await page.request.delete(`api/data/travel/plans/${savedPlanId}`, {
            headers: writeHeaders,
          });
          expect(response.status()).toBe(204);
        }
        await replacePreference(page, original);
      }
    });
  });
}
