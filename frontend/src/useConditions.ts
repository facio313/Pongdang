import { useEffect, useState } from "react";
import type { Activity } from "./aiApi";
import { conditionPath, conditionScore, conditionScoreExpiry, type Conditions } from "./productData";
import { useResource } from "./useResource";

/** Some official products publish only forecasts. Keep that mode explicit and
 * never replace an available observation score or bypass an official block. */
export function useConditions(id?: number, activity: Activity = "swim", at?: string) {
  const [revision, setRevision] = useState(() => Date.now());
  const primary = useResource<Conditions>(conditionPath(id, activity, at), revision);
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
    const delay = expiresAt === undefined ? 300000 : Math.min(300000, expiresAt - Date.now());
    const timer = window.setTimeout(() => setRevision(Date.now()), Math.max(1, delay));
    return () => window.clearTimeout(timer);
  }, [id, activity, at, expiresAt, revision]);
  if (!at && expiresAt !== undefined && expiresAt <= revision)
    return { ...primary, data: undefined, loading: true };
  if (!needsForecast) return primary;
  if (fallback.data && (conditionScore(fallback.data) !== null || fallback.data.metrics.length > primary.data!.metrics.length))
    return fallback;
  return { ...primary, loading: fallback.loading, error: primary.error ?? fallback.error };
}
