import type { Activity } from "./aiApi";
import {
  conditionPath,
  conditionScore,
  kstDate,
  type Conditions,
} from "./productData";
import { useResource } from "./useResource";

/** 조회할 시각. 훅은 조건부로 부를 수 없어 개수가 고정이어야 합니다.
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
  activity: Activity = "swim",
): HourlyScore[] {
  const day = kstDate(now);
  const at = (hour: string) => `${day}T${hour}:00:00+09:00`;
  const results = [
    useResource<Conditions>(conditionPath(id, activity, at(HOURS[0]))),
    useResource<Conditions>(conditionPath(id, activity, at(HOURS[1]))),
    useResource<Conditions>(conditionPath(id, activity, at(HOURS[2]))),
    useResource<Conditions>(conditionPath(id, activity, at(HOURS[3]))),
  ];
  return HOURS.map((hour, index) => ({
    hour,
    score: conditionScore(results[index].data),
    data: results[index].data,
    loading: results[index].loading,
    error: results[index].error,
  }));
}
