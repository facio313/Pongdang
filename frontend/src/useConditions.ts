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
    primary.data.projection?.retention_allowed !== false &&
    primary.data.condition_score?.status !== "blocked" &&
    primary.data.safety_status !== "restricted" && primary.data.support_status !== "unsupported";
  // The server resolves an omitted target to request time. This stable current
  // forecast key retains its result across observation refreshes; explicit date
  // queries elsewhere still use their exact target and never borrow this result.
  const fallback = useResource<Conditions>(needsForecast ? conditionPath(id, activity, undefined, "forecast") : null);
  const selected = needsForecast && fallback.data && (conditionScore(fallback.data) !== null || fallback.data.metrics.length > primary.data!.metrics.length)
    ? fallback : primary;
  const expired = useExpired(at ? undefined : conditionScoreExpiry(selected.data));
  return {
    ...selected,
    data: expired && selected.data ? { ...selected.data, retained: true } : selected.data,
    loading: selected.data ? false : selected.loading || !!(needsForecast && fallback.loading),
    error: selected.error ?? (needsForecast ? fallback.error : undefined),
  };
}
