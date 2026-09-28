import { originFromPlace, recommendationPlan, type PlanInput, type RecommendationResult } from "./travelApi.ts";

/** Display order is editable; the server-issued ranks still identify the signed selection. */
export function moveCandidate(result: RecommendationResult, from: number, to: number): RecommendationResult {
  const rows = [...result.recommendations];
  const source = rows.findIndex((row) => row.spot_id === from);
  const target = rows.findIndex((row) => row.spot_id === to);
  if (source < 0 || target < 0 || source === target) return result;
  rows.splice(target, 0, rows.splice(source, 1)[0]);
  return { ...result, recommendations: rows };
}

/** The checked rows, in their displayed order, are the complete course. */
export function candidateCourse(result: RecommendationResult, included: readonly number[]): PlanInput | null {
  const recommendations = result.recommendations.filter((row) => included.includes(row.spot_id));
  const first = recommendations[0];
  if (!first) return null;
  const input = recommendationPlan({ ...result, recommendations }, result.request.dates[0]);
  const origin = originFromPlace({
    id: first.spot_id, name: first.name,
    lat: first.confirmed.latitude, lng: first.confirmed.longitude,
  }, new Set(recommendations.map((row) => row.spot_id)));
  return { ...input, request: { ...input.request, origin: origin ?? undefined } };
}
