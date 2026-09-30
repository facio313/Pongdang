import { ProductPlaceSelector } from "./ProductPlaceSelector";
import { t } from "./i18n.ts";
import { useState } from "react";
import { DataOrigin } from "./DataOrigin";
import { TodayDesktop } from "./TodayDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { gradeOf } from "./groupAGrade";
import { isInitialLoad, useResource } from "./useResource";
import { useProductData, useTodayData } from "./useProductData";
import { TodayForecast } from "./TodayForecast";
import { useComparisonPlaces } from "./useComparisonPlaces";
import type { ComparisonPlace } from "./comparisonPlaces";
import { ConditionScoreDetails } from "./ConditionScoreDetails";
import { EvidenceNote } from "./EvidenceNote";
import { RecommendationReason } from "./RecommendationReason";
import { WaterQualityDetails } from "./WaterQualityDetails";
import { NotificationSummary } from "./NotificationSummary";
import type { ActivityCondition } from "./useBestActivity";
import type { Recommendation } from "./recommendationApi";
import { activities, displayTime, type Activity } from "./aiApi";
import { placeDetailsMissingText, placeOperatingSchedule } from "./placeDetails";
import { usePlaceDetails } from "./usePlaceDetails";
import { activityHeadline, missingChoiceHeadline } from "./recommendationText";
import { componentBars, scoreReason, scoreTitle } from "./scoreMeaning";
import {
  conditionPath,
  conditionModeLabel,
  periodPath,
  dateLabel,
  placeRegionLabel,
  timeLabel,
  scoreCoverageText,
  tideTimeLabel,
  evidenceText,
  waterQualityLabel,
  type Place,
  type Conditions,
  type TideResult,
  type WaterQualityGrade,
} from "./productData";
import {
  ComponentBars,
  GradeChip,
  GradeIcon,
  Icon,
  InfoPopover,
  Mascot,
  MetricValue,
  ScoreExplainer,
  ScoreReason,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { AppHeader, AppShell } from "./AppShell";
import { activityMascot } from "./mascots";
import "./todayPage.css";

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
      <h2 className="pd-lbl">
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
  { name: "래프팅", id: "rafting" },
  { name: "온천", id: "onsen" },
] as const;
const TIDE_ACTIVITIES = [
  { name: "래프팅", icon: "rafting", mascot: "rafting" },
  { name: "튜브 물놀이", icon: "tube", mascot: "tube" },
] as const;

function Hero({
  place,
  displayName,
  conditions,
  baseline,
  baselineLoading = false,
  placeRequired = false,
  baselineError,
  best,
  recommendation,
  recommendationLoading = false,
  recommendationError,
  loading = false,
  quality,
  qualityLoading = false,
}: {
  place?: Place;
  displayName: string;
  conditions?: Conditions;
  baseline?: Conditions;
  baselineLoading?: boolean;
  placeRequired?: boolean;
  baselineError?: string;
  /** 서버가 고른 오늘의 활동. 없으면 「고를 것이 없다」이거나 조회 실패입니다. */
  best?: ActivityCondition | null;
  recommendation?: Recommendation;
  recommendationLoading?: boolean;
  recommendationError?: string;
  /** 조건 조회 중. 「자료 없음」(–)과 구분해 그립니다. */
  loading?: boolean;
  quality: string;
  qualityLoading?: boolean;
}) {
  const heroScore = best?.score ?? null;
  return (
    <header className="pd-hero td-hero">
      <AppHeader
        title={placeRegionLabel(place, displayName.includes("경포") ? t("강릉") : t("선택 해수욕장"))}
        time={timeLabel(new Date().toISOString())}
        onCobalt
      />
      <div className="td-hero-inner">
        {/* 서버가 고른 오늘의 활동 표지입니다. 한 종목을 박아 두면 이 화면만
            서버와 다른 활동을 그립니다(퐁당 점수는 추천형입니다). 조회 전에는
            빈 상태 포즈로 두고, 홈 히어로의 포즈를 빌려 쓰지 않습니다. */}
        <Mascot
          className="pd-hero-mascot"
          role={best ? activityMascot(best.activity) : "empty"}
          size={66}
          label
          eager
        />
        <p className="pd-lbl">
          {t("{date} · {place} {mode} 기준", { date: dateLabel(), place: displayName, mode: conditionModeLabel(conditions) })}</p>
        <ProductPlaceSelector placeName={displayName} />
        <div className="td-hero-row">
          {/* 예전에는 「오늘의 수영 조건 / 자료를 확인하세요」 라는 상수
              문장이었습니다. 수영은 서버가 고른 활동이 아니라 화면이 박아 둔
              종목이었고, 그래서 이 탭만 홈과 다른 활동을 말할 수 있었습니다.
              조사(이/가)를 붙이지 않으려고 활동 이름을 줄로 뗍니다. */}
          <h1 className="td-hero-sentence">
            {recommendationLoading ? (
              <Skeleton width="7em" glass label={t("오늘의 활동 조회 중")} />
            ) : placeRequired ? t("기준 장소를 선택해 주세요.") : best ? (
              <>
                {t("오늘 가장 좋은 활동")}<br />
                <b>{activityHeadline(best.activity)}</b>
              </>
            ) : (
              // 조회 실패를 「할 게 없다」로 바꾸지 않습니다.
              <>
                {missingChoiceHeadline(recommendationError)[0]}
                <br />
                {missingChoiceHeadline(recommendationError)[1]}
              </>
            )}
          </h1>
          <div className="td-hero-score">
            <div className="pd-num td-hero-score-num">
              {loading ? (
                <Skeleton width="1.6em" glass label={t("점수 조회 중")} />
              ) : (
                (heroScore ?? "–")
              )}
            </div>
            {heroScore !== null && <div className="td-score-coverage">{scoreCoverageText(best?.data)}</div>}
            <GradeChip
              score={heroScore}
              prefix={best ? scoreTitle(best.activity) : undefined}
              loading={loading}
              glass
              bare
            />
          </div>
        </div>
        <p className="pd-note">{t("장소 {mode} · 활동 점수 입력과 별도", { mode: conditionModeLabel(baseline) })}</p>
        {baselineError && <p role="alert">{t("장소 자료 조회 실패: {error}", { error: t(baselineError) })}</p>}
        <div className="td-hero-tiles">
          <div className="td-tile">
            <Icon name="sun" size={17} className="td-tile-icon" />
            <div className="pd-num td-tile-value">
              <MetricValue
                conditions={baseline}
                name="air_temperature"
                loading={baselineLoading}
                glass
                width="2.6em"
              />
            </div>
            <div className="td-tile-name">{t("기온")}</div>
          </div>
          <div className="td-tile">
            <Icon name="wave" size={17} className="td-tile-icon" />
            <div className="pd-num td-tile-value">
              <MetricValue
                conditions={baseline}
                name="wave_height"
                loading={baselineLoading}
                glass
                width="2.6em"
              />
            </div>
            <div className="td-tile-name">{t("파고")}</div>
          </div>
          <div className="td-tile">
            <Icon name="thermometer" size={17} className="td-tile-icon" />
            <div className="pd-num td-tile-value">
              <MetricValue
                conditions={baseline}
                name="water_temperature"
                loading={baselineLoading}
                glass
                width="2.6em"
              />
            </div>
            <div className="td-tile-name">{t("수온")}</div>
          </div>
          {/* 조회 중은 「값 없음」이 아니므로 is-empty 를 붙이지 않습니다. */}
          <div className={"td-tile" + (qualityLoading ? "" : " is-empty")}>
            <Icon name="quality" size={17} className="td-tile-icon" />
            <div className="pd-num td-tile-value">
              {qualityLoading ? <Skeleton width="2.6em" glass /> : quality}
            </div>
            <div className="td-tile-name">{t("수질 · 최근 검사")}</div>
          </div>
        </div>
        {/* 왜 이 활동인가 · 왜 저것이 아닌가 · 지금 물때 · 대신 갈 곳. 홈과
            같은 줄입니다. 이 탭에는 아래에 물때 카드가 따로 있는데, 그쪽은
            만·간조 시각표이고 여기는 그 물때가 오늘의 활동 선택에 어떻게
            작용했는지입니다 -- 두 값을 합치지 않고 역할로 가릅니다. */}
        <RecommendationReason
          data={recommendation}
          error={recommendationError}
          loading={recommendationLoading}
          glass
        />
        {/* 「값이 없으면 –…」 같은 전역 규칙 문장은 화면 바닥의 AppFootNote 가
            한 번만 말합니다. 여기는 이 지점의 근거만 남깁니다. */}
        {/* 한 화면에 이런 손잡이가 다섯 개입니다(근거 보기 · 퐁당 점수란 ·
            분야별 근거 확인 · 분야별 점수·산정 기준·출처 · 수질 등급 기준).
            details 로 펴면 그 자리에서 카드가 늘어나 아래 내용이 한 화면 밖으로
            밀려나므로, 이 탭에서는 말풍선으로 엽니다(InfoPopover). */}
        <EvidenceNote
          data={conditions}
          className="td-hero-note"
          glass
          popover
          extra={<ScoreExplainer data={conditions} popover />}
        />
      </div>
    </header>
  );
}

function SpotComparisonRow({
  spot,
  selected,
  onSelect,
}: {
  spot: ComparisonPlace;
  selected: boolean;
  onSelect: () => void;
}) {
  const score = spot.score;
  const grade = gradeOf(score);
  return (
    <button
      type="button"
      className={"td-spot-row pd-pressable" + (selected ? " is-selected" : "")}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="td-score-badge" data-grade={grade.key}>
        {/* 조회 중과 「자료 없음」(–)은 다른 사실입니다. 조회가 끝나기 전에
            «–» 를 적으면 아직 묻고 있는 지점이 근거가 없는 지점처럼 보입니다. */}
        {spot.loading ? <Skeleton width="1.6em" label={t("점수 조회 중")} /> : score ?? "–"}
      </span>
      <span className="td-spot-body">
        <span className="td-spot-name">{spot.name}</span>
        <span className="td-spot-vals">{placeRegionLabel(spot)}{score !== null && <> · {scoreCoverageText(spot.conditions)}</>}</span>
        <span className="td-spot-vals">
          <GradeIcon gradeKey={grade.key} size={12} />
          <span>
            {t(grade.label)} {t("· 수온")}{" "}
            {spot.waterTemperature}
          </span>
          <StateChip kind={spot.conditions ? "live" : "no_data"} />
        </span>
      </span>
    </button>
  );
}

function SpotSection({
  rows,
  activity,
  reference,
}: {
  rows: ComparisonPlace[];
  activity: Activity;
  reference?: Conditions;
}) {
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const resolved = rows;
  const selected = resolved.find((spot) => spot.id === selectedSpotId);
  // 기준 장소는 상단과 같은 응답을 쓰고, 다른 장소의 상세만 선택 시 조회합니다.
  const details = useResource<Conditions>(selected && selected.id !== reference?.spot_id
    ? conditionPath(selected.id, activity, undefined, reference?.mode === "forecast" ? "forecast" : "observation")
    : null);
  const conditions = selected?.id === reference?.spot_id ? reference : details.data;
  return (
    <section>
      <SectionHead
        label={t("다른 지역 비교 · {activity} 점수", { activity: t(activities[activity]) })}
        href="#map"
        linkLabel={t("전체 지도 →")}
      />
      <div className="pd-card">
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
              <dt>{t("장소명")}</dt>
              <dd>
                {selected.name}
                {t("(수집 DB)")}</dd>
              <dt>{t("지역")}</dt>
              <dd>{placeRegionLabel(selected)}</dd>
              <dt>{t("주소")}</dt>
              <dd>{selected.address ?? "–"}</dd>
              <dt>{t("검증 상태")}</dt>
              <dd>{selected.catalog_verification ?? "–"}</dd>
              <dt>{t(activities[activity])} {t("점수")}</dt>
              <dd>
                {selected.score ?? "–"} {t("· 수온")}{" "}
                {selected.waterTemperature} ·{" "}
                {details.error ?? evidenceText(conditions)}
              </dd>
            </dl>
            <ConditionScoreDetails data={conditions} className="pd-note" popover />
          </div>
        )}
      </div>
    </section>
  );
}

/** 활동별 점수. 추천이 판단에 쓴 조건 응답을 그대로 씁니다.
 *
 *  예전에는 이 자리가 활동마다 따로 묻는 여섯 번의 조회였습니다. 추천 응답이
 *  같은 활동들의 조건을 이미 싣고 오는데 화면이 같은 것을 다시 물은 것이고,
 *  응답들의 시각이 서로 달라 히어로 점수와 이 타일이 다른 순간을 가리킬 수도
 *  있었습니다.
 *
 *  짝은 **활동 id 로** 맞춥니다. 갯벌이 후보에서 빠졌을 때 표시 줄은 다섯으로
 *  줄었는데 조회 배열은 여섯 그대로여서, 인덱스로 짝짓던 이 자리가 「래프팅」
 *  타일에 갯벌 점수를, 「온천」 타일에 래프팅 점수를 넣고 있었습니다. */
function ActivitySection({ states }: { states: ActivityCondition[] }) {
  const activities = ACTIVITY_ROWS.map((item) => {
    const state = states.find((entry) => entry.activity === item.id);
    return {
      ...item,
      score: state?.score ?? null,
      data: state?.data,
      error: state?.error,
      eligibility: state?.eligibility,
    };
  });
  const [basisId, setBasisId] = useState<string>(ACTIVITY_ROWS[0].id);
  const basis = activities.find((activity) => activity.id === basisId);
  return (
    <section>
      <SectionHead label={t("활동별 점수 · 선택 장소 조건")} />
      <div className="pd-card">
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
                {/* 이름이 바로 아래에 있으므로 표지는 읽히지 않게 둡니다. */}
                <Mascot className="td-act-mascot" role={activityMascot(activity.id)} size={28} />
                <div className="td-act-name">{t(activity.name)}</div>
                <div className="pd-num td-act-score">
                  <GradeIcon gradeKey={grade.key} size={12} />
                  {activity.score === null ? "–" : activity.score}
                </div>
                <div className="td-act-label">{activity.eligibility ?? t(grade.label)}</div>
                <div className="td-act-label">
                  {activity.score !== null ? scoreCoverageText(activity.data) : t("숫자 추천 보류")}
                </div>
                <div className="td-act-label">
                  {activity.data?.support_status === "supported" ? t("활동 지원 확인") : activity.data?.support_status === "unsupported" ? t("활동 미지원") : t("지원 미확인")}
                </div>
              </div>
            );
          })}
        </div>
        ))}

        {/* 예전에는 활동 6개의 근거가 카드 아래 <details> 6줄로 따로 쌓여
            있었습니다. 위 타일과 짝이 맞지 않아 어느 활동의 근거인지 두 번
            읽어야 했고, 아코디언 줄만 6줄이었습니다. 하나만 펴 두고 활동은
            셀렉트로 고릅니다 -- 근거를 감추는 것이 아니라 자리를 옮깁니다. */}
        <div className="pd-note td-basis">
          <InfoPopover label={t("분야별 근거 확인")}>
            <label className="td-basis-pick">
              {t("활동")}<select
                value={basisId}
                onChange={(event) => setBasisId(event.target.value)}
              >
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {t(activity.name)}
                  </option>
                ))}
              </select>
            </label>
            {basis?.error && <p role="alert">{basis.error}</p>}
            <ConditionScoreDetails data={basis?.data} popover />
          </InfoPopover>
        </div>
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
  // 「운영 제한」은 운영 중도 미확인도 아닌 별개의 사실입니다. 데스크탑만
  // 구분하고 있었고 모바일은 제한된 시간대를 「확인 필요」로 뭉뚱그렸습니다.
  const restricted = windows.data?.rows.find((row) => row.state === "restricted");
  const active = restricted ?? windows.data?.rows.find(
    (row) => row.state === "official_operating_window",
  );
  return (
    <div className={"td-tide-row" + (active && !restricted ? "" : " is-off")}>
      <span className="td-badge-round">
        <Icon name={activity.icon} size={14} />
      </span>
      <Mascot role={activity.mascot} size={20} />
      <span className="td-tide-name">{t(activity.name)}</span>
      <span className={"td-fit-chip" + (active && !restricted ? "" : " is-off")}>
        {restricted ? t("운영 제한") : active ? t("공식 운영") : t("확인 필요")}
      </span>
      <span className="td-tide-when" title={active?.scope}>
        {windows.error
          ? t("조회 실패")
          : active
            ? `${tideTimeLabel(active.start_at)}–${tideTimeLabel(active.end_at)}`
            : t("운영정보 없음")}
      </span>
    </div>
  );
}

/* 「이 시각의 한계」 설명 줄(TideNote)은 물때 카드에서 내렸습니다. 관측소 ·
   제공기관 · 거리는 그 카드가 이미 시각과 함께 적고 있어, 같은 사실이 두 층에
   있었습니다. 되살릴 때는 카드 안 어디에도 그 값이 없는지 먼저 확인하세요. */

/** 점수를 이루는 항목들.
 *
 *  데스크탑 「점수 근거」 LabelRow 와 같은 사실입니다. 모바일에서는 이 층이
 *  통째로 없었고, 대신 접기(ConditionScoreDetails) 안에만 숫자가 있었습니다 --
 *  펴 보지 않으면 무엇으로 몇 점인지 화면이 말하지 않았습니다. 히어로가 점수를
 *  크게 적는 화면이라면 그 점수가 어디서 왔는지도 같은 층에 있어야 합니다. */
function ScoreBasisSection({
  activity,
  conditions,
}: {
  activity: Activity;
  conditions: { data?: Conditions; loading: boolean; error?: string };
}) {
  const loading = isInitialLoad(conditions);
  return (
    <section>
      <SectionHead
        label={t("{activity} 점수를 이루는 것들", { activity: t(activities[activity]) })}
      />
      <div className="pd-card">
        <div className="td-basis-chip">
          <StateChip kind={conditions.data ? "live" : "no_data"} />
        </div>
        <p className="pd-note">{t("각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다.")}</p>
        <ComponentBars bars={componentBars(conditions.data)} loading={loading} />
        <ScoreReason text={scoreReason(conditions.data).text} loading={loading} />
        {/* 못 읽은 것과 없는 것은 다른 사실입니다. 막대가 빈 채로 서 있으면
            「자료가 없는 날」로 읽히므로 실패는 실패라고 적습니다. */}
        {conditions.error && (
          <p className="pd-note" role="alert">{conditions.error}</p>
        )}
      </div>
    </section>
  );
}

function TideSection({
  tides,
  id,
  now,
  place,
}: {
  tides?: TideResult;
  id?: number;
  now: string;
  place?: Place;
}) {
  // 고른 장소의 운영 안내(이용시간 · 개장 기간 · 휴무일). 데스크탑만 보여 주고
  // 있었습니다 -- 「물때는 좋은데 오늘 여는가」를 모바일에서는 알 수 없었습니다.
  const placeDetails = usePlaceDetails(id ? [id] : []);
  const detail = id ? placeDetails.byId.get(id) : undefined;
  const schedule = placeOperatingSchedule(detail);
  return (
    <section>
      <SectionHead label={t("물때")} suffix="A6" />
      <div className="pd-card">
        <div className="td-tide-now">
          <span className="td-tide-pill is-now">
            {t("간조")} {" "}{tideTimeLabel(tides?.next_low?.event_at)}
          </span>
          <span className="td-tide-arrow" aria-hidden="true">
            →
          </span>
          <span className="td-tide-pill">
            {t("만조")} {" "}{tideTimeLabel(tides?.next_high?.event_at)}
          </span>
          <span className="td-tide-level">
            {t("다음 만조 높이")}{" "}
            <b className="pd-num">
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
          <div className={"td-tide-row td-place-hours" + (schedule.length ? "" : " is-off")}>
            <span className="td-badge-round">
              <Icon name="pin" size={14} />
            </span>
            <span className="td-tide-name">{place?.name ?? t("기본 안내")}</span>
            <span
              className="td-fit-chip"
              title={[
                detail?.provider && t("한국관광공사 관광 정보"),
                detail?.source_modified_at && t("원천 수정일: {date}", { date: displayTime(detail.source_modified_at) }),
                detail?.fetched_at && t("수집일: {date}", { date: displayTime(detail.fetched_at) }),
              ].filter(Boolean).join(" · ")}
            >
              {t(schedule.length && (detail?.refresh_failed || detail?.refresh_pending) ? "이전 안내" : "기본 안내")}
            </span>
            <span className="td-tide-when" role={placeDetails.error ? "alert" : undefined}>
              {/* 조회 중 · 실패 · 안내 없음을 서로 다르게 적습니다. */}
              {schedule.length
                ? schedule.map((row, index) => (
                    <span className="td-hours-line" key={`${row.label}-${index}`}>
                      <span className="td-hours-label">{t(row.label)}</span>{row.value}
                    </span>
                  ))
                : placeDetails.loading
                  ? t("조회 중")
                  : placeDetails.error
                    ? t("조회 실패")
                    : t(placeDetailsMissingText(detail?.status))}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FirstSwimSection({ id }: { id?: number }) {
  return (
    <section aria-label={t("첫 입수 · 수온 알림")}>
      <SectionHead
        label={t("첫 입수 · 수온 알림")}
        suffix="A7"
        href="#first-swim"
        linkLabel={t("내 알림 조회 →")}
      />
      <div className="pd-card">
        <Mascot className="td-first-mascot" role="firstSwim" size={46} label />
        <NotificationSummary spotId={id} />
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
      <SectionHead label={t("수질 등급 · 최근 검사")} suffix="A8" />
      <div className="pd-card">
        <div className="td-conf-row"><b>{error ? t("조회 실패") : waterQualityLabel(data)}</b><span>{t(data?.label ?? "")}</span></div>
        <WaterQualityDetails data={data} error={error} className="pd-note" popover />
      </div>
    </section>
  );
}

function UnlinkedAlert() {
  const items = [
    t("공식 안전 판정 — 활동 조건 참고 점수와 별도 확인 필요"),
    t("첫 입수일·전년 비교 — 연속 관측 이력 확인 필요"),
    t("오늘의 해수욕장 위생 수질 — 최신 대장균·장구균 검사 필요"),
  ];
  return (
    <div className="pd-card td-alert" role="note">
      <div className="td-alert-head">
        <Icon name="warning" size={15} />
        <span>{t("추가 근거가 필요한 항목")}</span>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="pd-note">
        {t("장소·조건·공식 예보·물때·수질 비교·개인 알림을 각각 조회합니다. 빈 값과 unknown은 안전함을 뜻하지 않습니다.")}</p>
    </div>
  );
}

function TodayScreen() {
  // 이 탭도 홈과 같은 한 번의 추천 조회를 씁니다. 예전에는 수영 한 종목으로
  // 고정돼 있어서, 같은 장소 같은 시각을 두고 홈은 「온천」을 권하는데 이
  // 화면은 수영 조건만 늘어놓았습니다.
  const {
    now, place, conditions, baseline, activities: activityStates, best,
    recommendation, displayName, placeSettled, placeRequired,
  } = useProductData("best");
  const { tides, quality } = useTodayData(place?.id, now, placeSettled);
  // 지점 비교·주간 예보는 고른 활동을 따라갑니다. 고른 것이 없으면 수영으로
  // 물러서되(화면에 그렇게 적습니다) 히어로 점수를 그것으로 채우지 않습니다.
  const activity: Activity = best?.activity ?? "swim";
  const comparison = useComparisonPlaces(place, activity, conditions.data, isInitialLoad(conditions));
  return (
    <article className="today-page">
      <AppShell
        tab="today"
        hero={
          <Hero
            quality={quality.error ? t("조회 실패") : waterQualityLabel(quality.data)}
            qualityLoading={isInitialLoad(quality)}
            place={place}
            displayName={displayName}
            placeRequired={placeRequired}
            conditions={conditions.data}
            baseline={baseline.data}
            baselineLoading={isInitialLoad(baseline)}
            baselineError={baseline.error}
            best={best}
            recommendation={recommendation.data}
            recommendationLoading={isInitialLoad(recommendation)}
            recommendationError={recommendation.error}
            loading={isInitialLoad(conditions)}
          />
        }
      >
          <SpotSection rows={comparison.rows} activity={activity} reference={conditions.data} />
          <ActivitySection states={activityStates} />
          <ScoreBasisSection activity={activity} conditions={conditions} />
          <TodayForecast id={place?.id} now={now} activity={activity} placeSettled={placeSettled} />
          <TideSection id={place?.id} now={now} place={place} tides={tides.data} />
          <FirstSwimSection id={place?.id} />
          <QualitySection
            data={quality.data}
            error={quality.error}
          />
        <UnlinkedAlert />
      </AppShell>
    </article>
  );
}

export function TodayPage() {
  // 같은 라우트(#today)에서 폭으로 레이아웃을 갈아 끼웁니다. 데스크탑은
  // 모바일을 넓힌 것이 아니라 문법이 다르므로 마크업을 공유하지 않습니다.
  const isDesktop = useIsDesktop();
  // 이 화면은 실제 수집 데이터만 읽습니다. 상단 「데이터 구분」이 더미로
  // 선택돼 있어도 `/api/data` 로 고정합니다(`/api/demo` 는 은퇴해 404).
  return (
    <DataOrigin.Provider value="data">
      {isDesktop ? <TodayDesktop /> : <TodayScreen />}
    </DataOrigin.Provider>
  );
}
