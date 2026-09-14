import { requestData } from "./api.ts";

export const ACTIVITIES = ["swim", "surf", "relax", "mudflat", "onsen", "rafting"] as const;
export type Activity = typeof ACTIVITIES[number];
export type Mode = "observation" | "forecast";
export interface ConditionModel {
  model_id: "explicit-range-match";
  model_version: "1.0.0";
  score_meaning: "user_defined_condition_match";
  scientific_validation: "not_evaluated";
  formula: string;
}
export interface ActivityMetric { name: string; label: string; unit: string; description: string }
export interface ActivityDefinition {
  activity: Activity; label: string; description: string; metrics: ActivityMetric[];
  required_evidence: string[]; environment_model_status: "unimplemented";
}
export interface ActivityCatalog { model: ConditionModel; rows: ActivityDefinition[] }
export interface Place { spot_id: number; name: string | null }
export interface PlacePage { rows: Place[]; has_more: boolean }
export interface Evidence {
  metric_id: number | null; snapshot_id: number; provider: string; provider_record_id: string;
  source_record_id: string | null; name: string; numeric_value: number | null; unit: string | null;
  observed_at: string; issued_at: string | null; fetched_at: string; valid_until: string | null;
  mode: Mode; spatial_scope: string | null; valid_from: string; text_value: string | null;
  is_missing: boolean; source_state: string | null; metric_state: string | null;
}
export interface ConditionMetric {
  name: string; label: string; unit: string; value: number | null; station_id: number;
  station_name: string | null; relation: "station_observation_point" | "representative_station";
  mapping_id: string | null; spatial_scope: string | null;
  status: "available" | "missing" | "stale" | "unknown" | "conflict" | "unit_mismatch" | "not_applicable";
  reason_codes: string[]; evidence: Evidence[];
}
export interface Conditions {
  spot_id: number; place_name: string | null; activity: Activity; mode: Mode; at: string; as_of: string;
  model: ConditionModel; support_status: "supported" | "unsupported" | "unknown";
  safety_status: "restricted" | "caution" | "unknown"; restriction_refs: string[];
  environment_score: null; metrics: ConditionMetric[]; missing_metrics: string[];
  required_evidence: string[]; reason_codes: string[];
}
export interface Criterion {
  metric: string; station_id: number; minimum: number | null; maximum: number | null; weight: number;
}
export interface ScoreCriterion extends Criterion {
  status: "matched" | "not_matched" | "unavailable"; value: number | null;
  unit: string; matched: boolean | null; weighted_points: number | null; reason_codes: string[];
}
export interface ConditionScore {
  model: ConditionModel; evidence: Conditions; criteria: ScoreCriterion[];
  status: "evaluated" | "incomplete" | "blocked"; score: number | null;
  score_label: "종합 조건 일치 점수"; total_weight: number; matched_weight: number | null;
  reason_codes: string[]; calculation_id: string;
}
export interface Selection { spot_id: number; activity: Activity; mode: Mode; at?: string; as_of?: string }
export interface CriterionDraft { enabled: boolean; stationId: string; minimum: string; maximum: string; weight: string }
export type CriteriaDrafts = Record<string, CriterionDraft>;

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("활동 API 응답 형식이 올바르지 않습니다.");
  return value as RecordValue;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("활동 API 문자열 형식이 올바르지 않습니다.");
  return value;
}
function numeric(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("활동 API 숫자 형식이 올바르지 않습니다.");
  return value;
}
function positiveId(value: unknown): number {
  const result = numeric(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error("활동 API 식별자가 올바르지 않습니다.");
  return result;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("활동 API 상태 형식이 올바르지 않습니다.");
  return value;
}
function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null { return value === null ? null : parse(value); }
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) throw new Error("지원하지 않는 활동 API 상태입니다.");
  return value as T;
}
function list<T>(value: unknown, parse: (value: unknown) => T, max = 100): T[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("활동 API 목록 범위가 올바르지 않습니다.");
  return value.map(parse);
}
function timestamp(value: unknown): string {
  const result = text(value);
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error("활동 API 시각 형식이 올바르지 않습니다.");
  return result;
}
function contract(value: unknown): RecordValue {
  const data = record(value);
  if (data.contract_version !== "water-conditions.v1") throw new Error("지원하지 않는 활동 API 계약입니다.");
  return data;
}
function model(value: unknown): ConditionModel {
  const row = record(value);
  return {
    model_id: choice(row.model_id, ["explicit-range-match"]), model_version: choice(row.model_version, ["1.0.0"]),
    score_meaning: choice(row.score_meaning, ["user_defined_condition_match"]),
    scientific_validation: choice(row.scientific_validation, ["not_evaluated"]), formula: text(row.formula),
  };
}
export function parseActivityCatalog(value: unknown): ActivityCatalog {
  const data = contract(value);
  const rows = list(data.rows, (entry): ActivityDefinition => {
    const row = record(entry);
    return { activity: choice(row.activity, ACTIVITIES), label: text(row.label), description: text(row.description),
      metrics: list(row.metrics, (entry) => { const metric = record(entry); return { name: text(metric.name), label: text(metric.label), unit: text(metric.unit), description: text(metric.description) }; }, 8),
      required_evidence: list(row.required_evidence, text), environment_model_status: choice(row.environment_model_status, ["unimplemented"]) };
  }, 6);
  if (rows.length !== 6 || new Set(rows.map((row) => row.activity)).size !== 6) throw new Error("전체 6개 활동의 API 계약을 확인할 수 없습니다.");
  return { model: model(data.model), rows };
}
function evidence(value: unknown): Evidence {
  const row = record(value);
  return { metric_id: nullable(row.metric_id, positiveId), snapshot_id: positiveId(row.snapshot_id), provider: text(row.provider),
    provider_record_id: text(row.provider_record_id), source_record_id: nullable(row.source_record_id, text), name: text(row.name),
    numeric_value: nullable(row.numeric_value, numeric), unit: nullable(row.unit, text), observed_at: timestamp(row.observed_at),
    issued_at: nullable(row.issued_at, timestamp), fetched_at: timestamp(row.fetched_at), valid_until: nullable(row.valid_until, timestamp),
    mode: choice(row.mode, ["observation", "forecast"]), spatial_scope: nullable(row.spatial_scope, text),
    valid_from: timestamp(row.valid_from), text_value: nullable(row.text_value, text), is_missing: bool(row.is_missing),
    source_state: nullable(row.source_state, text), metric_state: nullable(row.metric_state, text) };
}
export function parseConditions(value: unknown): Conditions {
  const row = contract(value);
  if (row.environment_score !== null) throw new Error("검증되지 않은 환경 적합도 점수는 표시할 수 없습니다.");
  return { spot_id: positiveId(row.spot_id), place_name: nullable(row.place_name, text), activity: choice(row.activity, ACTIVITIES),
    mode: choice(row.mode, ["observation", "forecast"]), at: timestamp(row.at), as_of: timestamp(row.as_of), model: model(row.model),
    support_status: choice(row.support_status, ["supported", "unsupported", "unknown"]), safety_status: choice(row.safety_status, ["restricted", "caution", "unknown"]),
    restriction_refs: list(row.restriction_refs, text), environment_score: null,
    metrics: list(row.metrics, (value): ConditionMetric => { const metric = record(value); return {
      name: text(metric.name), label: text(metric.label), unit: text(metric.unit), value: nullable(metric.value, numeric),
      station_id: positiveId(metric.station_id), station_name: nullable(metric.station_name, text),
      relation: choice(metric.relation, ["station_observation_point", "representative_station"]),
      mapping_id: nullable(metric.mapping_id, text), spatial_scope: nullable(metric.spatial_scope, text),
      status: choice(metric.status, ["available", "missing", "stale", "unknown", "conflict", "unit_mismatch", "not_applicable"]),
      reason_codes: list(metric.reason_codes, text), evidence: list(metric.evidence, evidence) };
    }), missing_metrics: list(row.missing_metrics, text), required_evidence: list(row.required_evidence, text), reason_codes: list(row.reason_codes, text) };
}
function criterion(value: unknown): Criterion {
  const row = record(value);
  const result = { metric: text(row.metric), station_id: positiveId(row.station_id), minimum: nullable(row.minimum, numeric), maximum: nullable(row.maximum, numeric), weight: numeric(row.weight) };
  if (result.weight <= 0 || result.weight > 1000 || (result.minimum === null && result.maximum === null) || (result.minimum !== null && result.maximum !== null && result.minimum > result.maximum)) throw new Error("점수 조건이 올바르지 않습니다.");
  return result;
}
export function parseConditionScore(value: unknown): ConditionScore {
  const row = contract(value);
  const data: ConditionScore = { model: model(row.model), evidence: parseConditions(row.evidence),
    criteria: list(row.criteria, (value): ScoreCriterion => { const c = record(value); return { ...criterion(c),
      status: choice(c.status, ["matched", "not_matched", "unavailable"]), value: nullable(c.value, numeric), unit: text(c.unit),
      matched: nullable(c.matched, bool), weighted_points: nullable(c.weighted_points, numeric), reason_codes: list(c.reason_codes, text) }; }, 8),
    status: choice(row.status, ["evaluated", "incomplete", "blocked"]), score: nullable(row.score, numeric),
    score_label: choice(row.score_label, ["종합 조건 일치 점수"]), total_weight: numeric(row.total_weight),
    matched_weight: nullable(row.matched_weight, numeric), reason_codes: list(row.reason_codes, text), calculation_id: text(row.calculation_id) };
  if (!data.criteria.length || new Set(data.criteria.map((c) => c.metric)).size !== data.criteria.length) throw new Error("점수 조건이 누락되거나 중복되었습니다.");
  if (data.status !== "evaluated" && data.score !== null) throw new Error("미확인 조건의 점수를 표시할 수 없습니다.");
  if (data.status === "evaluated") {
    const total = data.criteria.reduce((sum, c) => sum + c.weight, 0);
    let matched = 0;
    for (const c of data.criteria) {
      const available = data.evidence.metrics.find((m) => m.name === c.metric && m.station_id === c.station_id);
      if (!available || available.status !== "available" || c.status === "unavailable" || c.matched === null || c.value === null || available.value !== c.value || available.unit !== c.unit) throw new Error("점수의 유효한 관측 근거를 확인할 수 없습니다.");
      const matches = (c.minimum === null || c.value >= c.minimum) && (c.maximum === null || c.value <= c.maximum);
      if (c.matched !== matches || c.status !== (matches ? "matched" : "not_matched") || c.weighted_points !== (matches ? c.weight : 0)) throw new Error("점수의 조건별 계산이 일치하지 않습니다.");
      if (matches) matched += c.weight;
    }
    const scale = Math.max(...data.criteria.map((c) => c.weight));
    const scaledTotal = data.criteria.reduce((sum, c) => sum + c.weight / scale, 0);
    const scaledMatched = data.criteria.reduce((sum, c) => sum + (c.matched ? c.weight / scale : 0), 0);
    // Check the server rounding envelope without reproducing decimal arithmetic in binary floating point.
    const unrounded = (scaledMatched / scaledTotal) * 100;
    if (data.score === null || data.score < 0 || data.score > 100 || Math.abs(data.score - unrounded) > 0.05000001 || Math.abs(data.score * 10 - Math.round(data.score * 10)) > 0.00001 || Math.abs(data.total_weight - total) > 0.00001 || data.matched_weight === null || Math.abs(data.matched_weight - matched) > 0.00001 || data.evidence.support_status === "unsupported" || data.evidence.safety_status === "restricted") throw new Error("종합 점수의 계산 또는 공개 상태가 올바르지 않습니다.");
  }
  return data;
}
export async function loadActivities(base: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ActivityCatalog> {
  return parseActivityCatalog(await requestData(base, "water-index/activities", signal, fetcher));
}
export async function loadPlaces(base: string, page: number, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<PlacePage> {
  const row = record(await requestData(base, `water-twin?page=${page}&page_size=25`, signal, fetcher));
  if (row.contract_version !== "water-spatial.v1") throw new Error("지원하지 않는 장소 API 계약입니다.");
  const rows = list(row.rows, (value) => { const place = record(value); return { spot_id: positiveId(place.spot_id), name: nullable(place.name, text) }; }, 25);
  return { rows, has_more: bool(row.has_more) };
}
export async function loadConditions(base: string, selection: Selection, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Conditions> {
  const query = new URLSearchParams({ spot_id: String(selection.spot_id), activity: selection.activity, mode: selection.mode });
  if (selection.at) query.set("at", selection.at);
  if (selection.as_of) query.set("as_of", selection.as_of);
  const result = parseConditions(await requestData(base, `water-index/conditions?${query}`, signal, fetcher));
  checkSelection(result, selection);
  return result;
}
function checkSelection(result: Conditions, selection: Selection) {
  if (result.spot_id !== selection.spot_id || result.activity !== selection.activity || result.mode !== selection.mode || (selection.at && Date.parse(result.at) !== Date.parse(selection.at)) || (selection.as_of && Date.parse(result.as_of) !== Date.parse(selection.as_of))) throw new Error("선택한 지점·활동·시각과 응답이 일치하지 않습니다.");
}
export async function calculateConditionScore(base: string, selection: Selection, criteria: Criterion[], signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ConditionScore> {
  signal.throwIfAborted();
  const response = await fetcher(`${base}api/data/water-index/condition-score`, { method: "POST", signal, cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...selection, criteria }) });
  const payload: unknown = await response.json();
  signal.throwIfAborted();
  if (!response.ok) { const error = record(payload); throw new Error(typeof error.detail === "string" ? error.detail : "점수 계산 조건을 확인해 주세요."); }
  const result = parseConditionScore(payload);
  checkSelection(result.evidence, selection);
  if (result.criteria.length !== criteria.length || criteria.some((c) => !result.criteria.some((r) => r.metric === c.metric && r.station_id === c.station_id && r.minimum === c.minimum && r.maximum === c.maximum && r.weight === c.weight))) throw new Error("요청한 점수 조건과 응답이 일치하지 않습니다.");
  return result;
}
export function criteriaFromDrafts(drafts: CriteriaDrafts): Criterion[] {
  const chosen = Object.entries(drafts).filter(([, draft]) => draft.enabled);
  if (!chosen.length || chosen.length > 8) throw new Error("계산할 조건을 1개 이상, 8개 이하로 선택해 주세요.");
  return chosen.map(([metric, draft]) => {
    const parse = (raw: string, label: string): number | null => {
      if (!raw.trim()) return null;
      const result = Number(raw);
      if (!Number.isFinite(result)) throw new Error(`${label}에 유효한 숫자를 입력해 주세요.`);
      return result;
    };
    const station = parse(draft.stationId, "관측소");
    const minimum = parse(draft.minimum, "최솟값");
    const maximum = parse(draft.maximum, "최댓값");
    const weight = parse(draft.weight, "중요도");
    if (station === null || !Number.isSafeInteger(station) || station <= 0) throw new Error("선택한 조건의 관측소를 지정해 주세요.");
    if (minimum === null && maximum === null) throw new Error("선택한 조건의 최솟값 또는 최댓값을 입력해 주세요.");
    if (minimum !== null && maximum !== null && minimum > maximum) throw new Error("최솟값은 최댓값 이하여야 합니다.");
    if (weight === null || weight <= 0 || weight > 1000) throw new Error("선택한 조건의 중요도를 0 초과 1,000 이하로 입력해 주세요.");
    return { metric, station_id: station, minimum, maximum, weight };
  });
}
export function formatConditionTime(value: string | null): string {
  return value === null ? "미제공" : new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}
