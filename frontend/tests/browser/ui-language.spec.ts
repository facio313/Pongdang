import { test, expect, type Page } from "@playwright/test";

const languages = [
  { locale: "en", label: "English", menu: "Open side menu", today: "Today", definition: "A reference score from 0 to 100", help: "Missing values appear as" },
  { locale: "zh-CN", label: "简体中文", menu: "打开侧边菜单", today: "今天", definition: "以0至100的参考评分", help: "缺失值" },
  { locale: "ja", label: "日本語", menu: "サイドメニューを開く", today: "今日", definition: "選んだ活動に現在の条件が", help: "値がない場合" },
];

async function changeLanguage(page: Page, label: string) {
  await page.locator(".pd-menu-button").click();
  await page.locator(".pd-menu").getByRole("button", { name: label, exact: true }).click();
  await page.keyboard.press("Escape");
}

for (const width of [390, 1440]) {
  test(`${width}px place descriptions switch immediately without losing the place or expanded explanation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const [place] = await (await page.request.get("api/data/livecams/preview/places?q=")).json();
    expect(place).toBeTruthy();
    await page.goto(`#spots?spot_id=${place.id}`);
    const heading = page.locator(width < 1080 ? ".sd-hero-name" : ".sk-detail-name");
    // The provider's place name stays in its original language.
    await expect(heading).toHaveText(place.name);
    const explainer = page.locator(".pd-explainer:has(.pd-explainer-scale)");
    await explainer.locator("summary").click();
    for (const language of languages) {
      await changeLanguage(page, language.label);
      await expect(page.locator("html")).toHaveAttribute("lang", language.locale);
      await expect(page.getByRole("button", { name: language.menu, exact: true })).toBeVisible();
      await expect(heading).toHaveText(place.name);
      await expect(page).toHaveURL(new RegExp(`#spots\\?spot_id=${place.id}$`));
      await expect(explainer).toHaveAttribute("open", "");
      await expect(explainer).toContainText(language.definition);
      await expect(page.locator(width < 1080 ? ".pd-foot" : ".pd-dk-foot-note")).toContainText(language.help);
      await expect(page.locator('.pd-tabbar a[href="#today"], .pd-dk-nav-links a[href="#today"]')).toHaveText(language.today);
    }
    await changeLanguage(page, "한국어");
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    await expect(explainer).toContainText("안전 판정이 아니며");
    await expect(heading).toHaveText(place.name);
  });
}

test("utility-page language controls preserve an unsent question and localize form help", async ({ page }) => {
  await page.route("**/api/data/ai/status", route => route.fulfill({ json: { enabled: false, status: "disabled", reason: "ai_disabled", model: null } }));
  await page.goto("#ai");
  const question = page.locator("#ai-question");
  await question.fill("Keep this unsent question · 아직 전송하지 않음");
  await page.locator(".pd-language-inline summary").click();
  for (const language of languages) {
    await page.locator(".pd-language-inline").getByRole("button", { name: language.label, exact: true }).click();
    await expect(question).toHaveValue("Keep this unsent question · 아직 전송하지 않음");
    await expect(page.locator("html")).toHaveAttribute("lang", language.locale);
    await expect(page.locator(".ai-privacy")).not.toContainText(/[가-힣]/);
    await expect(page.locator("#ai-input-help")).not.toContainText(/[가-힣]/);
    await expect(page.locator(".ai-notice").first()).not.toContainText(/[가-힣]/);
  }
  await expect(page.locator(".ai-turn")).toHaveCount(0);
});

test("a language selected in the menu also applies to the data information page", async ({ page }) => {
  await page.goto("#home");
  await changeLanguage(page, "English");
  await page.locator(".pd-menu-button").click();
  await page.locator('.pd-menu a[href="#info"]').first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".collector-doc h1")).not.toContainText(/[가-힣]/);
  await expect(page.locator(".collector-doc > p")).not.toContainText(/[가-힣]/);
  await expect(page.locator(".collector-doc table").first()).not.toContainText(/[가-힣]/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".collector-doc h1")).not.toContainText(/[가-힣]/);
});
