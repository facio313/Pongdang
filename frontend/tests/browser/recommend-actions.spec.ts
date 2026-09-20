import { test, expect, type Page, type Route } from "@playwright/test";
import { routePreference } from "./recommendation";
import type { RecommendationResult, TripPlan } from "../../src/travelApi";

test.use({ viewport: { width: 1440, height: 1000 } });
test.beforeEach(async ({ page }) => { await routePreference(page, ["물 보며 쉬기"]); });

const candidatesPath = "**/api/data/travel/recommendations";
const findCandidates = (page: Page) =>
  page.getByRole("button", { name: "이 조건으로 후보 찾기" });
const cancelCandidates = (page: Page) =>
  page.getByRole("button", { name: "후보 조회 취소" });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function realCandidates(route: Route, label?: string) {
  const response = await route.fetch();
  expect(response.status()).toBe(200);
  const result: RecommendationResult = await response.json();
  expect(result.recommendations.length).toBeGreaterThan(0);
  return {
    ...result,
    recommendations: result.recommendations.map((item, index) => ({
      ...item,
      name: label ? `${label} ${index + 1}` : item.name,
    })),
  };
}

test("candidate search replaces a pending desktop conversation and releases waiting state", async ({ page }) => {
  const releaseChat = deferred();
  const chatFinished = deferred();
  let chatRequests = 0;
  let candidateRequests = 0;
  await page.route("**/api/data/ai/chat", async (route) => {
    chatRequests += 1;
    await releaseChat.promise;
    try {
      await route.fulfill({ json: {
        answer: "늦게 도착한 대화 답변",
        clarification: null,
        status: "available",
        reason_codes: [],
      } });
    } finally {
      chatFinished.resolve();
    }
  });
  await page.route(candidatesPath, async (route) => {
    candidateRequests += 1;
    await route.fulfill({ json: await realCandidates(route, "새 후보") });
  });
  await page.goto("#recommend");
  await page.getByRole("button", { name: "AI에게 이어서 물어보기 →" }).click();
  await page.getByLabel("컨시어지에게 보낼 내용").fill("물 보면서 쉬고 싶어요");
  await page.getByRole("button", { name: "보내기" }).click();
  try {
    await expect.poll(() => chatRequests).toBe(1);
    await expect(page.locator(".rd-bubbles")).toContainText("답변을 조회하고 있습니다");
    await findCandidates(page).click();
    await expect.poll(() => candidateRequests).toBe(1);
    await expect(page.locator(".rd-step-name").first()).toHaveText("새 후보 1");
    await expect(cancelCandidates(page)).toHaveCount(0);
    await page.getByRole("button", { name: "AI에게 이어서 물어보기 →" }).click();
    await expect(page.locator(".rd-bubbles")).not.toContainText("답변을 조회하고 있습니다");
    await page.getByLabel("컨시어지에게 보낼 내용").fill("다음 대화");
    await expect(page.getByRole("button", { name: "보내기" })).toBeEnabled();
  } finally {
    releaseChat.resolve();
  }
  await chatFinished.promise;
  await expect(page.locator(".rd-bubbles")).not.toContainText("늦게 도착한 대화 답변");
  await page.getByRole("button", { name: "후보와 경로 보기 →" }).click();
  await expect(page.locator(".rd-step-name").first()).toHaveText("새 후보 1");
});

test("each candidate click starts a new request and an older response cannot replace it", async ({ page }) => {
  const releaseFirst = deferred();
  const firstFinished = deferred();
  let requests = 0;
  await page.route(candidatesPath, async (route) => {
    const number = ++requests;
    const result = await realCandidates(route, number === 1 ? "이전 후보" : "최신 후보");
    if (number === 1) {
      await releaseFirst.promise;
      try {
        await route.fulfill({ json: result });
      } finally {
        firstFinished.resolve();
      }
    } else {
      await route.fulfill({ json: result });
    }
  });
  await page.goto("#recommend");
  await findCandidates(page).click();
  try {
    await expect.poll(() => requests).toBe(1);
    await expect(cancelCandidates(page)).toBeVisible();
    await findCandidates(page).click();
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator(".rd-step-name").first()).toHaveText("최신 후보 1");
    await expect(cancelCandidates(page)).toHaveCount(0);
  } finally {
    releaseFirst.resolve();
  }
  await firstFinished.promise;
  await expect(page.locator(".rd-step-name").first()).toHaveText("최신 후보 1");
  await expect(page.locator(".rd-steps")).not.toContainText("이전 후보");
});

test("failed candidate reads release waiting state and the next click retries", async ({ page }) => {
  let requests = 0;
  await page.route(candidatesPath, async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.fulfill({ status: 503, json: { detail: "fixture failure" } });
    } else {
      await route.fulfill({ json: await realCandidates(route, "재시도 후보") });
    }
  });
  await page.goto("#recommend");
  await findCandidates(page).click();
  await expect(page.locator(".rd-note[role=alert]")).toContainText("요청을 처리하지 못했습니다");
  await expect(page.locator(".rd-step-name")).toHaveCount(0);
  await expect(cancelCandidates(page)).toHaveCount(0);
  await findCandidates(page).click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator(".rd-step-name").first()).toHaveText("재시도 후보 1");
  await expect(page.locator(".rd-note[role=alert]")).toHaveCount(0);
  await expect(cancelCandidates(page)).toHaveCount(0);
});

test("canceling a candidate read releases waiting state without publishing the late result", async ({ page }) => {
  const releaseFirst = deferred();
  const firstFinished = deferred();
  let requests = 0;
  await page.route(candidatesPath, async (route) => {
    const number = ++requests;
    const result = await realCandidates(route, number === 1 ? "취소한 후보" : "다시 찾은 후보");
    if (number === 1) {
      await releaseFirst.promise;
      try {
        await route.fulfill({ json: result });
      } finally {
        firstFinished.resolve();
      }
    } else {
      await route.fulfill({ json: result });
    }
  });
  await page.goto("#recommend");
  await findCandidates(page).click();
  try {
    await expect.poll(() => requests).toBe(1);
    await cancelCandidates(page).click();
    await expect(cancelCandidates(page)).toHaveCount(0);
    await expect(findCandidates(page)).toBeEnabled();
    await page.getByRole("button", { name: "AI에게 이어서 물어보기 →" }).click();
    await page.getByLabel("컨시어지에게 보낼 내용").fill("대화도 다시 보낼 수 있나요");
    await expect(page.getByRole("button", { name: "보내기" })).toBeEnabled();
  } finally {
    releaseFirst.resolve();
  }
  await firstFinished.promise;
  await expect(page.locator(".rd-step-name")).toHaveCount(0);
  await findCandidates(page).click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator(".rd-step-name").first()).toHaveText("다시 찾은 후보 1");
  await expect(page.locator(".rd-steps")).not.toContainText("취소한 후보");
});

for (const nextResult of ["empty", "failed"] as const) {
  test(`saved confirmation is cleared when the next candidate read is ${nextResult}`, async ({ page }) => {
    let requests = 0;
    let firstResult: RecommendationResult;
    await page.route(candidatesPath, async (route) => {
      requests += 1;
      if (requests === 1) {
        firstResult = await realCandidates(route);
        await route.fulfill({ json: firstResult });
      } else if (nextResult === "failed") {
        await route.fulfill({ status: 503, json: { detail: "fixture failure" } });
      } else {
        await route.fulfill({ json: {
          ...firstResult,
          recommendations: [],
          selection_token: null,
          status: "no_data",
          clarification: "지금 조건에 맞는 후보가 없습니다.",
        } });
      }
    });

    // Normalize the real selection with the read-only draft API, then imitate
    // a successful save without leaving any plans in the shared test database.
    let savedPlan: TripPlan;
    const planId = "00000000000000000000000000000073";
    await page.route("**/api/data/travel/plans", async (route) => {
      expect(route.request().method()).toBe("POST");
      const response = await route.fetch({ url: `${route.request().url()}/draft` });
      expect(response.status()).toBe(200);
      savedPlan = { ...await response.json(), plan_id: planId, revision: 1 };
      await route.fulfill({ json: savedPlan });
    });
    await page.route(`**/api/data/travel/plans/${planId}`, (route) =>
      route.fulfill({ json: savedPlan }));

    await page.goto("#recommend");
    await findCandidates(page).click();
    await expect(page.locator(".rd-step-name").first()).toContainText("OFFLINE TEST");
    await page.getByRole("button", { name: "내 코스에 저장", exact: true }).click();
    await expect(page.locator(".rd-note").filter({ hasText: "내 코스에 저장했습니다" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`#recommend\\?plan_id=${planId}$`));

    await findCandidates(page).click();
    await expect.poll(() => requests).toBe(2);
    if (nextResult === "empty") {
      await expect(page.locator(".rd-note").filter({ hasText: "지금 조건에 맞는 후보가 없습니다." })).toBeVisible();
      await expect(page.locator(".rd-step-name")).toHaveCount(0);
    } else {
      await expect(page.locator(".rd-note[role=alert]")).toContainText("요청을 처리하지 못했습니다");
    }
    await expect(page.locator(".pd-desktop")).not.toContainText("내 코스에 저장했습니다");
    await expect(cancelCandidates(page)).toHaveCount(0);
  });
}
