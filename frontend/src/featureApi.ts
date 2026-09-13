import { requestData } from "./api.ts";

export type Feature = "assessment" | "forecast" | "twin" | "livecam" | "tide" | "notifications" | "quality";
export interface FeatureResult { text: string; detail: string; sourceUrl?: string }
type ObjectValue = Record<string, unknown>;

function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("API 응답 형식을 확인할 수 없습니다.");
  return value as ObjectValue;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("API 문자열 형식이 올바르지 않습니다.");
  return value;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("API 숫자 형식이 올바르지 않습니다.");
  return value;
}
function nullableNumber(value: unknown): number | null { return value === null ? null : number(value); }
function rows(value: unknown): ObjectValue[] {
  const data = object(value);
  if (!Array.isArray(data.rows) || data.rows.length > 100) throw new Error("API 목록 범위를 확인할 수 없습니다.");
  return data.rows.map(object);
}
function time(value: unknown): string {
  const raw = string(value);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new Error("API 시각 형식이 올바르지 않습니다.");
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}
function contract(value: unknown, expected: string): ObjectValue {
  const record = object(value);
  if (record.contract_version !== expected) throw new Error("지원하지 않는 API 계약입니다.");
  return record;
}
const states: Record<string, string> = {
  no_data: "자료 없음", available: "자료 있음", unknown: "확인 불가", stale: "유효 기간 경과",
  missing: "값 미제공", observation: "관측", forecast: "공식 예보", partial: "일부 자료만 있음",
  support_unknown: "활동 지원 근거 미확인", withheld: "평가 공개 조건 미충족",
  outside_forecast_horizon: "제공처 예보 범위 밖", missing_within_horizon: "예보 범위 안 자료 누락",
  no_forecast_data: "저장된 공식 예보 없음", no_review_data: "비교할 실제 리뷰 없음",
  not_comparable: "자료 비교 조건 미충족", analysis_pending: "비교 처리 대기",
  reachable: "공개 URL 접속 확인", unverifiable: "재생 상태 확인 불가", offline: "접속 불가",
};
function state(value: unknown): string { const code = string(value); return states[code] ?? code; }

/** Dedicated DTO validation; assessment/feature payloads never become data-table rows. */
export function describeFeature(feature: Feature, payload: unknown, place = ""): FeatureResult {
  const data = object(payload);
  const list = rows(payload);
  const location = place ? `조회 지점: ${place}. ` : "";
  const first = list[0];
  if (feature === "assessment") {
    contract(payload, "water-assessment.v1-draft");
    if (!first) return { text: "저장된 활동 평가 없음", detail: `${location}점수·추천 순위는 제공하지 않습니다.` };
    if (first.score !== null) throw new Error("현재 공개 계약에서 검증되지 않은 점수를 표시할 수 없습니다.");
    if (!Array.isArray(first.inputs)) throw new Error("평가 근거가 올바르지 않습니다.");
    return { text: state(first.assessment_status), detail: `${location}점수 없음 · 평가 입력 ${first.inputs.length}개 · ${first.evaluated_at === null ? "평가 미실행" : `평가시각 ${time(first.evaluated_at)}`}. 안전 확인을 의미하지 않습니다.` };
  }
  if (feature === "forecast") {
    contract(payload, "water-forecast.v1");
    return { text: state(data.status), detail: first ? `${location}제공기관 ${string(first.provider)} · 대상 ${time(first.target_start_at)} · ${state(first.state)}. 발표시각 ${first.issued_at === null ? "미제공" : time(first.issued_at)}.` : `${location}없는 미래 값은 생성하지 않습니다.` };
  }
  if (feature === "twin") {
    contract(payload, "water-spatial.v1");
    if (!first) return { text: "연결된 장소 없음", detail: "관측소·여행 장소 연결 자료가 필요합니다." };
    if (!Array.isArray(first.layers)) throw new Error("지도 레이어 형식이 올바르지 않습니다.");
    const layers = first.layers.map(object);
    const temp = layers.find((row) => row.name === "water_temperature");
    const value = temp ? nullableNumber(temp.numeric_value) : null;
    return { text: `${first.name === null ? `지점 ${number(first.spot_id)}` : string(first.name)} · ${state(first.status)}`, detail: temp ? `관측소 ${number(temp.station_id)} 수온 ${value === null ? "미제공" : `${value} ${temp.unit === null ? "단위 미제공" : string(temp.unit)}`} · ${state(temp.status)} · 측정 ${time(temp.observed_at)}. 여행지 직접 측정·안전 판정과 구분합니다.` : "연결된 수온 관측이 없습니다. 장소 좌표와 원본 자료는 아래 표에서 확인할 수 있습니다." };
  }
  if (feature === "livecam") {
    contract(payload, "livecams.v1");
    if (!first) return { text: "재생할 수 있는 검증된 영상 주소가 없습니다.", detail: "공식 공개영상·장소 연결·사용 조건 검수가 필요합니다." };
    const url = new URL(string(first.public_page));
    if (url.protocol !== "https:" || url.username || url.password || url.search) throw new Error("공개 영상 URL이 올바르지 않습니다.");
    return { text: `${string(first.provider)} · ${state(first.status)}`, detail: `영상 구분: ${string(first.media_kind)}. URL 접속 성공은 생중계 확인과 다릅니다.`, sourceUrl: url.href };
  }
  if (feature === "tide") {
    contract(payload, "tide-timer.v1");
    const high = data.next_high === null ? null : object(data.next_high);
    const low = data.next_low === null ? null : object(data.next_low);
    return { text: `다음 만조 ${high ? time(high.event_at) : "자료 없음"} · 다음 간조 ${low ? time(low.event_at) : "자료 없음"}`, detail: `${location}기준시각 ${time(data.reference_at)}. 공식 운영창·통제 근거 없는 활동 가능 시간은 제공하지 않습니다.` };
  }
  if (feature === "quality") {
    contract(payload, "water-quality.v1");
    return { text: first ? state(first.status) : "저장된 비교 결과 없음", detail: first ? `지점 ${number(first.spot_id)} · 공식 검사와 현장 관찰은 별도 근거입니다. 신뢰도 백분율·수영 안전 판정은 제공하지 않습니다.` : "실제 관찰 입력과 주기 비교 결과를 기다립니다." };
  }
  if (!first) return { text: "생성된 조건 충족 알림 없음", detail: "본인 구독과 관측 이력이 필요하며 수온만으로 첫 입수 가능일을 정하지 않습니다." };
  const evidence = object(first.evidence);
  return { text: `수온 조건 알림 · ${state(first.state)}`, detail: `발생 ${time(first.created_at)} · 올해 최초 ${evidence.first_in_year === true ? "근거 확인" : evidence.first_in_year === false ? "아님" : "확인 불가"}. 발송 상태 ${string(first.delivery_state)}. 입수 안전 판정이 아닙니다.` };
}

export async function loadFeature(feature: Feature, base: string, signal: AbortSignal, fetcher: typeof fetch = fetch, now = new Date()): Promise<FeatureResult> {
  const read = (path: string) => requestData<unknown>(base, path, signal, fetcher);
  if (feature === "livecam") return describeFeature(feature, await read("livecams?page_size=1"));
  if (feature === "quality") return describeFeature(feature, await read("quality/comparisons?page_size=1"));
  if (feature === "notifications") return describeFeature(feature, await read("notifications/events?limit=1"));
  const selection = contract(await read("water-twin?page_size=1"), "water-spatial.v1");
  const place = rows(selection)[0];
  if (feature === "twin") return describeFeature(feature, selection);
  if (!place) return { text: "조회할 수집 지점 없음", detail: "실제 장소·관측소가 등록되면 조회할 수 있습니다." };
  const id = number(place.spot_id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("장소 식별자가 올바르지 않습니다.");
  const query = new URLSearchParams({ spot_id: String(id), activity: feature === "tide" ? "mudflat" : "swim", from: new Date(now.getTime() - (feature === "assessment" ? 3600000 : 0)).toISOString(), until: new Date(now.getTime() + 86400000).toISOString(), page_size: "1" });
  const path = feature === "assessment" ? "water-index/assessments" : feature === "forecast" ? "water-forecast/forecasts" : "tides/events";
  if (feature === "assessment") { query.set("profile_id", "general"); query.set("mode", "observation"); }
  return describeFeature(feature, await read(`${path}?${query}`), place.name === null ? `지점 ${id}` : string(place.name));
}
