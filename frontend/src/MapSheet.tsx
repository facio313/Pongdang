import { t } from "./i18n.ts";
import type { ReactNode } from "react";
import { useRef } from "react";
import "./mapSheet.css";

// 풀스크린 지도 화면(모바일 지도 · 내 코스)의 바텀 시트입니다.
//
// 예전의 «시트»는 시트가 아니었습니다. margin-top:-18px 으로 지도 아래에 붙은
// 그냥 블록이었고, 페이지와 함께 스크롤됐습니다. 지도는 위쪽 고정 높이 띠였고
// 목록을 읽으려면 지도를 화면 밖으로 밀어내야 했습니다.
//
// 이제 지도가 프레임을 다 쓰고, 이 시트가 그 위에 뜹니다. 시트는 두 높이를
// 오가며 **안에서만** 스크롤합니다.
//
// 손끝을 따라가는 연속 드래그는 두지 않습니다. 높이는 dvh/clamp 로 CSS 가
// 정하고(useSheetHeight 참고), 그 값을 JS 로 베껴 매 프레임 계산하면 화면
// 크기가 바뀔 때 조용히 어긋납니다. 대신 토글 버튼 영역에서 위/아래 스와이프를
// 인식해 기존 두 상태(접힘 · 펼침) 사이를 그대로 토글합니다 -- 탭 토글과
// 같은 전환(180ms)을 씁니다.
//
// 시트는 밝은 레이어입니다. 근거 · 표 · 폼 · 상태 칩은 전부 여기 들어오고,
// 지도 위 코발트 띠에는 한 줄 문장까지만 둡니다(디자인 시스템 v2 §07).

/** 스와이프로 인정할 최소 수직 이동 거리(px). 이보다 짧으면 탭으로 본다. */
const SWIPE_THRESHOLD = 40;

export function MapSheet({
  title,
  expanded,
  onToggle,
  head,
  sheetRef,
  children,
}: {
  /** 접힌 상태에서도 보이는 제목. 토글 버튼의 이름이기도 합니다. */
  title: string;
  /** 펼침 상태는 화면이 가집니다 -- 지도가 같은 값으로 아래 여백을 잡아야
   *  하므로 시트 혼자 알고 있으면 안 됩니다. */
  expanded: boolean;
  onToggle: () => void;
  /** 제목 줄 아래, 본문 스크롤 **밖**에 고정으로 둘 것(보기 전환 등).
   *  접어 둬도 계속 눌러야 하는 컨트롤만 여기 둡니다. */
  head?: ReactNode;
  /** useSheetHeight 가 준 콜백 ref. 지도가 시트에 덮인 높이를 알아야 합니다. */
  sheetRef?: (element: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const touchStartY = useRef<number | null>(null);
  return (
    <section
      className={"pd-sheet" + (expanded ? " is-expanded" : "")}
      aria-label={title}
      ref={sheetRef}
    >
      <button
        type="button"
        className="pd-sheet-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
        onTouchStart={(event) => {
          touchStartY.current = event.touches[0].clientY;
        }}
        onTouchEnd={(event) => {
          const startY = touchStartY.current;
          touchStartY.current = null;
          if (startY === null) return;
          const deltaY = event.changedTouches[0].clientY - startY;
          if (Math.abs(deltaY) < SWIPE_THRESHOLD) return;
          if (deltaY < 0 && !expanded) onToggle();
          else if (deltaY > 0 && expanded) onToggle();
        }}
      >
        <span className="pd-sheet-title">{title}</span>
        <span className="pd-sheet-toggle-label">
          {expanded ? t("접기") : t("자세히")}
          {/* 방향은 색이 아니라 형태로 말합니다. */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={expanded ? "M7 14l5-5 5 5" : "M7 10l5 5 5-5"} />
          </svg>
        </span>
      </button>
      {head && <div className="pd-sheet-head">{head}</div>}
      <div className="pd-sheet-body">{children}</div>
    </section>
  );
}
