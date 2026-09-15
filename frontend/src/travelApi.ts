import type { Activity } from "./aiApi";

const CONDITION_LABELS: Record<string, string> = {
  activity_support: "활동 지원 여부",
  opening_hours: "운영 시간",
  reservation_required: "예약 필요 여부",
  price: "요금",
  current_crowding: "현재 혼잡도",
  official_controls_completeness: "공식 통제 정보의 완전성",
  child_friendly: "어린이 동반 적합성",
  place_role_unconfirmed: "장소 용도",
};

export function unknownConditionsText(conditions: string[]): string {
  return conditions
    .map((condition) => CONDITION_LABELS[condition] ?? condition)
    .join(" · ");
}

export function placeRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    visit: "방문",
    meal: "식사",
    lodging: "숙박",
  };
  return labels[role] ?? "용도 미확인";
}
export interface Preference {
  tags: string[];
  companion_type?: string | null;
  learning_enabled?: boolean;
  [key: string]: unknown;
}
export interface TravelRequest {
  keyword_selection?: { category: string; values: string[] }[];
  purpose?: string;
  place_role?: "visit" | "meal" | "lodging" | "any";
  dates: string[];
  region?: string;
  preferred_tags: string[];
  activity: Activity;
  transport: "driving" | "transit" | "walking" | "cycling";
  companion_type?: "solo" | "friends";
  people?: number;
  day_trip?: boolean;
  departure_time?: string;
  return_by?: string;
  origin?: {
    label: string;
    spot_id?: number;
    latitude?: number;
    longitude?: number;
  };
  must_include?: number[];
}
export interface Recommendation {
  spot_id: number;
  rank: number;
  name: string;
  reason: string;
  region: string | null;
  activities: { activity: Activity; label: string; support_status?: string }[];
  unknown_conditions: string[];
  conditions: { status: string };
  matched_preferences: { tag: string }[];
  evidence: { provider: string; fetched_at: string | null }[];
}
export interface RecommendationResult {
  request: TravelRequest;
  recommendations: Recommendation[];
  selection_token: string | null;
  queried_at: string;
  status: string;
  clarification: string | null;
  route_calculated: false;
}
export interface StopInput {
  item_id: string;
  spot_id: number;
  day: string;
  stay_minutes: number;
  fixed?: boolean;
  requested_arrival?: string | null;
  role?: string;
}
export interface PlanInput {
  request: TravelRequest;
  stops: StopInput[];
  selection_token?: string;
  selected_ranks?: number[];
}
export interface PlanItem {
  item_id: string;
  spot_id: number;
  name: string;
  arrival_at: string | null;
  departure_at: string | null;
  role: string;
  unknown_conditions: string[];
}
export interface TripPlan {
  plan_id: string | null;
  revision: number;
  request: TravelRequest;
  input_stops: StopInput[];
  days: { date: string; items: PlanItem[] }[];
  status: string;
  unresolved: string[];
  queried_at: string;
  route_status: string;
}
export interface RouteLeg {
  from_spot_id: number | null;
  to_spot_id: number | null;
  duration_minutes: number;
  geometry?: { polyline: number[][]; status?: string };
}
export interface RouteResult {
  status: string;
  route_calculated: boolean;
  reason_codes: string[];
  optimality?: string;
  route: {
    items: {
      spot_id: number;
      name: string;
      arrival_at: string;
      departure_at: string;
    }[];
    legs: RouteLeg[];
    travel_minutes: number;
    return_at: string;
  } | null;
  plan_input?: PlanInput;
}
export async function travelJson<T>(
  base: string,
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(`${base}api/data/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "기존 SSO 로그인이 필요합니다.",
      403: "Pongdang 접근 권한이나 요청 출처를 확인해 주세요.",
      404: "이 항목을 찾을 수 없습니다. 목록을 새로 확인해 주세요.",
      409: "다른 화면에서 변경됐습니다. 최신 내용을 다시 불러와 주세요.",
      410: "추천이 만료됐습니다. 다시 추천받아 주세요.",
      422: "날짜·장소·출발지 등 요청 조건을 확인해 주세요.",
      429: "요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
    };
    throw new Error(
      messages[response.status] ??
        "서버에 연결하지 못했거나 기능 설정이 준비되지 않았습니다. 다시 시도해 주세요.",
    );
  }
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("서버 응답 형식을 확인할 수 없습니다. 다시 시도해 주세요.");
  }
}
export function recommendationPlan(
  result: RecommendationResult,
  day: string,
): PlanInput {
  if (!result.recommendations.length || !result.selection_token)
    throw new Error("저장할 실제 추천 장소가 없습니다.");
  return {
    request: { ...result.request, dates: [day], day_trip: true },
    selection_token: result.selection_token,
    selected_ranks: result.recommendations.map((r) => r.rank),
    stops: result.recommendations.map((r, index) => ({
      item_id: `selection-${index}-${r.spot_id}`,
      spot_id: r.spot_id,
      day,
      stay_minutes: 60,
    })),
  };
}
export const planItems = (plan: TripPlan | null | undefined) =>
  plan?.days.flatMap((day) => day.items) ?? [];
export function directionLink(
  name: string,
  lat: number | null,
  lng: number | null,
) {
  return lat !== null &&
    lng !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
    ? `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`
    : null;
}

export function selectedActivities(tags: string[]) {
  const ids: Record<string, Activity> = {
    수영: "swim",
    서핑: "surf",
    "서핑 강습": "surf",
    온천: "onsen",
    "온천 마무리": "onsen",
    "갯벌 체험": "mudflat",
    래프팅: "rafting",
    휴식: "relax",
    "물 보며 쉬기": "relax",
  };
  const activities = [...new Set(tags.map((tag) => ids[tag]).filter(Boolean))];
  if (activities.length > 3)
    throw new Error(
      "활동은 최대 3개까지 선택할 수 있습니다. 태그나 좋아요를 다시 골라 주세요.",
    );
  return activities;
}
