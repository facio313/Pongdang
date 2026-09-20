import { InlineLanguageSelector } from "./TravelLanguageSelector";
import { t } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { activities, aiReasonTexts, aiStatusText, displayTime, ConversationRequest, requestJson, safeInternalLink, safeSourceUrl, type AiContext, type AiFact, type AiStatus, type ChatMessage, type ChatResponse } from "./aiApi";
import { ModelTraceButton, ModelTraceDialog } from "./ModelTraceDialog";
import { placeRegionLabel } from "./productData";
import "./aiConcierge.css";

const exampleQuestions = ["오늘 강원도에서 수영 조건을 확인할 수 있는 곳이 있어?", "내일 오후 서핑 조건을 비교해줘.", "수질 자료가 서로 다르게 나오는데 무슨 뜻이야?", "여기서 어떤 기능을 사용할 수 있어?"];
const dataStatuses: Record<string, string> = {
  available: "자료 있음", observation: "현재 자료 · 관측", forecast: "예보", current: "현재 자료", stale: "갱신 지연",
  partial: "일부 자료", no_data: "자료 부족", missing: "자료 부족", unknown: "확인되지 않음", superseded: "후속 자료로 대체됨",
  unsupported: "미지원", unavailable: "제공 불가", error: "조회 실패", failed: "조회 실패",
};
const metadataNames: Record<string, string> = {
  name: "지표명", numeric_value: "수치", text_value: "문자 자료", value: "값", score: "공개 점수", is_missing: "결측 여부", reason_codes: "자료 제한 사유",
  observed_at: "관측 시각", issued_at: "발표 시각", fetched_at: "수집 시각", valid_until: "유효 기한",
  at: "대상 시각", target_at: "대상 시각", target_start_at: "대상 시작", target_end_at: "대상 종료",
  from: "조회 시작", until: "조회 종료", start_at: "시작 시각", end_at: "종료 시각", as_of: "자료 기준시각",
  provider: "제공처", source: "출처", source_id: "원본 ID", provider_record_id: "제공처 기록 ID",
  unit: "단위", station_id: "관측소 ID", relation: "장소와 관측소 관계", spatial_scope: "공간 범위",
  mode: "자료 종류", time_role: "시각 구분", status: "자료 상태", safety_status: "안전 상태",
  valid_from: "유효 시작", event_at: "조석 사건 시각", available_at: "조회 가능 시각", evaluated_at: "평가 시각", sampled_until: "채수 종료", checked_at: "접속 확인", station_name: "관측소 이름", source_record_id: "원본 기록 ID", source_state: "원본 상태", metric_state: "지표 상태",
  from_at: "조회 시작", until_at: "조회 종료", activity: "활동", region: "지역", spot_id: "장소 ID", feature: "조회 기능",
};

function metadataValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return t("기록 없음");
  if (key.endsWith("_at") || ["from", "until", "at", "valid_until", "as_of"].includes(key)) return displayTime(value);
  if (Array.isArray(value)) return value.map(String).join(" · ");
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return t("상세 근거 참조");
  if (key === "activity" && typeof value === "string" && Object.hasOwn(activities, value)) return t(activities[value as keyof typeof activities]);
  return dataStatuses[String(value)] ? `${t(dataStatuses[String(value)])} (${String(value)})` : String(value);
}
function Metadata({ value, depth = 0 }: { value: Record<string, unknown>; depth?: number }) {
  const isNested = (item: unknown) => item !== null && typeof item === "object" && !(Array.isArray(item) && item.every((child) => child === null || typeof child !== "object"));
  const fields = Object.entries(value).filter(([key, item]) => key !== "source_url" && !isNested(item));
  const nested = Object.entries(value).filter(([, item]) => isNested(item));
  const sourceUrl = safeSourceUrl(typeof value.source_url === "string" ? value.source_url : null);
  return <>
    {fields.length > 0 && <dl className="ai-metadata">{fields.map(([key, item]) => <div key={key}><dt>{t(metadataNames[key] ?? key)}</dt><dd>{metadataValue(key, item)}</dd></div>)}</dl>}
    {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t("원본 출처 ↗")}</a>}
    {nested.map(([key, item]) => <details key={key}><summary>{t(key === "target" ? "대상 기간" : ["inputs", "evidence", "sources", "official_sources"].includes(key) ? "원본 근거의 시각·출처" : metadataNames[key] ?? key)}</summary>{depth >= 3 ? <pre>{JSON.stringify(item, null, 2)}</pre> : (Array.isArray(item) ? item : [item]).slice(0, 100).map((child, index) => child && typeof child === "object" ? <Metadata key={index} value={child as Record<string, unknown>} depth={depth + 1} /> : null)}</details>)}
  </>;
}
function FactCard({ fact }: { fact: AiFact }) {
  return <article className="ai-fact">
    <div className="ai-badges"><span>{t(dataStatuses[fact.data_status] ?? fact.data_status)}</span><span>{fact.feature}</span>{fact.metadata.station_id != null && <span>{t("관측소 자료")}</span>}</div>
    <p className="ai-plain-text">{fact.text}</p>
    <Metadata value={fact.metadata} />
    <details><summary>{t("근거 ID 확인")}</summary><p>{t("근거 블록:")} {fact.fact_id}</p><ul>{fact.evidence_refs.map((ref) => <li key={ref}><code>{ref}</code></li>)}</ul></details>
  </article>;
}
export function AiResponseView({ response }: { response: ChatResponse }) {
  const groupedFacts = new Set(response.sections.flatMap((section) => section.fact_ids));
  const groupedCandidates = new Set(response.sections.flatMap((section) => section.candidate_ids));
  const [traceOpen, setTraceOpen] = useState(false);
  function candidateCards(ids: Set<string>) {
    return <div className="ai-candidates">{response.candidates.filter((candidate) => ids.has(candidate.candidate_id)).map((candidate) => <article className="ai-candidate" key={candidate.candidate_id}>
      <h3>{candidate.name}</h3><p>{placeRegionLabel(candidate, t("지역 기록 없음"))} {t("· 장소 ID")} {candidate.spot_id}</p>
      <p className="table-note">{t("장소 출처:")} {candidate.catalog_source ?? t("기록 없음")} {t("· 확인:")} {displayTime(candidate.catalog_verified_at)}</p>
      <nav aria-label={t("{name} 자료 화면", { name: candidate.name })}>{candidate.links.map((link) => { const href = safeInternalLink(link.href); return href && <a key={href} href={href}>{t(link.label)}</a>; })}</nav>
    </article>)}</div>;
  }
  return <div className="ai-response">
    <div className="ai-badges"><strong>{t(response.fallback ? "기존 자료 기반 대체 응답" : response.provider === "openai" ? "Luna · 서버 근거 검증 완료" : "Pongdang 자료 안내")}</strong><span>{t("처리 상태:")} {response.status}</span></div>
    <p className="ai-plain-text">{response.answer}</p>
    <ModelTraceButton trace={response.model_trace ?? []} onOpen={() => setTraceOpen(true)} />
    {traceOpen && (
      <ModelTraceDialog
        trace={response.model_trace ?? []}
        onClose={() => setTraceOpen(false)}
      />
    )}
    {response.reason_codes.some((code) => Object.hasOwn(aiReasonTexts, code)) && <p className="ai-notice">{response.reason_codes.filter((code) => Object.hasOwn(aiReasonTexts, code)).map((code) => t(aiReasonTexts[code])).join(" ")}</p>}
    {response.clarification && response.clarification !== response.answer && <p className="ai-clarification">{response.clarification}</p>}
    <p className="table-note">{t("이번 조회 기준:")} {displayTime(response.scope.as_of)} {t("· 이전 대화의 수치를 현재 자료로 재사용하지 않습니다.")}</p>
    {response.scope.queries.length > 0 && <details><summary>{t("조회 범위")}</summary>{response.scope.queries.map((query, index) => <Metadata key={index} value={query} />)}</details>}
    {response.sections.map((section, index) => <section key={index} aria-label={section.title}><h3>{section.title}</h3>
      {candidateCards(new Set(section.candidate_ids))}
      {section.fact_ids.map((id) => { const fact = response.facts.find((item) => item.fact_id === id); return fact ? <FactCard key={id} fact={fact} /> : null; })}
    </section>)}
    {response.candidates.some((candidate) => !groupedCandidates.has(candidate.candidate_id)) && <section aria-label={t("실제 장소 후보")}><h3>{t("조건을 확인한 장소")}</h3>{candidateCards(new Set(response.candidates.filter((candidate) => !groupedCandidates.has(candidate.candidate_id)).map((candidate) => candidate.candidate_id)))}</section>}
    {response.facts.some((fact) => !groupedFacts.has(fact.fact_id)) && <section aria-label={t("추가 검증 근거")}><h3>{t("함께 확인할 근거와 제한")}</h3>{response.facts.filter((fact) => !groupedFacts.has(fact.fact_id)).map((fact) => <FactCard key={fact.fact_id} fact={fact} />)}</section>}
    {response.warnings.length > 0 && <section className="ai-notice"><h3>{t("주의사항")}</h3><ul>{response.warnings.map((line, index) => <li key={index}>{line}</li>)}</ul></section>}
    {response.limitations.length > 0 && <section><h3>{t("자료와 답변의 한계")}</h3><ul>{response.limitations.map((line, index) => <li key={index}>{line}</li>)}</ul></section>}
    {response.sources.length > 0 && <section><h3>{t("출처")}</h3><ul>{response.sources.map((source) => { const url = safeSourceUrl(source.url); return <li key={source.id}>{url ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{source.name} ↗</a> : source.name} <code>{source.id}</code></li>; })}</ul></section>}
    <p className="table-note">{t("조회 기능:")} {response.features.join(" · ") || t("자료 조회 없음")} {t("· 요청 ID:")} {response.request_id}</p>
  </div>;
}
interface Turn { id: number; message: string; response?: ChatResponse; error?: string; cancelled?: boolean }
export function AiConciergePage({ initialContext = {} }: { initialContext?: AiContext }) {
  const [context, setContext] = useState<AiContext>({ region: "gangwon", ...initialContext });
  const [statusResult, setStatusResult] = useState<{ data?: AiStatus; error?: string }>({});
  const [statusRevision, setStatusRevision] = useState(0);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const request = useRef(new ConversationRequest());
  const sequence = useRef(0);
  const busyId = useRef<number | null>(null);
  const history = useRef<ChatMessage[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void requestJson<AiStatus>(import.meta.env.BASE_URL, "ai/status", controller.signal).then(
      (data) => { if (!controller.signal.aborted) setStatusResult({ data }); },
      (error: unknown) => { if (!controller.signal.aborted) setStatusResult({ error: error instanceof Error ? error.message : "상태를 확인하지 못했습니다." }); },
    );
    return () => controller.abort();
  }, [statusRevision]);
  useEffect(() => { const active = request.current; return () => active.cancel(); }, []);
  const status = statusResult.data;
  const canSend = !statusResult.error && status !== undefined;
  useEffect(() => { if (!busy) input.current?.focus(); }, [busy]);
  function cancel() {
    request.current.cancel();
    const id = busyId.current;
    busyId.current = null;
    setBusy(false);
    setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, cancelled: true } : turn));
    input.current?.focus();
  }
  function newConversation() {
    request.current.cancel(); busyId.current = null; sequence.current += 1;
    history.current = []; setTurns([]); setDraft(""); setBusy(false); setContext({}); input.current?.focus();
  }
  async function send() {
    if (busyId.current !== null || !canSend || !draft.trim()) return;
    const message = draft.trim(); const id = ++sequence.current;
    busyId.current = id; setBusy(true); setDraft("");
    setTurns((current) => [...current.slice(-11), { id, message }]);
    try {
      const response = await request.current.send(import.meta.env.BASE_URL, message, history.current, context);
      if (!response || busyId.current !== id) return;
      history.current = [...history.current, { role: "user", content: message }, { role: "assistant", content: response.answer }].slice(-8) as ChatMessage[];
      setContext(response.context);
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, response } : turn));
    } catch (error) {
      if (busyId.current !== id) return;
      setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, error: error instanceof Error ? error.message : "요청을 완료하지 못했습니다." } : turn));
      setDraft(message);
    } finally {
      if (busyId.current === id) { busyId.current = null; setBusy(false); input.current?.focus(); }
    }
  }
  return <article className="ai-concierge">
    <InlineLanguageSelector />
    <div className="ai-heading"><div><h1>{t("AI에게 물어보기")}</h1><p>{t("실제 Pongdang 자료로 장소·활동·시각을 바꿔가며 확인합니다.")}</p></div><button type="button" onClick={newConversation}>{t("새 대화")}</button></div>
    <p className="ai-privacy">{t("질문, 최근 대화와 필요한 공개 근거가 답변 처리를 위해 OpenAI에 전달됩니다. 개인정보를 입력하지 마세요. 대화는 이 화면의 메모리에만 유지되며, 새 대화나 페이지 이동 시 지워집니다. 제공자의 데이터 처리 정책은 별도로 적용됩니다.")}</p>
    <div className="ai-notice" role="status">{statusResult.error ? t(statusResult.error) : status ? aiStatusText(status) : t("AI 설정 상태 확인 중…")}</div>
    {statusResult.error && <button type="button" onClick={() => { setStatusResult({}); setStatusRevision((value) => value + 1); }}>{t("상태 다시 확인")}</button>}
    {status && !status.enabled && <p>{t("아래 질문에는 가능한 기존 자료 조회 또는 조건 확인 안내로 응답합니다. AI가 생성한 답변으로 표시하지 않습니다.")}</p>}
    <p><a href="#data">{t("데이터 조회")}</a> · <a href="#info">{t("자료와 기능 정보")}</a></p>
    {turns.length === 0 && <section className="ai-examples" aria-label={t("예시 질문")}><h2>{t("이렇게 물어보세요")}</h2>{exampleQuestions.map((question) => <button key={question} type="button" onClick={() => { setDraft(t(question)); input.current?.focus(); }}>{t(question)}</button>)}</section>}
    <div className="ai-conversation" role="log" aria-label={t("대화 내용")} aria-live="polite" aria-relevant="additions text">
      {turns.map((turn) => <section className="ai-turn" key={turn.id}><h2 className="ai-user-question">{turn.message}</h2>
        {turn.response && <AiResponseView response={turn.response} />}
        {turn.error && <p role="alert">{t(turn.error)}</p>}
        {turn.cancelled && <p className="table-note">{t("요청을 취소했습니다. 이미 시작된 서버 처리와 비용은 취소되지 않을 수 있습니다.")}</p>}
        {!turn.response && !turn.error && !turn.cancelled && <p role="status">{t("질문을 해석하고 실제 자료를 조회하고 있습니다…")}</p>}
      </section>)}
    </div>
    <form className="ai-form" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <details><summary>{t("질문 맥락")} {context.spot_id ? ` · ${t("장소 ID")} ${context.spot_id}` : ""}</summary>
        <div className="ai-context-fields"><label>{t("지역")}<input value={context.region === "gangwon" ? t("강원도") : context.region ?? ""} maxLength={60} onChange={(event) => setContext((value) => ({ ...value, region: event.target.value || undefined }))} disabled={busy} placeholder={t("예: 강원도, 속초시")} /></label>
          <label>{t("활동")}<select value={context.activity ?? ""} onChange={(event) => setContext((value) => ({ ...value, activity: event.target.value as AiContext["activity"] || undefined }))} disabled={busy}><option value="">{t("질문에서 해석")}</option>{Object.entries(activities).map(([key, label]) => <option value={key} key={key}>{t(label)}</option>)}</select></label>
          <label>{t("대상 시각")}<input value={context.time_text ?? ""} maxLength={80} disabled={busy} placeholder={t("예: 내일 오후")} onChange={(event) => setContext((value) => ({ ...value, time_text: event.target.value || undefined }))} /></label>
          {(context.spot_id || context.spot_ids?.length) && <button type="button" disabled={busy} onClick={() => setContext((value) => ({ ...value, spot_id: undefined, spot_ids: undefined }))}>{t("장소 선택 해제")}</button>}
        </div><p className="table-note">{t("맥락은 조회 조건이며 수치 근거가 아닙니다. 실제 장소와 시간 범위는 서버에서 다시 확인합니다.")}</p>
      </details>
      <label htmlFor="ai-question">{t("질문")}</label>
      <textarea ref={input} id="ai-question" value={draft} maxLength={2000} rows={3} disabled={busy} aria-describedby="ai-input-help" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder={t("지역, 활동, 궁금한 시간을 알려주세요.")} />
      <div className="ai-submit"><small id="ai-input-help">{t("Enter 줄바꿈 · Ctrl/⌘ + Enter 전송 · {count}/2,000자", { count: draft.length })}</small>{busy ? <button type="button" onClick={cancel}>{t("요청 취소")}</button> : <button type="submit" disabled={!canSend || !draft.trim()}>{t("질문 전송")}</button>}</div>
    </form>
  </article>;
}
