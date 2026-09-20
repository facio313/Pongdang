import { ProductPlaceSelector } from "./ProductPlaceSelector";
import { t } from "./i18n.ts";
import { gradeOf } from "./groupAGrade";
import { mascotUrl } from "./mascots";
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
import { activityHeadline, missingChoiceHeadline } from "./recommendationText";
import type { Recommendation } from "./recommendationApi";
import {
  conditionScore,
  conditionModeLabel,
  dataStatusText,
  dateLabel,
  metricText,
  periodPath,
  scoreCoverageText,
  tideTimeLabel,
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
  baseline,
  baselineLoading = false,
  placeRequired = false,
  baselineError,
  best,
  recommendation,
  recommendationLoading = false,
  recommendationError,
  quality,
  qualityLoading = false,
  loading = false,
}: {
  placeName: string;
  conditions?: Conditions;
  baseline?: Conditions;
  baselineLoading?: boolean;
  placeRequired?: boolean;
  baselineError?: string;
  /** 서버가 고른 활동과 그 근거. 히어로의 근거 줄이 이것을 읽습니다. */
  recommendation?: Recommendation;
  recommendationLoading?: boolean;
  recommendationError?: string;
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
      mascot="surf"
    >
      <div className="td-hero">
        <div className="td-hero-lead">
          <ProductPlaceSelector placeName={placeName} />
          <div className="pd-dk-kick td-hero-kick">
            {best ? scoreTitle(best.activity) : t("오늘의 판정")}
          </div>
          {/* 조사(이/가)를 붙이지 않으려고 활동 이름을 줄로 떼어 둡니다. */}
          <h1 className="td-hero-title">
            {loading ? (
              <Skeleton width="8em" glass label={t("오늘의 활동 조회 중")} />
            ) : placeRequired ? t("기준 장소를 선택해 주세요.") : best ? (
              <>
                {t("오늘 가장 좋은 활동")}<br />
                {activityHeadline(best.activity)}
              </>
            ) : (
              // 조회 실패를 「할 게 없다」로 바꾸지 않습니다.
              <>
                {missingChoiceHeadline(recommendationError, true)[0]}
                <br />
                {missingChoiceHeadline(recommendationError, true)[1]}
              </>
            )}
          </h1>
          {verdict && <span className="td-hero-chip">{verdict}</span>}
          {/* 왜 이 활동인가 · 왜 저것이 아닌가 · 지금 물때 · 대신 갈 곳.
              결론(제목) 바로 밑입니다 -- 근거는 결론을 읽은 자리에서 이어
              읽혀야 합니다. 아래로 내려 두면 점수 · 관측 타일을 지나서야
              나오고, 그 사이의 숫자들이 근거인 것처럼 읽혔습니다. */}
          <RecommendationReason
            data={recommendation}
            error={recommendationError}
            loading={recommendationLoading}
            glass
            className="td-hero-why"
          />
        </div>
        <div className="td-hero-score">
          <div className="pd-dk-num td-hero-score-num">
            {loading ? (
              <Skeleton width="1.6em" glass label={t("점수 조회 중")} />
            ) : (
              (score ?? "–")
            )}
          </div>
          <div className="td-hero-score-grade">
            <GradeIcon gradeKey={grade.key} size={14} />
            {t(grade.label)}
          </div>
          {score !== null && scoreCoverageText(conditions) && (
            <div className="td-tile-name td-score-coverage">{scoreCoverageText(conditions)}</div>
          )}
          <ScoreGauge score={score} loading={loading} glass compact />
        </div>
        <div className="td-hero-tiles">
          {/* 예전에는 이 네 칸이 「맑음 · 0.6m · 22.1°C · –」 상수였습니다. */}
          <div className="td-tile">
            <Icon name="wave" size={18} />
            <div className="pd-dk-num td-tile-value">
              {baselineLoading ? <Skeleton width="2.6em" glass label={t("장소 파고 조회 중")} />
                : baselineError ? t("조회 실패") : metricText(baseline, "wave_height")}
            </div>
            <div className="td-tile-name">{t("파고")}</div>
          </div>
          <div className="td-tile">
            <Icon name="thermometer" size={18} />
            <div className="pd-dk-num td-tile-value">
              {baselineLoading ? <Skeleton width="2.6em" glass label={t("장소 수온 조회 중")} />
                : baselineError ? t("조회 실패") : metricText(baseline, "water_temperature")}
            </div>
            <div className="td-tile-name">{t("수온")}</div>
          </div>
          <div className="td-tile">
            <Icon name="sun" size={18} />
            <div className="pd-dk-num td-tile-value">
              {baselineLoading ? <Skeleton width="2.6em" glass label={t("장소 기온 조회 중")} />
                : baselineError ? t("조회 실패") : metricText(baseline, "air_temperature")}
            </div>
            <div className="td-tile-name">{t("기온")}</div>
          </div>
          <div className="td-tile">
            <Icon name="quality" size={18} />
            <div className="pd-dk-num td-tile-value">
              {qualityLoading ? <Skeleton width="2.6em" glass /> : quality}
            </div>
            {/* 수질은 점수에 들어가지 않습니다. 점수 옆에 그냥 두면 근거로
                읽히므로 그 사실을 함께 적습니다. */}
            <div className="td-tile-name">{t("수질 · 점수 미반영")}</div>
          </div>
        </div>
      </div>
      <p className="td-tile-name" role={baselineError ? "alert" : "status"}>
        {t("장소 {mode} · 활동 점수 입력과 별도.", { mode: conditionModeLabel(baseline) })}{" "}{baselineError
          ? baselineError
          : baselineLoading ? t("장소 자료를 조회하고 있습니다.")
          : baseline ? t("–는 해당 자료가 없다는 뜻입니다.") : t("장소 자료 없음.")}
      </p>
      {/* 근거 「데이터」만 남은 자리입니다 -- 관측 요약 한 줄과, 접힌 「근거
          보기」 · 「퐁당 점수란?」 두 손잡이. 출처 · 격자 번호 · 방법론 · 면책
          전문은 한 글자도 지우지 않고 그 안에 그대로 있습니다. 펴지 않은
          상태에서 두 줄을 넘기지 않습니다 -- 사용자가 결론을 읽는 데 쓰는
          정보가 아니라, 따져 보려는 사람이 펴 보는 자료이기 때문입니다. */}
      <div className="td-hero-evidence">
        <EvidenceNote
          data={conditions}
          className="td-hero-note"
          glass
          extra={<ScoreExplainer data={conditions} />}
        />
      </div>
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
          <Skeleton width="1.6em" label={t("점수 조회 중")} />
        ) : (
          (score ?? "–")
        )}
      </span>
      <span className="td-spot-grade">
        <GradeIcon gradeKey={grade.key} size={13} />
        {t(grade.label)}
      </span>
      <span className="td-spot-body">
        <span className="td-spot-name">{place.name}</span>
        <span className="td-spot-address">{place.address ?? t("주소 없음")}</span>
        {score !== null && <small className="td-score-coverage">{scoreCoverageText(conditions.data)}</small>}
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
  statusIsError,
}: {
  rows: Place[];
  activity: Activity;
  status: string;
  statusIsError?: boolean;
}) {
  const resolved = rows.filter((row) => row.type === "beach").slice(0, 3);
  return (
    <div>
      <div className="td-head">
        <span className="pd-dk-kick">
          {t("지점 비교 · {activity} 점수", { activity: t(activities[activity]) })}</span>
        <StateChip kind={resolved.length ? "live" : "no_data"} />
        <a className="td-head-link" href="#map">
          {t("전체 지도 →")}</a>
      </div>
      {resolved.map((place) => (
        <SpotRow key={place.id} place={place} activity={activity} max={100} />
      ))}
      {!resolved.length && (
        <p className="td-note" role={statusIsError ? "alert" : "status"}>
          {status}
        </p>
      )}
      <p className="td-note">
        {t("지점마다 자기 조건을 따로 조회합니다. 막대는 100점 만점 대비 위치이며 기여도가 아닙니다. 값이 없으면 –이고 0점이 아닙니다.")}</p>
    </div>
  );
}

/** 활동 한 칸. 점수는 추천이 판단에 쓴 조건 응답에서 옵니다 -- 활동마다 따로
 *  묻지 않습니다(useBestActivity 의 all). */
function ActivityCell({
  state,
  activity,
  mascot,
}: {
  state?: ActivityCondition;
  activity: Activity;
  mascot: string;
}) {
  const score = state?.score ?? null;
  const grade = gradeOf(score);
  return (
    <div className="td-activity" data-grade={grade.key}>
      <img src={mascotUrl(mascot as never)} alt="" width={78} height={78} />
      <div className="pd-dk-num td-activity-score">
        {state && isInitialLoad(state) ? (
          <Skeleton width="1.6em" label={t("점수 조회 중")} />
        ) : (
          (score ?? "–")
        )}
      </div>
      {score !== null && scoreCoverageText(state?.data) && (
        <div className="td-score-coverage"><small>{scoreCoverageText(state?.data)}</small></div>
      )}
      <div className="td-activity-name">{t(activities[activity])}</div>
      <div className="td-activity-grade">
        <GradeIcon gradeKey={grade.key} size={11} />
        {state?.eligibility ?? t(grade.label)}
      </div>
    </div>
  );
}

function ActivityScores({
  states,
  placeName,
}: {
  states: ActivityCondition[];
  placeName: string;
}) {
  // 한 번의 조회이므로 오류도 하나입니다.
  const error = states.find((state) => state.error)?.error;
  return (
    <div>
      <div className="pd-dk-kick">{t("활동별 점수 · {place}", { place: placeName })}</div>
      <div className="td-activities">
        {/* 짝은 활동 id 로 맞춥니다. 인덱스로 맞추면 후보가 바뀐 날 옆 활동의
            점수가 들어갑니다(모바일 오늘 탭에서 실제로 그랬습니다). */}
        {ACTIVITY_ROWS.map((row) => (
          <ActivityCell
            key={row.id}
            state={states.find((state) => state.activity === row.id)}
            activity={row.id}
            mascot={row.mascot}
          />
        ))}
      </div>
      {error && (
        <p className="td-note" role="alert">
          {error}
        </p>
      )}
      <p className="td-note">
        {t("활동마다 보는 조건이 다릅니다. 지원하지 않는 활동은 –이며 0점이 아닙니다.")}</p>
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
  const errors = [...new Set(days.flatMap((day) => day.error ? [day.error] : []))];
  const max = Math.max(
    ...days.flatMap((day) => (day.score === null ? [] : [day.score])),
    1,
  );
  return (
    <section className="td-section" aria-label={t("이번 주 예보")}>
      <div className="td-head">
        <span className="pd-dk-kick">
          {t("이번 주 {activity} 예보", { activity: t(activities[activity]) })}</span>
        <span className="td-head-note">
          {t("값이 없는 날은 «–»이며 0점이 아닙니다 · 막대는 주간 내 상대 위치")}</span>
      </div>
      <div className="td-week">
        {days.map((day) => {
          const grade = gradeOf(day.score);
          return (
            <div className="td-day" data-grade={grade.key} key={day.at}>
              <div className="pd-dk-num td-day-score">
                {day.loading ? <Skeleton width="1.6em" label={t("예보 조회 중")} /> : (day.score ?? "–")}
              </div>
              {day.score !== null && scoreCoverageText(day.data) && (
                <div className="td-score-coverage"><small>{scoreCoverageText(day.data)}</small></div>
              )}
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
                {day.loading ? t("조회 중") : day.error ? t("조회 실패") : t(grade.label)}
              </div>
            </div>
          );
        })}
      </div>
      {errors.length > 0 && <p className="td-note" role="alert">{t("예보 조회 실패: {error}", { error: errors.map((error) => t(error)).join(" · ") })}</p>}
      <p className="td-note">
        {t("날짜별 12:00 KST에 유효한 수집 예보로 계산합니다. 일부 근거만 있는 날짜는 부분 점수이며, 해당 시각의 근거가 없으면 –입니다. 안전 판정은 별도입니다.")}</p>
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
      <b className="td-tide-name">{t(activity.name)}</b>
      <span className="td-tide-reason" title={active?.scope}>
        {windows.error
          ? t("조회 실패")
          : active
            ? `${tideTimeLabel(active.start_at)}–${tideTimeLabel(active.end_at)}`
            : t("운영정보 없음")}
      </span>
      <span className="td-tide-fit">{active ? t("공식 운영") : t("확인 필요")}</span>
    </div>
  );
}

export function TodayDesktop() {
  const {
    now, place, places, conditions, baseline, activities: activityStates, best,
    recommendation, displayName, selectionMessage, placeSettled, placeRequired,
  } = useProductData("best");
  const { tides, quality } = useTodayData(place?.id, now, placeSettled);
  // 지점 비교 · 주간 예보는 홈에서 고른 활동을 따라갑니다. 위에 크게 뜬 점수와
  // 다른 기준의 막대를 그리지 않기 위해서입니다.
  const activity: Activity = best?.activity ?? "swim";
  const event = tides.data?.next_high ?? tides.data?.next_low;

  return (
    <DesktopShell>
      <TodayHero
        placeName={displayName}
        placeRequired={placeRequired}
        conditions={conditions.data}
        baseline={baseline.data}
        baselineLoading={isInitialLoad(baseline)}
        baselineError={baseline.error}
        best={best}
        recommendation={recommendation.data}
        recommendationLoading={isInitialLoad(recommendation)}
        recommendationError={recommendation.error}
        quality={quality.error ? t("조회 실패") : waterQualityLabel(quality.data)}
        qualityLoading={isInitialLoad(quality)}
        loading={isInitialLoad(conditions)}
      />

      <section className="td-section td-compare">
        <SpotComparison
          rows={places.data?.rows ?? []}
          activity={activity}
          status={places.error ?? selectionMessage}
          statusIsError={Boolean(places.error)}
        />
        <ActivityScores states={activityStates} placeName={displayName} />
      </section>

      {/* 점수를 이루는 항목들. 모바일 「오늘 한눈에」와 같은 구성입니다. */}
      <LabelRow
        kick={t("점수 근거")}
        title={t("{activity} 점수를 이루는 것들", { activity: t(activities[activity]) })}
        chip={<StateChip kind={conditions.data ? "live" : "no_data"} />}
        desc={t("각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다. 값이 없는 항목은 –이며 0점이 아닙니다.")}
      >
        <ComponentBars
          bars={componentBars(conditions.data)}
          loading={isInitialLoad(conditions)}
        />
        <ScoreReason
          text={scoreReason(conditions.data).text}
          loading={isInitialLoad(conditions)}
        />
        {/* 조건 조회 실패는 이 화면 어디에도 나타나지 않았습니다. 항목 막대가
            빈 채로 서 있으면 「자료가 없는 날」로 읽히는데, 못 읽은 것과 없는
            것은 다른 사실입니다. */}
        {conditions.error && (
          <p className="td-note" role="alert">
            {conditions.error}
          </p>
        )}
      </LabelRow>

      <WeekForecast id={place?.id} now={now} activity={activity} />

      <LabelRow
        kick={t("물때")}
        title={
          <>
            {t("간조")} {" "}{tideTimeLabel(tides.data?.next_low?.event_at)}
            <br />
            {t("만조")} {" "}{tideTimeLabel(tides.data?.next_high?.event_at)}
          </>
        }
        chip={<StateChip kind={tides.data?.rows.length ? "live" : "no_data"} />}
        desc={t("공식 조석 예측의 간조·만조 시각입니다. 사건 시각만으로 현재 조류나 활동 적합 여부를 판단하지 않습니다.")}
      >
        <div className="td-tide-state">
          <span className="td-tide-chip is-now">
            {t("간조")} {" "}{tideTimeLabel(tides.data?.next_low?.event_at)}
          </span>
          <span className="td-tide-arrow">→</span>
          <span className="td-tide-chip">
            {t("만조")} {" "}{tideTimeLabel(tides.data?.next_high?.event_at)}
          </span>
          <span className="pd-dk-num td-tide-level">
            {tides.data?.next_high?.height ?? "–"}
            {tides.data?.next_high?.unit ?? ""}
          </span>
          <span className="td-tide-level-name">{t("다음 만조 높이")}</span>
        </div>
        {/* 예전에는 여기 손으로 그린 조위 곡선 SVG 가 있었습니다(x=337 이
            간조인 그림). 실제 조위 시계열을 내려주는 API 가 없어 다시 그릴 수
            없으므로, 그림 대신 위 수치와 아래 운영 시간대만 둡니다. */}
        <div className="td-tide-lists">
          <div>
            <div className="td-tide-head">
              <b>{t("활동별 공식 운영 시간대")}</b>
              <span className="td-tide-when">{t("조위 조건만 기준")}</span>
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
            `${event.spatial_relation === "nearby_station_context" ? t("주변") : t("관측소")} ${event.station_name}${typeof event.distance_km === "number" ? ` ${event.distance_km.toFixed(1)}km` : ""} · ${event.provider}. `}
          {dataStatusText(tides.data?.status)} {t("물때 조건만 기준이며 점수 · 안전 판정과 다른 값입니다.")}</p>
      </LabelRow>

      <LabelRow
        kick={t("수질")}
        title={t("최근 검사")}
        chip={<StateChip kind={quality.data ? "live" : "no_data"} />}
        desc={t("수질은 점수에 들어가지 않습니다. 물놀이 조건 점수와 다른 값이라 하나로 요약하지 않습니다.")}
      >
        <SplitBody columns="1fr 1.35fr">
          <div className="td-first-swim">
            <div className="td-first-head">
              <img src={mascotUrl("firstSwim")} alt="" width={58} height={58} />
              <div>
                <div className="td-first-date">
                  {quality.error
                    ? t("조회 실패")
                    : waterQualityLabel(quality.data)}
                </div>
                <div className="td-first-note">
                  {t("검사 기관이 공표한 등급입니다.")}</div>
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
        missing={t("조위 시계열 · 첫 입수 알림 트리거")}
        note={t("점수는 물놀이 조건 참고값이며 안전 판정이 아닙니다. 값이 없으면 «–» 로 두며 0 점 · 정상 · 안전으로 치환하지 않습니다. NULL · unknown 은 안전한 상태를 뜻하지 않습니다.")}
      />
    </DesktopShell>
  );
}
