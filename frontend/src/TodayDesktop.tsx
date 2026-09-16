import { CONFIDENCE_COLOR, gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl, type MascotRole } from "./mascots";
import {
  DesktopHero,
  DesktopNav,
  DesktopShell,
  FootNote,
  LabelRow,
  SplitBody,
} from "./pongdangDesktop";
import { GradeIcon, Icon, StateChip, type IconName } from "./pongdangUi";
import "./todayDesktop.css";

// 데스크탑 오늘(핸드오프 18e)입니다. 근거 데이터 전담 화면으로, 최적경로와
// 라이브캠은 홈(18a)으로 넘어갔습니다. 모바일 「오늘」과 같은 구성입니다.
//
// 값은 전부 디자인 시안의 예시입니다. 조위 · 수질 수집 · 첫 입수 알림 트리거 ·
// 시간대별 예보는 미연동이며, 화면은 그 사실을 칩과 하단 경고로 계속 밝힙니다.
//
// 이 화면이 특히 조심하는 것:
//  - 값이 없는 날은 «–» 이고 0 점이 아닙니다(주간 예보 토요일).
//  - 신뢰도는 점수 · 안전 판정과 다른 값이며 전용색(CONFIDENCE_COLOR)을 씁니다.
//  - 막대는 점수의 상대 위치이지 기여도가 아닙니다.

const CONTEXT = "강릉 경포해변 · 9월 15일 · 예보 06:00 기준";
const TODAY_SCORE = 82;

const HERO_TILES: { name: string; value: string; icon: IconName }[] = [
  { name: "날씨", value: "맑음", icon: "sun" },
  { name: "파고", value: "0.6m", icon: "wave" },
  { name: "수온", value: "22.1°C", icon: "thermometer" },
  { name: "수질 · 수집 미구현", value: "–", icon: "quality" },
];

const SPOT_SCORES: {
  name: string;
  address: string;
  score: number;
  temp: string;
}[] = [
  { name: "경포해변", address: "강릉시 강문동", score: 72, temp: "22.1°C" },
  { name: "안목해변", address: "강릉시 견소동", score: 68, temp: "21.8°C" },
  { name: "사천진해변", address: "강릉시 사천면", score: 54, temp: "21.2°C" },
];

const ACTIVITY_SCORES: {
  name: string;
  score: number;
  mascot: MascotRole;
}[] = [
  { name: "수영", score: 82, mascot: "swim" },
  { name: "래프팅", score: 86, mascot: "rafting" },
  { name: "휴식", score: 70, mascot: "rest" },
];

/** 토요일은 값이 없습니다. «–» 이며 0 점이 아닙니다. */
const WEEK: { weekday: string; date: string; score: number | null }[] = [
  { weekday: "월", date: "9/15", score: 82 },
  { weekday: "화", date: "9/16", score: 74 },
  { weekday: "수", date: "9/17", score: 58 },
  { weekday: "목", date: "9/18", score: 34 },
  { weekday: "금", date: "9/19", score: 66 },
  { weekday: "토", date: "9/20", score: null },
  { weekday: "일", date: "9/21", score: 71 },
];

const TIDE_NOW: {
  name: string;
  mascot: MascotRole;
  reason: string;
  fit: boolean;
}[] = [
  { name: "갯벌 체험", mascot: "spot", reason: "물이 빠져 바닥이 드러남", fit: true },
  { name: "래프팅", mascot: "rafting", reason: "유속 안정", fit: true },
  { name: "튜브 물놀이", mascot: "tube", reason: "수심이 얕음", fit: false },
];

const TIDE_LATER: typeof TIDE_NOW = [
  { name: "수영", mascot: "swim", reason: "수심 확보", fit: true },
  { name: "튜브 물놀이", mascot: "tube", reason: "파도 완만", fit: true },
  { name: "갯벌 체험", mascot: "spot", reason: "갯벌이 잠김", fit: false },
];

const FIRST_SWIM_YEARS: { year: string; date: string; width: string }[] = [
  { year: "2026", date: "5/18", width: "70%" },
  { year: "2025", date: "5/12", width: "28%" },
  { year: "2024", date: "5/20", width: "60%" },
];

/** 작은 숫자는 신뢰도입니다. 값과 신뢰도는 서로 다른 값이라 색도 다릅니다. */
const QUALITY_ROWS: {
  label: string;
  unit: string;
  sources: { value: string; confidence: string }[];
  spread: string;
}[] = [
  {
    label: "탁도",
    unit: "NTU",
    sources: [
      { value: "3.2", confidence: "0.8" },
      { value: "2.9", confidence: "0.7" },
      { value: "3.0", confidence: "0.6" },
    ],
    spread: "0.3",
  },
  {
    label: "용존산소",
    unit: "mg/L",
    sources: [
      { value: "7.8", confidence: "0.9" },
      { value: "8.1", confidence: "0.8" },
      { value: "7.9", confidence: "0.7" },
    ],
    spread: "0.3",
  },
  {
    label: "pH",
    unit: "",
    sources: [
      { value: "7.6", confidence: "0.9" },
      { value: "7.4", confidence: "0.8" },
      { value: "7.5", confidence: "0.7" },
    ],
    spread: "0.2",
  },
];

function TodayHero() {
  const grade = gradeOf(TODAY_SCORE);
  return (
    <DesktopHero nav={<DesktopNav active="today" context={CONTEXT} />}>
      <div className="td-hero">
        <img
          className="td-hero-mascot"
          src={mascotUrl("surf")}
          alt={MASCOT_ALT}
          width={196}
          height={196}
        />
        <div className="td-hero-lead">
          <div className="pd-dk-kick td-hero-kick">오늘의 판정 · 수영 기준</div>
          <h1 className="td-hero-title">
            오늘은 수영하기
            <br />
            좋은 날입니다
          </h1>
          <span className="td-hero-chip">예시 데이터 · 안전 판단 불가</span>
        </div>
        <div className="td-hero-score">
          <div className="pd-dk-num td-hero-score-num">{TODAY_SCORE}</div>
          <div className="td-hero-score-grade">
            <GradeIcon gradeKey={grade.key} size={14} />
            {grade.label}
          </div>
        </div>
        <div className="td-hero-tiles">
          {HERO_TILES.map((tile) => (
            <div className="td-tile" key={tile.name}>
              <Icon name={tile.icon} size={18} />
              <div className="pd-dk-num td-tile-value">{tile.value}</div>
              <div className="td-tile-name">{tile.name}</div>
            </div>
          ))}
        </div>
      </div>
    </DesktopHero>
  );
}

function SpotComparison() {
  const max = Math.max(...SPOT_SCORES.map((item) => item.score));
  return (
    <div>
      <div className="td-head">
        <span className="pd-dk-kick">지점 비교 · 수영 점수</span>
        <StateChip kind="example" />
        <a className="td-head-link" href="#map">
          전체 지도 →
        </a>
      </div>
      {SPOT_SCORES.map((spot) => {
        const grade = gradeOf(spot.score);
        return (
          <div className="td-spot" data-grade={grade.key} key={spot.name}>
            <span className="pd-dk-num td-spot-score">{spot.score}</span>
            <span className="td-spot-grade">
              <GradeIcon gradeKey={grade.key} size={13} />
              {grade.label}
            </span>
            <span className="td-spot-body">
              <span className="td-spot-name">{spot.name}</span>
              <span className="td-spot-address">{spot.address}</span>
            </span>
            <span className="td-spot-bar">
              <span
                className="td-spot-bar-fill"
                style={{ width: `${(spot.score / max) * 100}%` }}
              />
            </span>
            <span className="pd-dk-num td-spot-temp">{spot.temp}</span>
          </div>
        );
      })}
      <p className="td-note">
        지점별로 저장된 값은 수영 점수와 수온뿐입니다. 위 날씨 · 파고는 경포해변
        예보 값이며 다른 지점의 실측값이 아닙니다. 막대는 점수의 상대 위치이며
        기여도가 아닙니다.
      </p>
    </div>
  );
}

function ActivityScores() {
  return (
    <div>
      <div className="pd-dk-kick">활동별 점수 · 경포해변</div>
      <div className="td-activities">
        {ACTIVITY_SCORES.map((activity) => {
          const grade = gradeOf(activity.score);
          return (
            <div
              className="td-activity"
              data-grade={grade.key}
              key={activity.name}
            >
              <img
                src={mascotUrl(activity.mascot)}
                alt=""
                width={78}
                height={78}
              />
              <div className="pd-dk-num td-activity-score">
                {activity.score}
              </div>
              <div className="td-activity-name">{activity.name}</div>
              <div className="td-activity-grade">
                <GradeIcon gradeKey={grade.key} size={11} />
                {grade.label}
              </div>
            </div>
          );
        })}
      </div>
      <p className="td-note">저장된 활동은 수영 · 래프팅 · 휴식 3종입니다.</p>
    </div>
  );
}

function WeekForecast() {
  const max = Math.max(
    ...WEEK.flatMap((day) => (day.score === null ? [] : [day.score])),
  );
  return (
    <section className="td-section">
      <div className="td-head">
        <span className="pd-dk-kick">이번 주 물놀이 예보</span>
        <span className="td-head-note">
          값이 없는 날은 «–»이며 0점이 아닙니다 · 막대는 주간 내 상대 위치
        </span>
      </div>
      <div className="td-week">
        {WEEK.map((day) => {
          const grade = gradeOf(day.score);
          return (
            <div className="td-day" data-grade={grade.key} key={day.date}>
              <div className="pd-dk-num td-day-score">{day.score ?? "–"}</div>
              <div className="td-day-track">
                {/* 값이 없는 날은 막대를 그리지 않고 회색 기준선만 둡니다.
                    0 높이 막대로 그리면 「0점」으로 읽히기 때문입니다. */}
                <span
                  className={
                    "td-day-bar" + (day.score === null ? " is-empty" : "")
                  }
                  style={
                    day.score === null
                      ? undefined
                      : { height: (day.score / max) * 62 }
                  }
                />
              </div>
              <div className="td-day-weekday">{day.weekday}</div>
              <div className="pd-dk-num td-day-date">{day.date}</div>
              {/* 숫자 · 등급명 · 아이콘 · 색 네 겹을 좁은 칸에서도 지킵니다. */}
              <div className="td-day-grade">
                <GradeIcon gradeKey={grade.key} size={11} />
                {grade.label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TideList({
  title,
  when,
  rows,
  accent = false,
}: {
  title: string;
  when: string;
  rows: typeof TIDE_NOW;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="td-tide-head">
        <b className={accent ? "is-accent" : undefined}>{title}</b>
        <span className="td-tide-when">{when}</span>
      </div>
      {rows.map((row) => (
        <div
          className={"td-tide-row" + (row.fit ? "" : " is-unfit")}
          key={row.name}
        >
          <img src={mascotUrl(row.mascot)} alt="" width={34} height={34} />
          <b className="td-tide-name">{row.name}</b>
          <span className="td-tide-reason">{row.reason}</span>
          <span className="td-tide-fit">{row.fit ? "적합" : "부적합"}</span>
        </div>
      ))}
    </div>
  );
}

export function TodayDesktop() {
  return (
    <DesktopShell>
      <TodayHero />

      <section className="td-section td-compare">
        <SpotComparison />
        <ActivityScores />
      </section>

      <WeekForecast />

      <LabelRow
        kick="물때"
        title={
          <>
            지금은 썰물
            <br />
            12:34 간조부터 밀물
          </>
        }
        chip={<StateChip kind="uncollected" />}
        desc="조위 수치는 아직 실연동되지 않았습니다."
      >
        <div className="td-tide-state">
          <span className="td-tide-chip is-now">썰물 (지금)</span>
          <span className="td-tide-arrow">→</span>
          <span className="td-tide-chip">밀물 12:34</span>
          <span className="pd-dk-num td-tide-level">96cm</span>
          <span className="td-tide-level-name">현재 조위</span>
        </div>
        {/* 조위 곡선. x=337 이 간조 지점입니다. */}
        <svg
          className="td-tide-curve"
          viewBox="0 0 1080 64"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 14 C 134 14, 202 50, 337 50 S 540 14, 674 14 S 877 50, 1011 50 L1080 46 L1080 64 L0 64Z"
            fill="rgba(74,134,200,.14)"
          />
          <path
            d="M0 14 C 134 14, 202 50, 337 50 S 540 14, 674 14 S 877 50, 1011 50 L1080 46"
            fill="none"
            stroke="#4a86c8"
            strokeWidth="2"
          />
          <line
            x1="337"
            y1="0"
            x2="337"
            y2="64"
            stroke="#0f2f7a"
            strokeDasharray="4 4"
          />
          <circle cx="337" cy="50" r="5" fill="#0f2f7a" />
        </svg>
        <div className="td-tide-axis">
          <span>지금 06:00 · 썰물</span>
          <span className="td-tide-axis-low">간조 12:34</span>
          <span>이후 밀물</span>
        </div>
        <div className="td-tide-lists">
          <TideList title="지금 · 썰물" when="~12:34 간조까지" rows={TIDE_NOW} />
          <TideList
            title="12:34 이후 · 밀물"
            when="물이 들어오는 시간대"
            rows={TIDE_LATER}
            accent
          />
        </div>
        <p className="td-note">
          물때 조건만 기준이며 점수 · 안전 판정과 다른 값입니다. 활동별 적합
          시간대는 수집 항목이 아닌 <b>예시</b>이고, 조위 · 시간대별 예보는
          미연동입니다.
        </p>
      </LabelRow>

      <LabelRow
        kick="기록"
        title="올해 첫 입수"
        chip={<StateChip kind="uncollected" />}
        desc="첫 입수 알림 트리거는 아직 실연동되지 않았습니다."
      >
        <SplitBody columns="1fr 1.35fr">
          <div className="td-first-swim">
            <div className="td-first-head">
              <img src={mascotUrl("firstSwim")} alt="" width={58} height={58} />
              <div>
                <div className="td-first-date">5월 18일</div>
                <div className="td-first-note">
                  수온 18.3°C로 기준 18.0°C 첫 돌파 · 작년보다 6일 늦음
                </div>
              </div>
            </div>
            <div className="td-years">
              {FIRST_SWIM_YEARS.map((row) => (
                <div className="td-year" key={row.year}>
                  <span className="pd-dk-num td-year-label">{row.year}</span>
                  <span className="td-year-bar">
                    <span className="td-year-fill" style={{ width: row.width }} />
                  </span>
                  <span className="pd-dk-num td-year-date">{row.date}</span>
                </div>
              ))}
            </div>
          </div>
          <QualityComparison />
        </SplitBody>
      </LabelRow>

      <FootNote
        alert
        missing="조위 · 수질 수집 · 첫 입수 알림 트리거 · 시간대별 예보"
        note="위 수치와 시각은 레이아웃 확인용 예시이며 안전 판단에 사용할 수 없습니다. 점수 · 수온 · 안전 상태 · 신뢰도는 서로 다른 값이며 하나로 요약하지 않습니다. NULL · unknown은 안전한 상태를 뜻하지 않습니다."
      />
    </DesktopShell>
  );
}

/** 수질 출처 비교 표. 「기록」 행의 오른쪽 칸에 들어갑니다. */
function QualityComparison() {
  return (
    <div className="td-quality">
      <div className="td-head">
        <span className="pd-dk-kick">수질 · 출처 비교</span>
        <span className="td-head-link td-quality-legend">
          작은 숫자 = 신뢰도
        </span>
      </div>
      <div className="td-quality-row is-head">
        <span>지표</span>
        <span>환경부</span>
        <span>해양조사원</span>
        <span>파생 계산</span>
        <span className="td-quality-spread">편차</span>
      </div>
      {QUALITY_ROWS.map((row) => (
        <div className="td-quality-row" key={row.label}>
          <span>
            <b>{row.label}</b> <span className="td-quality-unit">{row.unit}</span>
          </span>
          {row.sources.map((source, index) => (
            <span key={index}>
              <span className="pd-dk-num td-quality-value">{source.value}</span>{" "}
              <span
                className="pd-dk-num td-quality-confidence"
                style={{ color: CONFIDENCE_COLOR }}
              >
                {source.confidence}
              </span>
            </span>
          ))}
          <span className="pd-dk-num td-quality-spread">{row.spread}</span>
        </div>
      ))}
      <p className="td-note">
        신뢰도(confidence)는 점수 · 안전 판정과 다른 값이며 전용 색으로
        표기합니다. 수질 수집은 미연동입니다.
      </p>
    </div>
  );
}
