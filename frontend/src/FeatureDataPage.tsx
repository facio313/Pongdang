import { useEffect, useState } from "react";
import { activities, displayTime, requestJson, safeSourceUrl, type Activity } from "./aiApi";
import { contextLink, featurePages, featurePath, type FeaturePage } from "./featureRoutes";
import { type RowsResult } from "./data";
import { KakaoMapCanvas } from "./KakaoMapCanvas";

type Envelope = { rows: Record<string, unknown>[]; status?: string; as_of?: string; queried_at?: string; at?: string; total?: number; has_more?: boolean; reason_codes?: string[]; coverage?: unknown };
function localInput(iso: string) {
  if (!Number.isFinite(Date.parse(iso))) return "";
  return new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 16);
}
function isoInput(local: string) { return new Date(local + ":00+09:00").toISOString(); }
function Cell({ value, column }: { value: unknown; column: string }) {
  if (value === null || value === undefined) return <span className="null-value">NULL · 기록 없음</span>;
  if (typeof value === "object") return <details><summary>상세 근거</summary><pre className="feature-json">{JSON.stringify(value, null, 2)}</pre></details>;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return <>{displayTime(value)}</>;
  if (["source_url", "public_page", "terms_url"].includes(column) && typeof value === "string") {
    const url = safeSourceUrl(value);
    if (url) return <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{column === "public_page" ? "공식 영상 페이지 열기" : "공식 출처 열기"} ↗</a>;
  }
  return <>{String(value)}</>;
}
export function FeatureDataPage({ page, spotId: initialSpotId, activity: initialActivity, from: initialFrom, until: initialUntil }: { page: FeaturePage; spotId?: number; activity: Activity; from: string | null; until: string | null }) {
  const [now] = useState(() => new Date().toISOString());
  const [spotId, setSpotId] = useState(initialSpotId);
  const [activity, setActivity] = useState(initialActivity);
  const [from, setFrom] = useState(() => localInput(initialFrom ?? now));
  const [until, setUntil] = useState(() => localInput(initialUntil ?? new Date(Date.parse(now) + 86400000).toISOString()));
  const [search, setSearch] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState<RowsResult | null>(null);
  const [placesError, setPlacesError] = useState("");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: Envelope; error?: string }>();
  const periodValid = Boolean(from && until && Number.isFinite(Date.parse(from + "+09:00")) && Date.parse(until + "+09:00") > Date.parse(from + "+09:00") && Date.parse(until + "+09:00") - Date.parse(from + "+09:00") <= 31 * 86400000);
  const path = periodValid ? featurePath(page, spotId, activity, isoInput(from), isoInput(until)) : null;
  const key = `${path}:${revision}`;
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: "1", page_size: "100", q: placeQuery });
    void requestJson<RowsResult>(import.meta.env.BASE_URL, "datasets/spots?" + params, controller.signal).then(
      (data) => { if (!controller.signal.aborted) { setPlaces(data); setPlacesError(""); } },
      () => { if (!controller.signal.aborted) setPlacesError("장소 목록을 조회하지 못했습니다. 데이터 조회에서 장소를 확인해 주세요."); },
    );
    return () => controller.abort();
  }, [placeQuery]);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void requestJson<Envelope>(import.meta.env.BASE_URL, path, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setResult({ key, data }); },
      (error: unknown) => { if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : "자료 조회 실패" }); },
    );
    return () => controller.abort();
  }, [path, key]);
  const rows = current?.data?.rows ?? [];
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const selectedPlace = places?.rows.find((row) => row.id === spotId);
  const markers = rows.filter((row) => typeof row.spot_id === "number" && typeof row.name === "string" && typeof row.lat === "number" && typeof row.lng === "number")
    .map((row) => ({ id: String(row.spot_id), name: row.name as string, latitude: row.lat as number, longitude: row.lng as number }));
  return <article className="feature-page">
    <div className="ai-heading"><h1>{featurePages[page]} · 실제 자료 조회</h1><a href={contextLink({ spot_id: spotId, activity }, ["water-index", "water-forecast", "tide"].includes(page) && periodValid ? { from: isoInput(from), until: isoInput(until) } : undefined)}>이 조건으로 AI에게 물어보기</a></div>
    <p>실제 Pongdang 읽기 서비스의 공개 자료입니다. 관측·예보·관측소 자료의 시각과 공간 범위를 구분해 확인하세요. NULL·unknown은 안전함을 뜻하지 않습니다.</p>
    {page === "first-swim" ? <p className="ai-notice">본인의 기존 알림 구독을 조회합니다. 이 화면과 AI 대화는 구독을 생성·변경하거나 메일을 보내지 않습니다. 수온 기준 통과는 입수 안전 판정이 아닙니다.</p> : <>
      <form className="toolbar" onSubmit={(event) => { event.preventDefault(); setPlaceQuery(search); }}><label>장소 찾기<input type="search" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="실제 장소명·지역" /></label><button type="submit">장소 검색</button></form>
      {placesError && <p role="alert">{placesError}</p>}
      <div className="toolbar"><label>장소<select value={spotId ?? ""} onChange={(event) => setSpotId(event.target.value ? Number(event.target.value) : undefined)}><option value="">장소 선택</option>{initialSpotId && !places?.rows.some((row) => row.id === initialSpotId) && <option value={initialSpotId}>장소 ID {initialSpotId} · 서버 조회로 확인</option>}{places?.rows.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.name ?? "이름 기록 없음")} · ID {String(row.id)}</option>)}</select></label>
        <label>활동<select value={activity} onChange={(event) => setActivity(event.target.value as Activity)}>{Object.entries(activities).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        {["water-index", "water-forecast", "tide"].includes(page) && <><label>시작 · KST<input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>종료 · KST<input type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} /></label></>}
      </div>
      {selectedPlace && <p>선택 장소: {String(selectedPlace.name)} · 유형: {String(selectedPlace.type ?? "기록 없음")} · 지역: {String(selectedPlace.region ?? "기록 없음")}</p>}
      {(places?.total ?? 0) > 100 && <p className="table-note">장소 검색은 최대 100건을 표시합니다. 지역이나 이름으로 범위를 좁혀 주세요.</p>}
    </>}
    {!periodValid && <p role="alert">시작과 종료를 확인해 주세요. 조회 기간은 최대 31일입니다.</p>}
    {periodValid && !path && <p className="ai-notice">실제 장소를 선택하면 자료를 조회합니다.</p>}
    {path && !current && <p role="status">실제 자료 조회 중…</p>}
    {current?.error && <p role="alert">조회 실패: {current.error}</p>}
    {path && <button type="button" disabled={!current} onClick={() => setRevision((value) => value + 1)}>자료 새로고침</button>}
    {current?.data && <>
      <p className="table-note">자료 상태: {current.data.status ?? "개별 기록 참조"} · 기준시각: {displayTime(current.data.as_of ?? current.data.queried_at)} · 최대 100행</p>
      {current.data.reason_codes?.length ? <p>제한: {current.data.reason_codes.join(" · ")}</p> : null}
      {current.data.coverage != null && <details><summary>자료 범위와 지원 상태</summary><pre>{JSON.stringify(current.data.coverage, null, 2)}</pre></details>}
      {page === "water-index-map" && markers.length > 0 && <div style={{ height: 360, position: "relative" }}><KakaoMapCanvas markers={markers} selectedId={spotId ? String(spotId) : null} renderMarker={(id) => <button onClick={() => setSpotId(Number(id))}>{markers.find((marker) => marker.id === id)?.name}</button>} /></div>}
      {rows.length > 0 ? <div className="table-scroll" role="region" aria-label={featurePages[page] + " 실제 자료 표"} tabIndex={0}><table><thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? row.spot_id ?? index)}>{columns.map((column) => <td key={column}><Cell value={row[column]} column={column} /></td>)}</tr>)}</tbody></table></div> : <p className="ai-notice">조회 조건에 해당하는 저장 자료가 없습니다. 자료 부족으로 평가·추천·현재 상태를 판단할 수 없습니다.</p>}
      {(current.data.has_more || (current.data.total ?? 0) > 100) && <p>첫 100건을 표시했습니다. 장소와 기간을 좁히거나 <a href="#data">데이터 조회</a>의 페이지·필터를 사용하세요.</p>}
    </>}
    <p className="table-note">라이브캠 등록과 링크 상태는 영상 내용 확인을 뜻하지 않습니다. 물때와 관측 자료만으로 활동의 안전함이나 검증되지 않은 점수·순위를 만들지 않습니다.</p>
  </article>;
}
