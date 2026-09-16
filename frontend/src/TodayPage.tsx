import { useState } from "react";
import { DataOrigin } from "./DataOrigin";
import { gradeOf } from "./groupAGrade";
import { useResource } from "./useResource";
import { useProductData, useTodayData } from "./useProductData";
import { useConditionDays } from "./useConditionDays";
import { useConditions } from "./useConditions";
import { ConditionScoreDetails } from "./ConditionScoreDetails";
import { WaterQualityDetails } from "./WaterQualityDetails";
import {
  conditionScore,
  conditionScoreText,
  conditionModeLabel,
  periodPath,
  dateLabel,
  timeLabel,
  forecastInputText,
  metricText,
  evidenceText,
  waterQualityLabel,
  type Place,
  type Conditions,
  type Forecast,
  type TideResult,
  type WaterQualityGrade,
} from "./productData";
import { AppTabBar } from "./appTabBar";
import "./todayPage.css";

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
  thermometer: (
    <path d="M12 3a2 2 0 0 1 2 2v8.5a4 4 0 1 1-4 0V5a2 2 0 0 1 2-2z" />
  ),
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
function GradeIcon({
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

const ACTIVITY_ROWS = [
  { name: "수영", id: "swim" },
  { name: "서핑", id: "surf" },
  { name: "휴식", id: "relax" },
  { name: "갯벌 체험", id: "mudflat" },
  { name: "래프팅", id: "rafting" },
  { name: "온천", id: "onsen" },
] as const;
const TIDE_ACTIVITIES = [
  { name: "갯벌 체험", icon: "mudflat" },
  { name: "래프팅", icon: "rafting" },
  { name: "튜브 물놀이", icon: "tube" },
] as const;

function Hero({
  place,
  displayName,
  conditions,
  quality,
}: {
  place?: Place;
  displayName: string;
  conditions?: Conditions;
  quality: string;
}) {
  const heroScore = conditionScore(conditions);
  return (
    <header className="td-hero">
      <div className="td-sbar">
        <span>{timeLabel(new Date().toISOString())}</span>
        <span className="td-sbar-mark">TODAY</span>
        <span>{place?.region || (displayName.includes("경포") ? "강릉" : "선택 해수욕장")}</span>
      </div>
      <div className="td-hero-inner">
        <p className="td-lbl">
          {dateLabel()} · {displayName} {conditionModeLabel(conditions)} 기준
        </p>
        <div className="td-hero-row">
          <h1 className="td-hero-sentence">
            오늘의 수영 조건
            <br />
            자료를 확인하세요
          </h1>
          <div className="td-hero-score">
            <div className="td-num td-hero-score-num">{heroScore ?? "–"}</div>
            <GradeChip score={heroScore} glass bare />
          </div>
        </div>
        <div className="td-hero-tiles">
          <div className="td-tile">
            <Icon name="sun" size={17} className="td-tile-icon" />
            <div className="td-num td-tile-value">
              {metricText(conditions, "air_temperature")}
            </div>
            <div className="td-tile-name">기온</div>
          </div>
          <div className="td-tile">
            <Icon name="wave" size={17} className="td-tile-icon" />
            <div className="td-num td-tile-value">
              {metricText(conditions, "wave_height")}
            </div>
            <div className="td-tile-name">파고</div>
          </div>
          <div className="td-tile">
            <Icon name="thermometer" size={17} className="td-tile-icon" />
            <div className="td-num td-tile-value">
              {metricText(conditions, "water_temperature")}
            </div>
            <div className="td-tile-name">수온</div>
          </div>
          <div className="td-tile is-empty">
            <Icon name="quality" size={17} className="td-tile-icon" />
            <div className="td-num td-tile-value">{quality}</div>
            <div className="td-tile-name">수질 · 최근 검사</div>
          </div>
        </div>
        <p className="td-hero-note">
          {conditionScoreText(conditions)} {evidenceText(conditions)} 안전 상태:{" "}
          {conditions?.safety_status ?? "unknown"}. 값이 없으면 –로 표시하며
          안전 판정을 만들지 않습니다.
        </p>
      </div>
    </header>
  );
}

function SpotComparisonRow({
  spot,
  selected,
  onSelect,
}: {
  spot: Place;
  selected: boolean;
  onSelect: () => void;
}) {
  const conditions = useConditions(spot.id);
  const score = conditionScore(conditions.data);
  const grade = gradeOf(score);
  return (
    <button
      type="button"
      className={"td-spot-row" + (selected ? " is-selected" : "")}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="td-score-badge" data-grade={grade.key}>
        {score ?? "–"}
      </span>
      <span className="td-spot-body">
        <span className="td-spot-name">{spot.name}</span>
        <span className="td-spot-vals">
          <GradeIcon gradeKey={grade.key} size={12} />
          <span>
            {grade.label} · 수온{" "}
            {metricText(conditions.data, "water_temperature")}
          </span>
          <StateChip kind={conditions.data ? "live" : "no_data"} />
        </span>
      </span>
    </button>
  );
}

function SpotSection({ rows, status }: { rows: Place[]; status: string }) {
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const resolved = rows.filter((row) => row.type === "beach").slice(0, 3);
  const selected = resolved.find((spot) => spot.id === selectedSpotId);
  const conditions = useConditions(selected?.id);
  return (
    <section>
      <SectionHead
        label="지점 비교 · 수영 점수"
        href="#map"
        linkLabel="전체 지도 →"
      />
      <div className="td-card">
        <div className="td-rows">
          {resolved.map((spot) => (
            <SpotComparisonRow
              key={spot.id}
              spot={spot}
              selected={spot.id === selectedSpotId}
              onSelect={() =>
                setSelectedSpotId((current) =>
                  current === spot.id ? null : spot.id,
                )
              }
            />
          ))}
        </div>

        {selected && (
          <div className="td-spot-detail">
            <dl>
              <dt>장소명</dt>
              <dd>
                {selected.name}
                (수집 DB)
              </dd>
              <dt>지역</dt>
              <dd>{selected.region ?? "–"}</dd>
              <dt>주소</dt>
              <dd>{selected.address ?? "–"}</dd>
              <dt>검증 상태</dt>
              <dd>{selected.catalog_verification ?? "–"}</dd>
              <dt>수영 점수</dt>
              <dd>
                {conditionScore(conditions.data) ?? "–"} · 수온{" "}
                {metricText(conditions.data, "water_temperature")} ·{" "}
                {conditions.error ?? evidenceText(conditions.data)}
              </dd>
            </dl>
            <ConditionScoreDetails data={conditions.data} className="td-note" />
          </div>
        )}

        <p className="td-note">
          {status} 장소를 선택하면 해당 지점의 분야별 점수와 조건 근거를 조회합니다.
          자료가 없는 분야는 –이며, 부분 점수의 근거 확보율을 함께 확인하세요.
        </p>
      </div>
    </section>
  );
}

function ActivitySection({ id }: { id?: number }) {
  const states = [
    useConditions(id, "swim"),
    useConditions(id, "surf"),
    useConditions(id, "relax"),
    useConditions(id, "mudflat"),
    useConditions(id, "rafting"),
    useConditions(id, "onsen"),
  ];
  const activities = ACTIVITY_ROWS.map((item, index) => ({
    ...item,
    score: conditionScore(states[index].data),
    data: states[index].data,
    error: states[index].error,
  }));
  return (
    <section>
      <SectionHead label="활동별 점수 · 선택 장소 조건" />
      <div className="td-card">
        {[activities.slice(0, 3), activities.slice(3)].map((group, index) => (
        <div className="td-acts" key={index}>
          {group.map((activity) => {
            const grade = gradeOf(activity.score);
            return (
              <div
                className="td-act"
                key={activity.name}
                data-grade={grade.key}
              >
                <div className="td-act-name">{activity.name}</div>
                <div className="td-num td-act-score">
                  <GradeIcon gradeKey={grade.key} size={12} />
                  {activity.score === null ? "–" : activity.score}
                </div>
                <div className="td-act-label">{grade.label}</div>
                <div className="td-act-label">
                  {activity.data?.condition_score ? `${Math.round(activity.data.condition_score.coverage * 100)}% 근거` : "근거 미확인"}
                </div>
                <div className="td-act-label">
                  {activity.data?.support_status === "supported" ? "활동 지원 확인" : activity.data?.support_status === "unsupported" ? "활동 미지원" : "지원 미확인"}
                </div>
              </div>
            );
          })}
        </div>
        ))}
        <p className="td-note">
          <StateChip kind="partial" /> 활동별 참고 점수입니다. 일부 근거로 계산한
          값은 조건 전체를 대표하지 않습니다. 안전·운영 여부는 별도 확인이 필요합니다.{" "}
          {states
            .map((state) => state.error)
            .filter(Boolean)
            .join(" · ")}
        </p>
        {activities.map((activity) => (
          <details key={activity.id} className="td-note">
            <summary>{activity.name} 분야별 근거 확인</summary>
            {activity.error && <p>{activity.error}</p>}
            <ConditionScoreDetails data={activity.data} />
          </details>
        ))}
      </div>
    </section>
  );
}

function ForecastSection({
  id,
  rows,
  now,
  status,
}: {
  id?: number;
  rows: Forecast[];
  now: string;
  status: string;
}) {
  const days = useConditionDays(id, now);
  const [forecastDayId, setForecastDayId] = useState(days[0].id);
  const selected = days.find((day) => day.id === forecastDayId) ?? days[0];
  const maxScore = Math.max(...days.map((day) => day.score ?? 0), 1);

  return (
    <section>
      <SectionHead label="7일 예보" suffix="A2" />
      <div className="td-card">
        <div className="td-bars" role="group" aria-label="날짜 선택">
          {days.map((day) => {
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
                  day.score === null
                    ? "평가값 없음"
                    : `${day.score}점 ${grade.label}`
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
        <ConditionScoreDetails data={selected.data} className="td-note" />
        {selected.error && <p className="td-note">{selected.error}</p>}

        <div className="td-bar-detail">
          <span>
            {selected.weekday} · {selected.dateLabel}
          </span>
          <GradeChip score={selected.score} />
          {selected.score === null && <StateChip kind="no_data" />}
        </div>

        <p className="td-note">
          {selected.score !== null
            ? "점수는 위 상세의 관측소·격자 예보 근거로 계산했습니다."
            : status === "no_forecast_data" ? "연결된 관측소·격자 예보 없음." : status}{" "}
          {rows
            .filter(
              (row) =>
                row.target_start_at.slice(0, 10) === selected.id ||
                new Date(row.target_start_at).toLocaleDateString("sv-SE", {
                  timeZone: "Asia/Seoul",
                }) === selected.id,
            )
            .map(
              (row) =>
                `${row.station_name} · ${row.provider} · ${timeLabel(row.target_start_at)} · ${row.state} · ${row.inputs.map((input) => `${input.name}: ${forecastInputText(input, row.state)}`).join(" / ")}`,
            )
            .join(" / ") || "예보 목록(첫 100건)에는 선택 날짜의 자료가 없습니다."}{" "}
          관측소·해당 기상 격자의 목록은 첫 100건입니다. 날짜별 점수는 해당 날짜 12:00 KST에 유효한
          수집 예보로 계산합니다. 해당 시각의 근거가 없으면 –입니다.
        </p>
      </div>
    </section>
  );
}

function OperatingRow({
  activity,
  id,
  now,
}: {
  activity: (typeof TIDE_ACTIVITIES)[number];
  id?: number;
  now: string;
}) {
  const windows = useResource<{
    rows: { state: string; start_at: string; end_at: string; scope: string }[];
  }>(
    activity.icon === "tube"
      ? null
      : periodPath("tides/windows", id, now, 1, activity.icon),
  );
  const active = windows.data?.rows.find(
    (row) => row.state === "official_operating_window",
  );
  return (
    <div className={"td-tide-row" + (active ? "" : " is-off")}>
      <span className="td-badge-round">
        <Icon name={activity.icon} size={14} />
      </span>
      <span className="td-tide-name">{activity.name}</span>
      <span className={"td-fit-chip" + (active ? "" : " is-off")}>
        {active ? "공식 운영" : "확인 필요"}
      </span>
      <span className="td-tide-when" title={active?.scope}>
        {windows.error
          ? "조회 실패"
          : active
            ? `${timeLabel(active.start_at)}–${timeLabel(active.end_at)}`
            : "운영정보 없음"}
      </span>
    </div>
  );
}

function TideSection({
  tides,
  status,
  id,
  now,
}: {
  tides?: TideResult;
  status: string;
  id?: number;
  now: string;
}) {
  return (
    <section>
      <SectionHead label="물때" suffix="A6" />
      <div className="td-card">
        <div className="td-tide-now">
          <span className="td-tide-pill is-now">
            간조 {timeLabel(tides?.next_low?.event_at)}
          </span>
          <span className="td-tide-arrow" aria-hidden="true">
            →
          </span>
          <span className="td-tide-pill">
            만조 {timeLabel(tides?.next_high?.event_at)}
          </span>
          <span className="td-tide-level">
            다음 만조 높이{" "}
            <b className="td-num">
              {tides?.next_high?.height ?? "–"}
              {tides?.next_high?.unit ?? ""}
            </b>
          </span>
        </div>
        <div className="td-rows td-tide-rows">
          {TIDE_ACTIVITIES.map((activity) => (
            <OperatingRow
              key={activity.name}
              activity={activity}
              id={id}
              now={now}
            />
          ))}
        </div>
        <p className="td-note">
          <StateChip kind={tides?.rows.length ? "live" : "no_data"} /> {status}{" "}
          공식 조석 예측의 간조·만조 시각입니다. 사건 시각만으로 현재 조류나
          활동 적합 여부를 판단하지 않습니다.{" "}
          {(tides?.next_high ?? tides?.next_low)?.station_name}{" "}
          {(tides?.next_high ?? tides?.next_low)?.spatial_relation === "nearby_station_context" &&
            `주변 관측소 참고 ${(tides?.next_high ?? tides?.next_low)?.distance_km?.toFixed(1)}km · 해당 해변의 직접 예측이 아닙니다.`}
        </p>
      </div>
    </section>
  );
}

function FirstSwimSection({ id }: { id?: number }) {
  const subscriptions = useResource<{
    rows: {
      id: string;
      spot_id: number;
      year: number;
      minimum_temperature_c: number;
      condition_state: string;
      last_evaluated_at: string | null;
    }[];
  }>("notifications/subscriptions?limit=100&offset=0");
  const subscription = subscriptions.data?.rows.find(
    (row) =>
      row.spot_id === id &&
      row.year ===
        Number(
          new Date()
            .toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
            .slice(0, 4),
        ),
  );
  return (
    <section>
      <SectionHead
        label="올해 첫 입수"
        suffix="A7"
        href="#first-swim"
        linkLabel="내 알림 조회 →"
      />
      <div className="td-card">
        <div className="td-swim">
          <span className="td-swim-badge">
            <Icon name="sun" size={20} />
          </span>
          <div>
            <div className="td-swim-date">
              {subscription ? "기준 관측 알림" : "–"}
            </div>
            <div className="td-swim-sub">
              {subscription
                ? `선택 기준 ${subscription.minimum_temperature_c}°C · ${subscription.condition_state} · 최근 평가 ${timeLabel(subscription.last_evaluated_at)}`
                : "이 장소의 올해 알림 구독이 없습니다."}
            </div>
          </div>
        </div>
        <p className="td-note">
          <StateChip kind={subscription ? "live" : "no_data"} />{" "}
          {subscriptions.error ??
            "개인 구독의 평가 상태입니다. 첫 입수일과 전년 비교는 관측 이력이 입증하지 않아 표시하지 않습니다."}
        </p>
      </div>
    </section>
  );
}

function QualitySection({
  data,
  error,
}: {
  data?: WaterQualityGrade;
  error?: string;
}) {
  return (
    <section>
      <SectionHead label="수질 등급 · 최근 검사" suffix="A8" />
      <div className="td-card">
        <div className="td-conf-row"><b>{error ? "조회 실패" : waterQualityLabel(data)}</b><span>{data?.label}</span></div>
        <WaterQualityDetails data={data} error={error} className="td-note" />
      </div>
    </section>
  );
}

function UnlinkedAlert() {
  const items = [
    "공식 안전 판정 — 활동 조건 참고 점수와 별도 확인 필요",
    "첫 입수일·전년 비교 — 연속 관측 이력 확인 필요",
    "오늘의 해수욕장 위생 수질 — 최신 대장균·장구균 검사 필요",
  ];
  return (
    <div className="td-card td-alert" role="note">
      <div className="td-alert-head">
        <Icon name="warning" size={15} />
        <span>추가 근거가 필요한 항목</span>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="td-note">
        장소·조건·공식 예보·물때·수질 비교·개인 알림을 각각 조회합니다. 빈 값과
        unknown은 안전함을 뜻하지 않습니다.
      </p>
    </div>
  );
}

function TodayScreen() {
  const { now, place, places, conditions, displayName, selectionMessage } = useProductData();
  const { forecasts, tides, quality } = useTodayData(place?.id, now);
  return (
    <article className="today-page">
      <div className="td-frame">
        <Hero
          quality={quality.loading ? "조회 중" : quality.error ? "조회 실패" : waterQualityLabel(quality.data)}
          place={place}
          displayName={displayName}
          conditions={conditions.data}
        />
        <div className="td-body">
          <SpotSection
            rows={places.data?.rows ?? []}
            status={
              places.error ??
              conditions.error ??
              selectionMessage
            }
          />
          <ActivitySection id={place?.id} />
          <ForecastSection
            id={place?.id}
            rows={forecasts.data?.rows ?? []}
            now={now}
            status={
              forecasts.error ??
              (forecasts.loading
                ? "예보 조회 중"
                : (forecasts.data?.status ?? "장소 선택 필요"))
            }
          />
          <TideSection
            id={place?.id}
            now={now}
            tides={tides.data}
            status={
              tides.error ??
              (tides.loading
                ? "물때 조회 중"
                : (tides.data?.status ?? "장소 선택 필요"))
            }
          />
          <FirstSwimSection id={place?.id} />
          <QualitySection
            data={quality.data}
            error={quality.error}
          />
          <UnlinkedAlert />
          <AppTabBar active="today" />
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
