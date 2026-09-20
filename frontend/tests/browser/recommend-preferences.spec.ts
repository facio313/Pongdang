import { test, expect, type Page } from "@playwright/test";
import type { Preference } from "../../src/travelApi";

test.use({ viewport: { width: 390, height: 844 } });

type Category = {
  id: string;
  label: string;
  max_selections: number;
  options: { id: string; label: string }[];
};

async function preferences(page: Page) {
  const response = await page.request.get("api/data/travel/preferences");
  expect(response.status()).toBe(200);
  return await response.json() as { preference: Preference; revision: number };
}

async function replacePreference(page: Page, preference: Preference) {
  const current = await preferences(page);
  const response = await page.request.put("api/data/travel/preferences", {
    headers: { Origin: "http://127.0.0.1:5177" },
    data: { preference, expected_revision: current.revision },
  });
  expect(response.status()).toBe(200);
}

async function catalogue(page: Page) {
  const response = await page.request.get("api/data/travel/keywords");
  expect(response.status()).toBe(200);
  return (await response.json()).categories as Category[];
}

let original: Preference;
test.beforeEach(async ({ page }) => {
  original = (await preferences(page)).preference;
  await replacePreference(page, { ...original, tags: [] });
});
test.afterEach(async ({ page }) => {
  await replacePreference(page, original);
});

async function openTags(page: Page) {
  await page.goto("#recommend");
  await page.getByRole("button", { name: "태그로 바로 받기" }).click();
  await expect(page.getByRole("button", { name: "다음 · 카드로 확정하기" })).toBeVisible();
}

test("mobile activity likes stop at the server limit and valid preferences receive a real PUT 200", async ({ page }) => {
  const activity = (await catalogue(page)).find((group) => group.id === "activity")!;
  expect(activity.options.length).toBeGreaterThan(activity.max_selections);
  await openTags(page);
  await page.getByRole("button", { name: "다음 · 카드로 확정하기" }).click();

  for (const [index, option] of activity.options.entries()) {
    await expect(page.locator(".rc-swipe-name")).toHaveText(option.label);
    const like = page.getByRole("button", { name: "좋아요", exact: true });
    if (index < activity.max_selections) {
      await expect(like).toBeEnabled();
      await like.click();
    } else {
      await expect(like).toBeDisabled();
      await expect(page.getByRole("status").filter({ hasText: "태그와 좋아요를 합쳐" }))
        .toContainText("최대 개수를 골랐습니다");
      await page.getByRole("button", { name: "패스", exact: true }).click();
    }
  }

  const selected = activity.options.slice(0, activity.max_selections).map((option) => option.label);
  await expect(page.getByRole("button", { name: /좋아요 선택 해제$/ })).toHaveCount(activity.max_selections);
  const saved = page.waitForResponse((response) =>
    response.url().endsWith("/travel/preferences") && response.request().method() === "PUT");
  const recommended = page.waitForResponse((response) =>
    response.url().endsWith("/travel/recommendations") && response.request().method() === "POST");
  await page.getByRole("button", { name: "취향 저장하고 코스 보기 →" }).click();
  const savedResponse = await saved;
  expect(savedResponse.status()).toBe(200);
  expect(savedResponse.request().postDataJSON().preference.tags).toEqual(selected);
  expect((await recommended).status()).toBe(200);
  await expect(page.getByRole("status").filter({ hasText: "취향을 저장했습니다." })).toBeVisible();
  expect((await preferences(page)).preference.tags).toEqual(selected);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("tag and card selections share the limit, and the summary can remove either source", async ({ page }) => {
  const groups = await catalogue(page);
  const activity = groups.find((group) => group.id === "activity")!;
  const companion = groups.find((group) => group.id === "companion")!;
  const tagged = activity.options.at(-1)!;
  await openTags(page);
  await page.getByRole("button", { name: tagged.label, exact: true }).click();
  await page.getByRole("button", { name: companion.options[0].label, exact: true }).click();
  await expect(page.getByRole("button", { name: companion.options[1].label, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: companion.options[0].label, exact: true }).click();
  await expect(page.getByRole("button", { name: companion.options[1].label, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "다음 · 카드로 확정하기" }).click();

  for (const [index, option] of activity.options.entries()) {
    await expect(page.locator(".rc-swipe-name")).toHaveText(option.label);
    const like = page.getByRole("button", { name: "좋아요", exact: true });
    if (index < activity.max_selections - 1 || option.id === tagged.id) {
      // Liking an already selected tag does not consume another slot.
      await expect(like).toBeEnabled();
      await like.click();
    } else {
      await expect(like).toBeDisabled();
      await page.getByRole("button", { name: "패스", exact: true }).click();
    }
  }
  await page.getByRole("button", { name: `${tagged.label} 태그 선택 해제`, exact: true }).click();
  await expect(page.getByRole("button", { name: `${tagged.label} 좋아요 선택 해제`, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: `${activity.options[0].label} 좋아요 선택 해제`, exact: true }).click();
  const saved = page.waitForResponse((response) =>
    response.url().endsWith("/travel/preferences") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "취향 저장하고 코스 보기 →" }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().preference.tags)
    .toEqual(activity.options.slice(1, activity.max_selections - 1).map((option) => option.label));
});

test("previously stored activity selections above the limit can be reduced before leaving tags", async ({ page }) => {
  const activity = (await catalogue(page)).find((group) => group.id === "activity")!;
  await replacePreference(page, { ...original, tags: activity.options.map((option) => option.label) });
  await openTags(page);
  const next = page.getByRole("button", { name: "다음 · 카드로 확정하기" });
  await expect(next).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(`최대 ${activity.max_selections}개`);
  for (const option of activity.options.slice(activity.max_selections)) {
    await page.getByRole("button", { name: option.label, exact: true }).click();
  }
  await expect(next).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await next.click();
  await expect(page.locator(".rc-swipe-name")).toHaveText(activity.options[0].label);
});

test("pending and failed card signals do not block the next card or navigation", async ({ page }) => {
  const activity = (await catalogue(page)).find((group) => group.id === "activity")!;
  const requests: { action: string; tags: string[] }[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/travel/signals", async route => {
    requests.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"signal_unavailable"}' });
  });
  try {
    await openTags(page);
    await page.getByRole("button", { name: "다음 · 카드로 확정하기" }).click();
    for (const [index, name] of ["좋아요", "패스"].entries()) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.locator(".rc-swipe-name")).toHaveText(activity.options[index + 1].label);
      await expect(page.getByText("서버에 요청 중입니다…", { exact: true })).toHaveCount(0);
      await expect(page.locator(".recommend-page")).toHaveAttribute("aria-busy", "false");
      await expect(page.getByRole("button", { name: "← 추천 처음으로" })).toBeEnabled();
      await expect(page.getByRole("link", { name: "오늘", exact: true })).toBeEnabled();
    }
    await expect.poll(() => requests.length).toBe(2);
    expect(requests).toEqual([
      { kind: "card", action: "like", tags: [activity.options[0].label] },
      { kind: "card", action: "skip", tags: [activity.options[1].label] },
    ]);
    release();
    await page.unrouteAll({ behavior: "wait" });
    await expect(page.getByRole("alert")).toContainText("카드 반응을 서버에 기록하지 못했습니다");
    await expect(page.locator(".rc-status")).toHaveCount(0);
    await page.getByRole("button", { name: "패스", exact: true }).click();
    await expect(page.locator(".rc-swipe-name")).toHaveText(activity.options[3].label);
    await page.getByRole("link", { name: "오늘", exact: true }).click();
    await expect(page).toHaveURL(/#today$/);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("equal place and activity labels are sent once while category IDs survive", async ({ page }) => {
  const activity = (await catalogue(page)).find((group) => group.id === "activity")!;
  await openTags(page);
  const onsen = page.getByRole("button", { name: "온천", exact: true });
  await onsen.nth(0).click();
  await onsen.nth(1).click();
  await page.getByRole("button", { name: "서핑", exact: true }).click();
  await page.getByRole("button", { name: "다음 · 카드로 확정하기" }).click();
  for (const option of activity.options) {
    await expect(page.locator(".rc-swipe-name")).toHaveText(option.label);
    await page.getByRole("button", { name: "패스", exact: true }).click();
  }
  const saved = page.waitForResponse(response =>
    response.url().endsWith("/travel/preferences") && response.request().method() === "PUT");
  const recommended = page.waitForResponse(response =>
    response.url().endsWith("/travel/recommendations") && response.request().method() === "POST");
  await page.getByRole("button", { name: "취향 저장하고 코스 보기 →" }).click();
  const savedResponse = await saved;
  expect(savedResponse.status()).toBe(200);
  const tags = savedResponse.request().postDataJSON().preference.tags;
  expect(tags).toEqual(["온천", "서핑"]);
  expect(tags.filter((tag: string) => tag === "온천")).toHaveLength(1);
  const recommendationResponse = await recommended;
  expect(recommendationResponse.status()).toBe(200);
  const request = recommendationResponse.request().postDataJSON().request;
  expect(request.preferred_tags).toEqual(tags);
  expect(request.keyword_selection).toEqual([
    { category: "place_type", values: ["hot_spring"] },
    { category: "activity", values: ["onsen", "surf"] },
  ]);
  await expect(page.getByRole("status").filter({ hasText: "취향을 저장했습니다." })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect((await preferences(page)).preference.tags).toEqual(tags);
});

test("preference save stays guarded through PUT and an empty candidate response", async ({ page }) => {
  const activity = (await catalogue(page)).find((group) => group.id === "activity")!;
  let releasePut!: () => void;
  let releaseCandidates!: () => void;
  const pendingPut = new Promise<void>(resolve => { releasePut = resolve; });
  const pendingCandidates = new Promise<void>(resolve => { releaseCandidates = resolve; });
  let putCount = 0;
  let candidateCount = 0;
  await page.route("**/travel/preferences", async route => {
    if (route.request().method() !== "PUT") return route.continue();
    putCount++;
    await pendingPut;
    await route.continue();
  });
  await page.route("**/travel/recommendations", async route => {
    candidateCount++;
    const response = await route.fetch();
    const body = await response.json();
    await pendingCandidates;
    // Explicit empty-200 fixture: catalogue contents must not determine whether
    // a successful preference PUT is reported as saved.
    await route.fulfill({ response, json: { ...body, recommendations: [] } });
  });
  try {
    await openTags(page);
    await page.getByRole("button", { name: "다음 · 카드로 확정하기" }).click();
    for (const option of activity.options) {
      await expect(page.locator(".rc-swipe-name")).toHaveText(option.label);
      await page.getByRole("button", { name: "패스", exact: true }).click();
    }
    const save = page.getByRole("button", { name: "취향 저장하고 코스 보기 →" });
    await save.click();
    await expect.poll(() => putCount).toBe(1);
    await expect(save).toBeDisabled();
    await expect(page.getByText("서버에 요청 중입니다…", { exact: true })).toBeVisible();
    await expect(page.getByText("취향을 저장했습니다.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "오늘", exact: true })).toBeEnabled();
    const rect = await save.boundingBox();
    await page.mouse.click(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
    const saved = page.waitForResponse(response =>
      response.url().endsWith("/travel/preferences") && response.request().method() === "PUT");
    releasePut();
    expect((await saved).status()).toBe(200);
    await expect.poll(() => candidateCount).toBe(1);
    await expect(save).toBeDisabled();
    await expect(page.getByText("취향을 저장했습니다.", { exact: true })).toBeVisible();
    releaseCandidates();
    await expect(page.locator(".recommend-page")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByText("취향을 저장했습니다.", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(putCount).toBe(1);
    expect(candidateCount).toBe(1);
  } finally {
    releasePut();
    releaseCandidates();
    await page.unrouteAll({ behavior: "wait" });
  }
});
