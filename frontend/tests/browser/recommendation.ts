import type { Page } from "@playwright/test";

/** 히어로의 활동과 점수는 서버의 추천 응답에서 옵니다(useBestActivity).
 *  조건 응답을 가로채는 검사는 추천 응답도 같은 값으로 맞춰야 화면이 조회 중이
 *  아니라 그 값을 그립니다. */
export async function routeRecommendation(
  page: Page,
  /** 고정값이거나, 검사가 상태를 바꿔 가며 쓰는 경우의 함수입니다. */
  selected:
    | { activity: string; score: number }
    | null
    | (() => { activity: string; score: number } | null),
  extra: Record<string, unknown> = {},
) {
  await page.route("**/api/data/water-index/recommendation?**", (route) => {
    const choice = typeof selected === "function" ? selected() : selected;
    return route.fulfill({
      json: {
        contract_version: "water-recommendation.v1",
        model_id: "pongdang-activity-recommendation",
        model_version: "1.0.0",
        scientific_validation: "not_evaluated",
        spot_id: Number(new URL(route.request().url()).searchParams.get("spot_id")),
        place_name: "browser fixture",
        place_kind: "beach",
        at: new Date().toISOString(),
        as_of: new Date().toISOString(),
        mode: "observation",
        choice: choice ? { ...choice, status: "evaluated" } : null,
        ranked: [],
        reasons: [],
        tide: null,
        alternatives: [],
        rules: [],
        limitations: [],
        reason_codes: [],
        ...extra,
      },
    });
  });
}

/** 실제 서버의 추천 응답. 화면이 고른 활동·점수와 같아야 합니다 -- 화면이 따로
 *  고르지 않는다는 것이 이 검사의 요지입니다. */
export async function serverRecommendation(page: Page, spotId: number) {
  const response = await page.request.get(
    `api/data/water-index/recommendation?spot_id=${spotId}&mode=observation`,
  );
  return (await response.json()) as {
    choice: { activity: string; score: number } | null;
    reasons: { code: string }[];
    alternatives: { kind: string; name: string }[];
    tide: { phase: string } | null;
  };
}

export const ACTIVITY_LABEL: Record<string, string> = {
  swim: "수영",
  surf: "서핑",
  relax: "휴식",
  mudflat: "갯벌",
  onsen: "온천",
  rafting: "래프팅",
};

/** 추천 문맥의 표기. 「휴식」은 물에 들어가지 않는 하루로 부릅니다
 *  (recommendationText.activityHeadline 과 같은 규칙). */
export const headlineOf = (activity: string) =>
  activity === "relax" ? "물에 들어가지 않는 하루" : ACTIVITY_LABEL[activity];
