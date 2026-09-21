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
import { useConditions } from "./useConditions";
import { ConditionScoreDetails } from "./ConditionScoreDetails";
import { EvidenceNote } from "./EvidenceNote";
import { RecommendationReason } from "./RecommendationReason";
import { WaterQualityDetails } from "./WaterQualityDetails";
import { NotificationSummary } from "./NotificationSummary";
import type { ActivityCondition } from "./useBestActivity";
import type { Recommendation } from "./recommendationApi";
import { activities, type Activity } from "./aiApi";
import { activityHeadline, missingChoiceHeadline } from "./recommendationText";
import { scoreTitle } from "./scoreMeaning";
import {
  conditionScore,
  conditionModeLabel,
  dataStatusText,
  periodPath,
  dateLabel,
  placeRegionLabel,
  timeLabel,
  scoreCoverageText,
  tideTimeLabel,
  metricText,
  evidenceText,
  waterQualityLabel,
  type Place,
  type Conditions,
  type TideResult,
  type WaterQualityGrade,
} from "./productData";
import {
  GradeChip,
  GradeIcon,
  Icon,
  MetricValue,
  ScoreExplainer,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { AppHeader, AppShell } from "./AppShell";
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
  { name: "래프팅", icon: "rafting" },
  { name: "튜브 물놀이", icon: "tube" },
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
        <EvidenceNote data={conditions} className="td-hero-note" glass extra={<ScoreExplainer data={conditions} />} />
      </div>
    </header>
  );
}

function SpotComparisonRow({
  spot,
  activity,
  selected,
  onSelect,
}: {
  spot: Place;
  /** 오늘 고른 활동. 위에 크게 뜬 점수와 다른 기준의 막대를 그리지 않습니다. */
  activity: Activity;
  selected: boolean;
  onSelect: () => void;
}) {
  const conditions = useConditions(spot.id, activity);
  const score = conditionScore(conditions.data);
  const grade = gradeOf(score);
  return (
    <button
      type="button"
      className={"td-spot-row pd-pressable" + (selected ? " is-selected" : "")}
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
            {t(grade.label)} {t("· 수온")}{" "}
            {metricText(conditions.data, "water_temperature")}
          </span>
          <StateChip kind={conditions.data ? "live" : "no_data"} />
        </span>
      </span>
    </button>
  );
}

function SpotSection({
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
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const resolved = rows.filter((row) => row.type === "beach").slice(0, 3);
  const selected = resolved.find((spot) => spot.id === selectedSpotId);
  // 다른 장소의 점수라 추천 응답에 없습니다. 여기는 따로 조회합니다.
  const conditions = useConditions(selected?.id, activity);
  return (
    <section>
      <SectionHead
        label={t("지점 비교 · {activity} 점수", { activity: t(activities[activity]) })}
        href="#map"
        linkLabel={t("전체 지도 →")}
      />
      <div className="pd-card">
        <div className="td-rows">
          {resolved.map((spot) => (
            <SpotComparisonRow
              key={spot.id}
              spot={spot}
              activity={activity}
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
                {conditionScore(conditions.data) ?? "–"} {t("· 수온")}{" "}
                {metricText(conditions.data, "water_temperature")} ·{" "}
                {conditions.error ?? evidenceText(conditions.data)}
              </dd>
            </dl>
            <ConditionScoreDetails data={conditions.data} className="pd-note" />
          </div>
        )}

        <p className="pd-note" role={statusIsError ? "alert" : "status"}>
          {status} {t("장소를 선택하면 해당 지점의 분야별 점수와 조건 근거를 조회합니다. 자료가 없는 분야는 –이며, 부분 점수의 근거 확보율을 함께 확인하세요.")}</p>
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
  // 한 번의 조회이므로 오류도 하나입니다. 같은 문장을 다섯 번 잇지 않습니다.
  const errors = states.find((state) => state.error)?.error ?? "";
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
        <p className="pd-note">
          <StateChip kind="partial" /> {t("활동별 참고 점수입니다. 일부 근거로 계산한 값은 조건 전체를 대표하지 않습니다. 안전·운영 여부는 별도 확인이 필요합니다.")}</p>
        {errors && <p className="pd-note" role="alert">{errors}</p>}
        {/* 예전에는 활동 6개의 근거가 카드 아래 <details> 6줄로 따로 쌓여
            있었습니다. 위 타일과 짝이 맞지 않아 어느 활동의 근거인지 두 번
            읽어야 했고, 아코디언 줄만 6줄이었습니다. 하나만 펴 두고 활동은
            셀렉트로 고릅니다 -- 근거를 감추는 것이 아니라 자리를 옮깁니다. */}
        <details className="pd-note td-basis">
          <summary>{t("분야별 근거 확인")}</summary>
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
          <ConditionScoreDetails data={basis?.data} />
        </details>
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
      <span className="td-tide-name">{t(activity.name)}</span>
      <span className={"td-fit-chip" + (active ? "" : " is-off")}>
        {active ? t("공식 운영") : t("확인 필요")}
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

/** 물때 카드의 근거 줄. 예전에는 status enum(「available」) · 주의문 · 관측소명 ·
 *  거리가 한 문단에 섞여 있었고, spatial_relation 이 nearby_station_context 가
 *  아니면 관측소 이름만 덩그러니 남았습니다.
 *
 *  거리(예: 33.5km)는 접지 않습니다 -- 이 화면에서 가장 중요한 한계입니다.
 *  나머지 주의문은 「이 시각의 한계」 안에 그대로 둡니다. */
function TideNote({ tides, status }: { tides?: TideResult; status: string }) {
  const event = tides?.next_high ?? tides?.next_low;
  const distance =
    typeof event?.distance_km === "number" ? `${event.distance_km.toFixed(1)}km` : null;
  const nearby = event?.spatial_relation === "nearby_station_context";
  return (
    <div className="pd-note">
      <p className="pd-evidence-line">
        <StateChip kind={tides?.rows.length ? "live" : "no_data"} />
        {event?.station_name && (
          <span className="pd-state-chip">
            {/* 관계를 알 수 없으면 「주변 참고」라고 단정하지 않고 관측소로만
                적습니다. 모르는 것을 가까운 것으로 바꾸지 않기 위해서입니다. */}
            {nearby
              ? t("주변 {station}{distance} 참고", { station: event.station_name, distance: distance ? ` ${distance}` : "" })
              : t("관측소 {station}{distance}", { station: event.station_name, distance: distance ? ` ${distance}` : "" })}
          </span>
        )}
        <span>
          {t("공식 조석 예측의 간조·만조 시각입니다. 이 시각이 오늘의 활동 선택에 어떻게 작용했는지는 위 추천 근거에 있습니다 -- 여기 값과 그쪽 값은 서로 다른 조회라 시각이 어긋날 수 있어 합치지 않습니다.")}{" "}
          {dataStatusText(status)}
        </span>
      </p>
      <details className="pd-explainer">
        <summary className="pd-tap">{t("이 시각의 한계")}</summary>
        <div className="pd-explainer-body">
          <p>
            {t("사건 시각만으로 현재 조류나 활동 적합 여부를 판단하지 않습니다.")}</p>
          {event && (
            <p>
              {event.station_name ?? t("관측소명 없음")} · {event.provider}
              {distance ? ` · ${distance}` : ""}
              {nearby ? t(" · 해당 해변의 직접 예측이 아닙니다.") : ""}
            </p>
          )}
        </div>
      </details>
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
        </div>
        <TideNote tides={tides} status={status} />
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
        <WaterQualityDetails data={data} error={error} className="pd-note" />
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
    now, place, places, conditions, baseline, activities: activityStates, best,
    recommendation, displayName, selectionMessage, placeSettled, placeRequired,
  } = useProductData("best");
  const { tides, quality } = useTodayData(place?.id, now, placeSettled);
  // 지점 비교·주간 예보는 고른 활동을 따라갑니다. 고른 것이 없으면 수영으로
  // 물러서되(화면에 그렇게 적습니다) 히어로 점수를 그것으로 채우지 않습니다.
  const activity: Activity = best?.activity ?? "swim";
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
          <SpotSection
            rows={places.data?.rows ?? []}
            activity={activity}
            statusIsError={Boolean(places.error ?? conditions.error)}
            status={
              places.error ??
              conditions.error ??
              selectionMessage
            }
          />
          <ActivitySection states={activityStates} />
          <TodayForecast id={place?.id} now={now} activity={activity} placeSettled={placeSettled} />
          <TideSection
            id={place?.id}
            now={now}
            tides={tides.data}
            status={
              tides.error ??
              (tides.loading
                ? t("물때 조회 중")
                : (tides.data?.status ?? t("장소 선택 필요")))
            }
          />
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
