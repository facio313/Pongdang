/** Shared reads refresh every thirty minutes unless the user asks. */
export const RESOURCE_REFRESH_INTERVAL = 1800000;

/** A calculation in progress is not a completed empty read. Check its result
 * every 30 seconds; ordinary data and failures retain the thirty-minute cadence. */
export function resourceRefreshInterval(data: unknown, receivedAt = Date.now()): number {
  if (typeof data !== "object" || data === null) return RESOURCE_REFRESH_INTERVAL;
  const record = data as Record<string, unknown>;
  const projection = record.projection as { status?: string; refresh_after?: string | null } | undefined;
  const missingTarget = Array.isArray(record.reason_codes)
    && record.reason_codes.includes("condition_projection_unavailable_for_target");
  if (record.refresh_pending === true || (projection?.status === "pending" && !missingTarget) || projection?.status === "refreshing") return 30000;
  const refreshAt = Date.parse(projection?.refresh_after ?? "");
  let interval = !missingTarget && Number.isFinite(refreshAt)
    ? Math.max(30000, Math.min(RESOURCE_REFRESH_INTERVAL, refreshAt - receivedAt))
    : RESOURCE_REFRESH_INTERVAL;
  for (const key of ["conditions", "rows"]) {
    if (Array.isArray(record[key])) for (const item of record[key]) {
      if (typeof item === "object" && item !== null && "projection" in item)
        interval = Math.min(interval, resourceRefreshInterval(item, receivedAt));
    }
  }
  return interval;
}

let generation = 0;
const listeners = new Set<() => void>();

export const resourceRefreshGeneration = () => generation;

export function subscribeResourceRefresh(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Invalidate every common read without remounting pages or resetting forms. */
export function invalidateResources() {
  generation += 1;
  for (const listener of listeners) listener();
}
