import type { Activity } from "./aiApi";
import type { PlacePhoto } from "./placePhotos";

export interface Place {
  id: number;
  name: string;
  address: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  type: string | null;
  catalog_verification: string | null;
  photo?: PlacePhoto;
}
export interface ClassifiedWaterPlace extends Omit<Place, "type" | "catalog_verification"> {
  place_kind: "beach" | "valley";
}
export function productPlaces(rows: ClassifiedWaterPlace[]): RowPage<Place> {
  return {
    rows: rows.map(({ place_kind, ...place }) => ({ ...place, type: place_kind, catalog_verification: null })),
    total: rows.length,
  };
}
export interface Metric {
  name: string;
  label: string;
  value: number | null;
  unit: string;
  status: string;
  station_id: number;
  text_value?: string | null;
  station_name: string | null;
  relation: string;
  spatial_scope: string | null;
  distance_km?: number | null;
  evidence: {
    provider: string;
    observed_at: string;
    issued_at: string | null;
    fetched_at: string;
    valid_until: string | null;
  }[];
}
export interface Conditions {
  spot_id: number;
  place_name: string | null;
  activity: Activity;
  at: string;
  mode: string;
  safety_status: string;
  support_status?: string;
  environment_score: number | null;
  condition_score?: ConditionScore;
  metrics: Metric[];
  context_metrics?: Metric[];
  display_metrics?: Metric[];
  reason_codes: string[];
}
export interface ConditionScore {
  status: "evaluated" | "partial" | "unavailable" | "blocked";
  score: number | null;
  label: string;
  coverage: number;
  available_components: number;
  total_components: number;
  model_id: string;
  model_version: string;
  methodology: string;
  sources: { id: string; title: string; url: string; usage: string }[];
  components: {
    metric: string;
    label: string;
    value: number | null;
    unit: string;
    score: number | null;
    weight: number;
    status: string;
    reason_codes: string[];
    criterion: string;
    station_name?: string | null;
    station_id?: number | null;
    relation?: string | null;
    distance_km?: number | null;
  }[];
  reason_codes: string[];
}

// Only the server's calculated condition index is displayable. The separate
// environment/safety contract is intentionally not a fallback for this value.
export function conditionScore(data?: Conditions): number | null {
  const index = data?.condition_score;
  return index && ["evaluated", "partial"].includes(index.status) &&
    typeof index.score === "number" && Number.isFinite(index.score) &&
    index.score >= 0 && index.score <= 100 ? index.score : null;
}

/** 숫자 바로 옆에 놓는 근거 요약. 부분 점수의 원값과 서버의 확보율을 유지합니다. */
export function scoreCoverageText(data?: Conditions): string {
  const index = data?.condition_score;
  if (!index) return "근거 정보 없음";
  const prefix = index.status === "partial" ? "부분 점수 · " : "";
  const available = index.available_components;
  const total = index.total_components;
  if (!Number.isInteger(available) || available < 0 ||
      !Number.isInteger(total) || total < 0 || available > total)
    return `${prefix}근거 정보 없음`;
  const percentage = Number.isFinite(index.coverage)
    ? ` (${Math.round(index.coverage * 100)}%)` : "";
  return `${prefix}근거 ${available}/${total}${percentage}`;
}

/** 점수 사유 코드의 한국어 표기. scoreMeaning.ts 도 같은 사전을 읽습니다 --
 *  같은 코드가 화면마다 다른 말로 보이지 않게 하려는 것이므로, 새 사전을
 *  만들지 말고 여기에 추가하세요. */
export const SCORE_REASONS: Record<string, string> = {
  measurement_not_collected: "아직 수집된 측정값 없음",
  measurement_evidence_unavailable: "측정 시각·출처 근거 없음",
  conflicting_station_measurements: "관측소 간 값 충돌",
  measurement_out_of_domain: "측정값 범위 오류",
  local_operating_range_required: "장소별 운영 기준 설정 필요",
  nearby_station_context: "주변 관측소 참고 · 장소 실측 아님",
  containing_forecast_grid: "해당 장소를 포함한 격자 기상 예보",
  identical_provider_variants: "같은 값의 제공기관 세부 분류를 묶어 계산",
  no_mapped_measurements: "연결된 관측 자료 없음",
  measurement_expired: "자료 유효기간 만료",
  conflicting_measurement_evidence: "관측 근거 충돌",
  measurement_unit_unconfirmed: "측정 단위 미확인",
  provider_issue_time_unknown: "예보 발표 시각 미확인",
  numeric_measurement_missing: "수치 자료 없음",
  activity_support_unknown: "활동 지원 여부 미확인",
  official_restriction_or_unsupported_activity: "공식 제한 또는 활동 미지원",
};
export function conditionScoreText(data?: Conditions) {
  const index = data?.condition_score;
  if (!index) return "환경 참고점수 자료를 읽지 못했습니다.";
  const score = conditionScore(data);
  const coverage = Number.isFinite(index.coverage) ? ` · 근거 확보 ${Math.round(index.coverage * 100)}% (${index.available_components}/${index.total_components}개)` : "";
  const state = index.status === "blocked" ? "공식 제한 또는 활동 미지원으로 계산 보류"
    : score === null ? "계산에 필요한 근거 부족"
    : index.status === "partial" ? "일부 근거로 계산" : "조건 근거로 계산";
  const support = index.reason_codes.includes("activity_support_unknown") ? " 활동 지원 여부 미확인." : "";
  const context = index.reason_codes.includes("nearby_station_context") ? " 주변 관측소 참고 · 장소 실측 아님." : "";
  const issueUnknown = index.components.some((component) => component.reason_codes.includes("provider_issue_time_unknown")) ? " 예보 발표 시각 미확인." : "";
  return `${index.label} ${score === null ? "–" : `${score}점`}${coverage} · ${state}. 현장 검증 전 참고값이며 안전 판정이 아닙니다.${support}${context}${issueUnknown}`;
}
/** 히어로에 항상 보이는 한 줄. 예전에는 conditionScoreText + evidenceText 전문이
 *  점수 바로 아래 펼쳐져 있었는데, 의무 면책 · 출처 원문 · 서버 enum 이 같은 층에
 *  평평하게 놓여 6~8줄이 되었습니다. 전문은 EvidenceNote 의 «details» 안에 그대로
 *  남기고 여기서는 「무엇의 몇 점 · 근거 몇 개 · 언제 기준」만 말합니다.
 *
 *  「근거 확보」라는 표기는 ScoreExplainer 의 용어 정의와 같은 말이어야 하므로
 *  바꾸지 마세요. */
export function evidenceSummary(data?: Conditions) {
  const index = data?.condition_score;
  if (!index) return "근거 확보 자료를 읽지 못했습니다.";
  const score = conditionScore(data);
  const value = index.status === "blocked" ? "계산 보류" : score === null ? "–" : `${score}`;
  // 확보율은 백분율보다 「4개 중 4개」가 바로 읽힙니다. 백분율 전문은 details 안에
  // conditionScoreText 로 그대로 남습니다.
  const coverage = ` · 근거 확보 ${index.available_components}/${index.total_components}`;
  const at = timeLabel(data?.at);
  return `참고 점수 ${value}${coverage} · ${conditionModeLabel(data)} ${at} KST`;
}
/** 안전 상태의 사용자 문장. 서버 enum(unknown/caution/restricted)을 그대로 쓰면
 *  뜻이 전달되지 않고, 특히 unknown 은 「이상 없음」으로 읽힙니다. 모르는 값은
 *  유리한 쪽으로 매핑하지 않고 코드를 남깁니다. */
export function safetyStatusText(data?: Conditions) {
  const status = data?.safety_status ?? "unknown";
  if (status === "restricted") return "안전 상태 restricted — 공식 제한이 있습니다. 해당 안내를 먼저 따르세요.";
  if (status === "caution") return "안전 상태 caution — 확인된 주의 사항이 있습니다.";
  if (status === "unknown") return "안전 상태 unknown — 판정이 없다는 뜻이며 안전하다는 뜻이 아닙니다.";
  return `안전 상태 ${status}.`;
}
/** 자료 조회 상태의 한국어 표기. 서버 enum 을 화면 문장 자리에 그대로 내보내지
 *  않기 위한 것이며(예전에는 문단이 「available」로 시작했습니다), 모르는 코드는
 *  유리한 상태로 매핑하지 않고 코드를 그대로 남깁니다. */
export const DATA_STATUS: Record<string, string> = {
  available: "",
  no_forecast_data: "연결된 예보 자료 없음.",
  outside_forecast_horizon: "예보 지원 기간 밖입니다.",
  missing_within_horizon: "지원 기간 안이지만 해당 시각의 자료가 없습니다.",
};
export const dataStatusText = (status?: string) =>
  status ? (DATA_STATUS[status] ?? `자료 상태 ${status}.`) : "";
export function conditionScoreExpiry(data?: Conditions): number | undefined {
  const used = data?.condition_score?.components.filter((item) => item.status === "evaluated" && item.score !== null) ?? [];
  const expiries = [...(data?.metrics ?? []), ...(data?.context_metrics ?? [])]
    .filter((metric) => used.some((item) => item.metric === metric.name && item.station_id === metric.station_id) || data?.display_metrics?.some((item) => item.name === metric.name && item.station_id === metric.station_id))
    .flatMap((metric) => metric.evidence)
    .map((source) => source.valid_until ? Date.parse(source.valid_until) : NaN)
    .filter(Number.isFinite);
  return expiries.length ? Math.min(...expiries) : undefined;
}
export function conditionComponentsText(data?: Conditions) {
  return data?.condition_score?.components.map((item) => {
    const score = typeof item.score === "number" && Number.isFinite(item.score)
      ? `${item.score}점` : "–";
    const reasons = item.reason_codes.map((reason) => SCORE_REASONS[reason] ?? reason).join(" · ");
    const source = item.station_name ? ` · ${item.station_name}` : "";
    const distance = typeof item.distance_km === "number" ? ` ${item.distance_km.toFixed(1)}km` : "";
    return `${item.label} ${formatValue(item.value, item.unit)} → ${score}${source}${distance}${reasons ? ` · ${reasons}` : ""}`;
  }).join(" / ") ?? "";
}
export interface Forecast {
  source_key: string;
  station_name: string;
  provider: string;
  target_start_at: string;
  target_end_at: string;
  issued_at: string | null;
  fetched_at: string;
  state: string;
  spatial_scope: string;
  inputs: {
    name: string;
    numeric_value: number | null;
    text_value: string | null;
    unit: string | null;
    state: string;
  }[];
}
export function forecastInputText(input: Forecast["inputs"][number], forecastState: string) {
  if (forecastState === "stale" || !["current", "recorded"].includes(input.state)) return "–";
  return input.numeric_value !== null
    ? formatValue(input.numeric_value, input.unit ?? "")
    : input.text_value?.trim() || "–";
}
export interface TideEvent {
  event_id: string;
  kind: string;
  event_at: string;
  height: number | null;
  unit: string | null;
  station_name: string;
  state: string;
  provider: string;
  spatial_relation?: string;
  distance_km?: number | null;
}
export interface TideResult {
  rows: TideEvent[];
  next_high: TideEvent | null;
  next_low: TideEvent | null;
  status: string;
}
export interface QualityRow {
  analysis_id: string;
  spot_id: number;
  freshness: string;
  status: string;
  confidence_percent: number | null;
  official_sources: {
    provider: string;
    official_grade?: string | null;
    measurements: {
      item: string;
      value: number | null;
      unit: string | null;
      sampled_at: string;
    }[];
  }[];
}
export interface WaterQualityGrade {
  status: "available" | "historical" | "no_data" | "conflict" | "unsupported";
  grade: number | null;
  label: string | null;
  wqi: number | null;
  basis: "official_grade" | "official_wqi_index" | "none";
  station_name: string | null;
  relation: "station_observation_point" | "nearby_station_context" | null;
  distance_km: number | null;
  observed_at: string | null;
  age_days: number | null;
  method_version: string;
  reason_codes: string[];
  measurements: { item: string; value: number | null; unit: string | null; layer: string | null; is_missing: boolean }[];
}
export function waterQualityLabel(data?: WaterQualityGrade) {
  return data?.grade != null && Number.isInteger(data.grade) && data.grade >= 1 && data.grade <= 5 && ["available", "historical"].includes(data.status)
    ? `${data.grade}등급${data.status === "historical" ? " · 과거" : ""}`
    : data?.status === "conflict" ? "자료 상충" : data?.status === "unsupported" ? "평가 기준 없음" : "검사 자료 없음";
}
export function waterQualityDescription(data?: WaterQualityGrade) {
  if (!data) return "수질 검사 자료를 조회하고 있습니다.";
  if (data.status === "unsupported") return "해양 WQI는 하천·계곡에 적용하지 않습니다. 이 장소의 별도 수질 평가 기준이 필요합니다.";
  if (!data.station_name || !data.observed_at) return "10km 안에 수집된 해양 수질 검사 자료가 없습니다.";
  const location = data.relation === "nearby_station_context" ? `주변 ${data.station_name} 관측소${data.distance_km != null ? ` ${data.distance_km.toFixed(1)}km` : ""}` : `${data.station_name} 관측소`;
  return `${location} · ${kstDate(data.observed_at)} 검사${data.status === "historical" ? ` · ${data.age_days}일 전 과거 자료` : ""}. ${data.grade != null ? `${data.grade}등급 ${data.label ?? ""}` : "등급을 확인할 수 없습니다"}${data.wqi != null ? ` · WQI ${data.wqi}` : ""}. 해역의 생태 수질 등급이며 오늘 해변의 수질·입수 안전 판정은 아닙니다.`;
}
export type RowPage<T> = { rows: T[]; total: number; status?: string };
export const kstDate = (value: Date | string = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export const dateLabel = (value: Date | string = new Date()) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
export const timeLabel = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "–";
/** 물때는 자정을 넘길 수 있으므로 시각과 함께 실제 KST 날짜를 표시합니다. */
export function tideTimeLabel(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "–";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${Number(part("month"))}/${Number(part("day"))} ${part("hour")}:${part("minute")} KST`;
}
export const formatValue = (value?: number | null, unit = "") =>
  typeof value === "number" && Number.isFinite(value) ? `${value}${unit}` : "–";
export function conditionPath(
  id?: number,
  activity: Activity = "swim",
  at?: string,
) {
  return id
    ? "water-index/conditions?" +
        new URLSearchParams({
          spot_id: String(id),
          activity,
          mode: at ? "forecast" : "observation",
          ...(at ? { at } : {}),
        })
    : // 장소를 아직 모르는 것은 자료가 없는 것과 다릅니다(useResource 의
      // ResourcePath 주석 참고). 「해당 없음」은 부르는 쪽이 null 로 적습니다.
      undefined;
}
export function conditionTargetInRange(at: string | undefined, now = Date.now()) {
  const target = at ? Date.parse(at) : NaN;
  return Number.isFinite(target) && Math.abs(target - now) <= 31 * 86400000;
}
export function periodPath(
  endpoint: string,
  id: number | undefined,
  now: string,
  days = 7,
  activity: Activity = "swim",
) {
  return id
    ? endpoint +
        "?" +
        new URLSearchParams({
          spot_id: String(id),
          activity,
          from: now,
          until: new Date(Date.parse(now) + days * 86400000).toISOString(),
          page_size: "100",
          ...(endpoint === "tides/events" ? { reference_at: now } : {}),
        })
    : undefined;
}
// Multiple station values are not interchangeable; keep an ambiguous metric unknown.
export function metric(
  data: Conditions | undefined,
  name: string,
): Metric | undefined {
  const rows =
    data?.metrics.filter(
      (item) =>
        item.name === name &&
        item.status === "available" &&
        item.value !== null,
    ) ?? [];
  return rows.length === 1 ? rows[0] : undefined;
}
export function metricText(data: Conditions | undefined, name: string) {
  const item = metric(data, name);
  if (item) return formatValue(item.value, item.unit);
  const displayed = data?.display_metrics?.find((value) =>
    value.name === name && ((["available", "provisional"].includes(value.status) && value.value !== null) || (value.status === "text" && value.text_value)),
  );
  if (displayed) return displayed.status === "text" ? displayed.text_value! : formatValue(displayed.value, displayed.unit);
  if (["wave_height", "wind_speed"].includes(name) && ![...(data?.metrics ?? []), ...(data?.context_metrics ?? [])].some(m => m.name === name)) {
    const maximum = data?.display_metrics?.find(m => m.name === `maximum_${name}` && ["available", "provisional"].includes(m.status) && m.value !== null);
    if (maximum) return `최대 ${formatValue(maximum.value, maximum.unit)}`;
  }
  // Context or provisional forecast values are displayed only when the server
  // explicitly evaluated that component, with its context/limitations alongside.
  const component = data?.condition_score?.components.find((value) =>
    value.metric === name && value.status === "evaluated" && value.score !== null,
  );
  return formatValue(component?.value, component?.unit);
}
export const conditionModeLabel = (data?: Conditions) => data?.mode === "forecast" ? "예보" : "관측";
export function evidenceText(data?: Conditions) {
  if (!data) return "아직 조건 자료를 읽지 못했습니다.";
  const sources = [
    ...new Set(
      [...data.metrics, ...(data.context_metrics ?? [])].flatMap((m) =>
        m.evidence.map(
          (e) =>
            `${m.relation === "nearby_station_context" ? `주변 관측소 참고${typeof m.distance_km === "number" ? ` ${m.distance_km.toFixed(1)}km` : ""}` : m.relation === "containing_forecast_grid" ? "격자 기상" : m.relation === "representative_station" ? "대표 관측소" : "관측 지점"} ${m.station_name ?? "관측소명 없음"} · ${e.provider} · ${timeLabel(e.observed_at)} KST`,
        ),
      ),
    ),
  ];
  return `${data.mode === "forecast" ? "예보" : "관측"} 기준 ${dateLabel(data.at)} ${timeLabel(data.at)} KST. ${sources.join(" / ") || "관측·예보 근거 없음"}. 관측소·격자 자료는 현장 실측과 다릅니다.`;
}
export function calendarDays(now: string, count: number) {
  const start = Date.parse(kstDate(now) + "T12:00:00+09:00");
  return Array.from({ length: count }, (_, index) => {
    const at = new Date(start + index * 86400000).toISOString();
    return {
      id: kstDate(at),
      at,
      weekday:
        index === 0
          ? "오늘"
          : index === 1
            ? "내일"
            : new Intl.DateTimeFormat("ko-KR", {
                timeZone: "Asia/Seoul",
                weekday: "short",
              }).format(new Date(at)),
      dateLabel: dateLabel(at),
      score: null as number | null,
    };
  });
}
export function qualityValues(rows: QualityRow[]) {
  return [
    { label: "탁도", names: ["turbidity"] },
    { label: "용존산소", names: ["dissolved_oxygen", "do"] },
    { label: "pH", names: ["ph", "pH"] },
  ].map((def) => {
    const measures = rows
      .filter((r) => r.freshness === "current")
      .flatMap((r) => r.official_sources.flatMap((s) => s.measurements))
      .filter((m) => def.names.includes(m.item));
    const unique = [
      ...new Map(measures.map((m) => [JSON.stringify(m), m])).values(),
    ];
    const m = unique.length === 1 ? unique[0] : undefined;
    return {
      label: def.label,
      value: formatValue(m?.value, m?.unit ?? ""),
      confidence: null as number | null,
    };
  });
}

export function qualityGrade(rows: QualityRow[]) {
  const sources = rows
    .filter((row) => row.freshness === "current")
    .flatMap((row) => row.official_sources);
  return sources.length === 1 ? (sources[0].official_grade ?? "–") : "–";
}
