import { test, expect } from "@playwright/test";
import { routePreference } from "./recommendation";

for (const width of [390, 1440]) {
  test.describe(`home and preference entry at ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } });

    test("an anonymous home still sends you into the recommendation flow", async ({ page }) => {
      // 저장된 취향을 읽지 못한 것(익명 방문자의 401)을 **로그인 벽**으로 바꾸지
      // 않습니다. 예전에는 이 자리가 「로그인」 버튼이어서, 추천 7단계를 한 번도
      // 보지 못한 채 화면이 끝났습니다 -- 고르는 일에는 계정이 필요하지 않습니다.
      await page.route("**/api/data/travel/preferences", route => route.fulfill({
        status: 401, json: { detail: "SSO_LOGIN_REQUIRED" },
      }));
      await page.goto("#home");
      const enter = page.getByRole("link", { name: "취향 고르기 →", exact: true }).first();
      await expect(enter).toBeVisible();
      await expect(enter).toHaveAttribute("href", "#recommend");

      // 계정이 필요한 것은 **저장**뿐이고, 그 안내는 문단 안의 링크입니다.
      const note = page.locator(".guest-save-note").first();
      await expect(note).toContainText("로그인하면 저장돼요");
      await note.getByRole("button", { name: "로그인하면 저장돼요" }).click();
      await expect(page.getByRole("dialog", { name: "로그인" })).toBeVisible();
      await expect(page).toHaveURL(/#home$/);
      await page.getByRole("button", { name: "닫기", exact: true }).click();
    });

    test("an empty preference opens the first selection step directly", async ({ page }) => {
      await routePreference(page, []);
      await page.goto("#home");
      await page.getByRole("link", { name: "취향 고르기 →", exact: true }).click();
      await expect(page.getByRole("button", { name: "해변", exact: true })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "추천 지역" })).toHaveCount(1);
      await expect(page.getByRole("button", { name: "태그로 바로 받기", exact: true })).toHaveCount(0);
    });
  });
}

test("desktop preference review keeps one region selector and separates its summary", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await routePreference(page, ["해변", "물 보며 쉬기", "혼자", "조용한 휴식"]);
  await page.goto("#recommend");
  await page.getByRole("button", { name: "취향 바꾸기", exact: true }).click();
  for (let step = 0; step < 3; step++) {
    await expect(page.getByRole("combobox", { name: "추천 지역" })).toHaveCount(1);
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await page.getByRole("button", { name: "다음 · 고른 항목 확인", exact: true }).click();
  const summary = page.getByRole("region", { name: "고른 항목", exact: true });
  await expect(summary).toContainText("고른 항목 · 4개");
  await expect(page.getByRole("combobox", { name: "추천 지역" })).toHaveCount(1);
  const separated = await summary.evaluate(element => {
    const previous = element.previousElementSibling!;
    return element.getBoundingClientRect().top - previous.getBoundingClientRect().bottom >= 24
      && parseFloat(getComputedStyle(element).borderTopWidth) > 0;
  });
  expect(separated).toBe(true);
});

for (const failure of ["missing", "unavailable"]) {
  test(`home beach cards use a labelled shared image when photos are ${failure}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (failure === "missing") {
      await page.route("**/api/data/attachments?**", route => route.fulfill({ json: { items: [] } }));
    } else {
      await page.route("**/api/data/attachments/*/file", route => route.fulfill({ status: 404, body: "Photo unavailable" }));
    }
    await page.goto("#home");
    const photos = page.locator(".hd-beach-photo img");
    await expect(photos).toHaveCount(4);
    for (const photo of await photos.all()) {
      await photo.scrollIntoViewIfNeeded();
      await expect(photo).toHaveAttribute("alt", "공용 바다 이미지 · 실제 장소 사진 아님");
      await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
  });
}
