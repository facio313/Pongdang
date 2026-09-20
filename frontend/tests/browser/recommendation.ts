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
        // 화면은 판단에 쓴 조건 응답도 이 한 번의 조회에서 읽습니다. 기본값은
        // 고른 활동 하나짜리 최소 응답이며, 근거 문구까지 보는 검사는
        // `extra.conditions` 로 실제 응답을 실어 줍니다.
        conditions: choice ? [conditionsFixture(choice)] : [],
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

/** 점수 하나만 필요한 검사를 위한 최소 조건 응답. */
export function conditionsFixture(choice: { activity: string; score: number }) {
  return {
    spot_id: 1, place_name: "browser fixture", activity: choice.activity,
    mode: "observation", at: new Date().toISOString(), as_of: new Date().toISOString(),
    safety_status: "unknown", support_status: "unknown", restriction_refs: [],
    environment_score: null, metrics: [], context_metrics: [], display_metrics: [],
    missing_metrics: [], required_evidence: [], reason_codes: [],
    condition_score: {
      label: "활동 조건 참고 점수", model_id: "browser-fixture", model_version: "1",
      methodology: "fixture", status: "partial", score: choice.score, coverage: 0.5,
      available_components: 2, total_components: 4, components: [], sources: [],
      reason_codes: [],
    },
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

/** 저장된 취향. 추천 화면은 이 값으로 **첫 단계**를 정합니다 -- 저장된 취향이
 *  있으면 시작 화면, 없으면 취향 고르기입니다. 일회용 DB 는 앞선 검사가 남긴
 *  취향을 그대로 들고 있으므로, 어느 쪽을 보는 검사인지 여기서 못박습니다.
 *  저장(PUT)도 이 픽스처가 받아 실제 DB 에 남기지 않습니다. */
export async function routePreference(page: Page, tags: string[] = []) {
  let current = [...tags];
  let revision = tags.length ? 1 : 0;
  await page.route("**/api/data/travel/preferences", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        preference?: { tags?: string[] };
      };
      current = body?.preference?.tags ?? [];
      revision += 1;
    }
    return route.fulfill({
      json: { preference: { tags: current }, revision },
    });
  });
}
