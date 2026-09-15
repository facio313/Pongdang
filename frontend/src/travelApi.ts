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

export function routeReasonsText(reasons: string[]): string {
  const labels: Record<string, string> = {
    route_provider_unconfigured: "서버의 카카오 길찾기 REST 키 설정이 필요합니다",
    route_provider_disabled: "운영 설정에서 길찾기가 비활성화되어 있습니다",
    route_provider_authentication_failed: "카카오 길찾기 인증에 실패했습니다. 서버 REST 키와 서비스 권한을 확인해야 합니다",
    route_transport_not_configured: "현재 자동 경로 계산은 자동차 이동만 지원합니다",
    route_date_required: "경로를 계산할 여행 날짜를 선택해 주세요",
    route_origin_and_departure_required: "출발지와 출발 시각을 입력해 주세요",
    route_departure_in_past: "출발 시각이 지났습니다. 앞으로의 시각을 선택해 주세요",
    origin_coordinates_required: "출발지 좌표가 없어 경로를 계산할 수 없습니다",
    must_include_not_in_selected_candidates: "필수 방문 장소를 후보에 포함해 주세요",
    insufficient_verified_candidates_for_stop_count: "선택한 방문 수를 채울 수 있는 장소 근거가 부족합니다",
    no_verifiable_feasible_route: "현재 요청 조건과 경로 응답으로 확인할 수 있는 코스가 없습니다",
    environment_or_route_comparison_incomplete: "일부 환경 또는 경로 비교 자료가 없습니다",
    visit_support_and_total_cost_unverified: "실제 이용 가능 여부와 총비용은 별도 확인이 필요합니다",
    reference_time_matrix_estimate: "요청 출발시각 기준의 예상 경로입니다",
  };
  return reasons.map(reason => Object.hasOwn(labels, reason) ? labels[reason] : "경로 조건을 확인해 주세요").join(" · ");
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
  // The ingress can redirect an expired session to an HTML login page with 200.
  // Do not parse that page as API data or report a successful private operation.
  if (response.redirected || (response.ok && response.headers.get("content-type")?.includes("text/html"))) {
    throw new Error("SSO 로그인 화면으로 이동했습니다. 기존 로그인을 확인한 뒤 다시 시도해 주세요.");
  }
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const detail = payload !== null && typeof payload === "object" && "detail" in payload
      ? payload.detail : undefined;
    const configurationMessages: Record<string, string> = {
      AUTH_NOT_CONFIGURED: "Pongdang의 SSO 로그인 연동이 설정되지 않았습니다. 운영자의 로그인 연동 설정이 필요합니다.",
      SSO_ORIGINS_NOT_CONFIGURED: "SSO에서 허용할 요청 출처가 설정되지 않아 저장·추천 요청을 처리할 수 없습니다. 운영자의 설정이 필요합니다.",
      TRAVEL_STORAGE_UNAVAILABLE: "여행 데이터 저장소에 연결하지 못했습니다. 운영 DB와 초기화 상태를 확인해야 합니다.",
      route_calculation_timeout: "길찾기 응답이 지연되어 계산을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
    if (response.status === 503 && typeof detail === "string" && Object.hasOwn(configurationMessages, detail)) {
      throw new Error(configurationMessages[detail]);
    }
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
