import { gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl } from "./mascots";
import {
  DesktopHero,
  DesktopNav,
  DesktopShell,
  FootNote,
  LabelRow,
  SplitBody,
} from "./pongdangDesktop";
import {
  ComponentBars,
  GradeIcon,
  Icon,
  ScoreExplainer,
  ScoreGauge,
  ScoreReason,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { EvidenceNote } from "./EvidenceNote";
import { WaterQualityDetails } from "./WaterQualityDetails";
import { activities, type Activity } from "./aiApi";
import { componentBars, scoreReason, scoreTitle, verdictOf } from "./scoreMeaning";
import { RecommendationReason } from "./RecommendationReason";
import { activityHeadline } from "./recommendationText";
import type { Recommendation } from "./recommendationApi";
import {
  conditionScore,
  dataStatusText,
  dateLabel,
  metricText,
  periodPath,
  timeLabel,
  waterQualityLabel,
  type Conditions,
  type Place,
} from "./productData";
import { isInitialLoad, useResource } from "./useResource";
import { useProductData, useTodayData } from "./useProductData";
import { useConditions } from "./useConditions";
import { useConditionDays } from "./useConditionDays";
import type { ActivityCondition } from "./useBestActivity";
import "./todayDesktop.css";

// 데스크탑 오늘(핸드오프 18e)입니다. 근거 데이터 전담 화면으로, 최적경로와
// 라이브캠은 홈(18a)으로 넘어갔습니다. 모바일 「오늘」과 같은 구성입니다.
//
// 예전에는 이 화면에 훅이 하나도 없었습니다. 점수 82 · 수온 22.1°C · 지점
// 세 곳 · 주간 일곱 칸 · 조위 곡선 · 수질 출처 세 개가 전부 파일 안 상수였고,
// 같은 라우트의 모바일은 그동안 실제 수집값을 읽고 있었습니다. 폭에 따라 다른
// 사실을 말하면 안 됩니다.
//
// 이제 모바일 「오늘」과 **같은 훅**을 씁니다. 레이아웃(괘선 · LabelRow)만
// 데스크탑 문법입니다.
//
// 이 화면이 특히 조심하는 것:
//  - 값이 없는 날은 «–» 이고 0 점이 아닙니다(주간 예보).
//  - 막대는 점수의 상대 위치이지 기여도가 아닙니다.

/** 활동별 점수 칸. 모바일 오늘 탭과 같은 다섯 활동입니다. */
const ACTIVITY_ROWS = [
  { id: "swim", mascot: "swim" },
  { id: "surf", mascot: "surf" },
  { id: "relax", mascot: "rest" },
  { id: "rafting", mascot: "rafting" },
  { id: "onsen", mascot: "hotspring" },
] as const;

/** 물때 운영 시간대를 묻는 활동. 모바일과 같은 두 가지입니다. */
const TIDE_ACTIVITIES = [
  { name: "래프팅", icon: "rafting" },
  { name: "튜브 물놀이", icon: "tube" },
] as const;

function TodayHero({
  placeName,
  conditions,
  best,
  recommendation,
  recommendationLoading = false,
  quality,
  qualityLoading = false,
  loading = false,
}: {
  placeName: string;
  conditions?: Conditions;
  /** 서버가 고른 활동과 그 근거. 히어로의 근거 줄이 이것을 읽습니다. */
  recommendation?: Recommendation;
  recommendationLoading?: boolean;
  best: ActivityCondition | null;
  quality: string;
  qualityLoading?: boolean;
  loading?: boolean;
}) {
  const score = best?.score ?? null;
  const grade = gradeOf(score);
  const verdict =
    best && !loading ? verdictOf(best.activity, gradeOf(best.score).key) : null;
  return (
    <DesktopHero
      nav={
        <DesktopNav
          active="today"
          context={`${placeName} · ${dateLabel()}`}
        />
      }
    >
      <div className="td-hero">
        <img
          className="td-hero-mascot"
          src={mascotUrl("surf")}
          alt={MASCOT_ALT}
          width={196}
          height={196}
        />
        <div className="td-hero-lead">
          <div className="pd-dk-kick td-hero-kick">
            {best ? scoreTitle(best.activity) : "오늘의 판정"}
          </div>
          {/* 조사(이/가)를 붙이지 않으려고 활동 이름을 줄로 떼어 둡니다. */}
          <h1 className="td-hero-title">
            {loading ? (
              <Skeleton width="8em" glass label="오늘의 활동 조회 중" />
            ) : best ? (
              <>
                오늘 가장 좋은 활동
                <br />
                {activityHeadline(best.activity)}
              </>
            ) : (
              <>
                오늘 점수를 낼 수 있는
                <br />
                활동이 없습니다
              </>
            )}
          </h1>
          {verdict && <span className="td-hero-chip">{verdict}</span>}
        </div>
        <div className="td-hero-score">
          <div className="pd-dk-num td-hero-score-num">
            {loading ? (
              <Skeleton width="1.6em" glass label="점수 조회 중" />
            ) : (
              (score ?? "–")
            )}
          </div>
          <div className="td-hero-score-grade">
            <GradeIcon gradeKey={grade.key} size={14} />
            {grade.label}
          </div>
          <ScoreGauge score={score} loading={loading} glass compact />
        </div>
        <div className="td-hero-tiles">
          {/* 예전에는 이 네 칸이 「맑음 · 0.6m · 22.1°C · –」 상수였습니다. */}
          <div className="td-tile">
            <Icon name="wave" size={18} />
            <div className="pd-dk-num td-tile-value">
              {metricText(conditions, "wave_height")}
            </div>
            <div className="td-tile-name">파고</div>
          </div>
          <div className="td-tile">
            <Icon name="thermometer" size={18} />
            <div className="pd-dk-num td-tile-value">
              {metricText(conditions, "water_temperature")}
            </div>
            <div className="td-tile-name">수온</div>
          </div>
          <div className="td-tile">
            <Icon name="sun" size={18} />
            <div className="pd-dk-num td-tile-value">
              {metricText(conditions, "air_temperature")}
            </div>
            <div className="td-tile-name">기온</div>
          </div>
          <div className="td-tile">
            <Icon name="quality" size={18} />
            <div className="pd-dk-num td-tile-value">
              {qualityLoading ? <Skeleton width="2.6em" glass /> : quality}
            </div>
            {/* 수질은 점수에 들어가지 않습니다. 점수 옆에 그냥 두면 근거로
                읽히므로 그 사실을 함께 적습니다. */}
            <div className="td-tile-name">수질 · 점수 미반영</div>
          </div>
        </div>
      </div>
      {/* 왜 이 활동인가 · 왜 저것이 아닌가 · 지금 물때 · 대신 갈 곳.
          점수 산출 근거와 출처 · 면책은 아래 「근거 보기」에 그대로 남습니다. */}
      <RecommendationReason
        data={recommendation}
        loading={recommendationLoading}
        glass
        className="td-hero-why"
      />
      <EvidenceNote data={conditions} className="td-hero-note" glass />
      <ScoreExplainer data={conditions} />
    </DesktopHero>
  );
}

/** 지점 한 줄. 모바일 오늘 탭의 SpotComparisonRow 와 같은 규칙으로, 지점마다
 *  자기 조건을 따로 조회합니다. */
function SpotRow({
  place,
  activity,
  max,
}: {
  place: Place;
  activity: Activity;
  max: number;
}) {
  const conditions = useConditions(place.id, activity);
  const score = conditionScore(conditions.data);
  const grade = gradeOf(score);
  return (
    <div className="td-spot" data-grade={grade.key}>
      <span className="pd-dk-num td-spot-score">
        {isInitialLoad(conditions) ? (
          <Skeleton width="1.6em" label="점수 조회 중" />
        ) : (
          (score ?? "–")
        )}
      </span>
      <span className="td-spot-grade">
        <GradeIcon gradeKey={grade.key} size={13} />
        {grade.label}
      </span>
      <span className="td-spot-body">
        <span className="td-spot-name">{place.name}</span>
        <span className="td-spot-address">{place.address ?? "주소 없음"}</span>
      </span>
      <span className="td-spot-bar">
        {/* 값이 없으면 막대를 그리지 않습니다 -- 폭 0 인 막대는 「0 점」과
            구별되지 않습니다. */}
        {score !== null && (
          <span
            className="td-spot-bar-fill"
            style={{ width: `${Math.max(2, (score / max) * 100)}%` }}
          />
        )}
      </span>
      <span className="pd-dk-num td-spot-temp">
        {metricText(conditions.data, "water_temperature")}
      </span>
    </div>
  );
}

function SpotComparison({
  rows,
  activity,
  status,
}: {
  rows: Place[];
  activity: Activity;
  status: string;
}) {
  const resolved = rows.filter((row) => row.type === "beach").slice(0, 3);
  return (
    <div>
      <div className="td-head">
        <span className="pd-dk-kick">
          지점 비교 · {activities[activity]} 점수
        </span>
        <StateChip kind={resolved.length ? "live" : "no_data"} />
        <a className="td-head-link" href="#map">
          전체 지도 →
        </a>
      </div>
      {resolved.map((place) => (
        <SpotRow key={place.id} place={place} activity={activity} max={100} />
      ))}
      {!resolved.length && <p className="td-note">{status}</p>}
      <p className="td-note">
        지점마다 자기 조건을 따로 조회합니다. 막대는 100점 만점 대비 위치이며
        기여도가 아닙니다. 값이 없으면 –이고 0점이 아닙니다.
      </p>
    </div>
  );
}

/** 활동 한 칸. 여섯 활동을 고정 순서로 조회합니다(훅 순서 규칙). */
function ActivityCell({
  id,
  activity,
  mascot,
}: {
  id?: number;
  activity: Activity;
  mascot: string;
}) {
  const conditions = useConditions(id, activity);
  const score = conditionScore(conditions.data);
  const grade = gradeOf(score);
  return (
    <div className="td-activity" data-grade={grade.key}>
      <img src={mascotUrl(mascot as never)} alt="" width={78} height={78} />
      <div className="pd-dk-num td-activity-score">
        {isInitialLoad(conditions) ? (
          <Skeleton width="1.6em" label="점수 조회 중" />
        ) : (
          (score ?? "–")
        )}
      </div>
      <div className="td-activity-name">{activities[activity]}</div>
      <div className="td-activity-grade">
        <GradeIcon gradeKey={grade.key} size={11} />
        {grade.label}
      </div>
    </div>
  );
}

function ActivityScores({ id, placeName }: { id?: number; placeName: string }) {
  return (
    <div>
      <div className="pd-dk-kick">활동별 점수 · {placeName}</div>
      <div className="td-activities">
        {ACTIVITY_ROWS.map((row) => (
          <ActivityCell
            key={row.id}
            id={id}
            activity={row.id}
            mascot={row.mascot}
          />
        ))}
      </div>
      <p className="td-note">
        활동마다 보는 조건이 다릅니다. 지원하지 않는 활동은 –이며 0점이
        아닙니다.
      </p>
    </div>
  );
}

function WeekForecast({
  id,
  now,
  activity,
}: {
  id?: number;
  now: string;
  activity: Activity;
}) {
  const days = useConditionDays(id, now, activity);
  const max = Math.max(
    ...days.flatMap((day) => (day.score === null ? [] : [day.score])),
    1,
  );
  return (
    <section className="td-section">
      <div className="td-head">
        <span className="pd-dk-kick">
          이번 주 {activities[activity]} 예보
        </span>
        <span className="td-head-note">
          값이 없는 날은 «–»이며 0점이 아닙니다 · 막대는 주간 내 상대 위치
        </span>
      </div>
      <div className="td-week">
        {days.map((day) => {
          const grade = gradeOf(day.score);
          return (
            <div className="td-day" data-grade={grade.key} key={day.at}>
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
                      : { height: Math.max(4, (day.score / max) * 62) }
                  }
                />
              </div>
              <div className="td-day-weekday">{day.weekday}</div>
              <div className="pd-dk-num td-day-date">{day.dateLabel}</div>
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

/** 활동별 공식 운영 시간대. 모바일 오늘 탭의 OperatingRow 와 같은 계약입니다. */
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
    <div className={"td-tide-row" + (active ? "" : " is-unfit")}>
      <Icon name={activity.icon} size={22} />
      <b className="td-tide-name">{activity.name}</b>
      <span className="td-tide-reason" title={active?.scope}>
        {windows.error
          ? "조회 실패"
          : active
            ? `${timeLabel(active.start_at)}–${timeLabel(active.end_at)}`
            : "운영정보 없음"}
      </span>
      <span className="td-tide-fit">{active ? "공식 운영" : "확인 필요"}</span>
    </div>
  );
}

export function TodayDesktop() {
  const { now, place, places, conditions, best, recommendation, displayName, selectionMessage } =
    useProductData("best");
  const { tides, quality } = useTodayData(place?.id, now);
  // 지점 비교 · 주간 예보는 홈에서 고른 활동을 따라갑니다. 위에 크게 뜬 점수와
  // 다른 기준의 막대를 그리지 않기 위해서입니다.
  const activity: Activity = best?.activity ?? "swim";
  const event = tides.data?.next_high ?? tides.data?.next_low;

  return (
    <DesktopShell>
      <TodayHero
        placeName={displayName}
        conditions={conditions.data}
        best={best}
        recommendation={recommendation.data}
        recommendationLoading={isInitialLoad(recommendation)}
        quality={quality.error ? "조회 실패" : waterQualityLabel(quality.data)}
        qualityLoading={isInitialLoad(quality)}
        loading={isInitialLoad(conditions)}
      />

      <section className="td-section td-compare">
        <SpotComparison
          rows={places.data?.rows ?? []}
          activity={activity}
          status={places.error ?? selectionMessage}
        />
        <ActivityScores id={place?.id} placeName={displayName} />
      </section>

      {/* 점수를 이루는 항목들. 모바일 「오늘 한눈에」와 같은 구성입니다. */}
      <LabelRow
        kick="점수 근거"
        title={`${activities[activity]} 점수를 이루는 것들`}
        chip={<StateChip kind={conditions.data ? "live" : "no_data"} />}
        desc="각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다. 값이 없는 항목은 –이며 0점이 아닙니다."
      >
        <ComponentBars
          bars={componentBars(conditions.data)}
          loading={isInitialLoad(conditions)}
        />
        <ScoreReason
          text={scoreReason(conditions.data).text}
          loading={isInitialLoad(conditions)}
        />
      </LabelRow>

      <WeekForecast id={place?.id} now={now} activity={activity} />

      <LabelRow
        kick="물때"
        title={
          <>
            간조 {timeLabel(tides.data?.next_low?.event_at)}
            <br />
            만조 {timeLabel(tides.data?.next_high?.event_at)}
          </>
        }
        chip={<StateChip kind={tides.data?.rows.length ? "live" : "no_data"} />}
        desc="공식 조석 예측의 간조·만조 시각입니다. 사건 시각만으로 현재 조류나 활동 적합 여부를 판단하지 않습니다."
      >
        <div className="td-tide-state">
          <span className="td-tide-chip is-now">
            간조 {timeLabel(tides.data?.next_low?.event_at)}
          </span>
          <span className="td-tide-arrow">→</span>
          <span className="td-tide-chip">
            만조 {timeLabel(tides.data?.next_high?.event_at)}
          </span>
          <span className="pd-dk-num td-tide-level">
            {tides.data?.next_high?.height ?? "–"}
            {tides.data?.next_high?.unit ?? ""}
          </span>
          <span className="td-tide-level-name">다음 만조 높이</span>
        </div>
        {/* 예전에는 여기 손으로 그린 조위 곡선 SVG 가 있었습니다(x=337 이
            간조인 그림). 실제 조위 시계열을 내려주는 API 가 없어 다시 그릴 수
            없으므로, 그림 대신 위 수치와 아래 운영 시간대만 둡니다. */}
        <div className="td-tide-lists">
          <div>
            <div className="td-tide-head">
              <b>활동별 공식 운영 시간대</b>
              <span className="td-tide-when">조위 조건만 기준</span>
            </div>
            {TIDE_ACTIVITIES.map((item) => (
              <OperatingRow
                key={item.name}
                activity={item}
                id={place?.id}
                now={now}
              />
            ))}
          </div>
        </div>
        <p className="td-note" role={tides.error ? "alert" : "status"}>
          {tides.error}{" "}
          {event?.station_name &&
            `${event.spatial_relation === "nearby_station_context" ? "주변" : "관측소"} ${event.station_name}${typeof event.distance_km === "number" ? ` ${event.distance_km.toFixed(1)}km` : ""} · ${event.provider}. `}
          {dataStatusText(tides.data?.status)} 물때 조건만 기준이며 점수 · 안전
          판정과 다른 값입니다.
        </p>
      </LabelRow>

      <LabelRow
        kick="수질"
        title="최근 검사"
        chip={<StateChip kind={quality.data ? "live" : "no_data"} />}
        desc="수질은 점수에 들어가지 않습니다. 물놀이 조건 점수와 다른 값이라 하나로 요약하지 않습니다."
      >
        <SplitBody columns="1fr 1.35fr">
          <div className="td-first-swim">
            <div className="td-first-head">
              <img src={mascotUrl("firstSwim")} alt="" width={58} height={58} />
              <div>
                <div className="td-first-date">
                  {quality.error
                    ? "조회 실패"
                    : waterQualityLabel(quality.data)}
                </div>
                <div className="td-first-note">
                  검사 기관이 공표한 등급입니다.
                </div>
              </div>
            </div>
          </div>
          <WaterQualityDetails
            data={quality.data}
            error={quality.error}
            className="td-note"
          />
        </SplitBody>
      </LabelRow>

      {/* 예전에는 「올해 첫 입수 5월 18일 · 작년보다 6일 늦음」과 연도별 막대
          세 개가 상수였습니다. 관측 이력이 그것을 입증하지 않습니다 -- 모바일은
          같은 이유로 이미 구독 상태만 보여 주고 있었습니다. 데스크탑에서는
          그 자리를 없애고 알림 화면으로 보냅니다. */}
      <FootNote
        missing="조위 시계열 · 첫 입수 알림 트리거 · 명소 대표 이미지"
        note="점수는 물놀이 조건 참고값이며 안전 판정이 아닙니다. 값이 없으면 «–» 로 두며 0 점 · 정상 · 안전으로 치환하지 않습니다. NULL · unknown 은 안전한 상태를 뜻하지 않습니다."
      />
    </DesktopShell>
  );
}
