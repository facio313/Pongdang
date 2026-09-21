import type { Activity } from "./aiApi";
import { calendarDays, conditionSeriesPath, conditionScore, conditionScoreExpiry, type ConditionSeries } from "./productData";
import { useResource } from "./useResource";
import { useExpiry } from "./useExpiry";

/** One bounded read for the selected calendar days. */
export function useConditionDays(id: number | undefined, now: string, activity: Activity = "swim", count = 7) {
  const days = calendarDays(now, 7).slice(0, Math.max(0, Math.min(7, count)));
  const result = useResource<ConditionSeries>(conditionSeriesPath(id, activity, days.map((day) => day.at)));
  const rows = new Map(result.data?.rows.map((row) => [Date.parse(row.at), row]));
  const previousRows = new Map(result.previousData?.rows.map((row) => [Date.parse(row.at), row]));
  const values = days.map((day) => rows.get(Date.parse(day.at)));
  const expiries = values.map(conditionScoreExpiry);
  const expiredUntil = useExpiry(expiries);
  return days.map((day, index) => {
    const expiry = expiries[index];
    const expired = expiry !== undefined && expiredUntil !== undefined && expiry <= expiredUntil;
    const data = expired ? undefined : values[index];
    return { ...day, ...result, data, previousData: previousRows.get(Date.parse(day.at)), score: conditionScore(data) };
  });
}
