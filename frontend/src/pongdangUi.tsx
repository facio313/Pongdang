import { useId, useState } from "react";
import { t } from "./i18n";
import { gradeOf, grades } from "./groupAGrade";
import { metricText, type Conditions } from "./productData";
import type { ComponentBar } from "./scoreMeaning";

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

/** 「조회 중」 자리표시자. 값이 없다는 것(«–»)과 아직 모른다는 것은 다른
 *  상태이므로 다르게 그립니다. 조회 중을 «–» 로 그리면 자료가 없다고 거짓말을
 *  하게 됩니다 -- 느린 회선에서 화면 전체가 「자료 없음」으로 보였습니다.
 *
 *  `width` 는 글자 수 기준(em)입니다. 값이 들어왔을 때와 자리가 크게 어긋나지
 *  않을 만큼만 잡으세요. */
export function Skeleton({
  width = "3.2em",
  glass = false,
  label = "조회 중",
}: {
  width?: string;
  glass?: boolean;
  /** 스크린리더용. 시각적으로는 블록만 보입니다. */
  label?: string;
}) {
  return (
    <span
      className={"pd-skeleton" + (glass ? " is-on-cobalt" : "")}
      style={{ "--pd-skeleton-w": width } as React.CSSProperties}
      role="status"
      aria-label={t(label)}
    />
  );
}

/** 관측값 한 칸. 조회 중이면 스켈레톤, 아니면 metricText 의 결과입니다.
 *  metricText 는 `data` 가 없을 때도 «–» 를 돌려주므로, 그 둘을 가르는 것은
 *  호출부가 넘기는 `loading` 뿐입니다 -- 직접 metricText 를 부르지 말고 이
 *  컴포넌트를 쓰세요. */
export function MetricValue({
  conditions,
  name,
  loading = false,
  glass = false,
  width,
}: {
  conditions?: Conditions;
  name: string;
  loading?: boolean;
  glass?: boolean;
  width?: string;
}) {
  if (loading) return <Skeleton width={width} glass={glass} />;
  return <>{metricText(conditions, name)}</>;
}

/** 점수는 언제나 숫자 + 등급명 + 등급 아이콘 + 색 네 겹으로 표시합니다.
 *  값이 없으면 "–"이며 0점 · 정상 · 안전으로 치환하지 않습니다.
 *  조회 중(`loading`)은 값 없음과 구분해 스켈레톤으로 둡니다. */
export function GradeChip({
  score,
  glass = false,
  bare = false,
  prefix,
  label,
  loading = false,
}: {
  score: number | null;
  /** 조회 중. 아직 모르는 것을 「평가값 없음」으로 치환하지 않기 위한 값입니다. */
  loading?: boolean;
  glass?: boolean;
  bare?: boolean;
  /** 숫자 앞에 붙는 말. 명소 화면의 「퐁당 72 · 양호」처럼 이 점수가 무슨
   *  점수인지 밝혀야 하는 자리에서 씁니다. */
  prefix?: string;
  /** 등급명을 덮어씁니다. 「산정 대상 아님」처럼 값이 없는 **이유**를 아는
   *  경우에만 쓰며, 모르면 넘기지 말고 기본 등급명을 그대로 두세요. 등급
   *  판정 자체는 여전히 groupAGrade.ts 가 합니다. */
  label?: string;
}) {
  const grade = gradeOf(score);
  if (loading)
    return (
      <span
        className={
          "pd-grade-chip" + (glass ? " is-glass" : "") + (bare ? " is-bare" : "")
        }
        data-grade="unscored"
      >
        <Skeleton width="5.2em" glass={glass} label={t("점수 조회 중")} />
      </span>
    );
  return (
    <span
      className={
        "pd-grade-chip" + (glass ? " is-glass" : "") + (bare ? " is-bare" : "")
      }
      data-grade={grade.key}
    >
      <GradeIcon gradeKey={grade.key} />
      <span className="pd-grade-chip-num">
        {prefix ? t(prefix) + " " : ""}
        {score === null ? "–" : score}
      </span>
      <span>{t(label ?? grade.label)}</span>
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
  no_data: "자료 없음",
  partial: "일부 자료",
  live: "수집 DB",
};

export function StateChip({ kind }: { kind: StateChipKind }) {
  const modifier =
    kind === "live" ? " is-live" : kind === "no_data" ? " is-alert" : "";
  return (
    <span className={"pd-state-chip" + modifier}>{t(STATE_CHIP_LABEL[kind])}</span>
  );
}

/** 0~100 척도 위의 현재 위치. 숫자만으로는 72 가 좋은 쪽인지 나쁜 쪽인지
 *  읽히지 않습니다 -- 등급 경계(20 · 40 · 60 · 80)를 눈금으로 깔아 상대 위치를
 *  보여 줍니다.
 *
 *  마커에는 등급 아이콘이 함께 붙습니다. 색만으로 판단을 전달하지 않는다는
 *  규칙은 게이지에도 그대로 적용됩니다. 값이 없으면 마커를 두지 않습니다 --
 *  0 자리에 마커를 찍으면 「자료 없음」이 「최악」으로 읽힙니다. */
export function ScoreGauge({
  score,
  loading = false,
  compact = false,
  glass = false,
}: {
  score: number | null;
  loading?: boolean;
  /** 눈금 라벨을 접습니다. 좁은 타일 안에서 씁니다. */
  compact?: boolean;
  /** 코발트 히어로 위. 등급 표면과 눈금색이 어두운 배경용으로 바뀝니다. */
  glass?: boolean;
}) {
  const grade = gradeOf(score);
  // grades 는 높은 등급부터이므로 척도 왼쪽(0점)부터 그리려면 뒤집습니다.
  const bands = [...grades].reverse();
  if (loading)
    return (
      <div className="pd-gauge">
        <Skeleton width="100%" glass={glass} label={t("점수 조회 중")} />
      </div>
    );
  return (
    <div
      className={
        "pd-gauge" +
        (compact ? " is-compact" : "") +
        (glass ? " is-glass" : "")
      }
      role="img"
      aria-label={
        score === null
          ? t("평가값 없음 · 100점 만점")
          : t("{score}점 {grade} · 100점 만점", { score, grade: t(grade.label) })
      }
    >
      <div className="pd-gauge-track">
        {bands.map((band) => (
          <span
            className={"pd-gauge-band" + (glass ? " is-glass" : "")}
            data-grade={band.key}
            key={band.key}
          />
        ))}
        {score !== null && (
          <span
            className="pd-gauge-marker"
            data-grade={grade.key}
            style={{ left: `${score}%` }}
          >
            <GradeIcon gradeKey={grade.key} size={11} />
          </span>
        )}
      </div>
      {!compact && (
        <div className="pd-gauge-ticks" aria-hidden="true">
          {bands.map((band) => (
            <span key={band.key}>{t(band.label)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 점수를 가장 많이 깎은(또는 가장 좋은) 조건 한 줄. 총점만으로는 무엇을
 *  손보면 되는지 알 수 없어서, 근거를 «details» 안에 접어 두는 대신 한 문장을
 *  밖으로 꺼냅니다. */
export function ScoreReason({
  text,
  loading = false,
  glass = false,
}: {
  text: string;
  loading?: boolean;
  glass?: boolean;
}) {
  const className = "pd-score-reason" + (glass ? " is-glass" : "");
  if (loading)
    return (
      <p className={className}>
        <Skeleton width="14em" glass={glass} label={t("점수 근거 조회 중")} />
      </p>
    );
  return (
    <p className={className}>
      <Icon name="sparkle" size={12} />
      {text}
    </p>
  );
}

/** 점수를 이루는 항목들. 총점이 어디서 왔는지 보여 줍니다.
 *
 *  점수가 없는 항목도 지우지 않고 사유와 함께 남깁니다 -- 빠진 칸을 없애면
 *  화면이 「이게 전부」라고 거짓말을 합니다. */
export function ComponentBars({
  bars,
  loading = false,
}: {
  bars: ComponentBar[];
  loading?: boolean;
}) {
  const disclosureId = useId();
  const [expandedMetrics, setExpandedMetrics] = useState<string[]>([]);
  if (loading)
    return (
      <ul className="pd-cbars">
        {[0, 1, 2, 3].map((index) => (
          <li className="pd-cbar pd-cbar-loading" key={index}>
            <Skeleton width="100%" label={t("분야별 점수 조회 중")} />
          </li>
        ))}
      </ul>
    );
  return (
    <ul className="pd-cbars">
      {bars.map((bar) => {
        const grade = gradeOf(bar.score);
        const expanded = expandedMetrics.includes(bar.metric);
        const criterionId = `${disclosureId}-${bar.metric}`;
        return (
          <li
            className={"pd-cbar" + (bar.evaluated ? "" : " is-empty")}
            data-grade={grade.key}
            key={bar.metric}
          >
            {bar.criterion ? (
              <button
                type="button"
                className="pd-cbar-label pd-cbar-toggle"
                aria-expanded={expanded}
                aria-controls={criterionId}
                onClick={() => setExpandedMetrics((metrics) => metrics.includes(bar.metric)
                  ? metrics.filter((metric) => metric !== bar.metric)
                  : [...metrics, bar.metric])}
              >
                {bar.label}<span className="pd-cbar-chevron" aria-hidden="true" />
              </button>
            ) : <span className="pd-cbar-label">{bar.label}</span>}
            <span className="pd-num pd-cbar-value">{bar.valueText}</span>
            <span className="pd-cbar-track">
              {bar.evaluated && (
                // 0 점은 유효한 값이므로 보이는 폭을 남깁니다. 폭 0 으로 그리면
                // 「0 점」과 「자료 없음」이 화면에서 같아집니다.
                <span
                  className="pd-cbar-fill"
                  style={{ width: `${Math.max(2, bar.score as number)}%` }}
                />
              )}
            </span>
            <span className="pd-num pd-cbar-score">
              {bar.score === null ? "–" : bar.score}
            </span>
            {!bar.evaluated && bar.reasons && (
              <span className="pd-cbar-reason">{bar.reasons}</span>
            )}
            {bar.criterion && (
              <div className="pd-cbar-reason pd-cbar-criterion" id={criterionId} hidden={!expanded}>
                <div className="pd-explainer-body">
                  <p><strong>{t("점수 기준 · 미보정 참고값")}</strong></p>
                  <p>{bar.criterion}</p>
                  {bar.sources.map((source) => <p key={source.id}>
                    <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                    <br />{t(source.usage)}
                  </p>)}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 「이 점수가 대체 뭔가」에 한 번에 답하는 자리. 정의 · 척도 · 계산 방식 ·
 *  근거 확보율 · 출처가 화면마다 흩어져 있어 어디서도 전체가 보이지 않았습니다.
 *
 *  네이티브 «details» 입니다. 직접 만든 모달보다 키보드와 보조기술 동작이
 *  확실하고, 이 저장소의 다른 근거 블록과도 같은 문법입니다. */
export function ScoreExplainer({ data }: { data?: Conditions }) {
  const index = data?.condition_score;
  return (
    <details className="pd-explainer">
      <summary className="pd-tap">{t("퐁당 점수란?")}</summary>
      <div className="pd-explainer-body">
        <p>{t("고른 활동을 하기에 지금 조건이 얼마나 맞는지를 0~100으로 나타낸 참고 점수입니다. 안전 판정이 아니며, 현장 상황과 공식 운영 여부는 따로 확인해야 합니다.")}</p>
        <table className="pd-explainer-scale">
          <tbody>
            {grades.map((grade) => (
              <tr key={grade.key}>
                <th scope="row">
                  <span className="pd-grade-chip" data-grade={grade.key}>
                    <GradeIcon gradeKey={grade.key} />
                    {t(grade.label)}
                  </span>
                </th>
                <td className="pd-num">
                  {grade.min}
                  {grade.key === "excellent" ? "~100" : `~${grade.min + 19}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{t("활동마다 보는 조건이 다릅니다. 수영은 수온 · 기온 · 바람 · 파고를, 갯벌은 기온 · 바람 · 강수를 봅니다. 각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다.")}</p>
        <p>
          {t("근거 확보율은 그 활동이 보는 조건 중 실제 측정값이 들어온 비율입니다. 확보율이 낮으면 총점도 조건 전체를 대표하지 못합니다.")}</p>
        <p>{t("자료가 없으면 –로 둡니다. 0점이 아니며, 정상이나 안전으로 바꾸어 표시하지 않습니다.")}</p>
        {index && (
          <>
            <p>
              {t(index.methodology)} · {t("방법론")} {index.model_id} {index.model_version}
            </p>
            <ul>
              {index.sources.map((source) => (
                <li key={source.id}>
                  <a
                    href={/^https:\/\//.test(source.url) ? source.url : undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t(source.title)}
                  </a>{" "}
                  · {t(source.usage)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
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
          <Icon name="sparkle" size={12} />{t("AI 제안")}</span>
        <span className="pd-ai-headline">{headline}</span>
      </div>
      <p className="pd-ai-basis">{t("근거")} · {basis}</p>
    </>
  );
}
