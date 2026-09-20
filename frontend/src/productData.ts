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
/** 점수로 **보여 줄 수 있는** 값인지 판정합니다. 전체 봉투와 목록 요약이 같은
 *  판정을 써야 두 화면이 같은 숫자를 말합니다 -- 그래서 인자를
 *  `condition_score` 하나만 요구합니다. */
export function conditionScore(
  data?: { condition_score?: ConditionScore | null },
): number | null {
  const index = data?.condition_score;
  return index && ["evaluated", "partial"].includes(index.status) &&
    typeof index.score === "number" && Number.isFinite(index.score) &&
    index.score >= 0 && index.score <= 100 ? index.score : null;
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

/** 조회 경로에 들어가는 「지금」. **10분 단위로 끊습니다.**
 *
 *  이 값은 periodPath 의 from · reference_at 이 되어 **조회 경로의 일부**가
 *  됩니다. 컴포넌트마다 `new Date()` 를 잡으면 같은 화면의 두 레이아웃이 서로
 *  다른 경로를 물어, 창 폭을 넘나들었다는 이유만으로 같은 자료를 다시
 *  받았습니다(useResource 의 조회 기억 주석). 끊어 두면 두 레이아웃이 같은
 *  경로를 말하고, 10분마다 자연히 갱신됩니다.
 *
 *  화면에 적는 시각에는 쓰지 않습니다 -- 「지금 06:07」을 06:00 으로 적으면
 *  실제와 다른 사실이 됩니다. 그 자리는 그대로 `timeLabel(new Date())` 입니다. */
export const SESSION_NOW_STEP = 600000;
export const sessionNow = () =>
  new Date(Math.floor(Date.now() / SESSION_NOW_STEP) * SESSION_NOW_STEP).toISOString();

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
/** 목록 한 줄이 쓰는 요약. 전체 봉투(Conditions)에서 서버가 **뽑아낸** 것이며
 *  따로 계산한 값이 아닙니다 -- 목록과 상세가 다른 숫자를 말하면 안 됩니다. */
export interface ConditionSummary {
  spot_id: number;
  place_name: string | null;
  support_status: string;
  safety_status: string;
  condition_score?: ConditionScore | null;
  water_temperature?: Metric | null;
  /** 이 요약을 떠받치는 근거 중 가장 먼저 만료되는 시각. 요약에는 metric
   *  트리가 없으므로 서버가 대신 계산해 실어 줍니다. */
  expires_at: string | null;
}
export interface ConditionSummaries {
  contract_version: string;
  activity: Activity;
  mode: string;
  as_of: string;
  rows: ConditionSummary[];
  /** 읽지 못한 지점. 값이 없는 상태가 안전을 뜻하지 않으므로, 조용히 빠지지
   *  않고 사유와 함께 남습니다. */
  unavailable: { spot_id: number; reason: string }[];
}
/** 서버가 한 요청에 받는 지점 수(condition_api.py 의 SUMMARY_BATCH_MAX). */
export const SUMMARY_BATCH_MAX = 25;
/** 목록 여러 줄의 조건을 **한 번에** 묻는 경로.
 *
 *  placePhotosPath 와 같은 방식으로 정렬 · 중복 제거해 **안정된 문자열 키**를
 *  만듭니다 -- 이게 useResource 의 기억이 먹는 전제입니다. 순서가 렌더마다
 *  흔들리면 같은 목록이 매번 새 키가 되어 기억이 무용지물이 됩니다. */
export function conditionSummaryPath(
  ids: number[],
  activity: Activity = "swim",
): string | null {
  const selected = [...new Set(ids)]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((a, b) => a - b);
  return selected.length
    ? "water-index/conditions/summary?" +
        new URLSearchParams({ spot_ids: selected.join(","), activity })
    : // 물어볼 지점이 없는 것은 「해당 없음」입니다. 조회는 나가지 않습니다.
      null;
}
/** 요약 여러 묶음에서 가장 먼저 만료되는 시각. 없으면 undefined. */
export function summariesExpiry(rows: ConditionSummary[]): number | undefined {
  const expiries = rows
    .map((row) => (row.expires_at ? Date.parse(row.expires_at) : NaN))
    .filter(Number.isFinite);
  return expiries.length ? Math.min(...expiries) : undefined;
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
