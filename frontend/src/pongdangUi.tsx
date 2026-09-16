import { gradeOf } from "./groupAGrade";

// 핸드오프 디자인(Pongdang 디자인 시스템 v2)의 공용 표시 요소입니다. 제품 화면
// 5개(홈 · 오늘 · 추천 · 지도 · 내 코스)가 같은 아이콘 세트와 같은 등급/데이터
// 상태 표기를 씁니다. 아래 pd-* 클래스의 스타일과 --pd-* 토큰은 pongdang.css 가
// 단일 출처입니다(예전에는 화면별 CSS 가 각자 복사해 갖고 있었습니다).
//
// 표시 전용입니다. 저장된 값을 새로 판정하거나 추론하지 않고, 색만으로
// 판단을 전달하지 않습니다.

export type IconName =
  | "sun"
  | "wave"
  | "thermometer"
  | "quality"
  | "mudflat"
  | "rafting"
  | "tube"
  | "surf"
  | "swim"
  | "sup"
  | "hotspring"
  | "restaurant"
  | "cafe"
  | "sunset"
  | "pin"
  | "course"
  | "livecam"
  | "search"
  | "wind"
  | "parking"
  | "transit"
  | "warning"
  | "sparkle"
  | "share"
  | "save"
  | "check"
  | "menu"
  | "close";

/** 05b 아이콘 라이브러리(디자인 시스템 v2). 전부 24×24 그리드, stroke 1.6,
 *  라운드 캡, 채움형 없음. `close` 만 05b 에 없어 같은 규격으로 맞춰 그렸습니다. */
const ICON_PATHS: Record<IconName, React.ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3v2.4M12 18.6V21M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M3 12h2.4M18.6 12H21M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
    </>
  ),
  wave: <path d="M2 17c2 0 2-3 4-3s2 3 4 3 2-3 4-3 2 3 4 3 2-3 4-3" />,
  thermometer: <path d="M12 3a2 2 0 0 1 2 2v8.5a4 4 0 1 1-4 0V5a2 2 0 0 1 2-2z" />,
  quality: (
    <>
      <path d="M12 3s5.5 6 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 9 12 3 12 3z" />
      <path d="M9.4 12.6l1.9 1.9 3.5-3.7" />
    </>
  ),
  mudflat: (
    <>
      <path d="M3 11.5h18c0 4.7-4 8-9 8s-9-3.3-9-8z" />
      <path d="M12 19.5v-8M8.2 18.6l1.4-7.1M15.8 18.6l-1.4-7.1" />
      <path d="M10 8.5c0-1.6.9-2.5 2-2.5s2 .9 2 2.5" />
    </>
  ),
  rafting: (
    <>
      <path d="M3 13.5h18l-2.2 4.5H5.2z" />
      <path d="M7.5 13.5L5 6M16.5 13.5L19 6" />
    </>
  ),
  tube: (
    <>
      <circle cx="12" cy="10.2" r="6.6" />
      <circle cx="12" cy="10.2" r="2.4" />
    </>
  ),
  surf: (
    <>
      <path d="M7.5 14.5c1-6.5 6-11 12-10.5.5 6-4.5 10.5-11 11z" />
      <path d="M2 19c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    </>
  ),
  swim: (
    <>
      <circle cx="8" cy="6.6" r="1.9" />
      <path d="M3.5 12.5l4.5-1.6 4 2.1 4.5-3.5 3 1.5" />
      <path d="M2 18.5c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    </>
  ),
  sup: (
    <>
      <circle cx="12" cy="4.4" r="1.9" />
      <path d="M12 6.3v7.2" />
      <path d="M8.6 9.2l6.8-2.6" />
      <ellipse cx="12" cy="16.6" rx="8" ry="2.1" />
      <path d="M3 21c2.5 0 2.5-1.6 5-1.6s2.5 1.6 5 1.6 2.5-1.6 5-1.6 2.5 1.6 5 1.6" />
    </>
  ),
  hotspring: (
    <>
      <path d="M3 12.5h18v3.5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" />
      <path d="M8.5 9.5c0-1.6 1.3-2.1 1.3-3.6S8.5 3.6 8.5 3.6M14 9.5c0-1.6 1.3-2.1 1.3-3.6S14 3.6 14 3.6" />
      <path d="M5.5 20v1M18.5 20v1" />
    </>
  ),
  restaurant: (
    <>
      <path d="M6.5 3v5.5a2.6 2.6 0 0 0 5.2 0V3" />
      <path d="M9.1 11v10" />
      <path d="M16.8 3c-1.3 2.1-1.9 4.1-1.9 6.4 0 1.4.8 2.2 1.9 2.2s1.9-.8 1.9-2.2c0-2.3-.6-4.3-1.9-6.4z" />
      <path d="M16.8 11.6V21" />
    </>
  ),
  cafe: (
    <>
      <path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
      <path d="M16 9h2.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M4 21h14" />
    </>
  ),
  sunset: (
    <>
      <path d="M3 18h18" />
      <circle cx="12" cy="13" r="4" />
      <path d="M12 3v3M5 7l2 2M19 7l-2 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 20.5s5.6-5.9 5.6-9.5a5.6 5.6 0 1 0-11.2 0c0 3.6 5.6 9.5 5.6 9.5z" />
      <circle cx="12" cy="11" r="2" />
    </>
  ),
  course: (
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="18" r="2.4" />
      <path d="M6 8.4V14a4 4 0 0 0 4 4h5.6" />
    </>
  ),
  livecam: (
    <>
      <path d="M3.5 8.5h3L8 6.5h8l1.5 2h3v10h-17z" />
      <circle cx="12" cy="13.2" r="3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12h14a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 16h7" />
    </>
  ),
  parking: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M10 16V8h3.2a2.4 2.4 0 0 1 0 4.8H10" />
    </>
  ),
  transit: (
    <>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M4 11h16" />
      <circle cx="8" cy="18.5" r="1.6" />
      <circle cx="16" cy="18.5" r="1.6" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4l8.5 15H3.5z" />
      <path d="M12 10v4M12 16.6v.6" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" />
      <path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" />
    </>
  ),
  share: (
    <>
      <circle cx="17" cy="6" r="2.6" />
      <circle cx="7" cy="12" r="2.6" />
      <circle cx="17" cy="18" r="2.6" />
      <path d="M9.3 10.8l5.4-3.2M9.3 13.2l5.4 3.2" />
    </>
  ),
  save: <path d="M6 4h12v16l-6-4-6 4z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  menu: <path d="M4 7h16M4 12h16M4 17h11" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/** 등급 아이콘은 순서가 형태로도 읽히도록 고정입니다 -- 별(매우 좋음) ·
 *  체크(양호) · 이중선(보통) · 삼각 경고(주의) · 금지(나쁨) · 점선
 *  원(평가값 없음). 색만으로 판단을 전달하지 않기 위한 이중화입니다. */
export function GradeIcon({
  gradeKey,
  size = 13,
}: {
  gradeKey: string;
  size?: number;
}) {
  const shared = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (gradeKey === "excellent")
    return (
      <svg {...shared}>
        <path d="M12 4l2.4 5 5.6.7-4 3.9 1 5.4-5-2.7-5 2.7 1-5.4-4-3.9 5.6-.7z" />
      </svg>
    );
  if (gradeKey === "good")
    return (
      <svg {...shared}>
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
    );
  if (gradeKey === "fair")
    return (
      <svg {...shared}>
        <path d="M5 9.5h14M5 15h14" />
      </svg>
    );
  if (gradeKey === "caution")
    return (
      <svg {...shared}>
        <path d="M12 4l8.5 15H3.5z" />
        <path d="M12 10v4M12 16.6v.6" />
      </svg>
    );
  if (gradeKey === "poor")
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="8.6" />
        <path d="M6.5 17.5l11-11" />
      </svg>
    );
  return (
    <svg {...shared} strokeDasharray="3 3">
      <circle cx="12" cy="12" r="8.6" />
    </svg>
  );
}

/** 점수는 언제나 숫자 + 등급명 + 등급 아이콘 + 색 네 겹으로 표시합니다.
 *  값이 없으면 "–"이며 0점 · 정상 · 안전으로 치환하지 않습니다. */
export function GradeChip({
  score,
  glass = false,
  bare = false,
}: {
  score: number | null;
  glass?: boolean;
  bare?: boolean;
}) {
  const grade = gradeOf(score);
  return (
    <span
      className={
        "pd-grade-chip" + (glass ? " is-glass" : "") + (bare ? " is-bare" : "")
      }
      data-grade={grade.key}
    >
      <GradeIcon gradeKey={grade.key} />
      <span className="pd-grade-chip-num">{score === null ? "–" : score}</span>
      <span>{grade.label}</span>
    </span>
  );
}

export type StateChipKind =
  | "example"
  | "uncollected"
  | "no_data"
  | "partial"
  | "live";

const STATE_CHIP_LABEL: Record<StateChipKind, string> = {
  example: "예시 데이터",
  uncollected: "수집 미구현",
  no_data: "no_data",
  partial: "partial",
  live: "수집 DB",
};

export function StateChip({ kind }: { kind: StateChipKind }) {
  const modifier =
    kind === "live" ? " is-live" : kind === "no_data" ? " is-alert" : "";
  return (
    <span className={"pd-state-chip" + modifier}>{STATE_CHIP_LABEL[kind]}</span>
  );
}

/** 「AI 제안」 칩. 규칙상 이 칩이 붙은 카드에는 반드시 같은 카드 안에 근거를
 *  적어야 하므로, 근거 문장을 필수 인자로 받아 함께 렌더링합니다. */
export function AiSuggestion({
  headline,
  basis,
}: {
  headline: string;
  basis: string;
}) {
  return (
    <>
      <div className="pd-ai-row">
        <span className="pd-ai-chip">
          <Icon name="sparkle" size={12} />
          AI 제안
        </span>
        <span className="pd-ai-headline">{headline}</span>
      </div>
      <p className="pd-ai-basis">근거 · {basis}</p>
    </>
  );
}
