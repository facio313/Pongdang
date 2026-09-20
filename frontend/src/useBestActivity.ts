import { recommendedActivities, type Activity } from "./aiApi";
import { conditionScore, type Conditions } from "./productData";
import { useRecommendation } from "./useRecommendation";

/** 화면이 활동을 늘어놓는 순서입니다. 동점 우선순위는 서버 규칙
 *  (recommendation.RECOMMENDED_ACTIVITIES)이 정하므로 여기서는 표시 순서만
 *  맞춥니다 -- 두 곳이 어긋나면 타입 단계에서 멈춥니다. */
const ACTIVITY_ORDER = [
  "swim",
  "surf",
  "relax",
  "onsen",
  "rafting",
] as const satisfies readonly Activity[];
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

/** 오늘 이 장소에서 할 활동과, 판단에 쓴 활동별 조건 응답 전부.
 *
 *  **고르는 일은 서버가 합니다**(`water-index/recommendation`). 화면은 예전에
 *  다섯 점수 중 `max` 를 골랐는데, 그러면 항목이 적어 점수가 높게 나오는
 *  「휴식」이 여름 해변에서도 1위가 되고, 해변에서 래프팅이 뽑히고, 물때는
 *  아무 영향도 주지 못했습니다. 규칙과 그 근거는 한 곳(recommendation.py)에
 *  있어야 화면이 말하는 이유와 고른 활동이 갈리지 않습니다.
 *
 *  조건 응답도 그 한 번의 조회에 함께 옵니다. 예전에는 활동마다 따로 물어
 *  홈 한 번에 여섯 번을 왕복했고, 그 응답들의 시각이 서로 달라 히어로 점수와
 *  아래 근거가 다른 순간을 가리킬 수 있었습니다.
 *
 *  고를 것이 없으면 `best` 는 null 입니다. 이때 화면은 «–» 로 두어야 하며,
 *  0 점이나 「안전함」으로 바꾸지 않습니다 -- 근거가 없는 것과 조건이 나쁜 것은
 *  다른 사실입니다. */
export function useBestActivity(id?: number, enabled = true) {
  const recommendation = useRecommendation(id, undefined, enabled);
  const { data, loading, error, previousData } = recommendation;
  const find = (source: typeof data, activity: Activity) =>
    source?.conditions.find((item) => item.activity === activity);
  const all: ActivityCondition[] = ACTIVITY_ORDER.map((activity) => {
    const conditions = find(data, activity);
    return {
      activity,
      data: conditions,
      score: conditionScore(conditions),
      previousData: find(previousData, activity),
      loading,
      error,
    };
  });
  const chosen = data?.choice;
  const entry = all.find((item) => item.activity === chosen?.activity);
  // 고른 활동은 추천이 정하고, 옆에 뜨는 숫자는 그 활동의 조건 응답에서
  // 옵니다. 한 응답 안의 두 값이므로 서로 어긋나지 않습니다.
  const best = chosen
    ? {
        ...(entry ?? { activity: chosen.activity, loading, error }),
        activity: chosen.activity,
        score: entry ? entry.score : chosen.score,
      }
    : null;
  return { best, all, recommendation, loading, error };
}
