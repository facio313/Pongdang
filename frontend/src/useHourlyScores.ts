import type { Activity } from "./aiApi";
import {
  conditionSeriesPath,
  conditionScore,
  kstDate,
  type Conditions,
  type ConditionSeries,
} from "./productData";
import { useResource } from "./useResource";

/** 조회할 시각.
 *
 *  모바일의 HourlyConditions 표와 같은 네 시각입니다. 데스크탑 시안은 막대
 *  아홉 개였지만, 같은 날 같은 장소를 두 화면이 서로 다른 시각으로 보여 주면
 *  값이 어긋난 것처럼 읽힙니다. 조회 횟수도 활동 여섯 번 위에 아홉 번이 더
 *  얹히는 것을 피합니다. */
const HOURS = ["09", "12", "15", "18"] as const;

export interface HourlyScore {
  hour: string;
  score: number | null;
  data?: Conditions;
  loading: boolean;
  error?: string;
}

/** 오늘 시간대별 점수. 어느 활동의 점수인지는 부르는 쪽이 정합니다 -- 홈은
 *  오늘 고른 활동을 넘겨, 위에 크게 뜬 점수와 같은 기준의 막대를 그립니다. */
export function useHourlyScores(
  id: number | undefined,
  now: string,
  /** 없으면 **조회하지 않습니다.** 활동을 고르지 못한 날 수영으로 물러서면
   *  무엇의 몇 점인지 말하지 않은 채 숫자가 남습니다. 장소를 아직 모르는
   *  것과 달라서 「조회 중」이 아니라 「해당 없음」입니다
   *  (useResource 의 ResourcePath 주석 참고). */
  activity?: Activity,
): HourlyScore[] {
  const day = kstDate(now);
  const targets = HOURS.map((hour) => `${day}T${hour}:00:00+09:00`);
  const result = useResource<ConditionSeries>(activity ? conditionSeriesPath(id, activity, targets) : null);
  const rows = new Map(result.data?.rows.map((row) => [Date.parse(row.at), row]));
  const values = targets.map((target) => rows.get(Date.parse(target)));
  // The server evaluates evidence at each forecast target. Passing that time
  // does not invalidate its forecast; live observation expiry is separate.
  return HOURS.map((hour, index) => {
    const data = values[index];
    return { hour, score: conditionScore(data), data, loading: result.loading, error: result.error };
  });
}
