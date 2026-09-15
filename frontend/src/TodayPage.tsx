import { useEffect, useState } from "react";
import { DataOrigin } from "./DataOrigin";
import { gradeOf } from "./groupAGrade";
import { useResource } from "./useResource";
import type { RowsResult } from "./data";
import "./todayPage.css";

// Group A: "오늘" 통합 페이지. A1(허브 요약)·A2(7일 예보)·A6(물때)·A7(첫
// 입수)·A8(수질 신뢰도)를 화면 이동 없이 한 페이지의 섹션 스택으로 합친
// 화면입니다. 각 섹션의 「자세히 →」는 기존 A 화면 해시 라우트로 갑니다.
//
// 데이터 연결 상태
//  - 지점(장소명·주소·좌표·검증 상태): `/api/data/datasets/spots` 실연동.
//  - 그 외(점수·수온·파고·강수·조위·수질·첫 입수): 저장된 값이 없습니다.
//    AGENTS.md 상 점수·안전 판정은 별도 구현·검증 전까지 unknown 으로 남기고
//    수집은 점수화가 아니므로, 아래 상수는 전부 레이아웃 확인용 예시이며
//    화면에 「예시 데이터」/「수집 미구현」 칩으로 표기합니다. 합성 값을 실제
//    관측·안전 판단으로 제시하지 않습니다.
//
// 등급 판정·등급명·원본 색·NULL 처리는 groupAGrade.ts 를 단일 출처로 쓰고,
// 레이어별 칩 표면(배경/글자)만 todayPage.css 가 등급 key 로 정의합니다.

const HERO_DATE = "9월 15일";
const SPOTS_QUERY = "datasets/spots?page_size=100&q=강릉";

type IconName =
  | "sun"
  | "wave"
  | "thermometer"
  | "quality"
  | "mudflat"
  | "rafting"
  | "tube"
  | "pin"
  | "warning";

/** 05b 아이콘 라이브러리(디자인 시스템 v2). 24×24 그리드, stroke 1.6,
 *  라운드 캡, 채움형 없음. */
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
  pin: (
    <>
      <path d="M12 20.5s5.6-5.9 5.6-9.5a5.6 5.6 0 1 0-11.2 0c0 3.6 5.6 9.5 5.6 9.5z" />
      <circle cx="12" cy="11" r="2" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4l8.5 15H3.5z" />
      <path d="M12 10v4M12 16.6v.6" />
    </>
  ),
};

function Icon({
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
function GradeIcon({ gradeKey, size = 13 }: { gradeKey: string; size?: number }) {
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
 *  값이 없으면 "–"이며 0점·정상·안전으로 치환하지 않습니다. */
function GradeChip({
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
        "td-grade-chip" + (glass ? " is-glass" : "") + (bare ? " is-bare" : "")
      }
      data-grade={grade.key}
    >
      <GradeIcon gradeKey={grade.key} />
      <span className="td-grade-chip-num">{score === null ? "–" : score}</span>
      <span>{grade.label}</span>
    </span>
  );
}

type StateChipKind = "example" | "uncollected" | "no_data" | "partial" | "live";

const STATE_CHIP_LABEL: Record<StateChipKind, string> = {
  example: "예시 데이터",
  uncollected: "수집 미구현",
  no_data: "no_data",
  partial: "partial",
  live: "수집 DB",
};

function StateChip({ kind }: { kind: StateChipKind }) {
  const modifier =
    kind === "live" ? " is-live" : kind === "no_data" ? " is-alert" : "";
  return (
    <span className={"td-state-chip" + modifier}>{STATE_CHIP_LABEL[kind]}</span>
  );
}

function SectionHead({
  label,
  suffix,
  href,
  linkLabel,
}: {
  label: string;
  suffix?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="td-section-head">
      <h2 className="td-lbl">
        {label}
        {suffix && <span className="td-lbl-plain"> · {suffix}</span>}
      </h2>
      {href && linkLabel && (
        <a className="td-section-link" href={href}>
          {linkLabel}
        </a>
      )}
    </div>
  );
}

// ── 예시 상수 (저장된 값 없음) ───────────────────────────────

interface SpotExample {
  id: string;
  /** `/api/data/datasets/spots` 의 장소명과 맞추기 위한 부분 문자열. */
  match: string;
  fallbackName: string;
  score: number | null;
  waterTemp: string;
}

const SPOT_EXAMPLES: SpotExample[] = [
  { id: "gyeongpo", match: "경포", fallbackName: "경포해변", score: 72, waterTemp: "22.1°C" },
  { id: "anmok", match: "안목", fallbackName: "안목해변", score: 68, waterTemp: "24.8°C" },
  { id: "sacheonjin", match: "사천진", fallbackName: "사천진해변", score: 54, waterTemp: "19.4°C" },
];

const ACTIVITY_EXAMPLES: { name: string; score: number | null; collected: boolean }[] = [
  { name: "수영", score: 82, collected: true },
  { name: "래프팅", score: 86, collected: true },
  { name: "온천", score: 70, collected: false },
];

interface ForecastDay {
  id: string;
  weekday: string;
  dateLabel: string;
  score: number | null;
}

const FORECAST_DAYS: ForecastDay[] = [
  { id: "d0", weekday: "오늘", dateLabel: "9/15", score: 82 },
  { id: "d1", weekday: "내일", dateLabel: "9/16", score: 74 },
  { id: "d2", weekday: "토", dateLabel: "9/17", score: 58 },
  { id: "d3", weekday: "일", dateLabel: "9/18", score: 34 },
  { id: "d4", weekday: "월", dateLabel: "9/19", score: 66 },
  { id: "d5", weekday: "화", dateLabel: "9/20", score: null },
  { id: "d6", weekday: "수", dateLabel: "9/21", score: 71 },
];

const TIDE = {
  nextFlood: "12:34",
  levelCm: 96,
  activities: [
    { name: "갯벌 체험", icon: "mudflat" as IconName, fit: true, when: "간조 ±2h", collected: false },
    { name: "래프팅", icon: "rafting" as IconName, fit: true, when: "밀물 시작", collected: true },
    { name: "튜브 물놀이", icon: "tube" as IconName, fit: false, when: "만조 무렵", collected: false },
  ],
};

/** 첫 입수 비교는 day-of-year 차이로만 계산합니다(윤년 보정 없음). */
const FIRST_SWIM = {
  thisYear: { date: "5월 18일", doy: 138, waterTemp: "18.3°C" },
  lastYear: { year: 2025, doy: 132 },
  thresholdTemp: "18.0°C",
};

const QUALITY_CONFIDENCE = [
  { label: "탁도", value: "3.2 NTU", confidence: 0.82 },
  { label: "용존산소", value: "7.8 mg/L", confidence: 0.78 },
  { label: "pH", value: "7.6", confidence: 0.85 },
];

const UNLINKED_ITEMS = [
  "조위 — 국립해양조사원 연동 전",
  "수질 수집 — 수집 작업 미구현",
  "첫 입수 알림 트리거 — 발송 기능 미구현",
];

// ── 섹션 ────────────────────────────────────────────────────

function Hero() {
  const heroScore = 82;
  return (
    <header className="td-hero">
      <div className="td-sbar">
        <span>9:41</span>
        <span className="td-sbar-mark">TODAY</span>
        <span>강릉</span>
      </div>
      <div className="td-hero-inner">
        <p className="td-lbl">{HERO_DATE} · 경포해변 예보 기준</p>
        <div className="td-hero-row">
          <h1 className="td-hero-sentence">
            오늘은 수영하기
            <br />
            좋은 날입니다
          </h1>
          <div className="td-hero-score">
            <div className="td-num td-hero-score-num">{heroScore}</div>
            <GradeChip score={heroScore} glass bare />
          </div>
        </div>
        <div className="td-hero-tiles">
          <div className="td-tile">
            <Icon name="sun" size={17} className="td-tile-icon" />
            <div className="td-num td-tile-value">맑음</div>
            <div className="td-tile-name">날씨</div>
          </div>
          <div className="td-tile">
            <Icon name="wave" size={17} className="td-tile-icon" />
            <div className="td-num td-tile-value">0.6m</div>
            <div className="td-tile-name">파고</div>
          </div>
          <div className="td-tile">
            <Icon name="thermometer" size={17} className="td-tile-icon" />
            <div className="td-num td-tile-value">22.1°</div>
            <div className="td-tile-name">수온</div>
          </div>
          <div className="td-tile is-empty">
            <Icon name="quality" size={17} className="td-tile-icon" />
            <div className="td-num td-tile-value">–</div>
            <div className="td-tile-name">수질</div>
          </div>
        </div>
        <p className="td-hero-note">
          날씨 · 파고 · 강수는 경포해변 예보 값이며 다른 지점의 실측값이
          아닙니다. 점수 · 수온 · 안전 상태 · 신뢰도는 서로 다른 값이며 하나로
          요약하지 않습니다. 수질은 저장된 값이 없어 –이며 0점 · 정상 ·
          안전이라는 뜻이 아닙니다. 위 수치는 전부 예시 데이터입니다.
        </p>
      </div>
    </header>
  );
}

function SpotSection() {
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const spots = useResource<RowsResult>(SPOTS_QUERY);

  useEffect(() => {
    if (spots.error)
      console.warn(
        "[TodayPage] 장소 카탈로그 조회 실패 · path=%s · %s · 지점명은 예시 상수로 표시합니다.",
        SPOTS_QUERY,
        spots.error,
      );
  }, [spots.error]);

  const rows = spots.data?.rows ?? [];
  const resolved = SPOT_EXAMPLES.map((spot) => {
    const row = rows.find(
      (item) => typeof item.name === "string" && item.name.includes(spot.match),
    );
    return {
      ...spot,
      name: typeof row?.name === "string" ? row.name : spot.fallbackName,
      address: typeof row?.address === "string" ? row.address : null,
      region: typeof row?.region === "string" ? row.region : null,
      verification:
        typeof row?.catalog_verification === "string"
          ? row.catalog_verification
          : null,
      linked: row !== undefined,
    };
  });
  const selected = resolved.find((spot) => spot.id === selectedSpotId) ?? null;
  const linkedCount = resolved.filter((spot) => spot.linked).length;

  return (
    <section>
      <SectionHead
        label="지점 비교 · 수영 점수"
        href="#water-index-map"
        linkLabel="전체 지도 →"
      />
      <div className="td-card">
        <div className="td-rows">
          {resolved.map((spot) => {
            const grade = gradeOf(spot.score);
            return (
              <button
                type="button"
                key={spot.id}
                className={
                  "td-spot-row" + (spot.id === selectedSpotId ? " is-selected" : "")
                }
                aria-pressed={spot.id === selectedSpotId}
                onClick={() =>
                  setSelectedSpotId((current) =>
                    current === spot.id ? null : spot.id,
                  )
                }
              >
                <span className="td-score-badge" data-grade={grade.key}>
                  {spot.score === null ? "–" : spot.score}
                </span>
                <span className="td-spot-body">
                  <span className="td-spot-name">{spot.name}</span>
                  <span className="td-spot-vals">
                    <GradeIcon gradeKey={grade.key} size={12} />
                    <span>
                      {grade.label} · 수온 {spot.waterTemp}
                    </span>
                    <StateChip kind={spot.linked ? "live" : "example"} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="td-spot-detail">
            <dl>
              <dt>장소명</dt>
              <dd>
                {selected.name}
                {selected.linked ? " (수집 DB)" : " (예시 상수)"}
              </dd>
              <dt>지역</dt>
              <dd>{selected.region ?? "–"}</dd>
              <dt>주소</dt>
              <dd>{selected.address ?? "–"}</dd>
              <dt>검증 상태</dt>
              <dd>{selected.verification ?? "–"}</dd>
              <dt>수영 점수</dt>
              <dd>
                {selected.score === null ? "–" : selected.score} ·{" "}
                {gradeOf(selected.score).label} · 예시 데이터
              </dd>
            </dl>
          </div>
        )}

        <p className="td-note">
          지점별로 저장된 값은 수영 점수와 수온뿐입니다. 장소명 · 지역 · 주소 ·
          검증 상태만 수집 DB(<code>spots</code>)에서 읽어옵니다.{" "}
          {spots.loading
            ? "장소 카탈로그를 불러오는 중입니다."
            : spots.error
              ? `장소 카탈로그를 불러오지 못했습니다(${spots.error}) — 아래 지점명은 예시 상수입니다.`
              : `강릉 검색 결과 ${rows.length}건 중 ${linkedCount}개 지점이 연결되었습니다.`}{" "}
          점수 · 수온은 저장·검증된 값이 아니며 안전 판단에 쓸 수 없습니다.
        </p>
      </div>
    </section>
  );
}

function ActivitySection() {
  return (
    <section>
      <SectionHead label="활동별 점수 · 경포해변 예보" />
      <div className="td-card">
        <div className="td-acts">
          {ACTIVITY_EXAMPLES.map((activity) => {
            const grade = gradeOf(activity.score);
            return (
              <div className="td-act" key={activity.name} data-grade={grade.key}>
                <div className="td-act-name">{activity.name}</div>
                <div className="td-num td-act-score">
                  <GradeIcon gradeKey={grade.key} size={12} />
                  {activity.score === null ? "–" : activity.score}
                </div>
                <div className="td-act-label">{grade.label}</div>
              </div>
            );
          })}
        </div>
        <p className="td-note">
          <StateChip kind="example" /> 저장된 활동은 수영 · 래프팅 · 휴식
          3종입니다. 온천은 수집 항목이 아니므로 위 점수는 예시입니다.
        </p>
      </div>
    </section>
  );
}

function ForecastSection() {
  const [forecastDayId, setForecastDayId] = useState(FORECAST_DAYS[0].id);
  const selected =
    FORECAST_DAYS.find((day) => day.id === forecastDayId) ?? FORECAST_DAYS[0];
  const maxScore = Math.max(...FORECAST_DAYS.map((day) => day.score ?? 0), 1);

  return (
    <section>
      <SectionHead
        label="7일 예보"
        suffix="A2"
        href="#water-forecast"
        linkLabel="자세히 →"
      />
      <div className="td-card">
        <div className="td-bars" role="group" aria-label="날짜 선택">
          {FORECAST_DAYS.map((day) => {
            const grade = gradeOf(day.score);
            return (
              <button
                type="button"
                key={day.id}
                className={
                  "td-bar" + (day.id === forecastDayId ? " is-selected" : "")
                }
                data-grade={grade.key}
                aria-pressed={day.id === forecastDayId}
                aria-label={`${day.weekday} ${day.dateLabel} · ${
                  day.score === null ? "평가값 없음" : `${day.score}점 ${grade.label}`
                }`}
                onClick={() => setForecastDayId(day.id)}
              >
                <span className="td-bar-score">
                  {day.score === null ? "–" : day.score}
                </span>
                <span
                  className="td-bar-fill"
                  style={{
                    height:
                      day.score === null
                        ? "4px"
                        : `${Math.max(8, (day.score / maxScore) * 46)}px`,
                    background: grade.color,
                  }}
                />
                <span className="td-bar-day">{day.weekday}</span>
              </button>
            );
          })}
        </div>

        <div className="td-bar-detail">
          <span>
            {selected.weekday} · {selected.dateLabel}
          </span>
          <GradeChip score={selected.score} />
          {selected.score === null && <StateChip kind="no_data" />}
        </div>

        <p className="td-note">
          값이 없는 날은 <b>–</b>이며 0점이 아닙니다. 막대 길이는 각 날짜 점수의
          상대 위치이며 점수 기여도가 아닙니다. <StateChip kind="example" />
        </p>
      </div>
    </section>
  );
}

function TideSection() {
  return (
    <section>
      <SectionHead label="물때" suffix="A6" href="#tide" linkLabel="자세히 →" />
      <div className="td-card">
        <div className="td-tide-now">
          <span className="td-tide-pill is-now">썰물 (지금)</span>
          <span className="td-tide-arrow" aria-hidden="true">
            →
          </span>
          <span className="td-tide-pill">밀물 {TIDE.nextFlood}</span>
          <span className="td-tide-level">
            조위 <b className="td-num">{TIDE.levelCm}cm</b>
          </span>
        </div>
        <div className="td-rows td-tide-rows">
          {TIDE.activities.map((activity) => (
            <div
              className={"td-tide-row" + (activity.fit ? "" : " is-off")}
              key={activity.name}
            >
              <span className="td-badge-round">
                <Icon name={activity.icon} size={14} />
              </span>
              <span className="td-tide-name">{activity.name}</span>
              <span className={"td-fit-chip" + (activity.fit ? "" : " is-off")}>
                {activity.fit ? "적합" : "부적합"}
              </span>
              <span className="td-tide-when">{activity.when}</span>
            </div>
          ))}
        </div>
        <p className="td-note">
          <StateChip kind="uncollected" /> 조위는 아직 실연동되지 않았습니다. 위
          시각 · 조위 · 적합 여부는 예시이며 새로운 안전 판정이 아닙니다. 갯벌
          체험 · 튜브 물놀이는 수집 항목이 아닙니다(저장 활동: 수영 · 래프팅 ·
          휴식).
        </p>
      </div>
    </section>
  );
}

function FirstSwimSection() {
  const diff = FIRST_SWIM.thisYear.doy - FIRST_SWIM.lastYear.doy;
  const compare =
    diff === 0
      ? `${FIRST_SWIM.lastYear.year}년과 같은 날`
      : diff > 0
        ? `${FIRST_SWIM.lastYear.year}년보다 ${diff}일 늦음`
        : `${FIRST_SWIM.lastYear.year}년보다 ${-diff}일 빠름`;

  return (
    <section>
      <SectionHead
        label="올해 첫 입수"
        suffix="A7"
        href="#first-swim"
        linkLabel="연도 비교 →"
      />
      <div className="td-card">
        <div className="td-swim">
          <span className="td-swim-badge">
            <Icon name="sun" size={20} />
          </span>
          <div>
            <div className="td-swim-date">{FIRST_SWIM.thisYear.date}</div>
            <div className="td-swim-sub">
              수온 {FIRST_SWIM.thisYear.waterTemp}로 기준(
              {FIRST_SWIM.thresholdTemp}) 첫 돌파 · {compare}
            </div>
          </div>
        </div>
        <p className="td-note">
          <StateChip kind="example" /> 날짜 · 기준 수온은 저장된 관측이 아니며,
          연도 비교는 day-of-year 차이({FIRST_SWIM.thisYear.doy} −{" "}
          {FIRST_SWIM.lastYear.doy})로만 계산한 값입니다.
        </p>
      </div>
    </section>
  );
}

function QualitySection() {
  return (
    <section>
      <SectionHead
        label="수질 신뢰도"
        suffix="A8"
        href="#water-quality"
        linkLabel="교차검증 →"
      />
      <div className="td-card">
        {QUALITY_CONFIDENCE.map((item) => (
          <div className="td-conf-row" key={item.label}>
            <span>
              {item.label} {item.value}
            </span>
            <b className="td-conf-value" style={{ color: "#4a6d8c" }}>
              신뢰도 {item.confidence.toFixed(2)}
            </b>
          </div>
        ))}
        <p className="td-note">
          <StateChip kind="uncollected" /> 신뢰도는 점수 · 안전 판정과 다른
          값이며, 색(<code>#4a6d8c</code>)도 등급 팔레트와 분리했습니다. 수질
          수집이 구현되지 않아 위 값은 예시입니다. 히어로의 수질 타일이 –인 것과
          같은 이유입니다.
        </p>
      </div>
    </section>
  );
}

function UnlinkedAlert() {
  return (
    <div className="td-card td-alert" role="note">
      <div className="td-alert-head">
        <Icon name="warning" size={15} />
        <span>아직 실연동되지 않은 항목</span>
      </div>
      <ul>
        {UNLINKED_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="td-note">
        이 페이지에서 수집 DB로 읽는 값은 장소 카탈로그(장소명 · 지역 · 주소 ·
        검증 상태)뿐입니다. 나머지 수치 · 시각은 레이아웃 확인용 예시이며 안전
        판단에 쓸 수 없습니다. 값이 없거나 unknown인 상태는 안전하다는 뜻이
        아닙니다.
      </p>
    </div>
  );
}

function TabBar() {
  return (
    <>
      <nav className="td-tabbar" aria-label="주요 탭">
        <button type="button" className="td-tab" disabled>
          홈
        </button>
        <a className="td-tab" href="#today" aria-current="page">
          오늘
        </a>
        <button type="button" className="td-tab" disabled>
          추천
        </button>
        <a className="td-tab" href="#water-index-map">
          지도
        </a>
        <button type="button" className="td-tab" disabled>
          내 코스
        </button>
      </nav>
      <p className="td-tabbar-note">
        홈 · 추천 · 내 코스 화면은 아직 없어 비활성입니다. 지도는 기존 지도
        배치 화면으로 이동합니다.
      </p>
    </>
  );
}

function TodayScreen() {
  return (
    <article className="today-page">
      <div className="td-frame">
        <Hero />
        <div className="td-body">
          <SpotSection />
          <ActivitySection />
          <ForecastSection />
          <TideSection />
          <FirstSwimSection />
          <QualitySection />
          <UnlinkedAlert />
          <TabBar />
        </div>
      </div>
    </article>
  );
}

export function TodayPage() {
  // 이 화면은 실제 수집 데이터만 읽습니다. 상단 「데이터 구분」이 더미로
  // 선택돼 있어도 `/api/data` 로 고정합니다(`/api/demo` 는 은퇴해 404).
  return (
    <DataOrigin.Provider value="data">
      <TodayScreen />
    </DataOrigin.Provider>
  );
}
