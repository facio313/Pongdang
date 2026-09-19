import type { Activity } from "./aiApi";
import { conditionScore, type Conditions } from "./productData";
import { useConditions } from "./useConditions";

/** 동점일 때의 우선순위이자 훅 호출 순서입니다. 훅은 조건부로 부를 수 없으므로
 *  여섯 활동을 매번 전부 조회합니다 -- TodayPage 의 활동별 점수 타일이 이미
 *  같은 방식으로 여섯 줄을 고정해 두고 있습니다. */
const ACTIVITY_ORDER = [
  "swim",
  "surf",
  "relax",
  "mudflat",
  "onsen",
  "rafting",
] as const satisfies readonly Activity[];

export interface ActivityCondition {
  activity: Activity;
  score: number | null;
  data?: Conditions;
  error?: string;
  loading: boolean;
  /** isInitialLoad 가 「첫 조회」와 「만료 후 재조회」를 가르는 데 씁니다. */
  previousData?: Conditions;
}

/** 오늘 이 장소에서 가장 조건이 좋은 활동. 홈 히어로가 수영 한 종목에 고정돼
 *  있던 자리를 대신합니다.
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
    useConditions(id, ACTIVITY_ORDER[5]),
  ];
  const all: ActivityCondition[] = ACTIVITY_ORDER.map((activity, index) => ({
    ...states[index],
    activity,
    score: conditionScore(states[index].data),
  }));
  // conditionScore 가 blocked · unavailable 을 이미 null 로 거르므로, 여기서는
  // 「지원하지 않는 활동」만 더 뺍니다. 온천이 없는 해변을 오늘의 추천으로
  // 올리지 않기 위한 것입니다.
  const candidates = all.filter(
    (item) =>
      item.score !== null && item.data?.support_status !== "unsupported",
  );
  // reduce 는 동점에서 앞선 것을 유지하므로 ACTIVITY_ORDER 가 그대로 우선순위가
  // 됩니다.
  const best = candidates.length
    ? candidates.reduce((high, item) =>
        (item.score as number) > (high.score as number) ? item : high,
      )
    : null;
  return {
    best,
    all,
    loading: states.some((state) => state.loading),
    error: states.map((state) => state.error).find(Boolean),
  };
}
