import { recommendedActivities, type Activity } from "./aiApi";
import { conditionScore, type Conditions } from "./productData";
import { useConditions } from "./useConditions";
import { useRecommendation } from "./useRecommendation";

/** 동점일 때의 우선순위이자 훅 호출 순서입니다. 훅은 조건부로 부를 수 없으므로
 *  추천 활동을 매번 전부 조회합니다 -- TodayPage 의 활동별 점수 타일이 이미
 *  같은 방식으로 다섯 줄을 고정해 두고 있습니다.
 *
 *  아래 훅 호출 수는 이 배열 길이와 반드시 같아야 합니다. */
const ACTIVITY_ORDER = [
  "swim",
  "surf",
  "relax",
  "onsen",
  "rafting",
] as const satisfies readonly Activity[];
// 갯벌이 빠지는 등 추천 집합이 바뀌면 훅 호출 수도 함께 고쳐야 하므로, 길이가
// 어긋나면 타입 단계에서 멈춥니다.
const _sameAsRecommended: typeof ACTIVITY_ORDER.length =
  recommendedActivities.length;
void _sameAsRecommended;

export interface ActivityCondition {
  activity: Activity;
  score: number | null;
  data?: Conditions;
  error?: string;
  loading: boolean;
  /** isInitialLoad 가 「첫 조회」와 「만료 후 재조회」를 가르는 데 씁니다. */
  previousData?: Conditions;
}

/** 오늘 이 장소에서 할 활동과, 활동별 조건 응답 전부.
 *
 *  **고르는 일은 서버가 합니다**(`water-index/recommendation`). 화면은 예전에
 *  다섯 점수 중 `max` 를 골랐는데, 그러면 항목이 적어 점수가 높게 나오는
 *  「휴식」이 여름 해변에서도 1위가 되고, 해변에서 래프팅이 뽑히고, 물때는
 *  아무 영향도 주지 못했습니다. 규칙과 그 근거는 한 곳(recommendation.py)에
 *  있어야 화면이 말하는 이유와 고른 활동이 갈리지 않습니다.
 *
 *  활동별 조회(`all`)는 그대로 둡니다 -- 오늘 탭의 활동별 타일과 히어로 위
 *  「지금 날씨와 바다」 패널이 이 다섯 응답을 그립니다.
 *
 *  고를 것이 없으면 `best` 는 null 입니다. 이때 화면은 «–» 로 두어야 하며,
 *  0 점이나 「안전함」으로 바꾸지 않습니다 -- 근거가 없는 것과 조건이 나쁜 것은
 *  다른 사실입니다. */
export function useBestActivity(id?: number) {
  const states = [
    useConditions(id, ACTIVITY_ORDER[0]),
    useConditions(id, ACTIVITY_ORDER[1]),
    useConditions(id, ACTIVITY_ORDER[2]),
    useConditions(id, ACTIVITY_ORDER[3]),
    useConditions(id, ACTIVITY_ORDER[4]),
  ];
  const recommendation = useRecommendation(id);
  const all: ActivityCondition[] = ACTIVITY_ORDER.map((activity, index) => ({
    ...states[index],
    activity,
    score: conditionScore(states[index].data),
  }));
  const chosen = recommendation.data?.choice;
  const entry = all.find((item) => item.activity === chosen?.activity);
  // 고른 활동은 추천 응답이 정하고, 옆에 뜨는 숫자는 그 활동의 조건 응답에서
  // 옵니다. 근거가 만료되면 조건 응답 쪽이 그 사실을 알고 «–» 로 비우는데
  // (useConditions 의 만료 처리), 추천 응답의 점수를 그대로 쓰면 만료된 숫자가
  // 화면에 남습니다. 모르는 값을 지난 값으로 채우지 않기 위해 조건 쪽을 따릅니다.
  const best = chosen
    ? {
        ...(entry ?? { activity: chosen.activity, loading: false }),
        activity: chosen.activity,
        score: entry ? entry.score : chosen.score,
      }
    : null;
  return {
    best,
    all,
    recommendation,
    loading: recommendation.loading || states.some((state) => state.loading),
    error:
      recommendation.error ?? states.map((state) => state.error).find(Boolean),
  };
}
