import { activities, type Activity, type AiContext } from "./aiApi";

export const featurePages = {
  "water-index": "Water Index", "water-index-map": "지도 배치", "water-forecast": "Water Forecast",
  "water-temperature": "수온", livecam: "웹캠 목록", tide: "물때 타이머", "first-swim": "첫 입수", "water-quality": "수질 교차검증",
} as const;
export type FeaturePage = keyof typeof featurePages;
export function readRoute(hash: string) {
  const [rawPage, rawQuery = ""] = hash.replace(/^#/, "").split("?");
  const page = rawPage === "livecam-test" ? "livecam" : rawPage === "collector" ? "info" : rawPage === "ai" || rawPage === "info" || Object.hasOwn(featurePages, rawPage) ? rawPage : "data";
  const query = new URLSearchParams(rawQuery);
  const value = query.get("spot_id") ?? "";
  const spotId = /^[1-9]\d{0,14}$/.test(value) ? Number(value) : undefined;
  const rawActivity = query.get("activity") ?? "";
  const activity = Object.hasOwn(activities, rawActivity) ? rawActivity as Activity : undefined;
  return { page, spotId, activity, from: query.get("from"), until: query.get("until") };
}
export function contextLink(context: AiContext, period?: { from: string; until: string }) {
  const query = new URLSearchParams();
  if (context.spot_id) query.set("spot_id", String(context.spot_id));
  if (context.activity) query.set("activity", context.activity);
  if (period) { query.set("from", period.from); query.set("until", period.until); }
  return "#ai" + (query.size ? "?" + query : "");
}
export function featurePath(page: FeaturePage, spotId: number | undefined, activity: Activity, from: string, until: string) {
  if (page === "first-swim") return "notifications/subscriptions?limit=100&offset=0";
  const params = new URLSearchParams({ page: "1", page_size: "100" });
  if (spotId) params.set("spot_id", String(spotId));
  if (page === "livecam") return "livecams?" + params;
  if (page === "water-quality") return "quality/comparisons?" + params;
  params.set("activity", activity);
  if (["water-index-map", "water-temperature"].includes(page)) return (page === "water-index-map" ? "water-twin" : "water-temperature") + "?" + params;
  if (!spotId) return null;
  params.set("from", from); params.set("until", until);
  if (page === "tide") { params.set("reference_at", from); return "tides/events?" + params; }
  if (page === "water-forecast") return "water-forecast/forecasts?" + params;
  params.set("profile_id", "general"); params.set("mode", "observation");
  return "water-index/assessments?" + params;
}
