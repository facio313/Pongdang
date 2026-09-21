import { ProductPlaceSelector } from "./ProductPlaceSelector";
import { FirstSwimPreview } from "./FirstSwimGuide";
import { t } from "./i18n.ts";
import { useState } from "react";
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
  GradeChip,
  Icon,
  MetricValue,
  ScoreGauge,
  ScoreReason,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { activities, recommendedActivities, type Activity } from "./aiApi";
import { gradeOf } from "./groupAGrade";
import {
  componentBars,
  scoreReason,
  scoreTitle,
  verdictOf,
} from "./scoreMeaning";
import { RecommendationReason } from "./RecommendationReason";
import { activityHeadline, choiceReason, missingChoiceHeadline } from "./recommendationText";
import { travelActivityLabel } from "./travelApi";
import type { Recommendation } from "./recommendationApi";
import { PlacePhoto, PlacePhotoCredit } from "./PlacePhoto";
import { usePlacePhotos } from "./usePlacePhotos";
import {
  conditionModeLabel,
  dateLabel,
  placeRegionLabel,
  waterQualityLabel,
  type Conditions,
  type Place,
  type WaterQualityGrade,
} from "./productData";
import { isInitialLoad, useResource } from "./useResource";
import { settledWithoutPlace, useProductData } from "./useProductData";
import { useHourlyScores } from "./useHourlyScores";
import type { ActivityCondition } from "./useBestActivity";
import { spotLink } from "./spotsRoute";
import { useWaterPlaces } from "./useWaterPlaces";
import { useTravelSession } from "./travelSession";
import { useTastePreference } from "./useTastePreference";
import { sessionWebcamShuffleSeed, shuffleWebcams } from "./livecamPreviewApi";
import { previewPlayerUrl, safeWebcamUrl } from "./livecamApi";
import { useWebcamCatalog } from "./useWebcamCatalog";
import { WebcamThumbnail } from "./WebcamThumbnail";
import "./homeDesktop.css";

// 데스크탑 홈(핸드오프 18a)입니다. 모바일 홈과 **같은 라우트(#home)**이며
// HomePage.tsx 가 폭으로 갈라 이 레이아웃을 붙입니다.
//
// 모바일과 문법이 다릅니다 -- 흰 카드 스택이 아니라 괘선으로 끊는 LabelRow
// 연속입니다. 프리미티브는 pongdangDesktop.tsx 가 단일 출처이고, 여기에는 이
// 화면에만 있는 내용물만 둡니다.
//
// 점수와 관측값은 모바일 홈과 **같은 훅**을 씁니다(useProductData("best") ·
// useHourlyScores). 같은 라우트인데 폭에 따라 다른 사실을 말하지 않기
// 위해서입니다 -- 예전에는 이 파일 안의 상수가 수온 22.1°C 와 시간대 점수
// 아홉 개를 지어내고 있었습니다.
//
// 명소 · 취향 · 코스 · 라이브캠도 모바일과 같은 소스를 읽습니다. 예전에는
// 이 자리들이 전부 파일 안 상수였습니다 -- 고른 적 없는 취향이 「서핑과 온천을
// 고르셨습니다」로 떠 있었고, 저장된 적 없는 코스가 「3곳 · 12.0km」로 적혀
// 있었습니다. 데이터가 없으면 지어내지 않고 그 사실을 적습니다.

const BAR_MAX_HEIGHT = 104;

/** 예전에는 이 히어로가 「오늘 바다는 / 들어가기 좋습니다」라는 고정 문장과
 *  하드코딩된 수온 22.1°C 였습니다. 모바일 홈이 실제 점수를 읽는 동안
 *  데스크탑만 시안 값을 보여 주고 있었습니다. 같은 라우트(#home)인데 폭에
 *  따라 다른 사실을 말하면 안 됩니다. */
function HomeHero({
  placeName,
  baseline,
  best,
  recommendation,
  recommendationLoading = false,
  recommendationError,
  quality,
  qualityLoading = false,
  loading = false,
  baselineLoading = false,
  placeRequired = false,
}: {
  placeName: string;
  /** 서버가 고른 활동과 그 근거. 히어로의 근거 줄이 이것을 읽습니다. */
  recommendation?: Recommendation;
  recommendationLoading?: boolean;
  recommendationError?: string;
  /** 활동과 무관한 「지금 날씨와 바다」의 기준 응답(useProductData 주석). */
  baseline?: Conditions;
  best: ActivityCondition | null;
  quality: string;
  qualityLoading?: boolean;
  loading?: boolean;
  baselineLoading?: boolean;
  placeRequired?: boolean;
}) {
  const verdict =
    best && !loading ? verdictOf(best.activity, gradeOf(best.score).key) : null;
  return (
    <DesktopHero
      nav={
        <DesktopNav
          active="home"
          context={t("{place} · {date} · {mode} 기준", { place: placeName, date: dateLabel(), mode: conditionModeLabel(baseline) })}
        />
      }
      wave="animated"
      mascot="home"
    >
      <div className="hd-hero">
        <div className="hd-hero-lead">
          <ProductPlaceSelector placeName={placeName} />
          <div className="pd-dk-kick hd-hero-kick">{t("강원도 물놀이")}</div>
          {/* 조사(이/가)를 붙이지 않으려고 활동 이름을 줄로 떼어 둡니다.
              「수영」·「갯벌」처럼 받침이 갈립니다. */}
          <h1 className="hd-hero-title">
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
          <div className="hd-hero-score">
            <span className="pd-dk-num hd-hero-score-num">
              {loading ? (
                <Skeleton width="1.6em" glass label={t("점수 조회 중")} />
              ) : (
                (best?.score ?? "–")
              )}
            </span>
            <GradeChip
              score={best?.score ?? null}
              prefix={best ? scoreTitle(best.activity) : undefined}
              loading={loading}
              glass
              bare
            />
          </div>
          <ScoreGauge score={best?.score ?? null} loading={loading} glass />
          {/* 등급명은 상태어라 가도 되는지가 읽히지 않습니다. 값이 없으면
              문장을 지어내지 않고 비워 둡니다. */}
          {verdict && <p className="hd-hero-verdict">{verdict}</p>}
          {/* 히어로에는 「왜 이 활동인가」 한 줄만 얹습니다. 뺀 이유 · 물때 ·
              대신 갈 곳 · 근거 전문 · 수질 상세 · 점수 읽는 법은 홈에서 다시
              펼치지 않고 오늘 탭에서 읽습니다 -- 같은 내용을 두 화면에 두 번
              싣지 않기 위해서입니다. 모바일 홈과 같은 층 나눔입니다. */}
          <RecommendationReason
            data={recommendation}
            error={recommendationError}
            loading={recommendationLoading}
            variant="lead"
            glass
          />
          <div className="hd-hero-buttons">
            <a className="pd-dk-button is-on-cobalt" href="#today">
              {t("오늘 후보 활동 {count}가지 보기 →", { count: recommendedActivities.length })}</a>
            <a className="pd-dk-button is-glass" href="#recommend">
              {t("코스 만들기")}</a>
          </div>
        </div>
        <div className="hd-hero-metrics">
          <div>
            <div className="hd-metric-name">{t("수온")}</div>
            <div className="pd-dk-num hd-metric-value">
              <MetricValue
                conditions={baseline}
                name="water_temperature"
                loading={baselineLoading}
                glass
              />
            </div>
          </div>
          <div>
            <div className="hd-metric-name">{t("파고")}</div>
            <div className="pd-dk-num hd-metric-value">
              <MetricValue
                conditions={baseline}
                name="wave_height"
                loading={baselineLoading}
                glass
              />
            </div>
          </div>
          {/* 수질은 점수에 들어가지 않습니다. 점수 옆에 그냥 두면 근거로
              읽히므로 그 사실을 함께 적습니다. */}
          <div>
            <div className="hd-metric-name">{t("수질 · 점수 미반영")}</div>
            <div className="pd-dk-num hd-metric-value">
              {qualityLoading ? <Skeleton width="3.2em" glass /> : quality}
            </div>
          </div>
        </div>
      </div>
    </DesktopHero>
  );
}

/** 예전에는 아홉 개 막대가 전부 파일 안 상수였습니다(6시 58점, 8시 68점 …).
 *  이제 고른 활동의 실제 시간대 예보를 읽습니다. 값이 없는 시각은 막대를
 *  그리지 않고 «–» 로 둡니다 -- 높이 0 인 막대는 「0 점」과 구별되지 않습니다. */
function HourBars({
  id,
  now,
  activity,
  conditions,
  loading = false,
}: {
  id?: number;
  now: string;
  /** 고른 활동. 없으면 시간대 막대를 그리지 않습니다 -- 무엇의 점수인지
   *  말할 수 없는 숫자이기 때문입니다. */
  activity?: Activity;
  conditions?: Conditions;
  loading?: boolean;
}) {
  // 활동이 없으면 조회하지 않습니다. 예전에는 수영으로 물러섰는데, 추천이
  // 실패했거나 고를 것이 없는 날에도 수영 점수가 남아 「오늘 한눈에」가
  // 무엇의 몇 점인지 말하지 않은 채 숫자를 보여 줬습니다.
  const hours = useHourlyScores(id, now, activity);
  const scored = hours.filter((hour) => hour.score !== null);
  // 막대 높이는 그날 안에서의 상대 위치입니다. 점수 기여도가 아닙니다.
  const max = Math.max(...scored.map((hour) => hour.score as number), 1);
  return (
    <>
      <div className="hd-hours">
        {hours.map((hour) => {
          const grade = gradeOf(hour.score);
          return (
            <div
              className={"hd-hour" + (hour.score === null ? " is-empty" : "")}
              data-grade={grade.key}
              key={hour.hour}
              aria-label={t("{hour}시 · {score}", { hour: hour.hour, score: hour.score === null ? t("평가값 없음") : t("{score}점 {grade}", { score: hour.score, grade: t(grade.label) }) })}
            >
              <div className="pd-dk-num hd-hour-score">
                {hour.loading ? (
                  <Skeleton width="1.6em" label={t("시간대 점수 조회 중")} />
                ) : (
                  (hour.score ?? "–")
                )}
              </div>
              <div className="hd-hour-track">
                {hour.score !== null && (
                  <span
                    className="hd-hour-bar"
                    style={{
                      height: Math.max(6, (hour.score / max) * BAR_MAX_HEIGHT),
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="hd-hour-labels">
        {hours.map((hour) => (
          <div className="hd-hour-label" key={hour.hour}>
            <span className="pd-dk-num">{t("{hour}시", { hour: Number(hour.hour) })}</span>
          </div>
        ))}
      </div>

      {/* 점수가 무엇으로 이루어졌는지. 모바일 「오늘 한눈에」와 같은 구성입니다.
          시간대 축 바로 아래 붙이면 그 축에 속한 값으로 읽히므로 괘선과
          소제목으로 끊습니다 -- 시각별 점수와 항목별 점수는 다른 값입니다. */}
      <div className="hd-parts">
        <div className="hd-parts-head">{t("지금 점수를 이루는 것들")}</div>
        <ComponentBars bars={componentBars(conditions)} loading={loading} />
        {/* 점수를 가장 많이 깎은 항목. 히어로에서 이 자리로 내려왔습니다 --
            히어로는 「왜 이 활동인가」를, 여기는 「그 점수가 왜 그 점수인가」를
            말합니다. */}
        <ScoreReason text={scoreReason(conditions).text} loading={loading} />
      </div>
    </>
  );
}

function BeachCard({ place }: { place: Place }) {
  return (
    <div className="hd-beach">
      <a className="place-photo-link" href={spotLink(place)}>
        <PlacePhoto className="hd-beach-photo" name={place.name} photo={place.photo} />
        <span className="hd-beach-head first-swim-name-row">
          <b className="hd-beach-name">{place.name}</b>
          <FirstSwimPreview spotId={place.id} />
        </span>
        <span className="hd-beach-foot">
          <span className="hd-beach-operating">
            {placeRegionLabel(place)}
          </span>
        </span>
      </a>
      <PlacePhotoCredit photo={place.photo} />
    </div>
  );
}

export function HomeDesktop() {
  const { now, place, places, conditions, baseline, best, recommendation, displayName, selectionMessage, placeSettled, placeRequired } =
    useProductData("best");
  const quality = settledWithoutPlace(
    useResource<WaterQualityGrade>(
      place ? `quality/grade?spot_id=${place.id}` : undefined,
    ),
    placeSettled,
  );
  // 아래 네 덩어리는 모바일 홈이 이미 쓰는 것과 같은 소스입니다. 예전에는 이
  // 자리들이 전부 파일 안 상수였습니다.
  const catalog = useWaterPlaces("");
  const beaches = (catalog.rows ?? [])
    .filter((item) => item.type === "beach")
    .slice(0, 4);
  const session = useTravelSession();
  const tastePhotos = usePlacePhotos((session.recommendation?.recommendations ?? [])
    .slice(0, 3).map((item) => ({ ...item, id: item.spot_id })));
  const tastePicks = tastePhotos.rows ?? [];
  // 고른 취향은 서버에 저장돼 있습니다(travel/preferences). 예전에는 이 자리가
  // 추천 결과의 matched_preferences 였는데, 그건 이 브라우저 메모리에만 있는
  // 값이라 취향을 저장하고 홈으로 와도 바뀌지 않았고 새로고침하면 사라졌습니다.
  const taste = useTastePreference();
  const tags = taste.savedIds.map(taste.labelOf);
  const course = session.route?.route ?? null;
  // 시드는 페이지가 기억합니다. 마운트마다 새로 뽑으면 창 폭을 바꿨다는
  // 이유로 목록을 다시 받고 풍경까지 바뀝니다(sessionWebcamShuffleSeed 주석).
  const [shuffleSeed, setShuffleSeed] = useState(sessionWebcamShuffleSeed);
  const webcams = useWebcamCatalog(1, "", shuffleSeed);
  const cameras = (webcams.result?.rows ?? [])
    .flatMap((camera) => {
      const player = previewPlayerUrl(camera, webcams.result!.valid_until, webcams.now);
      const href =
        player ?? safeWebcamUrl(camera.public_page, camera.provider_camera_id);
      return href
        ? [{ camera, href, label: player ? t(player === camera.live_player ? "실시간 안내 · 미검증" : "타임랩스") : t("원본 보기") }]
        : [];
    })
    .slice(0, 3);
  return (
    <DesktopShell>
      <HomeHero
        placeName={displayName}
        placeRequired={placeRequired}
        baseline={baseline.data}
        best={best}
        recommendation={recommendation.data}
        recommendationLoading={isInitialLoad(recommendation)}
        recommendationError={recommendation.error}
        quality={quality.error ? t("조회 실패") : waterQualityLabel(quality.data)}
        qualityLoading={isInitialLoad(quality)}
        loading={isInitialLoad(conditions)}
        baselineLoading={isInitialLoad(baseline)}
      />

      <LabelRow
        kick={t("오늘 한눈에")}
        title={
          best
            ? t("{place} · {activity} 점수를 이루는 것들", { place: displayName, activity: t(activities[best.activity]) })
            : t("{place} · 시간대별", { place: displayName })
        }
        chip={<StateChip kind={conditions.data ? "live" : "no_data"} />}
        desc={t("더 자세한 비교와 예보, 수질 근거가 궁금하다면 오늘 탭을 살펴보세요!")}
        link={{ href: "#today", label: t("오늘 탭에서 근거 보기") }}
      >
        <HourBars
          id={place?.id}
          now={now}
          activity={best?.activity}
          conditions={conditions.data}
          loading={isInitialLoad(conditions)}
        />
        {/* 장소 목록 조회 실패도 싣습니다. 선정 문구(selectionMessage)는 어느
            장소를 골랐는지를 말할 뿐이라, 목록을 못 읽은 사실을 덮습니다. */}
        <p
          className="hd-row-note"
          role={(places.error ?? conditions.error) ? "alert" : "status"}
        >
          {places.error ?? conditions.error ?? selectionMessage}
        </p>
      </LabelRow>

      <LabelRow
        kick={t("바다가 좋은 오늘")}
        title={
          <>
            {t("해변 명소")} · {t("첫 입수")}<br />
            {t("바로 이어가기")}</>
        }
        chip={<StateChip kind={catalog.rows ? "live" : "no_data"} />}
        link={{ href: "#spots", label: t("명소 탭 전체 보기") }}
      >
        <div className="hd-beaches">
          {beaches.map((place) => (
            <BeachCard key={place.id} place={place} />
          ))}
        </div>
        {!beaches.length && (
          <p className="hd-row-note" role={catalog.error ? "alert" : "status"}>
            {catalog.error ??
              (catalog.loading
                ? t("해변 목록을 조회하고 있습니다.")
                : t("수집된 해변이 아직 없습니다."))}
          </p>
        )}
      </LabelRow>

      {/* 예전에는 「서핑과 온천을 고르셨습니다」가 늘 떠 있었고 칩 네 개 중
          둘이 켜져 있었습니다. 고른 적이 없는데도 고른 것처럼 보였습니다 --
          취향은 파일 안 상수였습니다. 지금 칩은 서버에 저장된 취향입니다. */}
      <LabelRow
        kick={t("취향 맞추기")}
        title={
          <>
            {t("뭘 좋아하는지")}<br />
            {t("알려 주세요")}</>
        }
        desc={t("취향을 골라 나만의 코스를 만들어보세요.")}
      >
        <SplitBody columns="1.25fr 1fr">
          <div className="hd-taste">
            <div className="hd-taste-lead" role={taste.profileError ? "alert" : "status"}>
              {taste.profileError ??
                (tags.length
                  ? t("{tags}을 고르셨습니다", { tags: tags.map((tag) => t(tag)).join(" · ") })
                  : taste.profileLoading
                    ? t("저장된 취향을 조회하고 있습니다.")
                    : t("아직 고른 취향이 없습니다"))}
            </div>
            {taste.profileLoading && !tags.length && (
              <div className="hd-taste-chips">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} width="4.5em" label={t("취향 조회 중")} />
                ))}
              </div>
            )}
            {tags.length > 0 && (
              <div className="hd-taste-chips">
                {tags.map((tag) => (
                  <span className="hd-taste-chip is-on" key={tag}>
                    {t(tag)}
                    <Icon name="check" size={13} />
                  </span>
                ))}
              </div>
            )}
            <div className="hd-taste-actions">
              <a className="pd-dk-button" href="#recommend">
                {tags.length ? t("추천 다시 보기 →") : t("취향 고르기 →")}
              </a>
            </div>
          </div>
          <div className="hd-ai">
            <img
              className="hd-ai-mascot"
              src={mascotUrl("ai")}
              alt={t(MASCOT_ALT)}
              width={92}
              height={92}
            />
            <div>
              {/* 「AI 제안」 칩이 붙은 자리에는 같은 덩어리 안에 근거가 반드시
                  함께 있어야 합니다(핸드오프 데이터 표기 규칙 4). 예전에는
                  「오전 서핑 후 오후 온천」이라는 고정 문장과 「파고 0.6m ·
                  12:34 이후 밀물」이라는 지어낸 근거가 적혀 있었습니다. */}
              <span className="pd-ai-chip">
                <Icon name="sparkle" size={12} />
                {t("AI 제안")}</span>
              <div className="hd-ai-headline">
                {best
                  ? t("오늘 이 장소에서는 {activity}이(가) 가장 잘 맞습니다", { activity: t(activities[best.activity]) })
                  : missingChoiceHeadline(recommendation.error, true).join(" ")}
              </div>
              {/* 근거는 서버가 고른 이유를 먼저 씁니다. 그 이유가 없으면
                  점수를 깎은 항목으로 물러섭니다 -- 둘 다 없으면 이 칩이 근거
                  없이 서 있게 되므로 마지막 문장은 남겨 둡니다.

                  조회 실패는 그 물러서기를 타지 않습니다. best 가 없어 곧장
                  scoreReason(undefined) 로 떨어지면 「근거가 부족해 점수를
                  내지 못했어요」가 되는데, 그건 응답을 보고 할 수 있는 말이지
                  서버에 닿지 못한 날 할 말이 아닙니다. 히어로가 이미 갈라
                  놓은 「실패 ≠ 고를 것 없음」을 여기서도 지킵니다. */}
              <p
                className="hd-ai-basis"
                role={recommendation.error ? "alert" : undefined}
              >
                {t("근거 —")}{" "}
                {recommendation.error
                  ? t("추천 근거를 불러오지 못했어요. {error}", { error: t(recommendation.error) })
                  : (choiceReason(recommendation.data)?.text ??
                    scoreReason(best?.data).text)}
              </p>
            </div>
          </div>
        </SplitBody>
      </LabelRow>

      {/* 「취향에 맞는 명소」 줄이 여기 있었습니다. 고른 취향이 없으면 보여 줄
          것도 없어, 추천 결과가 있을 때만 싣습니다. */}
      {tastePicks.length > 0 && (
        <LabelRow
          kick={t("취향에 맞는 명소")}
          title={
            <>
              {t("고르신 취향에")}<br />
              {t("맞춰 골랐습니다")}</>
          }
          chip={<StateChip kind="live" />}
          desc={t("추천에서 고른 취향에 맞춰 서버가 고른 장소입니다.")}
          link={{ href: "#recommend", label: t("추천 다시 보기") }}
        >
          <SplitBody>
            {tastePicks.map((item) => (
              <div className="hd-taste-spot" key={item.spot_id}>
                <a
                  className="place-photo-link"
                  href={spotLink(item)}
                  aria-label={t("{name} 상세", { name: item.name })}
                >
                  <PlacePhoto
                    className="hd-taste-photo"
                    name={item.name}
                    photo={item.photo}
                  />
                </a>
                <span>
                  <a
                    className="hd-taste-spot-name place-photo-link"
                    href={spotLink(item)}
                  >
                    {item.name}
                  </a>
                  <span className="hd-taste-spot-meta">
                    {placeRegionLabel(item)} ·{" "}
                    {item.activities
                      .map((activity) => travelActivityLabel(activity.activity, activity.label))
                      .join(" · ") || t("활동 미확인")}
                  </span>
                  <PlacePhotoCredit photo={item.photo} />
                </span>
              </div>
            ))}
          </SplitBody>
        </LabelRow>
      )}

      {/* 예전에는 「오늘 조건으로 3곳 · 12.0km」와 경포 09:20 → 안목 12:00 →
          사천진 14:30 이 파일 안 상수로 적혀 있었습니다. 저장된 코스가 없어도
          코스가 있는 것처럼 보였습니다. */}
      <LabelRow
        kick={t("물놀이 최적경로")}
        title={
          course
            ? t("오늘 조건으로 {count}곳", { count: course.items.length })
            : t("코스를 만들면 여기에")
        }
        chip={<StateChip kind={course ? "live" : "partial"} />}
        desc={t("최적의 여행 코스를 만들어보세요.")}
      >
        {course ? (
          <SplitBody>
            {course.items.map((item, index) => (
              <div className="hd-step" key={item.spot_id}>
                <div className="hd-step-head">
                  <span className="pd-dk-num hd-step-no">{index + 1}</span>
                  {index < course.items.length - 1 && (
                    <span className="hd-step-line" />
                  )}
                </div>
                <div className="hd-step-body">
                  <div>
                    <div className="hd-step-name">{item.name}</div>
                  </div>
                </div>
              </div>
            ))}
          </SplitBody>
        ) : (
          <div className="pd-dk-slot hd-course-empty">
            {t("추천에서 장소를 고르고 지도에서 경로를 요청하세요")}</div>
        )}
        <div className="hd-course-foot">
          <span className="hd-row-note">
            {course
              ? t("예상 이동 {minutes}분 · 이동 시간은 경로 제공자가 준 추정값입니다.", { minutes: course.travel_minutes })
              : ""}
          </span>
          <a className="pd-dk-button is-pill" href="#map?view=course">
            {t("지도에서 경로 탐색 →")}</a>
        </div>
      </LabelRow>

      {/* 예전에는 라이브캠 세 칸이 파일 안 상수였습니다(경포 · 안목 06:00
          LIVE). 모바일 홈은 같은 자리에서 이미 실제 카탈로그를 읽고
          있었습니다 -- 데스크탑만 지어내고 있었습니다. */}
      <LabelRow
        kick={t("라이브캠")}
        title={t("지금 바다 보기")}
        chip={<StateChip kind={webcams.result ? "live" : "no_data"} />}
        desc={t("지금 이 순간의 바다, 그 풍경을 직접 느껴보세요")}
        link={{ href: "#livecam", label: t("전체 화면으로") }}
      >
        {/* 저장된 목록 안에서 다른 카메라를 고릅니다. */}
        <button
          type="button"
          className="pd-dk-button is-pill hd-cams-reshuffle"
          disabled={webcams.loading}
          onClick={() => setShuffleSeed(shuffleWebcams())}
        >
          {t("다른 풍경 보기")}</button>
        <div className="hd-cams">
          {cameras.map(({ camera, href, label }) => (
            <a
              className="hd-cam"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              key={camera.provider_camera_id}
            >
              <WebcamThumbnail camera={camera} className="pd-dk-slot hd-cam-frame" fallback={<>
                <img className="hd-cam-mascot" src={mascotUrl("livecam")} alt="" width={84} height={84} />
                {camera.title}
              </>}>
                <span className="hd-cam-live">
                  <span className="hd-cam-dot" />
                  {label}
                </span>
              </WebcamThumbnail>
              <div className="hd-cam-head">
                <b>{camera.title}</b>
                <span className="hd-cam-place">{label}</span>
              </div>
            </a>
          ))}
          {/* 송출이 없는 자리는 빈 칸으로 두지 않고 그 사실을 밝힙니다. */}
          {!cameras.length && (
            <div className="hd-cam">
              <div className="hd-cam-frame is-empty">
                <img src={mascotUrl("empty")} alt="" width={46} height={46} />
                <div className="hd-cam-empty-title">
                  {webcams.loading ? t("조회 중") : t("송출 없음")}
                </div>
                <div className="hd-cam-empty-note">
                  {webcams.error ??
                    (webcams.loading
                      ? t("물 풍경을 고르는 중입니다")
                      : t("열 수 있는 물 풍경 카메라가 없습니다"))}
                </div>
              </div>
            </div>
          )}
        </div>
        <p className="hd-row-note" role={webcams.error ? "alert" : "status"}>
          {webcams.error ??
            t("장소와 관계없이 무작위로 선택된 물 풍경입니다. 대표 이미지는 저장된 사진이며 실시간 영상이 아닙니다.")}{" "}
          {/* 유효기간이 지나 원본 페이지로 물러선 사실을 적습니다. 모바일은
              적는데 이 화면은 말없이 링크만 바꿨습니다. */}
          {webcams.expired &&
            t("원본 페이지로 연결합니다. 다른 풍경 보기로 새로 불러오세요. ")}
          Webcams provided by windy.com
        </p>
      </LabelRow>

      {/* 시간대별 예보와 코스는 이제 연동됐으므로 목록에서 뺐습니다. 남은
          것만 적습니다 -- 다 고친 뒤에도 미연동이라고 적어 두면 그것도
          거짓말입니다. */}
      <FootNote missing={t("운영시간 · 장소까지의 거리")} />
    </DesktopShell>
  );
}
