import { useEffect, useState } from "react";
import type { Activity } from "./aiApi";
import { conditionPath, conditionScore, conditionScoreExpiry, type Conditions } from "./productData";
import { useResource } from "./useResource";

/** 같은 지점을 이 시간 안에 다시 묻지 않습니다.
 *
 *  예전에는 하한이 `Math.max(1, delay)` -- 1ms 였습니다. 근거의 `valid_until`
 *  이 이미 지난 상태(서버가 만료된 관측을 그대로 내려주는 흔한 경우)에서는
 *  `expiresAt - Date.now()` 가 음수라 **1ms 뒤 재조회**가 걸리고, 새 revision
 *  이 조회 키를 바꿔 항상 캐시 미스이며, 응답은 또 같은 과거 만료를 담고
 *  옵니다. 왕복 속도로 도는 무한 재조회였고, 지도 목록처럼 여러 지점이 동시에
 *  이걸 돌리면 화면이 멈췄습니다.
 *
 *  하한을 둬도 「만료된 값은 «–» 로 비운다」는 뜻은 그대로입니다 -- 화면은
 *  즉시 비우고, **다시 묻는 것만** 이 간격을 지킵니다. */
export const REFRESH_MIN = 30000;
/** 만료를 모를 때의 갱신 주기. 만료를 알아도 이보다 더 미루지는 않습니다. */
export const REFRESH_MAX = 300000;

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
  // 0 으로 시작합니다 -- 마운트 시각을 넣으면 그것이 조회 키가 되어, 폭이
  // 바뀌어 레이아웃이 갈릴 때마다 같은 조건을 다시 물었습니다(useRecommendation
  // 과 같은 이유). 아래 만료 비교의 뜻은 그대로입니다.
  const [revision, setRevision] = useState(0);
  const primary = useResource<Conditions>(
    enabled ? conditionPath(id, activity, at) : null,
    revision,
  );
  const needsForecast = !at && primary.data && conditionScore(primary.data) === null &&
    primary.data.condition_score?.status !== "blocked" &&
    primary.data.safety_status !== "restricted" && primary.data.support_status !== "unsupported";
  // Use this place's just-returned observation target; a mount-time timestamp
  // would query the wrong time after changing place or leaving the page open.
  const fallback = useResource<Conditions>(needsForecast ? conditionPath(id, activity, primary.data!.at) : null);
  const current = needsForecast && fallback.data ? fallback.data : primary.data;
  const expiresAt = conditionScoreExpiry(current);
  useEffect(() => {
    if (!id || at) return;
    // Refresh within five minutes and at the earliest known source expiry.
    // A new request key clears visible data while the replacement is loading.
    const delay = expiresAt === undefined ? REFRESH_MAX : Math.min(REFRESH_MAX, expiresAt - Date.now());
    const timer = window.setTimeout(() => setRevision(Date.now()), Math.max(REFRESH_MIN, delay));
    return () => window.clearTimeout(timer);
  }, [id, activity, at, expiresAt, revision]);
  if (!at && expiresAt !== undefined && expiresAt <= revision)
    return { ...primary, data: undefined, loading: true };
  if (!needsForecast) return primary;
  if (fallback.data && (conditionScore(fallback.data) !== null || fallback.data.metrics.length > primary.data!.metrics.length))
    return fallback;
  return { ...primary, loading: fallback.loading, error: primary.error ?? fallback.error };
}
