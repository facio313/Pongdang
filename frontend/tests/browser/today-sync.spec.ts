import { test, expect, type Page } from "@playwright/test";
import { ACTIVITY_LABEL, headlineOf, serverRecommendation } from "./recommendation";

/** 오늘 탭의 두 폭이 같은 사실을 말하는지 봅니다.
 *
 *  추천 판단이 서버로 옮겨 갈 때 이 탭은 데스크탑만 따라갔습니다. 모바일은
 *  「오늘의 수영 조건」이라는 상수 문장을 걸고 수영 점수만 늘어놓아, 같은 장소
 *  같은 시각을 두고 홈은 온천을 권하는데 이 화면은 수영을 보여 줄 수 있었습니다.
 *
 *  활동 타일은 추천이 이미 싣고 온 조건 응답을 씁니다. 활동마다 따로 묻던 여섯
 *  번의 조회가 사라지고, 히어로 점수와 타일이 같은 응답의 같은 시각이 됩니다. */

/** 이 렌더에서 나간 water-index 조건 조회. 활동 타일이 쓰는 것은 「지금」의
 *  관측(mode=observation)이라, 주간 예보(mode=forecast)와 갈라서 셉니다. */
async function recordConditionQueries(page: Page) {
  const asked: { activity: string; mode: string; spot: string }[] = [];
  await page.route("**/api/data/water-index/conditions?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    asked.push({
      activity: query.get("activity") ?? "",
      mode: query.get("mode") ?? "",
      spot: query.get("spot_id") ?? "",
    });
    return route.continue();
  });
  return asked;
}

test("모바일 오늘 탭도 서버가 고른 활동을 말한다", async ({ page }) => {
  await page.goto("#today");
  const placeResponse = await page.request.get(
    "api/data/datasets/spots?page_size=100&q=강릉",
  );
  const place = (await placeResponse.json()).rows.find((item: { name: string }) =>
    item.name.includes("경포"),
  );
  const recommendation = await serverRecommendation(page, place.id);
  const best = recommendation.choice;

  const hero = page.locator(".td-hero-sentence");
  // 화면이 스스로 고르지 않는다는 것이 요지이므로 기대값을 다시 계산하지 않고
  // 서버 응답을 그대로 읽습니다.
  if (best) {
    await expect(hero).toContainText(headlineOf(best.activity));
    await expect(page.locator(".td-hero-score-num")).toHaveText(String(best.score));
    await expect(page.locator(".td-hero-score .pd-grade-chip")).toContainText(
      `${ACTIVITY_LABEL[best.activity]} 적합도`,
    );
  } else {
    await expect(hero).toContainText("활동이 없어요");
  }
  // 상수 문장은 사라졌습니다.
  await expect(hero).not.toContainText("자료를 확인하세요");
  // 아래 지점 비교 · 주간 예보도 그 활동을 따라갑니다. 예전에는 수영 고정이라
  // 히어로와 다른 기준의 점수가 같은 화면에 함께 있었습니다.
  if (best) {
    const label = ACTIVITY_LABEL[best.activity];
    await expect(page.locator(".today-page")).toContainText(`지점 비교 · ${label} 점수`);
    await expect(page.locator(".today-page")).toContainText(`7일 예보 · ${label}`);
  }
});

test("활동 타일은 추천이 이미 실어 온 조건을 쓰고 따로 묻지 않는다", async ({
  page,
}) => {
  const asked = await recordConditionQueries(page);
  await page.goto("#today");
  await expect(page.locator(".td-act")).toHaveCount(5);
  await expect(page.locator(".td-act-score").first()).not.toBeEmpty();
  // 지점 비교 줄의 조회는 타일보다 늦게 나갑니다. 다 나간 뒤에 세지 않으면
  // 이 검사는 아무것도 보지 않은 채 통과합니다.
  await page.waitForLoadState("networkidle");

  const chosen = String(
    (await (await page.request.get("api/data/water-index/default-place")).json())
      .place?.id ?? "",
  );
  // 고른 장소의 「지금」 조건을 활동마다 따로 묻지 않습니다. 예전에는 여기가
  // 활동 여섯 줄이었고, 그 여섯 응답의 시각이 서로 달라 히어로 점수와 타일이
  // 다른 순간을 가리킬 수 있었습니다. 이제 추천 응답 하나가 그 활동들을 모두
  // 싣고 옵니다. 남는 한 줄은 지점 비교이며, 그쪽은 고른 활동 하나뿐입니다.
  const here = asked.filter(
    (query) => query.mode === "observation" && query.spot === chosen,
  );
  expect(new Set(here.map((query) => query.activity)).size).toBeLessThanOrEqual(1);
  // 갯벌은 후보에서 빠졌으므로 어디에서도 묻지 않습니다.
  expect(asked.filter((query) => query.activity === "mudflat")).toEqual([]);
});

test("활동 타일의 이름과 점수는 활동 id 로 짝짓는다", async ({ page }) => {
  // 갯벌이 후보에서 빠졌을 때 표시 줄은 다섯으로 줄었는데 조회 배열은 여섯
  // 그대로여서, 인덱스로 짝짓던 이 자리가 「래프팅」 타일에 갯벌 점수를,
  // 「온천」 타일에 래프팅 점수를 넣고 있었습니다.
  const scores: Record<string, number | null> = {};
  await page.route("**/api/data/water-index/recommendation?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const item of body.conditions ?? []) {
      const excluded = body.ranked.some((rank: { activity: string; dropped: boolean }) => rank.activity === item.activity && rank.dropped);
      scores[item.activity] = excluded || item.support_status === "unsupported"
        ? null : item.condition_score?.score ?? null;
    }
    return route.fulfill({ response, json: body });
  });
  await page.goto("#today");
  await expect(page.locator(".td-act")).toHaveCount(5);

  const pairs = await page.locator(".td-act").evaluateAll((nodes) =>
    nodes.map((node) => ({
      name: node.querySelector(".td-act-name")?.textContent?.trim() ?? "",
      score: node.querySelector(".td-act-score")?.textContent?.trim() ?? "",
    })),
  );
  const byName: Record<string, string> = {
    수영: "swim",
    서핑: "surf",
    휴식: "relax",
    래프팅: "rafting",
    온천: "onsen",
  };
  for (const pair of pairs) {
    const activity = byName[pair.name];
    expect(activity, `알 수 없는 활동 타일: ${pair.name}`).toBeTruthy();
    const expected = scores[activity];
    // 서버가 추천에서 제외한 활동과 점수가 오지 않은 활동은 «–» 이며 0이 아닙니다.
    expect(pair.score.replace(/\s+/g, "")).toContain(
      expected === null || expected === undefined ? "–" : String(expected),
    );
  }
});
