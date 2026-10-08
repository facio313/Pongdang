import { ProductPlacePopover } from "./ProductPlaceSelector";
import { t } from "./i18n.ts";
import { gradeOf } from "./groupAGrade";
import { activityMascot, type MascotRole } from "./mascots";
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
  Mascot,
  ScoreExplainer,
  ScoreGauge,
  ScoreReason,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { EvidenceNote } from "./EvidenceNote";
import { WaterQualityDetails } from "./WaterQualityDetails";
import { NotificationSummary } from "./NotificationSummary";
import { activities, displayTime, type Activity } from "./aiApi";
import { placeDetailsMissingText, placeOperatingSchedule } from "./placeDetails";
import { usePlaceDetails } from "./usePlaceDetails";
import { componentBars, scoreReason, verdictOf } from "./scoreMeaning";
import { RecommendationReason } from "./RecommendationReason";
import { activityHeadline, missingChoiceHeadline } from "./recommendationText";
import type { Recommendation } from "./recommendationApi";
import {
  dataStatusText,
  dateLabel,
  timeLabel,
  metricText,
  placeRegionLabel,
  scoreCoverageText,
  tideTimeLabel,
  waterQualityLabel,
  type Conditions,
} from "./productData";
import { isInitialLoad } from "./useResource";
import { useProductData, useTodayData } from "./useProductData";
import { useComparisonPlaces } from "./useComparisonPlaces";
import type { ComparisonPlace } from "./comparisonPlaces";
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
/** 포즈는 여기서 들고 있지 않습니다 -- activityMascot(mascots.ts)이 단일
 *  출처이고, 모바일 「오늘」도 같은 표를 씁니다. */
const ACTIVITY_ROWS = [
  { id: "swim" },
  { id: "surf" },
  { id: "relax" },
  { id: "walk" },
  { id: "onsen" },
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
  const displayedConditions = best?.data ?? baseline;
  const at = displayedConditions?.projection?.computed_at ?? displayedConditions?.retained_at ?? displayedConditions?.at;
  return (
    <DesktopHero
      nav={
        <DesktopNav
          active="today"
          context={<div className="td-place-context">
            <ProductPlacePopover placeName={placeName} />
            <span aria-hidden="true">·</span>
            <time dateTime={at}>{at ? `${dateLabel(at)} ${timeLabel(at)}` : "–"}</time>
          </div>}
        />
      }
      wave="animated"
      /* 서버가 고른 활동의 표지입니다. "surf" 로 되돌리면 이 화면만 서버와
         다른 활동을 그립니다. 조회 전 한 프레임 lying.png 가 보이는 것은
         의도입니다 -- home(surfwave)은 홈 히어로의 포즈이므로 빌려 쓰지
         않습니다. undefined 로 두면 has-mascot 패딩이 빠져 본문이 밀립니다. */
      mascot={best ? activityMascot(best.activity) : "empty"}
    >
      <div className="td-hero">
        <div className="td-hero-lead">
          {/* 조사(이/가)를 붙이지 않으려고 활동 이름을 줄로 떼어 둡니다. */}
          <h1 className="td-hero-title">
            {loading ? (
              <Skeleton width="8em" glass label={t("오늘의 활동 조회 중")} />
            ) : placeRequired ? t("기준 장소를 선택해 주세요.") : best ? (
              <>
                <span className="td-hero-title-label">{t("오늘 가장 좋은 활동")}</span>{" "}
                <span className="td-hero-title-activity">{activityHeadline(best.activity, recommendation)}</span>
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
      {/* 요약 줄은 숨기고 기존 근거 보기·점수 설명은 그대로 둡니다. */}
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

/** 지점 한 줄. 모바일과 같은 필터 결과를 추가 조회 없이 표시합니다. */
function SpotRow({
  place,
  max,
}: {
  place: ComparisonPlace;
  max: number;
}) {
  const score = place.score;
  const grade = gradeOf(score);
  return (
    <div className="td-spot" data-grade={grade.key}>
      <span className="pd-dk-num td-spot-score">
        {place.loading ? (
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
        <span className="td-spot-address">{placeRegionLabel(place)} · {place.address ?? t("주소 없음")}</span>
        {score !== null && <small className="td-score-coverage">{scoreCoverageText(place.conditions)}</small>}
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
        {place.waterTemperature}
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
  rows: ComparisonPlace[];
  activity: Activity;
  status: string;
  statusIsError?: boolean;
}) {
  const resolved = rows;
  return (
    <div>
      <div className="td-head">
        <span className="pd-dk-kick">
          {t("다른 지역 비교 · {activity} 점수", { activity: t(activities[activity]) })}</span>
        <StateChip kind={resolved.length ? "live" : "no_data"} />
        <a className="td-head-link" href="#map">
          {t("전체 지도 →")}</a>
      </div>
      {resolved.map((place) => (
        <SpotRow key={place.id} place={place} max={100} />
      ))}
      {status && (
        <p className="td-note" role={statusIsError ? "alert" : "status"}>
          {status}
        </p>
      )}
      {resolved.some((place) => place.conditions?.condition_score?.status === "partial") &&
        <p className="td-note">{t("장소마다 들어온 측정값이 달라, 점수만으로 어디가 더 좋은지 견주기 어렵습니다.")}</p>}
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
  mascot: MascotRole;
}) {
  const score = state?.score ?? null;
  const grade = gradeOf(score);
  return (
    <div className="td-activity" data-grade={grade.key}>
      <Mascot role={mascot} size={78} />
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
            mascot={activityMascot(row.id)}
          />
        ))}
      </div>
      {error && (
        <p className="td-note" role="alert">
          {error}
        </p>
      )}

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
  const waitingDates = days.filter((day) => day.awaitingForecast && !day.error).map((day) => day.dateLabel);
  const max = Math.max(
    ...days.flatMap((day) => (day.score === null ? [] : [day.score])),
    1,
  );
  return (
    <section className="td-section" aria-label={t("이번 주 예보")}>
      <div className="td-head">
        <span className="pd-dk-kick">
          {t("이번 주 {activity} 예보", { activity: t(activities[activity]) })}</span>
        <span className="td-head-note">{t("막대는 주간 내 상대 위치")}</span>
      </div>
      <div className="td-week">
        {days.map((day) => {
          const grade = gradeOf(day.score);
          return (
            <div className="td-day" data-grade={grade.key} key={day.at}>
              <div className="pd-dk-num td-day-score">
                {day.loading ? <Skeleton width="1.6em" label={t("예보 조회 중")} /> : day.awaitingForecast ? t("대기") : (day.score ?? "–")}
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
                {day.loading ? t("조회 중") : day.error ? t("조회 실패") : day.awaitingForecast ? t("예보 자료 대기") : t(grade.label)}
              </div>
            </div>
          );
        })}
      </div>
      {errors.length > 0 && <p className="td-note" role="alert">{t("예보 조회 실패: {error}", { error: errors.map((error) => t(error)).join(" · ") })}</p>}
      {waitingDates.length > 0 && <p className="td-note" role="status">{waitingDates.join(" · ")} · {t("해당 날짜의 예보 자료를 아직 받지 못했습니다. 자료가 수집되면 점수를 표시합니다.")}</p>}
      <p className="td-note">
        {t("날짜별 낮 12시 예보로 계산합니다. 측정값이 일부만 들어온 날은 그만큼만 평가하고, 그 시각 자료가 없으면 –입니다. 안전 판정은 별도입니다.")}</p>
    </section>
  );
}

export function TodayDesktop() {
  const {
    now, place, conditions, baseline, activities: activityStates, best,
    recommendation, displayName, selectionMessage, placeSettled, placeRequired,
  } = useProductData("best");
  const { tides, quality } = useTodayData(place?.id, now, placeSettled);
  const placeDetails = usePlaceDetails(place ? [place.id] : []);
  const detail = place ? placeDetails.byId.get(place.id) : undefined;
  const schedule = placeOperatingSchedule(detail, place?.type);
  // 지점 비교 · 주간 예보는 홈에서 고른 활동을 따라갑니다. 위에 크게 뜬 점수와
  // 다른 기준의 막대를 그리지 않기 위해서입니다.
  const activity: Activity = best?.activity ?? "swim";
  const comparison = useComparisonPlaces(place, activity, conditions.data, isInitialLoad(conditions));
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
          rows={comparison.rows}
          activity={activity}
          status={comparison.status ?? selectionMessage}
          statusIsError={Boolean(comparison.error)}
        />
        <ActivityScores states={activityStates} placeName={displayName} />
      </section>

      {/* 점수를 이루는 항목들. 모바일 「오늘 한눈에」와 같은 구성입니다. */}
      <LabelRow
        kick={t("점수 근거")}
        title={t("{activity} 점수를 이루는 것들", { activity: t(activities[activity]) })}
        chip={<StateChip kind={conditions.data ? "live" : "no_data"} />}
        desc={t("각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다.")}
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
        title={t("다음 간조·만조")}
        chip={<StateChip kind={tides.data?.rows.length ? "live" : "no_data"} />}
        desc={t("공식 조석 예측의 간조·만조 시각입니다.")}
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
        <div className="td-tide-lists td-operating-hours" aria-label={t("운영시간 안내")}>
          <div>
            <div className="td-tide-head">
              <b>{t("운영시간 안내")}</b>
            </div>

            <div className={"td-tide-row td-place-hours" + (schedule.length ? "" : " is-unfit")}>
              <Icon name="pin" size={22} />
              <b className="td-tide-name">{place?.name ?? t("기본 안내")}</b>
              <div className="td-tide-reason" role={placeDetails.error ? "alert" : undefined}>
                {schedule.length ? schedule.map((row, index) => <div key={`${row.label}-${index}`}>
                  <span className="td-hours-label">{t(row.label)}</span>{t(row.value)}
                </div>) : placeDetails.loading ? t("조회 중") : placeDetails.error ? t("조회 실패") : t(placeDetailsMissingText(detail?.status))}
              </div>
              <span className="td-tide-fit" title={[
                detail?.provider && t("한국관광공사 관광 정보"),
                detail?.source_modified_at && t("원천 수정일: {date}", { date: displayTime(detail.source_modified_at) }),
                detail?.fetched_at && t("수집일: {date}", { date: displayTime(detail.fetched_at) }),
              ].filter(Boolean).join(" · ")}>
                {t(schedule.length && (detail?.refresh_failed || detail?.refresh_pending) ? "이전 안내" : "기본 안내")}
              </span>
            </div>
          </div>
        </div>
        <p className="td-note" role={tides.error ? "alert" : "status"}>
          {tides.error}{" "}
          {event?.station_name &&
            `${event.spatial_relation === "nearby_station_context" ? t("주변") : t("관측소")} ${event.station_name}${typeof event.distance_km === "number" ? ` ${event.distance_km.toFixed(1)}km` : ""}. `}
          {dataStatusText(tides.data?.status)} {t("물때 조건만 기준이며 점수 · 안전 판정과 다른 값입니다.")}</p>
      </LabelRow>

      <LabelRow
        kick={t("수질")}
        title={t("최근 검사")}
        chip={<StateChip kind={quality.data ? "live" : "no_data"} />}
      >
        <SplitBody columns="1fr 1.35fr">
          <div className="td-first-swim">
            <div className="td-first-head">
              <Mascot role="firstSwim" size={58} />
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

      <section className="pd-dk-row td-notifications" aria-label={t("첫 입수 · 수온 알림")}>
        <div className="pd-dk-row-label">
          <h2 className="pd-dk-row-title">{t("첫 입수 · 수온 알림")}</h2>
        </div>
        <div className="pd-dk-row-body">
          <NotificationSummary spotId={place?.id} appearance="desktop" loginPrompt />
        </div>
      </section>
      <FootNote
        missing={t("조위 시계열")}
        note={null}
      />
    </DesktopShell>
  );
}
