import type { Place } from "./productData.ts";
import { originFromPlace, type PlanInput, type RecommendationResult } from "./travelApi.ts";

export function moveCoursePlace(order: readonly number[], from: number, to: number): number[] {
  const next = [...order];
  const source = next.indexOf(from);
  const target = next.indexOf(to);
  if (source >= 0 && target >= 0 && source !== target) {
    next.splice(target, 0, next.splice(source, 1)[0]);
  }
  return next;
}

/** Keep the saved stop data, but discard receipts for the previous selection. */
export function courseInputForSelection(
  input: PlanInput | null,
  orderedIds: readonly number[],
  places: readonly Place[],
): PlanInput | null {
  if (!input || !orderedIds.length) return null;
  const stops = orderedIds.flatMap((id) => input.stops.filter((stop) => stop.spot_id === id));
  if (stops.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) return null;
  const first = places.find((place) => place.id === orderedIds[0]);
  const origin = first ? originFromPlace(first, new Set(orderedIds)) : null;
  return {
    request: { ...input.request, must_include: [...orderedIds], origin: origin ?? undefined },
    stops,
  };
}

/** Provider ranks identify signed candidates; they are not the user's visit order. */
export function courseCandidateRanks(result: RecommendationResult, orderedIds: readonly number[]): number[] {
  return orderedIds.flatMap((id) => {
    const candidate = result.recommendations.find((item) => item.spot_id === id);
    return candidate ? [candidate.rank] : [];
  });
}
