import type { Activity } from "./aiApi";
import { calendarDays, conditionPath, conditionScore, type Conditions } from "./productData";
import { useResource } from "./useResource";

/** Exactly seven bounded reads, with date changes isolated by useResource's
 * request key so another date's score cannot flash during loading. */
export function useConditionDays(id: number | undefined, now: string, activity: Activity = "swim", count = 7) {
  const days = calendarDays(now, 7);
  const path = (index: number) => index < count ? conditionPath(id, activity, days[index].at) : null;
  const results = [
    useResource<Conditions>(path(0)),
    useResource<Conditions>(path(1)),
    useResource<Conditions>(path(2)),
    useResource<Conditions>(path(3)),
    useResource<Conditions>(path(4)),
    useResource<Conditions>(path(5)),
    useResource<Conditions>(path(6)),
  ];
  return days.slice(0, count).map((day, index) => ({
    ...day,
    ...results[index],
    score: conditionScore(results[index].data),
  }));
}
