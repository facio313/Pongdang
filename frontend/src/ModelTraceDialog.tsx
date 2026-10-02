import { t } from "./i18n";
import { useEffect, useRef } from "react";
import { aiReasonTexts, type ModelTraceRequest, type ModelTraceTurn } from "./aiApi";
import "./modelTrace.css";

interface TraceSource {
  trace?: ModelTraceTurn[] | null;
  history?: ModelTraceRequest[];
}

function traceLabel(turn: ModelTraceTurn): string {
  if (turn.kind === "tool") return turn.name ?? t("도구");
  if (turn.kind === "attempt") return `${t("루나 호출 시도")} · ${t(turn.name === "scope" ? "관련성·의도 판단" : "자료 조회 계획")}`;
  if (turn.kind === "retry") return t("빈 응답 · 재시도 준비");
  if (turn.kind === "error") return t("루나 처리 실패");
  if (turn.kind === "scope") {
    const relevance = turn.plan?.relevance;
    return `${t("관련성·의도 판단")}${relevance === "Y" ? ` · Y (${t("지원하는 질문")})` : relevance === "N" ? ` · N (${t("지원하지 않는 질문")})` : ""}`;
  }
  return t("계획");
}

function interpretedVisits(turn: ModelTraceTurn): string | null {
  if (turn.kind !== "scope") return null;
  const changes = turn.plan?.changes;
  if (!changes || typeof changes !== "object" || !("visit_intents" in changes) || !Array.isArray(changes.visit_intents)) return null;
  const places: Record<string, string> = {
    beach: "해변", valley: "계곡", cafe: "카페", hot_spring: "온천",
    lake: "호수", reservoir: "저수지", river: "강", restaurant: "식당", lodging: "숙박", attraction: "관광지",
  };
  const times: Record<string, string> = { morning: "오전", afternoon: "오후", evening: "저녁", any: "시간대 미지정" };
  const visits = changes.visit_intents.flatMap((visit: unknown) => {
    if (!visit || typeof visit !== "object" || !("place_type" in visit) || typeof visit.place_type !== "string") return [];
    const time = "part_of_day" in visit && typeof visit.part_of_day === "string" ? visit.part_of_day : "any";
    return [`${t(Object.hasOwn(times, time) ? times[time] : time)} · ${t(Object.hasOwn(places, visit.place_type) ? places[visit.place_type] : visit.place_type)}`];
  });
  return visits.length ? visits.join(" → ") : null;
}

function TraceTurns({ trace }: { trace: ModelTraceTurn[] }) {
  return trace.length === 0 ? (
    <p className="pd-trace-empty">{t("표시할 처리 기록이 없습니다.")}</p>
  ) : (
    <ol className="pd-trace-turns">
      {trace.map((turn, index) => {
        const visits = interpretedVisits(turn);
        return (
          <li key={`${turn.kind}:${index}`}>
            <strong>{traceLabel(turn)}</strong>
            {visits && <p>{visits}</p>}
            {turn.error && turn.kind !== "retry" && <p>{t(Object.hasOwn(aiReasonTexts, turn.error) ? aiReasonTexts[turn.error] : "루나 응답을 처리하지 못했습니다.")}</p>}
            <pre>
              <code>
                {JSON.stringify(
                  turn.kind === "tool"
                    ? (turn.arguments ?? {})
                    : {
                        ...(turn.plan ?? {}),
                        ...(turn.name ? { stage: turn.name } : {}),
                        ...(turn.error ? { error: turn.error } : {}),
                      },
                  null,
                  2,
                )}
              </code>
            </pre>
          </li>
        );
      })}
    </ol>
  );
}

export function ModelTraceButton({
  trace,
  history,
  onOpen,
}: TraceSource & {
  onOpen: () => void;
}) {
  if (!trace && !history?.length) return null;
  return (
    <button type="button" className="pd-trace-open" onClick={onOpen}>{t("주고받은 기록")}</button>
  );
}

export function ModelTraceDialog({
  trace,
  history,
  onClose,
}: TraceSource & {
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!trace && !history?.length) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [trace, history, onClose]);
  if (!trace && !history?.length) return null;
  return (
    <>
      <button
        type="button"
        className="pd-trace-backdrop"
        onClick={onClose}
        aria-label={t("주고받은 기록 닫기")}
        tabIndex={-1}
      />
      <div
        className="pd-trace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pd-trace-title"
        ref={panel}
      >
        <div className="pd-trace-head">
          <h2 id="pd-trace-title">{t("주고받은 기록")}</h2>
          <button
            type="button"
            className="pd-trace-close"
            onClick={onClose}
            ref={closeButton}
          >{t("닫기")}</button>
        </div>
        {history ? <>
          <p>{t("이 화면의 최근 12개 요청 기록입니다. 새 대화나 페이지 이동 시 지워집니다.")}</p>
          {history.map((request) => (
            <section key={request.sequence}>
              <h3>{t("{count}번째 요청", { count: request.sequence })}</h3>
              <TraceTurns trace={request.trace} />
            </section>
          ))}
        </> : <TraceTurns trace={trace ?? []} />}
      </div>
    </>
  );
}
