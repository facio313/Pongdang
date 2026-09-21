import type { Activity } from "./aiApi";
import { conditionPath, conditionScore, conditionScoreExpiry, type Conditions } from "./productData";
import { useResource } from "./useResource";
import { useExpired } from "./useExpiry";

/** Some official products publish only forecasts. Keep that mode explicit and
 * never replace an available observation score or bypass an official block. */
/** `enabled: false` 는 **이 조회를 하지 않는다**는 뜻입니다 -- 훅은 조건부로
 *  부를 수 없어 쓰지 않는 쪽도 함께 부르는 자리(useProductData)에서 씁니다.
 *  장소를 아직 모르는 동안(`id` 없음)과 달라서 「조회 중」으로 읽히지 않습니다. */
export function useConditions(
  id?: number,
  activity: Activity = "swim",
  at?: string,
  enabled = true,
) {
  const primary = useResource<Conditions>(
    enabled ? conditionPath(id, activity, at) : null,
  );
  const needsForecast = !at && primary.data && conditionScore(primary.data) === null &&
    primary.data.condition_score?.status !== "blocked" &&
    primary.data.safety_status !== "restricted" && primary.data.support_status !== "unsupported";
  // Use this place's just-returned observation target; a mount-time timestamp
  // would query the wrong time after changing place or leaving the page open.
  const fallback = useResource<Conditions>(needsForecast ? conditionPath(id, activity, primary.data!.at) : null);
  const current = needsForecast && fallback.data ? fallback.data : primary.data;
  const expired = useExpired(conditionScoreExpiry(current));
  if (expired) return { ...primary, data: undefined, loading: false };
  if (!needsForecast) return primary;
  if (fallback.data && (conditionScore(fallback.data) !== null || fallback.data.metrics.length > primary.data!.metrics.length))
    return fallback;
  return { ...primary, loading: fallback.loading, error: primary.error ?? fallback.error };
}
