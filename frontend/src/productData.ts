import type { Activity } from "./aiApi";

export interface Place {
  id: number;
  name: string;
  address: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  type: string | null;
  catalog_verification: string | null;
}
export interface Metric {
  name: string;
  label: string;
  value: number | null;
  unit: string;
  status: string;
  station_id: number;
  station_name: string | null;
  relation: string;
  spatial_scope: string | null;
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
  environment_score: number | null;
  metrics: Metric[];
  reason_codes: string[];
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
export interface TideEvent {
  event_id: string;
  kind: string;
  event_at: string;
  height: number | null;
  unit: string | null;
  station_name: string;
  state: string;
  provider: string;
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
    : null;
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
    : null;
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
  return formatValue(item?.value, item?.unit);
}
export function evidenceText(data?: Conditions) {
  if (!data) return "아직 조건 자료를 읽지 못했습니다.";
  const sources = [
    ...new Set(
      data.metrics.flatMap((m) =>
        m.evidence.map(
          (e) =>
            `${m.station_name ?? "관측소명 없음"} · ${e.provider} · ${timeLabel(e.observed_at)} KST`,
        ),
      ),
    ),
  ];
  return `${data.mode === "forecast" ? "예보" : "관측"} 기준 ${dateLabel(data.at)} ${timeLabel(data.at)} KST. ${sources.join(" / ") || "유효한 근거 없음"}. 대표 관측소 자료는 현장 실측과 다릅니다.`;
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
