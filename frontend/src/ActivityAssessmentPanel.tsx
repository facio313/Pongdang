import { useEffect, useRef, useState } from "react";
import {
  calculateConditionScore, criteriaFromDrafts, formatConditionTime, loadActivities, loadConditions, loadPlaces,
} from "./activityAssessmentApi";
import type {
  Activity, ActivityCatalog, ActivityDefinition, ConditionMetric, Conditions, ConditionScore,
  CriteriaDrafts, CriterionDraft, Mode, Place, PlacePage, Selection,
} from "./activityAssessmentApi";
import "./activityAssessment.css";

type Remote<T> = { key: string; data?: T; error?: string };
const emptyDraft: CriterionDraft = { enabled: false, stationId: "", minimum: "", maximum: "", weight: "" };
const statusLabels: Record<string, string> = {
  available: "자료 사용 가능", missing: "값 미제공", stale: "유효 기간 경과", unknown: "확인 불가",
  conflict: "근거 충돌", unit_mismatch: "단위 불일치", not_applicable: "대상 범위 밖",
  supported: "지원 근거 있음", unsupported: "지원하지 않음", restricted: "공식 제한 있음", caution: "주의 근거 있음",
  evaluated: "계산 완료", incomplete: "필요한 자료 미확보", blocked: "활동 지원·제한으로 계산 보류",
  matched: "범위 충족", not_matched: "범위 미충족", unavailable: "계산 불가",
};
const label = (value: string) => statusLabels[value] ?? value;
const reasonLabels: Record<string, string> = {
  revision_reactivation_history_unavailable: "자료가 수정되거나 다시 사용된 이력을 확인할 수 없습니다.",
  conflicting_measurement_evidence: "같은 조건의 측정 근거가 서로 충돌합니다.",
  provider_activity_mismatch: "제공기관 자료의 활동 범위가 선택한 활동과 다릅니다.",
  river_station_scope_unconfirmed: "이 관측소가 해당 하천 활동 구간을 대표하는지 확인되지 않았습니다.",
  bath_station_scope_unconfirmed: "시설 욕조를 직접 측정한 자료인지 확인되지 않았습니다.",
  numeric_measurement_missing: "제공기관이 사용할 수 있는 측정 수치를 제공하지 않았습니다.",
  nonfinite_measurement: "측정 수치를 계산에 사용할 수 없습니다.",
  measurement_unit_unconfirmed: "측정 단위가 해당 조건의 계산 단위와 맞는지 확인되지 않았습니다.",
  spatial_scope_unconfirmed: "측정 자료가 적용되는 장소 범위가 확인되지 않았습니다.",
  measurement_validity_unknown: "측정 자료의 유효 기간이 확인되지 않았습니다.",
  measurement_expired: "측정 자료의 유효 기간이 지났습니다.",
  measurement_time_or_mode_mismatch: "자료의 시각 또는 관측·예보 구분이 조회 조건과 맞지 않습니다.",
  provider_issue_time_unknown: "제공기관의 예보 발표시각이 확인되지 않았습니다.",
  environment_model_not_validated: "활동별 환경 적합도 모델이 아직 검증되지 않았습니다.",
  safety_requirements_not_validated: "안전 확인에 필요한 기준과 항목이 아직 검증되지 않았습니다.",
  activity_support_unknown: "이 장소에서 선택한 활동을 지원하는지 확인되지 않았습니다.",
  conflicting_support_evidence: "활동 지원 여부에 관한 근거가 서로 충돌합니다.",
  official_caution_present: "공식 주의 근거가 있습니다. 세부 내용을 확인해 주세요.",
  historical_metadata_unavailable: "조회 기준시각에 해당하는 장소 정보가 없습니다.",
  no_mapped_measurements: "선택한 장소와 활동에 연결된 측정 자료가 없습니다.",
  selected_measurement_unavailable: "선택한 관측소의 해당 측정 자료를 확보하지 못했습니다.",
  user_defined_conditions_only: "직접 설정한 조건만 종합 점수에 반영했습니다.",
  not_a_safety_or_suitability_score: "이 점수는 안전 판정이나 검증된 활동 적합도를 나타내지 않습니다.",
  selected_criteria_incomplete: "선택한 조건 중 유효한 자료를 확보하지 못한 항목이 있습니다.",
  official_restriction_or_unsupported_activity: "공식 제한 또는 활동 지원 불가 근거로 점수 계산을 보류했습니다.",
  place_not_found: "선택한 장소를 찾을 수 없습니다.",
  ambiguous_station_mapping: "장소와 관측소의 연결 근거가 중복되어 확인이 필요합니다.",
  response_scope_too_large: "조회할 자료가 너무 많습니다. 장소나 시각의 범위를 좁혀 주세요.",
  application_json_required: "점수 계산 요청 형식을 확인해 주세요.",
  request_too_large: "계산 요청이 너무 큽니다. 선택한 조건을 줄여 주세요.",
  invalid_request: "조회 조건 또는 점수 계산 설정을 확인해 주세요.",
  condition_data_unavailable: "조건 자료를 제공할 수 없습니다. 잠시 후 다시 조회해 주세요.",
};
const reasonText = (code: string) => Object.hasOwn(reasonLabels, code) ? reasonLabels[code] : "추가로 확인할 사유가 있습니다. 상세 코드를 확인해 주세요.";
const errorText = (error: unknown) => error instanceof Error ? (Object.hasOwn(reasonLabels, error.message) ? reasonLabels[error.message] : error.message) : "자료 조회 오류";

function Reasons({ codes }: { codes: string[] }) {
  if (!codes.length) return <>없음</>;
  return <>
    <span>{Array.from(new Set(codes.map(reasonText))).join(" ")}</span>
    <details><summary>상세 사유 코드</summary><code>{codes.join(", ")}</code></details>
  </>;
}

function EvidenceTable({ metric }: { metric: ConditionMetric }) {
  return (
    <details>
      <summary>출처·시각·공간 근거 {metric.evidence.length}건</summary>
      <p>관측소 {metric.station_name ?? metric.station_id} · {metric.relation === "representative_station" ? "대표 관측소 연결" : "관측소 관측 지점"}</p>
      <p>공간 범위: {metric.spatial_scope ?? "미확인"} · 연결 근거 ID: {metric.mapping_id ?? "미제공"}</p>
      <p>자료 상태: {label(metric.status)}</p>
      <div>자료 사유: <Reasons codes={metric.reason_codes} /></div>
      {metric.evidence.length > 0 && <div className="table-scroll" tabIndex={0} aria-label={`${metric.label} 출처 표`}>
        <table>
          <thead><tr><th>제공기관·레코드</th><th>원본 값·단위</th><th>관측·대상시각</th><th>발표시각</th><th>수집시각</th><th>유효 범위</th><th>원본 상태·공간 범위</th></tr></thead>
          <tbody>{metric.evidence.map((row, index) => <tr key={`${row.metric_id}-${index}`}>
            <td>{row.provider}<br /><code>{row.provider_record_id}</code><br />원천: {row.source_record_id ?? "미제공"}<br />측정 ID {row.metric_id ?? "미제공"} · 자료 ID {row.snapshot_id}</td>
            <td>{row.numeric_value ?? "수치 미제공"} {row.unit ?? "단위 미제공"}<br />원문 값: {row.text_value ?? "미제공"}<br /><code>{row.name}</code></td>
            <td>{row.mode === "forecast" ? "예보 대상" : "관측"}<br />{formatConditionTime(row.observed_at)}</td>
            <td>{formatConditionTime(row.issued_at)}</td><td>{formatConditionTime(row.fetched_at)}</td>
            <td>{formatConditionTime(row.valid_from)} ~<br />{formatConditionTime(row.valid_until)}</td><td>결측: {row.is_missing ? "예" : "아니요"}<br />자료: {row.source_state ?? "미확인"}<br />측정: {row.metric_state ?? "미확인"}<br />{row.spatial_scope ?? "공간 범위 미확인"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </details>
  );
}

function ScoreResult({ result }: { result: ConditionScore }) {
  return <section className="activity-score-result" aria-label="종합 조건 일치 점수 결과" aria-live="polite">
    <h3>{result.score_label}: {result.score === null ? "산출 불가" : `${result.score.toFixed(1)} / 100`}</h3>
    <p>{label(result.status)} · 설정한 조건 {result.criteria.length}개 · 전체 중요도 {result.total_weight} · 충족 중요도 {result.matched_weight ?? "계산 불가"}</p>
    <p>직접 설정한 조건의 일치 점수입니다. 안전 판정·검증된 활동 적합도·활동 간 순위는 제공하지 않습니다.</p>
    <p>근거 기준시각: {formatConditionTime(result.evidence.as_of)} · 대상시각: {formatConditionTime(result.evidence.at)} (한국 표준시)</p>
    <div className="table-scroll" tabIndex={0} aria-label="조건별 계산 표">
      <table>
        <thead><tr><th>조건·관측소</th><th>설정 범위</th><th>자료 값</th><th>중요도</th><th>결과</th><th>충족 중요도</th><th>사유</th></tr></thead>
        <tbody>{result.criteria.map((row) => <tr key={row.metric}>
          <td>{result.evidence.metrics.find((metric) => metric.name === row.metric)?.label ?? row.metric}<br />관측소 {row.station_id}</td>
          <td>{row.minimum ?? "하한 없음"} ~ {row.maximum ?? "상한 없음"} {row.unit}</td>
          <td>{row.value ?? "미확보"} {row.unit}</td><td>{row.weight}</td><td>{label(row.status)}</td>
          <td>{row.weighted_points ?? "계산 불가"}</td><td><Reasons codes={row.reason_codes} /></td>
        </tr>)}</tbody>
      </table>
    </div>
    {result.reason_codes.length > 0 && <div>계산 사유: <Reasons codes={result.reason_codes} /></div>}
    <details><summary>계산식과 검증 상태</summary>
      <p>종합 점수 = 100 × 범위를 충족한 조건의 중요도 합 ÷ 선택한 모든 조건의 중요도 합. 경곗값을 포함하며, 하나라도 유효한 자료가 없으면 점수를 산출하지 않습니다.</p>
      <p>계산 모델: {result.model.model_id} {result.model.model_version} · 과학적 활동 적합도 검증: 미평가</p>
      <p>계산 식별자: <code>{result.calculation_id}</code></p>
    </details>
  </section>;
}

function ConditionsForm({ definition, conditions, selection }: { definition: ActivityDefinition; conditions: Conditions; selection: Selection }) {
  const [drafts, setDrafts] = useState<CriteriaDrafts>({});
  const [result, setResult] = useState<ConditionScore>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function change(name: string, update: Partial<CriterionDraft>) {
    controller.current?.abort();
    setLoading(false);
    setResult(undefined);
    setError(undefined);
    setDrafts((value) => ({ ...value, [name]: { ...(value[name] ?? emptyDraft), ...update } }));
  }
  async function calculate() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setResult(undefined);
    setError(undefined);
    try {
      const criteria = criteriaFromDrafts(drafts);
      setLoading(true);
      const score = await calculateConditionScore(import.meta.env.BASE_URL,
        { ...selection, at: conditions.at, as_of: conditions.as_of }, criteria, request.signal);
      if (!request.signal.aborted) setResult(score);
    } catch (cause) {
      if (!request.signal.aborted) setError(errorText(cause));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }
  return <>
    <div className="table-scroll activity-state-table" tabIndex={0} aria-label="선택 활동 확인 상태">
      <table><thead><tr><th>활동</th><th>활동 지원 근거</th><th>안전·제한 확인</th><th>환경 적합도 모델</th><th>자료 기준시각</th></tr></thead>
        <tbody><tr><td>{definition.label}</td><td>{label(conditions.support_status)}</td><td>{label(conditions.safety_status)}</td>
          <td>수치 모델 미구현 · 검증 미평가 · 점수 없음</td><td>{formatConditionTime(conditions.as_of)}<br />대상 {formatConditionTime(conditions.at)} (한국 표준시)</td></tr></tbody>
      </table>
    </div>
    {(conditions.safety_status === "restricted" || conditions.support_status === "unsupported") && <p className="activity-notice" role="status">공식 활동 제한 또는 지원 불가 근거가 있습니다. 종합 조건 일치 점수를 산출하지 않습니다.</p>}
    {(conditions.safety_status === "unknown" || conditions.support_status === "unknown") && <p className="activity-notice">활동 지원 여부나 안전 확인에 필요한 근거가 부족합니다. 조건 일치 점수가 나와도 해당 장소에서 활동할 수 있다는 뜻은 아닙니다.</p>}
    {conditions.restriction_refs.length > 0 && <details><summary>공식 제한 근거 {conditions.restriction_refs.length}건</summary><code>{conditions.restriction_refs.join(", ")}</code></details>}
    <h3>활동 조건과 종합 점수 설정</h3>
    <p>계산할 조건과 관측소를 선택하고, 원하는 범위와 중요도를 직접 입력하세요. 범위·중요도는 추천 기준이 아니며, 선택하지 않은 조건은 점수에 포함하지 않습니다.</p>
    <form onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
      <div className="table-scroll" tabIndex={0} aria-label="활동별 조건 설정 표">
        <table className="activity-criteria-table">
          <thead><tr><th>선택</th><th>조건</th><th>관측소</th><th>값·자료 상태</th><th>원하는 최솟값</th><th>원하는 최댓값</th><th>중요도</th></tr></thead>
          <tbody>{definition.metrics.map((metric) => {
            const options = conditions.metrics.filter((value) => value.name === metric.name);
            const draft = drafts[metric.name] ?? emptyDraft;
            const current = options.find((value) => String(value.station_id) === draft.stationId);
            return <tr key={metric.name}>
              <td><input type="checkbox" aria-label={`${metric.label} 계산에 포함`} checked={draft.enabled} disabled={!options.length} onChange={(event) => change(metric.name, { enabled: event.target.checked })} /></td>
              <td>{metric.label} ({metric.unit})<br /><small>{metric.description}</small></td>
              <td>{options.length ? <select aria-label={`${metric.label} 관측소`} value={draft.stationId} onChange={(event) => change(metric.name, { stationId: event.target.value })}>
                <option value="">관측소 선택</option>{options.map((value) => <option key={value.station_id} value={value.station_id}>{value.station_name ?? `관측소 ${value.station_id}`} · {label(value.status)}</option>)}
              </select> : "연결된 자료 없음"}</td>
              <td>{current ? <>{current.value ?? "미제공"} {current.unit}<br />{label(current.status)}</> : options.length ? "관측소를 선택해 주세요" : "자료 없음"}</td>
              <td><input type="number" step="any" aria-label={`${metric.label} 최솟값`} value={draft.minimum} disabled={!draft.enabled} onChange={(event) => change(metric.name, { minimum: event.target.value })} placeholder="하한 없음" /></td>
              <td><input type="number" step="any" aria-label={`${metric.label} 최댓값`} value={draft.maximum} disabled={!draft.enabled} onChange={(event) => change(metric.name, { maximum: event.target.value })} placeholder="상한 없음" /></td>
              <td><input type="number" step="any" max="1000" aria-label={`${metric.label} 중요도`} value={draft.weight} disabled={!draft.enabled} onChange={(event) => change(metric.name, { weight: event.target.value })} placeholder="직접 입력" /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="toolbar"><button type="submit" disabled={loading || conditions.support_status === "unsupported" || conditions.safety_status === "restricted"}>{loading ? "종합 점수 계산 중…" : "선택 조건의 종합 점수 계산"}</button><span className="muted">범위·중요도·관측소를 바꾸면 이전 결과가 사라집니다.</span></div>
    </form>
    {error && <p role="alert">계산하지 못했습니다. {error}</p>}
    {loading && <p role="status">서버에 저장된 실제 자료로 조건 일치 점수를 계산하고 있습니다.</p>}
    {result && <ScoreResult result={result} />}
    <h3>자료 근거와 아직 확인할 항목</h3>
    {conditions.missing_metrics.length > 0 && <p>미확보 조건: {conditions.missing_metrics.map((name) => definition.metrics.find((metric) => metric.name === name)?.label ?? name).join(", ")}</p>}
    <p>추가로 필요한 근거: {conditions.required_evidence.join(" · ") || "서버에 등록된 항목 없음"}</p>
    {conditions.reason_codes.length > 0 && <div>평가 사유: <Reasons codes={conditions.reason_codes} /></div>}
    {conditions.metrics.length > 0 ? conditions.metrics.map((metric) => <div key={`${metric.name}-${metric.station_id}`} className="activity-evidence"><strong>{metric.label} · {metric.station_name ?? `관측소 ${metric.station_id}`}</strong><EvidenceTable metric={metric} /></div>) : <p>선택한 활동과 장소·시각에 사용할 실제 자료가 없습니다.</p>}
  </>;
}

function SelectedActivity({ definition, place, mode, at, revision }: { definition: ActivityDefinition; place: Place; mode: Mode; at: string; revision: number }) {
  const [remote, setRemote] = useState<Remote<Conditions>>();
  let atIso: string | undefined;
  let invalidTime = false;
  if (at) {
    const parsed = new Date(`${at}+09:00`);
    invalidTime = !Number.isFinite(parsed.getTime());
    if (!invalidTime) atIso = parsed.toISOString();
  }
  const selection: Selection = { spot_id: place.spot_id, activity: definition.activity, mode, ...(atIso ? { at: atIso } : {}) };
  const key = JSON.stringify({ ...selection, revision, invalidTime });
  useEffect(() => {
    if (invalidTime) return;
    const controller = new AbortController();
    void loadConditions(import.meta.env.BASE_URL, { spot_id: place.spot_id, activity: definition.activity, mode, ...(atIso ? { at: atIso } : {}) }, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setRemote({ key, data }); },
      (error: unknown) => { if (!controller.signal.aborted) setRemote({ key, error: errorText(error) }); },
    );
    return () => controller.abort();
  }, [key, invalidTime, place.spot_id, definition.activity, mode, atIso]);
  if (invalidTime) return <p role="alert">한국 표준시 기준의 올바른 대상시각을 입력해 주세요.</p>;
  if (remote?.key !== key) return <p role="status">{place.name ?? `지점 ${place.spot_id}`} · {definition.label} 자료를 확인하고 있습니다.</p>;
  if (remote.error) return <p role="alert">활동 자료를 불러오지 못했습니다. {remote.error} 조회 실패는 조건 충족을 의미하지 않습니다.</p>;
  return remote.data && <ConditionsForm key={key} definition={definition} conditions={remote.data} selection={selection} />;
}

export function ActivityAssessmentPanel() {
  const [catalog, setCatalog] = useState<Remote<ActivityCatalog>>();
  const [places, setPlaces] = useState<Remote<PlacePage>>();
  const [page, setPage] = useState(1);
  const [place, setPlace] = useState<Place>();
  const [activity, setActivity] = useState<Activity>("swim");
  const [mode, setMode] = useState<Mode>("observation");
  const [at, setAt] = useState("");
  const [revision, setRevision] = useState(0);
  const catalogKey = String(revision);
  const placeKey = `${page}-${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    void loadActivities(import.meta.env.BASE_URL, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setCatalog({ key: catalogKey, data }); },
      (error: unknown) => { if (!controller.signal.aborted) setCatalog({ key: catalogKey, error: errorText(error) }); },
    );
    return () => controller.abort();
  }, [catalogKey]);
  useEffect(() => {
    const controller = new AbortController();
    void loadPlaces(import.meta.env.BASE_URL, page, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setPlaces({ key: placeKey, data }); },
      (error: unknown) => { if (!controller.signal.aborted) setPlaces({ key: placeKey, error: errorText(error) }); },
    );
    return () => controller.abort();
  }, [placeKey, page]);
  const currentPlaces = places?.key === placeKey ? places.data : undefined;
  const currentCatalog = catalog?.key === catalogKey ? catalog.data : undefined;
  const definition = currentCatalog?.rows.find((value) => value.activity === activity);
  return <section className="activity-assessment" aria-labelledby="activity-assessment-title">
    <h2 id="activity-assessment-title">활동별 자료 확인과 종합 조건 일치 점수</h2>
    <p>수영·서핑·휴식·갯벌·온천·래프팅을 선택해 실제 수집 자료와 미확보 근거를 확인할 수 있습니다. 종합 점수는 선택한 활동에서 직접 정한 여러 조건의 일치 정도를 계산합니다.</p>
    <div className="toolbar">
      <label>활동 <select aria-label="활동" value={activity} onChange={(event) => setActivity(event.target.value as Activity)} disabled={!currentCatalog}>
        {currentCatalog?.rows.map((value) => <option value={value.activity} key={value.activity}>{value.label}</option>)}
      </select></label>
      <label>장소 <select aria-label="평가 장소" value={place?.spot_id ?? ""} disabled={!currentPlaces} onChange={(event) => setPlace(currentPlaces?.rows.find((value) => value.spot_id === Number(event.target.value)))}>
        <option value="">장소 선택</option>
        {place && !currentPlaces?.rows.some((value) => value.spot_id === place.spot_id) && <option value={place.spot_id}>{place.name ?? `지점 ${place.spot_id}`} (선택됨)</option>}
        {currentPlaces?.rows.map((value) => <option value={value.spot_id} key={value.spot_id}>{value.name ?? `지점 ${value.spot_id}`}</option>)}
      </select></label>
      <button onClick={() => setPage((value) => value - 1)} disabled={page <= 1 || !currentPlaces}>장소 이전</button>
      <span>장소 {page}쪽 · 최대 25개</span>
      <button onClick={() => setPage((value) => value + 1)} disabled={!currentPlaces?.has_more || page >= 1000}>장소 다음</button>
    </div>
    <div className="toolbar">
      <label>자료 구분 <select aria-label="자료 구분" value={mode} onChange={(event) => setMode(event.target.value as Mode)}><option value="observation">관측</option><option value="forecast">공식 예보</option></select></label>
      <label>대상시각 (한국 표준시) <input type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} /></label>
      <span className="muted">비워 두면 조회 시점</span>
      <button onClick={() => setRevision((value) => value + 1)}>활동 자료 새로고침</button>
    </div>
    {catalog?.key !== catalogKey && <p role="status">전체 활동 목록을 확인하고 있습니다.</p>}
    {catalog?.key === catalogKey && catalog.error && <p role="alert">활동 목록 조회 실패: {catalog.error}</p>}
    {places?.key !== placeKey && <p role="status">장소 목록을 확인하고 있습니다.</p>}
    {places?.key === placeKey && places.error && <p role="alert">장소 목록 조회 실패: {places.error}</p>}
    {currentPlaces && !currentPlaces.rows.length && <p>이 페이지에 조회할 수집 장소가 없습니다.</p>}
    {currentCatalog && <details>
      <summary>전체 6개 활동의 제공 범위와 검증 상태</summary>
      <div className="table-scroll" tabIndex={0} aria-label="전체 활동 검증 상태 표">
        <table><thead><tr><th>활동</th><th>조회할 조건</th><th>필요한 근거</th><th>현재 검증 상태</th></tr></thead>
          <tbody>{currentCatalog.rows.map((row) => <tr key={row.activity} aria-selected={activity === row.activity}>
            <td><button type="button" onClick={() => setActivity(row.activity)} aria-pressed={activity === row.activity}>{row.label} 보기</button></td>
            <td>{row.metrics.map((metric) => metric.label).join(" · ")}<br /><small>{row.description}</small></td>
            <td>{row.required_evidence.join(" · ")}</td><td>환경 적합도 수치 모델 미구현 · 과학적 검증 미평가<br />사용자 조건 일치 계산 제공</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
    {definition && place ? <SelectedActivity definition={definition} place={place} mode={mode} at={at} revision={revision} /> : currentCatalog && <p>실제 수집 장소를 선택하면 활동 조건과 근거가 표시됩니다.</p>}
  </section>;
}
