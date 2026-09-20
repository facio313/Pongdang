import { useEffect, useRef } from "react";
import type { ModelTraceTurn } from "./aiApi";
import "./modelTrace.css";

export function ModelTraceButton({
  trace,
  onOpen,
}: {
  trace: ModelTraceTurn[] | null;
  onOpen: () => void;
}) {
  if (!trace) return null;
  return (
    <button type="button" className="pd-trace-open" onClick={onOpen}>
      주고받은 기록
    </button>
  );
}

export function ModelTraceDialog({
  trace,
  onClose,
}: {
  trace: ModelTraceTurn[] | null;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!trace) return;
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
  }, [trace, onClose]);
  if (!trace) return null;
  return (
    <>
      <button
        type="button"
        className="pd-trace-backdrop"
        onClick={onClose}
        aria-label="주고받은 기록 닫기"
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
          <h2 id="pd-trace-title">주고받은 기록</h2>
          <button
            type="button"
            className="pd-trace-close"
            onClick={onClose}
            ref={closeButton}
          >
            닫기
          </button>
        </div>
        {trace.length === 0 ? (
          <p className="pd-trace-empty">루나 호출 없음</p>
        ) : (
          <ol className="pd-trace-turns">
            {trace.map((turn, index) => (
              <li key={`${turn.kind}:${index}`}>
                <strong>
                  {turn.kind === "tool"
                    ? turn.name ?? "도구"
                    : turn.error
                      ? `계획 · ${turn.error}`
                      : "계획"}
                </strong>
                <pre>
                  <code>
                    {JSON.stringify(
                      turn.kind === "tool"
                        ? (turn.arguments ?? {})
                        : {
                            ...(turn.plan ?? {}),
                            ...(turn.error ? { error: turn.error } : {}),
                          },
                      null,
                      2,
                    )}
                  </code>
                </pre>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
