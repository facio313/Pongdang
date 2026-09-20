import { test, expect } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`the ${width}px home activity link describes the five actual today tiles`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("#home");
    const link = page.getByRole("link", { name: "오늘 후보 활동 5가지 보기 →", exact: true });
    await expect(link).toBeVisible();
    await expect(page.locator("body")).not.toContainText("활동 여섯 가지 모두 보기");
    await link.click();
    await expect(page).toHaveURL(/#today$/);
    const tiles = page.locator(width < 1080 ? ".td-act" : ".td-activity");
    await expect(tiles).toHaveCount(5);
    await expect(tiles).toContainText(["수영", "서핑", "휴식", "래프팅", "온천"]);
    await expect(page.locator("body")).not.toContainText("갯벌 지원 중단");
  });
}

test("desktop footnotes reflect connected photos and activity scoring, with readable empty-state chips", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/data/attachments?spot_ids=**", (route) => {
    const ids = new URL(route.request().url()).searchParams.get("spot_ids")!.split(",");
    return route.fulfill({ json: { items: ids.map((id, index) => ({
      spot_id: Number(id), id: index + 1, url: `/api/data/attachments/${index + 1}/file`,
      name: "OFFLINE TEST 대표 사진", attribution: "OFFLINE TEST", license: "Type1",
      source_url: "https://example.test/photo",
    })) } });
  });
  await page.route("**/api/data/attachments/*/file", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="blue"/></svg>',
  }));
  await page.goto("#home");
  const photo = page.locator(".place-photo img").first();
  await photo.scrollIntoViewIfNeeded();
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(".pd-dk-foot-missing")).not.toContainText("대표 이미지");
  await page.goto("#today");
  await expect(page.locator(".pd-dk-foot-missing")).not.toContainText("대표 이미지");
  await page.goto("#recommend");
  await expect(page.locator(".pd-dk-foot-missing")).not.toContainText("서핑");
  await expect(page.locator(".pd-dk-foot-missing")).not.toContainText("온천 활동 점수");
  await expect(page.locator(".pd-desktop")).not.toContainText("서핑 · 온천 점수는 수집 항목이 아닙니다");
  await expect(page.locator(".pd-state-chip").filter({ hasText: /^자료 없음$/ })).toBeVisible();
  await expect(page.locator(".pd-state-chip").filter({ hasText: /^(no_data|partial)$/ })).toHaveCount(0);
});

test("mobile preferences describe the existing save flow and show saved choices after reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  let stored = { revision: 0, preference: { tags: [] as string[] } };
  const updates: { expected_revision: number; preference: { tags: string[] } }[] = [];
  await page.route("**/api/data/travel/preferences", async (route) => {
    if (route.request().method() === "PUT") {
      const update = route.request().postDataJSON();
      updates.push(update);
      stored = { revision: stored.revision + 1, preference: update.preference };
    }
    await route.fulfill({ json: stored });
  });
  await page.route("**/api/data/travel/keywords", (route) => route.fulfill({ json: {
    version: "travel-keywords.v1", categories: [{
      id: "activity", label: "활동", max_selections: 3,
      options: [{ id: "swim", label: "수영" }],
    }],
  } }));
  await page.route("**/api/data/travel/signals", (route) => route.fulfill({
    status: 201, json: { id: "00000000000000000000000000000074" },
  }));
  await page.goto("#recommend");
  const preferenceCard = page.locator(".pd-card").filter({ has: page.getByText("내 취향", { exact: true }) });
  await expect(preferenceCard).toContainText("선택 후 저장");
  await expect(preferenceCard).not.toContainText("수집 미구현");
  await preferenceCard.getByRole("button", { name: "수영", exact: true }).click();
  await preferenceCard.getByRole("button", { name: "+ 더 고르기" }).click();
  await expect(page.locator(".pd-state-chip").filter({ hasText: /^일부 자료$/ })).toBeVisible();
  await expect(page.locator(".pd-state-chip").filter({ hasText: /^(no_data|partial)$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "다음 · 카드로 확정하기" }).click();
  await page.getByRole("button", { name: "패스", exact: true }).click();
  await page.getByRole("button", { name: "취향 저장하고 코스 보기 →" }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0].expected_revision).toBe(0);
  expect(updates[0].preference.tags).toEqual(["수영"]);
  await page.reload();
  await expect(preferenceCard.getByRole("button", { name: "수영", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(preferenceCard).toContainText("선택 후 저장");
  await expect(preferenceCard).not.toContainText("수집 미구현");
});
