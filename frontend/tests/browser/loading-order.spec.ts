import { test, expect, type Page } from "@playwright/test";
import { routeRecommendation } from "./recommendation";

/** 첫 페인트의 순서를 봅니다.
 *
 *  화면은 기본 해수욕장을 먼저 조회하고, 그 응답이 와야 장소 id 를 알아
 *  조건·추천을 물을 수 있습니다. 그 사이 화면은 **아직 묻지 않았다**는 사실을
 *  말해야 하는데, 예전에는 「조회할 경로가 없음」이 「조회가 끝났는데 없음」과
 *  같은 값이라 히어로가 이렇게 흘렀습니다.
 *
 *      「오늘 점수를 낼 수 있는 활동이 없어요」 → 스켈레톤 → 실제 값
 *
 *  묻지도 않은 것을 자료 없음으로 그린 뒤 뒤늦게 조회 중으로 되돌아간 것이라,
 *  세 단계 모두가 틀렸습니다. 이제 경로의 `undefined`(대상 미정)와
 *  `null`(해당 없음)을 가릅니다(useResource 의 ResourcePath).
 *
 *  검사는 장소 응답을 늦춰 그 구간을 실제로 만들고, 그 동안 화면이 무엇을
 *  말하는지 읽습니다. */

const BEACH = {
  id: 987,
  name: "해운대해수욕장",
  place_kind: "beach",
  region: "부산",
  address: null,
  lat: 35.16,
  lng: 129.16,
};

/** 기본 해수욕장 응답을 붙잡아 둡니다. 돌려주는 함수를 부르면 그때 응답이
 *  나갑니다 -- 조회 중 구간을 검사가 원하는 만큼 잡아 둘 수 있습니다. */
async function holdDefaultPlace(page: Page) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/data/water-index/default-place", async (route) => {
    await held;
    await route.fulfill({
      json: {
        place: BEACH,
        rows: [BEACH],
        display_name: BEACH.name,
        status: "preferred",
        message: "수집 자료가 있는 해수욕장입니다.",
      },
    });
  });
  return () => release();
}

const NEVER_BEFORE_ASKING = [
  // 「고를 것이 없다」는 판단입니다. 묻지 않았으면 할 수 없는 말입니다.
  "활동이 없어요",
  "활동이 없습니다",
  // 조회 실패도 아직 일어나지 않았습니다.
  "불러오지 못했어요",
  "불러오지 못했습니다",
  // 점수 근거가 부족하다는 것도 응답을 본 뒤에야 알 수 있습니다.
  "근거가 부족해",
];

test("장소를 조회하는 동안 히어로는 자료 없음이 아니라 조회 중이다", async ({
  page,
}) => {
  await routeRecommendation(page, { activity: "swim", score: 73 });
  const release = await holdDefaultPlace(page);
  await page.goto("");

  // 아직 장소 응답 전입니다. 이 구간이 예전에 「활동이 없어요」였습니다.
  const skeleton = page.locator('.hm-hero-sentence [aria-label="오늘의 활동 조회 중"]');
  await expect(skeleton).toBeVisible();
  const hero = page.locator(".pd-hero");
  for (const phrase of NEVER_BEFORE_ASKING)
    await expect(hero).not.toContainText(phrase);
  // 점수 자리도 «–» 가 아니라 스켈레톤입니다 -- «–» 는 자료가 없다는 뜻입니다.
  await expect(page.locator('.hm-hero-score-num [aria-label="점수 조회 중"]')).toBeVisible();
  await expect(page.locator(".hm-hero-score-num")).not.toHaveText("–");

  release();
  await expect(page.locator(".hm-hero-score-num")).toHaveText("73");
  await expect(page.locator(".hm-hero-sentence")).toContainText("수영");
});

test("데스크탑 홈도 같은 순서로 그린다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await routeRecommendation(page, { activity: "swim", score: 73 });
  const release = await holdDefaultPlace(page);
  await page.goto("");

  await expect(
    page.locator('.hd-hero-title [aria-label="오늘의 활동 조회 중"]'),
  ).toBeVisible();
  const hero = page.locator(".hd-hero");
  for (const phrase of NEVER_BEFORE_ASKING)
    await expect(hero).not.toContainText(phrase);

  release();
  await expect(page.locator(".hd-hero-score-num")).toHaveText("73");
});

test("장소 조회가 실패하면 그때는 조회 중에 머물지 않는다", async ({ page }) => {
  // 반대쪽도 봅니다. 「조회 중」이 영원히 남으면 그것도 거짓말입니다.
  await page.route("**/api/data/water-index/default-place", (route) =>
    route.fulfill({ status: 503, json: { detail: "unavailable" } }),
  );
  await page.goto("");
  await expect(page.locator(".home-page")).toContainText("요청을 처리하지 못했습니다");
  await expect(
    page.locator('.hm-hero-sentence [aria-label="오늘의 활동 조회 중"]'),
  ).toHaveCount(0);
});
