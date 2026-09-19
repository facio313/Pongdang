import {
  conditionScoreText,
  evidenceSummary,
  evidenceText,
  safetyStatusText,
  type Conditions,
} from "./productData";

/** 점수 아래의 근거 줄. 예전에는 conditionScoreText + evidenceText + safety_status
 *  전문이 한 문단으로 펼쳐져 있었고, 홈 · 데스크탑홈 · 오늘 · 지도 네 곳에 같은
 *  JSX 가 복붙돼 있었습니다. 의무 면책과 출처 원문과 서버 enum 이 같은 층에
 *  평평하게 놓여 히어로 아래가 6~8줄이 되었습니다.
 *
 *  **문구는 줄이지 않았습니다.** 층을 나눈 것입니다 -- 접힌 줄은 「무엇의 몇 점 ·
 *  근거 몇 개 · 언제 기준」, 펼친 안에 관측소 · 제공기관 · 격자 번호 · 시각 ·
 *  「현장 실측과 다릅니다」가 한 글자도 빠짐없이 들어갑니다.
 *
 *  예외는 공식 통제입니다. safety_status 가 restricted/caution 이면 그 사실을
 *  접지 않습니다 -- 설계 문서(frontend_integration.md)의 「공식 통제가 있으면
 *  통제 사실을 먼저 읽을 수 있어야 한다」를 접기로 뒤집지 않기 위해서입니다. */
export function EvidenceNote({
  data,
  className,
  glass = false,
  chip = true,
}: {
  data?: Conditions;
  className?: string;
  /** 코발트 히어로 위. 요약 · summary · 본문 색이 어두운 배경용으로 바뀝니다. */
  glass?: boolean;
  /** 안전 상태 칩을 이 줄에 붙일지. 지도처럼 화면이 이미 같은 사실을 더 눈에
   *  띄게 말하고 있으면 끕니다 -- 끈다고 문장이 사라지지는 않습니다. */
  chip?: boolean;
}) {
  const status = data?.safety_status ?? "unknown";
  const controlled = status === "restricted" || status === "caution";
  return (
    <div
      className={
        "pd-evidence" +
        (glass ? " is-glass" : "") +
        (className ? ` ${className}` : "")
      }
    >
      <p className="pd-evidence-line">
        <span>{evidenceSummary(data)}</span>
        {chip && (
          <span className={"pd-state-chip" + (controlled ? " is-alert" : "")}>
            {status === "restricted"
              ? "공식 제한"
              : status === "caution"
                ? "주의 사항 있음"
                : "안전 판정 아님"}
          </span>
        )}
      </p>

      {/* 통제 상태는 접지 않습니다. 환경값이 좋아 보여도 이 문장이 먼저 읽혀야
          합니다. 미판정(unknown)일 때만 아래 details 안으로 들어갑니다. */}
      {controlled && <p className="pd-evidence-control">{safetyStatusText(data)}</p>}

      <details className="pd-explainer">
        <summary className="pd-tap">근거 보기</summary>
        <div className="pd-explainer-body">
          <p>{conditionScoreText(data)}</p>
          <p>{evidenceText(data)}</p>
          {!controlled && <p>{safetyStatusText(data)}</p>}
        </div>
      </details>
    </div>
  );
}
