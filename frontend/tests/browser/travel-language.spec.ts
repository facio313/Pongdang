import { test, expect, type Page } from "@playwright/test";
import { routePreference } from "./recommendation";

const languages = [
  { locale: "en", label: "English", name: "OFFLINE TEST English attraction", provider: "tourapi_english", find: "Find candidates with these preferences", message: "Message to the concierge", send: "Send" },
  { locale: "ja", label: "日本語", name: "OFFLINE TEST 日本語観光地", provider: "tourapi_japanese", find: "この条件で候補を探す", message: "コンシェルジュへのメッセージ", send: "送信" },
  { locale: "zh-CN", label: "简体中文", name: "OFFLINE TEST 简体中文景点", provider: "tourapi_chinese_simplified", find: "按这些条件查找候选地点", message: "发送给旅行助手的内容", send: "发送" },
];

async function selectLanguage(page: Page, label: string) {
  await page.locator(".pd-menu-button").click();
  const panel = page.locator(".pd-menu");
  const button = panel.getByRole("button", { name: label, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await panel.locator(".pd-menu-close").click();
}

test("desktop toggles query the selected real provider and retain the choice after navigation and reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await routePreference(page, ["물 보며 쉬기"]);
  await page.goto("#recommend");
  for (const language of languages) {
    await selectLanguage(page, language.label);
    const response = page.waitForResponse(response => response.url().endsWith("/travel/recommendations"));
    await page.getByRole("button", { name: language.find, exact: true }).click();
    const result = await response;
    expect(result.status()).toBe(200);
    expect(result.request().postDataJSON().request.locale).toBe(language.locale);
    expect(result.request().postDataJSON().request.preferred_tags).toContain("물 보며 쉬기");
    const payload = await result.json();
    expect(payload.recommendations).toHaveLength(1);
    expect(payload.recommendations[0].catalog_locale).toBe(language.locale);
    expect(payload.recommendations[0].evidence[0].provider).toBe(language.provider);
    await expect(page.locator(".rd-step-name").first()).toHaveText(language.name);
  }
  await page.locator(".pd-dk-nav-link[href='#home']").click();
  const savedPick = page.locator(".hd-taste-spot").first();
  await expect(savedPick.locator(".hd-taste-spot-name")).toHaveText(languages[2].name);
  await expect(savedPick.locator(".hd-taste-spot-meta")).toContainText("水边休息");
  await selectLanguage(page, "English");
  await expect(savedPick.locator(".hd-taste-spot-meta")).toContainText("Relax by the water");
  await expect(savedPick.locator(".hd-taste-spot-name")).toHaveText(languages[2].name);
  await selectLanguage(page, "简体中文");
  await page.locator(".pd-dk-nav-link[href='#today']").click();
  await page.reload();
  await page.locator(".pd-menu-button").click();
  await expect(page.getByRole("button", { name: "简体中文", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.locator(".pd-dk-nav-link[href='#recommend']").click();
  await selectLanguage(page, "한국어");
  const response = page.waitForResponse(response => response.url().endsWith("/travel/recommendations"));
  await page.getByRole("button", { name: "이 조건으로 후보 찾기" }).click();
  const payload = await (await response).json();
  expect(payload.recommendations.length).toBeGreaterThan(0);
  expect(payload.recommendations.every((item: { catalog_locale: string }) => item.catalog_locale === "ko")).toBe(true);
});

test("mobile preference flow sends the selected language and shows its provider place", async ({ page }) => {
  await routePreference(page);
  await page.goto("#recommend");
  await selectLanguage(page, "English");
  await page.getByRole("button", { name: "Find directly with tags", exact: true }).click();
  for (let index = 0; index < 10; index++) {
    const next = page.getByRole("button", { name: "Next", exact: true });
    if (!(await next.count())) break;
    await next.click();
  }
  await page.getByRole("button", { name: "Next · Confirm with cards", exact: true }).click();
  const counter = page.getByText(/Card \d+ of \d+\./);
  const total = Number((await counter.innerText()).match(/of (\d+)/)![1]);
  for (let index = 0; index < total; index++) {
    await page.getByRole("button", { name: "Pass", exact: true }).click();
  }
  const response = page.waitForResponse(response => response.url().endsWith("/travel/recommendations"));
  await page.getByRole("button", { name: "Save preferences and view itinerary →", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  expect(result.request().postDataJSON().request.locale).toBe("en");
  await expect(page.locator(".rc-timeline")).toContainText(languages[0].name);
});

test("a language change applies to the next conversation turn without reusing a different-language selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await routePreference(page, ["물 보며 쉬기"]);
  await page.goto("#recommend");
  await page.getByRole("button", { name: "이 조건으로 후보 찾기" }).click();
  await expect(page.locator(".rd-step-name").first()).toBeVisible();
  await page.getByRole("button", { name: "AI에게 이어서 물어보기 →" }).click();
  const requests: { travel: { request: { locale: string }; selection_token?: string }; history: { content: string }[] }[] = [];
  await page.route("**/api/data/ai/chat", async route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({ json: {
      status: "available", clarification: null,
      answer: body.travel.request.locale === "en" ? "English travel reply" : "日本語の旅行案内",
      travel: body.travel,
    } });
  });
  for (const language of languages.slice(0, 2)) {
    await selectLanguage(page, language.label);
    if (language.locale === "en") {
      await expect(page.locator(".rd-bubbles")).toContainText("What kind of waterside trip would you like?");
    } else {
      await expect(page.locator(".rd-bubbles")).toContainText("English travel reply");
    }
    await page.getByLabel(language.message).fill("추천해 주세요");
    await page.getByRole("button", { name: language.send, exact: true }).click();
    await expect(page.locator(".rd-bubbles")).toContainText(language.locale === "en" ? "English travel reply" : "日本語の旅行案内");
  }
  expect(requests.map(item => item.travel.request.locale)).toEqual(["en", "ja"]);
  expect(requests.every(item => !item.travel.selection_token)).toBe(true);
  expect(requests[0].history[0].content).toContain("What kind of waterside trip would you like?");
  expect(requests[1].history.some(item => item.content === "English travel reply")).toBe(true);
});

test("invalid stored languages default to Korean and blocked storage still allows switching", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pongdang.travel-language", "unsupported");
    Storage.prototype.setItem = () => { throw new DOMException("Storage blocked", "SecurityError"); };
  });
  await routePreference(page);
  await page.goto("#recommend");
  await page.locator(".pd-menu-button").click();
  await expect(page.getByRole("button", { name: "한국어", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await expect(page.getByRole("button", { name: "日本語", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pd-language-note[role=status]")).toContainText("現在のタブにのみ適用します");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});
