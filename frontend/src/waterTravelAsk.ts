import {
  conditionPath,
  conditionTargetInRange,
  kstDate,
} from "./productData";
import type { Activity } from "./aiApi";
import {
  travelJson,
  type Preference,
  type RecommendationResult,
  type TravelRequest,
} from "./travelApi";

export const WATER_TRAVEL_PREMISE = "전제: 퐁당의 물 여행 관련 정보를 찾습니다.";

export interface WaterTravelReply {
  answer: string;
  fallback: boolean;
  travel_results?: { recommendations?: RecommendationResult };
}

export function waterTravelUserMessage(input: {
  answers?: string[];
  keywords?: string[];
}): string {
  const parts: string[] = [];
  if (input.answers?.length) parts.push("답변: " + input.answers.join(". "));
  if (input.keywords?.length) parts.push("키워드: " + input.keywords.join(", "));
  return [WATER_TRAVEL_PREMISE, ...parts].join(" ").trim();
}

export function waterTravelConditionPath(
  spotId?: number,
  activity: Activity = "relax",
  day?: string,
) {
  if (!spotId) return null;
  if (!day || day === kstDate()) return conditionPath(spotId, activity);
  const at = day + "T12:00:00+09:00";
  return conditionTargetInRange(at) ? conditionPath(spotId, activity, at) : null;
}

export function askWaterTravel(
  base: string,
  input: {
    request: TravelRequest;
    answers?: string[];
    keywords?: string[];
    preference?: Preference;
  },
  signal?: AbortSignal,
) {
  return travelJson<WaterTravelReply>(
    base,
    "ai/chat",
    "POST",
    {
      message: waterTravelUserMessage(input),
      history: [],
      context: { region: input.request.region ?? "강릉" },
      travel: {
        action: "recommend",
        request: input.request,
        ...(input.preference ? { preference: input.preference } : {}),
      },
    },
    signal,
  );
}
