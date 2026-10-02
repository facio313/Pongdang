import { forbiddenMessage } from "./authMessages.ts";
import { aiReasonTexts, type Activity } from "./aiApi.ts";
import type { ModelTraceTurn } from "./aiApi";
import type { TravelLocale } from "./travelLanguage";
import { t } from "./i18n.ts";
// 값을 실제로 가져오는 import 는 확장자를 붙입니다. tests/*.test.mjs 는 번들러
// 없이 node 가 이 .ts 를 그대로 읽습니다(recommendationText.ts 와 같은 이유).
import { isGuest } from "./guestStore.ts";

const CONDITION_LABELS: Record<string, string> = {
  activity_support: "활동 지원 여부",
  opening_hours: "운영 시간",
  reservation_required: "예약 필요 여부",
  price: "요금",
  current_crowding: "현재 혼잡도",
  official_controls_completeness: "공식 통제 정보의 완전성",
  child_friendly: "어린이 동반 적합성",
  place_role_unconfirmed: "장소 용도",
  budget_not_specified: "예산 미입력",
  incidental_costs_unknown: "식비 등 추가 비용",
  return_deadline_required: "귀가 마감 시각",
};

export function unknownConditionsText(conditions: string[]): string {
  return conditions
    .map((condition) => t(CONDITION_LABELS[condition] ?? condition))
    .join(" · ");
}

export function placeRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    visit: "방문",
    meal: "식사",
    lodging: "숙박",
  };
  return t(labels[role] ?? "용도 미확인");
}

export function routeReasonsText(reasons: string[]): string {
  const labels: Record<string, string> = {
    route_provider_unconfigured: "서버의 카카오 길찾기 REST 키 설정이 필요합니다",
    route_provider_disabled: "운영 설정에서 길찾기가 비활성화되어 있습니다",
    route_provider_authentication_failed: "카카오 길찾기 인증에 실패했습니다. 서버 REST 키와 서비스 권한을 확인해야 합니다",
    route_transport_not_configured: "선택한 이동 수단의 경로를 지원하지 않습니다",
    route_provider_quota_exceeded: "카카오 경로 조회 한도에 도달했습니다. 잠시 후 다시 시도해 주세요",
    provider_does_not_accept_departure_time: "이 이동 수단은 출발시각별 조회를 지원하지 않습니다. 실제 운행·소요시간은 출발 전에 확인해 주세요",
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
    provider_time_independent_estimate: "출발시각을 반영하지 않는 제공사 예상시간으로 계산했습니다",
  };
  return reasons.map(reason => t(Object.hasOwn(labels, reason) ? labels[reason] : "경로 조건을 확인해 주세요")).join(" · ");
}

/** Activity names are application labels; place names and addresses remain
 *  provider text. Resolve these labels from stable IDs when the UI changes. */
export function travelActivityLabel(activity: Activity, fallback: string): string {
  const labels: Partial<Record<Activity, string>> = {
    relax: "물 보며 쉬기", onsen: "온천", surf: "서핑", swim: "수영",
    rafting: "래프팅", mudflat: "갯벌",
  };
  return t(labels[activity] ?? fallback);
}
export interface Preference {
  tags: string[];
  companion_type?: string | null;
  learning_enabled?: boolean;
  [key: string]: unknown;
}
export const TRANSPORT_MODES = ["driving", "transit", "walking", "cycling"] as const;
export type TransportMode = typeof TRANSPORT_MODES[number];

export function transportLabel(mode: TransportMode): string {
  return t({ driving: "자동차", transit: "대중교통", walking: "도보", cycling: "자전거" }[mode]);
}

export function selectedTransport(request?: Pick<TravelRequest, "transport" | "keyword_selection">): TransportMode {
  const mode = request?.keyword_selection?.find((item) => item.category === "transport")?.values[0];
  return TRANSPORT_MODES.find((item) => item === mode) ?? request?.transport ?? "driving";
}

/** A route form is the latest explicit choice, including an older keyword choice. */
export function withTransport(request: TravelRequest, transport: TransportMode): TravelRequest {
  return { ...request, transport, keyword_selection: request.keyword_selection?.map((item) =>
    item.category === "transport" ? { ...item, values: [transport] } : item) };
}

export interface TransportAdvice {
  selected_transport: TransportMode;
  suggested_transport: TransportMode | null;
  straight_line_distance_m: number | null;
  route_verified: false;
  alternatives_compared: false;
}

export function transportAdviceText(advice?: TransportAdvice): string {
  if (!advice) return "";
  if (!advice.suggested_transport || advice.straight_line_distance_m === null)
    return t("선택한 이동 수단: {mode}. 출발지를 정하면 거리 기준 이동 수단 제안을 볼 수 있습니다.", { mode: transportLabel(advice.selected_transport) });
  return t("이동 수단 제안: {mode} · 직선거리 합 {km}km 기준. 실제 경로·장비·운행 여부를 확인해 주세요. 이동 수단별 소요시간 비교는 아직 하지 않았습니다.", {
    mode: transportLabel(advice.suggested_transport), km: (advice.straight_line_distance_m / 1000).toFixed(1),
  });
}
export interface Origin {
  label: string;
  spot_id?: number;
  latitude?: number;
  longitude?: number;
}

/** Build a route origin from a listed place. Travel-catalog IDs may travel as
 *  `spot_id`; other lists (water-index default places) send coordinates only
 *  so a foreign identifier cannot 404 the catalog lookup. */
export function originFromPlace(
  place: {
    id: number;
    name: string;
    lat: number | null;
    lng: number | null;
  },
  catalogIds: ReadonlySet<number>,
): Origin | null {
  if (place.lat === null || place.lng === null) return null;
  return {
    label: place.name,
    latitude: place.lat,
    longitude: place.lng,
    ...(catalogIds.has(place.id) ? { spot_id: place.id } : {}),
  };
}
export interface VisitIntent {
  place_type: "beach" | "valley" | "cafe" | "hot_spring" | "lake" | "river" | "reservoir" | "restaurant" | "lodging" | "attraction";
  part_of_day: "morning" | "afternoon" | "evening" | "any";
  activity: Activity | null;
}
export interface TravelRequest {
  locale?: TravelLocale | "zh-TW";
  keyword_selection?: { category: string; values: string[] }[];
  purpose?: string;
  place_role?: "visit" | "meal" | "lodging" | "any";
  dates: string[];
  region?: string;
  preferred_tags: string[];
  activity: Activity;
  transport: TransportMode;
  companion_type?: "solo" | "friends";
  people?: number;
  day_trip?: boolean;
  departure_time?: string;
  return_by?: string;
  origin?: Origin;
  must_include?: number[];
  visit_intents?: VisitIntent[];
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
  transport_advice?: TransportAdvice;
  /** Registered place facts the server confirmed, never user wishes. */
  confirmed: {
    latitude: number | null;
    longitude: number | null;
    [key: string]: unknown;
  };
}
export interface RecommendationResult {
  request: TravelRequest;
  recommendations: Recommendation[];
  selection_token: string | null;
  queried_at: string;
  status: string;
  clarification: string | null;
  route_calculated: false;
  excluded?: { spot_id: number; reason: string }[];
  recommendation_groups?: { intent: VisitIntent; result: RecommendationResult }[];
}

/** Why the server kept a candidate out of the list. Unknown codes stay
 *  unexplained rather than being guessed at. */
export function exclusionReasonsText(
  excluded: { spot_id: number; reason: string }[] | undefined,
  spotIds: number[],
): string {
  const labels: Record<string, string> = {
    official_restriction: "공식 제한 정보가 있습니다",
    required_condition_unconfirmed: "필수 조건을 확인하지 못했습니다",
    avoid_preference: "회피 취향에 해당합니다",
    selected_place_type_unconfirmed: "고른 장소 유형과 맞는지 확인되지 않았습니다",
    selected_activity_catalog_affinity_unconfirmed:
      "고른 활동과 맞는지 확인되지 않았습니다",
  };
  return (excluded ?? [])
    .filter((row) => spotIds.includes(row.spot_id))
    .map(
      (row) =>
        t(Object.hasOwn(labels, row.reason)
          ? labels[row.reason]
          : "서버가 제외 사유를 표시했습니다"),
    )
    .filter((text, index, all) => all.indexOf(text) === index)
    .join(" · ");
}
/** `/api/data/ai/chat` for a travel conversation. The server composes `answer`
 *  from its own structured results; the client never parses it for places. */
export interface TravelChatResponse {
  answer: string;
  clarification: string | null;
  status: string;
  fallback?: boolean;
  reason_codes?: string[];
  model_trace?: ModelTraceTurn[];
  travel?: {
    action: string;
    request: TravelRequest;
    selection_token: string | null;
  };
  travel_results?: {
    recommendations?: RecommendationResult;
    recommendation_groups?: { intent: VisitIntent; result: RecommendationResult }[];
    route_recommendation?: RouteResult;
  };
}

/** Explain failed scope decisions once, using their known cause when available.
 *  Other responses keep the server answer and known fallback reasons.
 *  A deliberate scope rejection is already the complete response. */
export function travelChatMessages(result: TravelChatResponse): string[] {
  const messages = [result.answer, result.clarification]
    .filter((content): content is string => Boolean(content?.trim()))
    .filter((content, index, all) => all.indexOf(content) === index);
  if (!result.fallback || result.status === "out_of_scope") return messages;
  if (result.status === "unavailable" && result.reason_codes?.includes("ai_scope_unavailable")) {
    const causes = [...new Set(result.reason_codes)]
      .filter((code) => code !== "ai_scope_unavailable" && Object.hasOwn(aiReasonTexts, code))
      .map((code) => t(aiReasonTexts[code]));
    return [causes.join(" ") || t(aiReasonTexts.ai_scope_unavailable)];
  }
  const reasons = (result.reason_codes ?? [])
    .filter((code) => Object.hasOwn(aiReasonTexts, code))
    .map((code) => t(aiReasonTexts[code]))
    .filter((reason, index, all) => all.indexOf(reason) === index && !messages.some((message) => message.includes(reason)));
  return reasons.length ? [...messages, reasons.join(" ")] : messages;
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
  route_token?: string;
}
export interface PlanItem {
  item_id: string;
  spot_id: number;
  name: string;
  arrival_at: string | null;
  departure_at: string | null;
  role: string;
  unknown_conditions: string[];
  previous_leg?: { duration_minutes: number | null; status: string } | null;
}
export interface TripPlan {
  plan_id: string | null;
  revision: number;
  is_favorite?: boolean;
  request: TravelRequest;
  input_stops: StopInput[];
  days: { date: string; items: PlanItem[] }[];
  status: string;
  unresolved: string[];
  queried_at: string;
  route_status: string;
  route_snapshot?: RouteResult | null;
}
export const LATEST_FAVORITE_PLAN_PATH = "travel/plans?favorite_only=true&limit=1&offset=0";
/** The server preserves the provider's own longitude/latitude objects. */
export interface RoutePoint {
  longitude: number;
  latitude: number;
}
export interface RouteLeg {
  from_spot_id: number | null;
  to_spot_id: number | null;
  duration_minutes: number;
  geometry?: { polyline: RoutePoint[]; status?: string };
}
export interface RouteItem {
  spot_id: number;
  name: string;
  arrival_at: string;
  departure_at: string;
  latitude: number | null;
  longitude: number | null;
}
export interface RouteOrigin {
  label: string;
  spot_id: number | null;
  latitude: number | null;
  longitude: number | null;
}
export interface RouteResult {
  status: string;
  route_calculated: boolean;
  reason_codes: string[];
  optimality?: string;
  route: {
    transport?: TransportMode;
    transport_advice?: TransportAdvice;
    items: RouteItem[];
    legs: RouteLeg[];
    travel_minutes: number;
    return_at: string;
    origin?: RouteOrigin;
  } | null;
  plan_input?: PlanInput;
}

function mappablePoint(point: RoutePoint | null | undefined) {
  return (
    point !== null &&
    point !== undefined &&
    Number.isFinite(point.longitude) &&
    Number.isFinite(point.latitude) &&
    Math.abs(point.longitude) <= 180 &&
    Math.abs(point.latitude) <= 90
  );
}

/** Kakao's map SDK wrapper takes `[longitude, latitude]` pairs per line.
 *  A leg with any unusable point is dropped whole: a shortened line would draw
 *  a road the provider never returned. */
export function routePaths(
  route: RouteResult | null | undefined,
): number[][][] {
  return (route?.route?.legs ?? [])
    .map((leg) => leg.geometry?.polyline ?? [])
    .filter((polyline) => polyline.length >= 2 && polyline.every(mappablePoint))
    .map((polyline) => polyline.map((point) => [point.longitude, point.latitude]));
}
/** Carries the server's status so callers can react to a specific condition,
 *  such as an expired selection, without parsing the display message. */
export class TravelRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TravelRequestError";
    this.status = status;
  }
}
/** 로그인 없이도 쓸 수 있는 계산 전용 경로. 게스트는 같은 기능의
 *  `travel/browse/...` 거울을 씁니다.
 *
 *  **운영 ingress 를 고치지 않아도 되도록 경로로 가릅니다.** 앞단의 SSO 게이트는
 *  경로 접두사별로 걸려 있어(`ops/nginx-location.conf`) `travel/recommendations`
 *  로 들어온 익명 호출은 로그인 화면으로 튕깁니다. `travel/browse/...` 는 어느
 *  게이트 접두사로도 시작하지 않아 그대로 백엔드에 닿고, 백엔드가 그것을 예약
 *  subject 로 받습니다(`app/travel/api.py` 의 BROWSE).
 *
 *  **로그인한 브라우저는 원래 경로를 씁니다.** 그쪽에만 ingress 가 SSO 헤더를
 *  주입하므로 저장된 취향·활동 기록이 추천에 반영됩니다. 거울로 보내면 로그인한
 *  사람이 빈 취향으로 추천을 받습니다. */
const BROWSE_PATHS = new Set([
  "travel/recommendations",
  "travel/routes/recommend",
  "travel/compare",
  "travel/plans/draft",
]);

/** 게스트일 때만 거울 경로로 바꿉니다. 쿼리 문자열이 붙은 경로는 그대로 둡니다 --
 *  위 네 경로는 모두 POST 이고 쿼리를 쓰지 않습니다. */
export function travelPath(path: string): string {
  return isGuest() && BROWSE_PATHS.has(path)
    ? path.replace("travel/", "travel/browse/")
    : path;
}

export async function travelJson<T>(
  base: string,
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(`${base}api/data/${travelPath(path)}`, {
    method,
    credentials: "same-origin",
    redirect: "manual",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  // A legacy ingress redirect is opaque in browsers. Stop before following it
  // across origins to SSO, which otherwise becomes an unhelpful CORS fetch error.
  if (response.type === "opaqueredirect" || response.status >= 300 && response.status < 400
    || response.redirected || (response.ok && response.headers.get("content-type")?.includes("text/html"))) {
    throw new TravelRequestError(401, "기존 SSO 로그인이 필요합니다.");
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
      throw new TravelRequestError(response.status, configurationMessages[detail]);
    }
    if (response.status === 422 && detail === "WATER_PLACE_REQUIRED") {
      throw new TravelRequestError(response.status, "첫 입수 알림은 분류가 확인된 해변·계곡에서만 저장할 수 있습니다.");
    }
    const messages: Record<number, string> = {
      401: "기존 SSO 로그인이 필요합니다.",
      403: forbiddenMessage(detail),
      404: "이 항목을 찾을 수 없습니다. 목록을 새로 확인해 주세요.",
      409: "다른 화면에서 변경됐습니다. 최신 내용을 다시 불러와 주세요.",
      410: "추천이 만료됐습니다. 다시 추천받아 주세요.",
      422: "날짜·장소·출발지 등 요청 조건을 확인해 주세요.",
      429: "요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
    };
    throw new TravelRequestError(
      response.status,
      messages[response.status] ??
        "요청을 처리하지 못했습니다. 서버 응답이 일시적으로 없거나 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
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

/** A point the map app can route through. */
export interface RouteStopPoint {
  latitude: number | null;
  longitude: number | null;
}

// Kakao's documented route scheme takes `sp`, `vp`…`vp5` and `ep` as
// `latitude,longitude`, with at most five waypoints.
// https://apis.map.kakao.com/android_v2/docs/api-guide/urlscheme/
const KAKAO_ROUTE_SCHEME = "https://m.map.kakao.com/scheme/route";
const KAKAO_WAYPOINT_LIMIT = 5;

function schemeCoordinate(point: RouteStopPoint | null | undefined) {
  const { latitude, longitude } = point ?? {};
  return typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
    ? `${latitude},${longitude}`
    : null;
}

/** Hands the calculated visiting order to Kakao Map as origin → waypoints →
 *  destination. Returns null unless every point has stored coordinates and the
 *  order fits the documented waypoint limit: a shortened order would send the
 *  user on a trip they did not ask for. */
export function kakaoRouteLink(
  origin: RouteStopPoint | null | undefined,
  stops: readonly RouteStopPoint[],
  mode: TransportMode = "driving",
): string | null {
  const points = [origin, ...stops].map(schemeCoordinate);
  if (
    points.length < 2 ||
    points.some((point) => point === null) ||
    points.length - 2 > KAKAO_WAYPOINT_LIMIT ||
    (mode === "transit" && points.length > 2)
  )
    return null;
  const query = [
    `sp=${points[0]}`,
    ...points
      .slice(1, -1)
      .map((point, index) => `${index ? `vp${index + 1}` : "vp"}=${point}`),
    `ep=${points[points.length - 1]}`,
    `by=${{ driving: "car", walking: "foot", cycling: "bicycle", transit: "publictransit" }[mode]}`,
  ].join("&");
  return `${KAKAO_ROUTE_SCHEME}?${query}`;
}

/** 고른 키워드 id 를 카테고리별로 묶어 `keyword_selection` 으로 만듭니다.
 *
 *  예전에는 selectedActivities 가 「서핑 강습」·「SUP 체험」 같은 화면 라벨을
 *  활동 id 로 되돌렸습니다. 그 라벨들은 프런트가 만든 이름이라 서버 카탈로그에
 *  없었고, 되돌릴 수 없는 것은 조용히 사라졌습니다. 이제 화면이 서버 id 를
 *  그대로 들고 다니므로 묶기만 하면 됩니다.
 *
 *  상한을 넘으면 던집니다 -- 넘친 선택을 말없이 버리면 사용자가 고른 것과
 *  서버가 받은 것이 달라집니다. 상한 값은 서버 카탈로그의 max_selections 이며
 *  여기서 만들지 않습니다. */
export function keywordSelection(
  chosenIds: string[],
  categoryOf: (id: string) => string | undefined,
  categories: readonly { id: string; max_selections: number }[],
) {
  return categories.flatMap((category) => {
    const values = chosenIds.filter((id) => categoryOf(id) === category.id);
    if (!values.length) return [];
    if (values.length > category.max_selections)
      throw new Error(
        `${category.id} 선택은 최대 ${category.max_selections}개까지 가능합니다. 선택을 다시 골라 주세요.`,
      );
    return [{ category: category.id, values }];
  });
}
