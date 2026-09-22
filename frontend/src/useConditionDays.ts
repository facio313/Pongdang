import type { Activity } from "./aiApi";
import { calendarDays, conditionSeriesPath, conditionScore, type ConditionSeries } from "./productData";
import { useResource } from "./useResource";

/** One bounded read for the selected calendar days. */
export function useConditionDays(id: number | undefined, now: string, activity: Activity = "swim", count = 7) {
  const days = calendarDays(now, 7).slice(0, Math.max(0, Math.min(7, count)));
  const result = useResource<ConditionSeries>(conditionSeriesPath(id, activity, days.map((day) => day.at)));
  const rows = new Map(result.data?.rows.map((row) => [Date.parse(row.at), row]));
  const previousRows = new Map(result.previousData?.rows.map((row) => [Date.parse(row.at), row]));
  const values = days.map((day) => rows.get(Date.parse(day.at)));
  // Keep today's noon forecast after noon: validity is evaluated by the server
  // at day.at, not against the viewer's current clock.
  return days.map((day, index) => {
    const data = values[index];
    return { ...day, ...result, data, previousData: previousRows.get(Date.parse(day.at)), score: conditionScore(data) };
  });
}
