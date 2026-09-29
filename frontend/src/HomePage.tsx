import { ProductPlacePopover } from "./ProductPlaceSelector";
import { FirstSwimPreview } from "./FirstSwimGuide";
import { t } from "./i18n.ts";
import { useState, type ReactNode } from "react";
import { DataOrigin } from "./DataOrigin";
import {
  AiSuggestion,
  ComponentBars,
  Icon,
  MetricValue,
  ScoreGauge,
  ScoreReason,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { activities, recommendedActivities, type Activity } from "./aiApi";
import { componentBars, scoreReason } from "./scoreMeaning";
import { RecommendationReason } from "./RecommendationReason";
import { activityHeadline, choiceReason, missingChoiceHeadline } from "./recommendationText";
import type { Recommendation } from "./recommendationApi";
import type { ActivityCondition } from "./useBestActivity";
import { AppHeader, AppShell } from "./AppShell";
import { WaterQualityDetails } from "./WaterQualityDetails";
import { PlacePhoto } from "./PlacePhoto";
import type { PlacePhoto as Photo } from "./placePhotos";
import { usePlacePhotos } from "./usePlacePhotos";
import { HomeDesktop } from "./HomeDesktop";
import { HomeTides } from "./HomeTides";
import { useIsDesktop } from "./useIsDesktop";
import { useTravelSession } from "./travelSession";
import { useTastePreference } from "./useTastePreference";
import { useRequireLogin } from "./loginPopoverState";
import { isInitialLoad, useResource } from "./useResource";
import { settledWithoutPlace, useProductData } from "./useProductData";
import { HourlyConditions } from "./HourlyConditions";
import {
  dateLabel,
  placeRegionLabel,
  conditionModeLabel,
  timeLabel,
  waterQualityLabel,
  type Conditions,
  type WaterQualityGrade,
} from "./productData";
import { mascotUrl } from "./mascots";
import { spotLink } from "./spotsRoute";
import { useHomeBeaches } from "./useHomeBeaches";
import type { TemperatureReading } from "./firstSwimTemperature";
import { sessionWebcamShuffleSeed, shuffleWebcams } from "./livecamPreviewApi";
import { WAVE_LOOP_PATH } from "./waveShape";
import { previewPlayerUrl, safeWebcamUrl } from "./livecamApi";
import { useWebcamCatalog } from "./useWebcamCatalog";
import { WebcamThumbnail } from "./WebcamThumbnail";
import "./homePage.css";

// Keep the product layout; only server evidence supplies condition values.
const CAM_BACKGROUNDS = [
  "linear-gradient(160deg,#4fb3d9,#1d6fd8)",
  "linear-gradient(160deg,#e0a72a,#b97a1d)",
  "linear-gradient(160deg,#6b8fae,#33475a)",
];

function Hero({
  placeName,
  baseline,
  best,
  recommendation,
  recommendationLoading = false,
  recommendationError,
  loading = false,
  baselineLoading = false,
  placeRequired = false,
}: {
  placeName: string;
  /** 서버가 고른 활동과 그 근거. 히어로의 근거 줄이 이것을 읽습니다. */
  recommendation?: Recommendation;
  recommendationLoading?: boolean;
  recommendationError?: string;
  /** 활동과 무관한 「지금 날씨와 바다」의 기준 응답. 점수용 응답과 다릅니다 --
   *  서버는 그 활동이 보는 지표만 내려주기 때문입니다(useProductData 주석). */
  baseline?: Conditions;
  /** 오늘 이 장소에서 조건이 가장 좋은 활동. 없으면 고를 것이 없다는 뜻입니다. */
  best: ActivityCondition | null;
  /** 조건 조회 중. 「자료 없음」(–)과 구분해 그립니다. */
  loading?: boolean;
  baselineLoading?: boolean;
  placeRequired?: boolean;
}) {
  const conditions = best?.data ?? baseline;
  const at = conditions?.projection?.computed_at ?? conditions?.retained_at ?? conditions?.at;
  return (
    <header className="pd-hero">
      <div className="hm-hero-background" aria-hidden="true" />
      <AppHeader title={t("홈")} time={timeLabel(new Date().toISOString())} onCobalt />
      <div className="hm-hero-inner">
        <div className="hm-hero-top">
          <div className="pd-lbl hm-hero-place">
            <Icon name="pin" size={12} />
            <ProductPlacePopover placeName={placeName} />
            <span aria-hidden="true">·</span>
            <time className="home-condition-time" dateTime={at}>
              {at ? `${dateLabel(at)} ${timeLabel(at)}` : "–"}
            </time>
          </div>
        </div>

        {/* 예전에는 이 자리가 점선 pd-slot 이었습니다. 실제 수집한 기온 ·
            수온 · 파고 · 강수가 들어 있는데도 「미구현」으로 읽혔습니다.
            점선은 아직 설계되지 않은 자리에만 씁니다. */}
        <div className="hm-hero-visual">
          <div className="hm-hero-visual-head">
            {t("{mode} 기준 날씨와 바다", { mode: conditionModeLabel(baseline) })}</div>
          <dl className="hm-hero-metrics">
            <div>
              <dt>{t("기온")}</dt>
              <dd className="pd-num">
                <MetricValue
                  conditions={baseline}
                  name="air_temperature"
                  loading={baselineLoading}
                  glass
                />
              </dd>
            </div>
            <div>
              <dt>{t("수온")}</dt>
              <dd className="pd-num">
                <MetricValue
                  conditions={baseline}
                  name="water_temperature"
                  loading={baselineLoading}
                  glass
                />
              </dd>
            </div>
            <div>
              <dt>{t("파고")}</dt>
              <dd className="pd-num">
                <MetricValue
                  conditions={baseline}
                  name="wave_height"
                  loading={baselineLoading}
                  glass
                />
              </dd>
            </div>
            <div>
              <dt>{t("바람")}</dt>
              <dd className="pd-num">
                <MetricValue
                  conditions={baseline}
                  name="wind_speed"
                  loading={baselineLoading}
                  glass
                />
              </dd>
            </div>
            <div>
              <dt>{t("1시간 강수량")}</dt>
              <dd className="pd-num">
                <MetricValue
                  conditions={baseline}
                  name="precipitation"
                  loading={baselineLoading}
                  glass
                />
              </dd>
            </div>
          </dl>
        </div>

        {/* 예전에는 이 자리가 「오늘의 물놀이 조건 / 자료를 확인하세요」와 숫자
            하나였습니다. 그 숫자는 사실 수영 점수였는데 화면은 그 말을 하지
            않아, 무엇의 몇 점인지 알 수 없었습니다. 이제 여섯 활동을 모두 보고
            가장 좋은 하나를 이름과 함께 올립니다. */}
        <div className="hm-hero-row">
          {/* 조사(이/가)를 붙이지 않으려고 이름을 줄로 떼어 둡니다. 활동 이름은
              「수영」·「갯벌」처럼 받침이 갈려, 어느 쪽을 골라도 절반은 틀립니다. */}
          <h1 className="hm-hero-sentence">
            {loading ? (
              <Skeleton width="7em" glass label={t("오늘의 활동 조회 중")} />
            ) : placeRequired ? t("기준 장소를 선택해 주세요.") : best ? (
              <>
                <span className="hm-hero-title-label">{t("오늘 가장 좋은 활동")}</span>{" "}
                <span className="hm-hero-title-activity">{activityHeadline(best.activity)}</span>
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
          <div className="hm-hero-score">
            <div className="pd-num hm-hero-score-num">
              {loading ? (
                <Skeleton width="1.6em" glass label={t("점수 조회 중")} />
              ) : (
                (best?.score ?? "–")
              )}
            </div>
          </div>
        </div>

        <ScoreGauge score={best?.score ?? null} loading={loading} glass />
        {/* 히어로에는 「왜 이 활동인가」 **한 줄만** 얹습니다. 예전에는 뺀 이유 ·
            물때 · 대신 갈 곳 · 근거 전문 · 점수 설명이 모두 이 코발트 면 안에
            있어서, 결론(무엇을 · 몇 점)이 감사 기록에 묻혔습니다. 나머지는
            홈에서 한 번 더 펼치지 않고 오늘 탭에서 읽습니다 -- 같은 내용을 두
            화면에 두 번 싣지 않기 위해서입니다. */}
        <RecommendationReason
          data={recommendation}
          error={recommendationError}
          loading={recommendationLoading}
          variant="lead"
          glass
        />

        <div className="hm-hero-actions">
          <a className="pd-inline pd-tap" href="#today">
            {t("오늘 후보 활동 {count}가지 보기 →", { count: recommendedActivities.length })}</a>
          {/* 데스크탑 히어로는 「오늘 보기」 옆에 코스 만들기를 함께 두고
              있었습니다. 모바일은 취향 카드까지 내려가야 추천으로 갈 수 있어,
              가장 자주 쓰는 진입이 화면 밖에 있었습니다. */}
          <a className="pd-inline pd-tap hm-hero-course" href="#recommend">
            {t("코스 만들기")}</a>
        </div>
      </div>
      {/* 물결. 데스크탑 히어로와 같은 굴곡을 2겹으로 흘립니다(waveShape.ts).
          「동작 줄이기」를 켜면 pongdang.css 의 규칙이 멈춰 세웁니다. */}
      <div className="hm-hero-anim" aria-hidden="true">
        <svg className="hm-wave-back" viewBox="0 0 2880 96" preserveAspectRatio="none">
          <path d={WAVE_LOOP_PATH} />
        </svg>
        <svg className="hm-wave-front" viewBox="0 0 2880 96" preserveAspectRatio="none">
          <path d={WAVE_LOOP_PATH} opacity="0.5" />
        </svg>
      </div>
    </header>
  );
}

/** 예전에는 이 카드가 수온 · 파고 · 강수 · 수질 네 타일이었습니다. 측정값만
 *  나열해서 바로 위 히어로 점수와 아무 연결이 없었고, 수질은 점수 입력이
 *  아닌데도 나란히 놓여 점수 근거처럼 읽혔습니다.
 *
 *  이제 카드는 **그 점수를 이루는 항목들**입니다. 무엇을 보고 매긴 점수인지,
 *  어느 항목이 몇 점인지가 여기서 끝납니다. 항목 구성은 활동마다 다르므로
 *  고정 네 칸이 아니라 서버가 준 components 를 그대로 따릅니다. */
function GlanceCard({
  statusText,
  statusIsError,
  conditions,
  activity,
  loading = false,
  quality,
  qualityLoading = false,
  qualityData,
  qualityError,
  spotId,
  now,
}: {
  statusText: string;
  /** 상태 문장이 오류인지. 오류는 role="alert", 진행 중은 role="status" 입니다. */
  statusIsError?: boolean;
  conditions?: Conditions;
  /** 어느 활동의 점수를 펼치는지. 없으면 고른 활동이 없다는 뜻입니다. */
  activity?: Activity;
  loading?: boolean;
  quality: string;
  qualityLoading?: boolean;
  qualityData?: WaterQualityGrade;
  qualityError?: string;
  spotId?: number;
  now: string;
}) {
  const bars = componentBars(conditions);
  return (
    <div className="pd-card">
      <div className="pd-card-title">
        {t("오늘 한눈에")}{activity ? t(" · {activity} 점수를 이루는 것들", { activity: t(activities[activity]) }) : ""}
      </div>
      {loading || bars.length ? (
        <ComponentBars bars={bars} loading={loading} />
      ) : (
        <p className="pd-note">
          {t("점수를 이루는 항목을 읽지 못했습니다. 아래 상태 문장을 확인하세요.")}</p>
      )}
      {/* 점수를 가장 많이 깎은 항목. 히어로에서 이 자리로 내려왔습니다 --
          히어로는 「왜 이 활동인가」를, 이 카드는 「그 점수가 왜 그 점수인가」를
          말합니다. 둘 다 사실이지만 같은 질문의 답이 아닙니다. */}
      <ScoreReason text={scoreReason(conditions).text} loading={loading} />

      {/* 수질은 점수에 들어가지 않습니다(백엔드 activity_score 의 입력에
          없습니다). 위 항목들과 같은 줄에 두면 점수 근거로 오인되므로 자리를
          나누고 그 사실을 배지로 밝힙니다. */}
      <div className="hm-glance-aside">
        <span className="hm-glance-aside-name">{t("수질 · 최근 검사")}</span>
        <span className="pd-num hm-glance-aside-value">
          {qualityLoading ? <Skeleton width="2.6em" /> : quality}
        </span>
        <span className="pd-state-chip">{t("점수 미반영")}</span>
      </div>

      <WaterQualityDetails data={qualityData} error={qualityError} className="pd-note" />
      <HourlyConditions id={spotId} now={now} activity={activity} />
      <p className="pd-note" role={statusIsError ? "alert" : "status"}>
        <StateChip kind={conditions ? "live" : "no_data"} /> {t("{mode} 기준이며 강수는 강수량입니다. 자료가 없거나 상충하면 –로 표시합니다. 항목 점수는 100점 만점이며, 총점은 이 항목들을 같은 비중으로 평균낸 값입니다.", { mode: conditionModeLabel(conditions) })}{" "}{t(statusText)}
      </p>
    </div>
  );
}

/** 홈의 명소 가로 줄. 「바다가 좋은 오늘」과 「고른 취향의 명소」가 같은 모양을
 *  쓰므로 한 컴포넌트로 둡니다. 수집된 대표 사진을 같은 규칙으로 보여줍니다. */
function SpotScroller({
  title,
  note,
  link,
  places,
  chips,
  beachFallback = false,
  children,
}: {
  title: string;
  note?: string;
  link: { href: string; label: string };
  places: { id: number; name: string; meta: string; photo?: Photo; temperature?: TemperatureReading }[];
  /** 목록 위에 붙는 칩 줄. 「고른 취향의 명소」가 취향을 싣는 자리입니다. */
  chips?: ReactNode;
  beachFallback?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="pd-card">
      <div className="hm-picks-head">
        <div className="pd-card-title">{title}</div>
        <a className="hm-picks-link pd-inline" href={link.href}>
          {link.label} →
        </a>
      </div>
      {note && <p className="pd-note hm-picks-note">{note}</p>}
      {chips}
      <div className="hm-picks-row">
        {places.map((place) => (
          <div className="hm-pick" key={place.id}>
            <a className="place-photo-link" href={spotLink(place)}>
              <PlacePhoto className="hm-pick-photo" name={place.name} photo={place.photo} fallback={beachFallback ? "beach" : undefined} />
              <span className={place.temperature ? "first-swim-name-row" : undefined}>
                <span className="hm-pick-name">{place.name}</span>
                {place.temperature && <FirstSwimPreview reading={place.temperature} />}
              </span>
              <span className="hm-pick-meta">{place.meta}</span>
            </a>
            {/* <PlacePhotoCredit photo={place.photo} /> */}
          </div>
        ))}
        {/* 점수 칩이 있던 자리입니다. 명소마다 점수를 붙이려면 장소마다 한
            번씩 조회해야 해서, 목록에서는 약속하지 않고 상세에서 읽습니다. */}
      </div>
      {children && <div className="pd-note hm-picks-foot">{children}</div>}
    </div>
  );
}

/** 수온 관측이 있는 실제 해변 중 네 곳을 뽑습니다. */
function BeachPicksCard() {
  const places = useHomeBeaches();
  const beaches = (places.rows ?? [])
    .map((place) => ({
      id: place.id,
      name: place.name,
      meta: placeRegionLabel(place),
      photo: place.photo,
      temperature: place.temperature,
    }));
  if (!beaches.length)
    return (
      <div className="pd-card">
        <div className="pd-card-title">{t("해변 명소")}</div>
        <p className="pd-note" role={places.error ? "alert" : "status"}>
          <StateChip kind={places.rows ? "no_data" : "partial"} />{" "}
          {places.error ??
            (places.loading
              ? t("해변 목록을 조회하고 있습니다.")
              : t("수온이 확인되는 해변이 아직 없습니다."))}
        </p>
      </div>
    );
  return (
    <SpotScroller
      title={t("해변 명소")}
      beachFallback
      link={{ href: "#spots", label: t("명소 전체") }}
      places={beaches}
    />
  );
}

/** 예전에는 「고른 취향의 명소 · 서핑 · 온천」이 늘 떠 있었습니다. 고른 적이
 *  없는데도 고른 것처럼 보였습니다 -- 취향은 파일 안 상수였습니다.
 *
 *  그 다음에는 추천 결과 안의 matched_preferences 를 읽었습니다. 그것은 이
 *  브라우저 메모리에만 있는 값이라(travelSession), 추천에서 취향을 저장하고
 *  홈으로 와도 아무것도 바뀌지 않았고 새로고침하면 사라졌습니다. 고른 취향은
 *  **서버에 저장돼 있으므로**(travel/preferences) 그것을 읽습니다. 아래 장소
 *  줄만 추천 결과에서 가져옵니다 -- 그건 이번 조회의 결과이지 취향이 아닙니다. */
function TastePicksCard() {
  const session = useTravelSession();
  const { savedIds, labelOf, profileLoading, profileError } = useTastePreference();
  const tags = savedIds.map(labelOf);
  const photoPicks = usePlacePhotos((session.recommendation?.recommendations ?? [])
    .slice(0, 3)
    .map((item) => ({
      id: item.spot_id,
      name: item.name,
      meta: placeRegionLabel(item),
    })));
  const picks = photoPicks.rows ?? [];
  const chips = <TasteChipRow tags={tags} loading={profileLoading} />;
  if (!picks.length)
    return (
      <div className="pd-card">
        <div className="pd-card-title">{t("고른 취향의 명소")}</div>
        {/* 「취향 고르기 →」 버튼은 바로 위 TasteBanner 것 하나만 둡니다.
            두 카드가 붙어 있어 같은 버튼이 두 번 보였습니다. 여기서는 이
            자리가 왜 비어 있는지만 말합니다. */}
        {chips}
        <p className="pd-note" role={profileError ? "alert" : "status"}>
          {profileError ??
            (profileLoading
              ? t("저장된 취향을 조회하고 있습니다.")
              : tags.length
                ? t("저장된 취향입니다. 추천에서 후보를 조회하면 그 장소가 여기에 들어옵니다.")
                : t("아직 고른 취향이 없습니다. 위 「취향 고르기」로 취향을 고르면 그 결과가 여기에 들어옵니다."))}
        </p>
      </div>
    );
  return (
    <SpotScroller
      title={t("고른 취향의 명소")}
      note={t("추천에서 고른 취향에 맞춰 서버가 고른 장소입니다.")}
      link={{ href: "#recommend", label: t("추천 다시 보기") }}
      places={picks}
      chips={chips}
    >
      {t("퐁당 점수는 물놀이 조건이 있는 명소에만 산정됩니다. 없으면 –이며 0점이 아닙니다.")}</SpotScroller>
  );
}

/** 저장된 취향 칩. 조회가 끝나기 전에는 「없음」이 아니라 「모름」이므로
 *  스켈레톤으로 자리만 잡습니다. */
function TasteChipRow({ tags, loading }: { tags: string[]; loading: boolean }) {
  if (loading)
    return (
      <div className="hm-taste-chips" role="status" aria-label={t("저장된 취향을 조회하고 있습니다.")}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} width="4.5em" label={t("취향 조회 중")} />
        ))}
      </div>
    );
  if (!tags.length) return null;
  return (
    <div className="hm-taste-chips">
      {tags.map((tag) => (
        <span className="hm-taste-chip" key={tag}>
          {t(tag)}
          <Icon name="check" size={12} />
        </span>
      ))}
    </div>
  );
}

/** 「AI 제안」 칩과 그 근거.
 *
 *  예전에는 이 카드가 「취향만 알려주면 코스를 짜드려요」라는 고정 문장과, 그
 *  아래 「선택한 취향과 실제 장소 카탈로그를 비교합니다」라는 **설명문**을
 *  근거 자리에 세워 두었습니다. 둘 다 서버 응답을 보고 한 말이 아니어서, 칩은
 *  근거 없이 서 있었습니다 -- 핸드오프 데이터 표기 규칙 4 가 금지하는 모양입니다.
 *  데스크탑 홈(hd-ai)은 이미 서버가 고른 활동과 그 이유를 읽고 있었습니다. */
function TasteBanner({
  best,
  recommendation,
}: {
  best?: ActivityCondition | null;
  recommendation: { data?: Recommendation; error?: string };
}) {
  // useResource 는 같은 경로를 두 번 부르지 않으므로(no-refetch 검사) 아래
  // TastePicksCard 와 함께 불러도 요청이 늘지 않습니다.
  const { savedIds, loginRequired, profileLoading } = useTastePreference();
  const requireLogin = useRequireLogin();
  const hasTaste = savedIds.length > 0;
  return (
    <div className="pd-card">
      <AiSuggestion
        headline={
          best
            ? t("오늘 이 장소에서는 {activity}이(가) 가장 잘 맞습니다", { activity: t(activities[best.activity]) })
            : missingChoiceHeadline(recommendation.error, true).join(" ")
        }
        // 서버가 고른 이유를 먼저 씁니다. 없으면 점수를 깎은 항목으로
        // 물러서되, 조회 실패는 그 물러서기를 타지 않습니다 -- 닿지 못한 날에
        // 「근거가 부족해 점수를 내지 못했어요」라고 적으면 거짓말입니다.
        basis={
          recommendation.error
            ? t("추천 근거를 불러오지 못했어요. {error}", { error: t(recommendation.error) })
            : (choiceReason(recommendation.data)?.text ?? scoreReason(best?.data).text)
        }
        basisIsError={Boolean(recommendation.error)}
      />
      {profileLoading ? (
        <button type="button" className="pd-primary hm-cta" disabled>{t("조회 중")}</button>
      ) : loginRequired ? (
        <button type="button" className="pd-primary hm-cta" onClick={requireLogin}>{t("로그인")}</button>
      ) : (
        <a className="pd-primary hm-cta" href="#recommend">
          {hasTaste ? t("추천 다시 보기 →") : t("취향 고르기 →")}</a>
      )}
    </div>
  );
}

function RouteCard() {
  const session = useTravelSession();
  const routeCourse = session.route?.route ?? null;
  // 경로 계산 전에도 담아둔 코스(추천/지도에서 만든 planInput, 「내 코스」에서
  // 불러온 plan)는 있을 수 있습니다. route 만 보면 그 사이엔 홈이 늘 비어
  // 보였습니다.
  const planStops = routeCourse
    ? []
    : (session.plan?.days.flatMap((day) => day.items) ?? []);
  return (
    <div className="pd-card">
      <div className="hm-card-top">
        <div className="pd-card-title">{t("물놀이 최적경로")}</div>
        <StateChip kind={routeCourse ? "live" : "partial"} />
      </div>
      {/* 정차지를 번호 붙인 단계로 세웁니다. 예전에는 「경포 → 안목 → 사천진」
          처럼 화살표로 이은 한 줄이라, 정차지가 셋을 넘으면 줄바꿈 위치에 따라
          순서가 흐려졌습니다. 데스크탑 홈(hd-step)은 이미 번호와 연결선으로
          그리고 있었습니다. */}
      {routeCourse || planStops.length ? (
        <>
          <ol className="hm-steps">
            {(routeCourse?.items ?? planStops).map((item, index, all) => (
              <li className="hm-step" key={`${item.spot_id}-${index}`}>
                <span className="hm-step-head">
                  <span className="pd-num hm-step-no">{index + 1}</span>
                  {index < all.length - 1 && <span className="hm-step-line" />}
                </span>
                <span className="hm-step-name">{item.name}</span>
              </li>
            ))}
          </ol>
          <p className="pd-note">
            {routeCourse
              ? t("예상 이동 {minutes}분", { minutes: routeCourse.travel_minutes })
              : t("경로 미계산")}
          </p>
        </>
      ) : (
        <div className="pd-slot hm-route-slot">
          {t("추천에서 장소를 고르고 지도에서 경로를 요청하세요")}
        </div>
      )}
      <a className="pd-secondary hm-cta" href="#map?view=course">
        {t("경로 탐색 →")}</a>
      <p className="pd-note">
        {t("추천에서 고른 실제 장소를 지도에서 확인하고, 출발지를 정해 경로를 요청할 수 있습니다.")}</p>
    </div>
  );
}

function LivecamModule() {
  // 시드는 페이지가 기억합니다. 마운트마다 새로 뽑으면 창 폭을 바꿨다는
  // 이유로 목록을 다시 받고 풍경까지 바뀝니다(sessionWebcamShuffleSeed 주석).
  const [shuffleSeed, setShuffleSeed] = useState(sessionWebcamShuffleSeed);
  const { result, error, loading, expired, now } = useWebcamCatalog(1, "", shuffleSeed);
  const cameras = (result?.rows ?? []).flatMap(camera => {
    const player = previewPlayerUrl(camera, result!.valid_until, now);
    const href = player ?? safeWebcamUrl(camera.public_page, camera.provider_camera_id);
    return href ? [{ camera, href, label: player ? t(player === camera.live_player ? "실시간 안내 · 미검증" : "타임랩스") : t("원본 보기") }] : [];
  }).slice(0, 3);
  return (
    <div className="pd-card">
      <div className="hm-card-top">
        <div className="hm-card-top hm-card-top-tight">
          <span className="hm-badge-round">
            <Icon name="livecam" size={16} />
          </span>
          <div className="pd-card-title">{t("라이브캠 물멍")}</div>
        </div>
        <button className="pd-state-chip pd-tap" disabled={loading} onClick={() => setShuffleSeed(shuffleWebcams())}>{t("다른 풍경 보기")}</button>
      </div>
      <div className="hm-cam-row">
        {cameras.map(({ camera: cam, href, label }, index) => (
          <a className="hm-cam" href={href} target="_blank" rel="noopener noreferrer" key={cam.provider_camera_id}>
            <WebcamThumbnail
              camera={cam}
              className="hm-cam-thumb"
              style={{ background: CAM_BACKGROUNDS[index] }}
            />
            <span className="hm-cam-label">{cam.title} · {label}</span>
          </a>
        ))}
        {/* 송출이 없는 자리는 빈 줄로 두지 않고 그 사실을 밝힙니다. 예전에는
            아래 문단에 한 문장만 있어, 카드 줄 자체가 조용히 사라졌습니다
            (데스크탑 홈은 빈 상태 칸을 그리고 있었습니다). */}
        {!cameras.length && (
          <div className="hm-cam is-empty">
            <div className="hm-cam-thumb hm-cam-empty">
              <img src={mascotUrl("empty")} alt="" width={40} height={40} />
              <span className="hm-cam-empty-title">
                {loading ? t("조회 중") : t("송출 없음")}
              </span>
            </div>
            <span className="hm-cam-label">
              {error ??
                (loading
                  ? t("물 풍경을 고르는 중입니다.")
                  : t("현재 목록에 열 수 있는 물 풍경 카메라가 없습니다."))}
            </span>
          </div>
        )}
      </div>
      <p className="pd-note" role={error ? "alert" : "status"}>
        {error ||
          (loading
            ? t("물 풍경을 고르는 중입니다.")
            : cameras.length
              ? t("위치와 관계없이 고른 랜덤 물 풍경입니다. 카드를 누르면 해당 카메라가 열립니다. 대표 이미지는 저장된 사진이며 실시간 영상이 아닙니다.")
              : t("현재 목록에 열 수 있는 물 풍경 카메라가 없습니다."))}{" "}
        {expired && t("목록 유효기간이 지나 원본 페이지로 연결합니다. 다른 풍경 보기로 새로 불러오세요. ")}
        {/* 문단 안에 흐르는 인라인 링크입니다. min-height 는 인라인 요소에
            듣지 않으므로, 줄 높이를 깨지 않고 히트박스만 넓히는 .pd-tap 을
            함께 붙입니다(pongdang.css 터치 타깃 주석). */}
        <a className="pd-inline pd-tap" href="#livecam">{t("전체 라이브캠 →")}</a>
      </p>
      <p className="pd-note">Webcams provided by <a className="pd-inline pd-tap" href="https://www.windy.com/" target="_blank" rel="noopener noreferrer">windy.com</a></p>
    </div>
  );
}

function HomeScreen() {
  // 홈은 여섯 활동을 모두 보고 오늘 가장 좋은 하나를 고릅니다. 다른 화면은
  // 예전처럼 수영 한 번만 조회합니다(useProductData 의 mode 주석 참고).
  const { now, place, places, conditions, baseline, best, recommendation, displayName, selectionMessage, placeSettled, placeRequired } =
    useProductData("best");
  const quality = settledWithoutPlace(
    useResource<WaterQualityGrade>(
      place ? `quality/grade?spot_id=${place.id}` : undefined,
    ),
    placeSettled,
  );

  return (
    <article className="home-page">
      <AppShell
        tab="home"
        showFooterNote={false}
        hero={
          <Hero
            placeName={displayName}
            placeRequired={placeRequired}
            baseline={baseline.data}
            best={best}
            recommendation={recommendation.data}
            recommendationLoading={isInitialLoad(recommendation)}
            recommendationError={recommendation.error}
            loading={isInitialLoad(conditions)}
            baselineLoading={isInitialLoad(baseline)}
          />
        }
      >
          <GlanceCard
            quality={quality.error ? t("조회 실패") : waterQualityLabel(quality.data)}
            qualityLoading={isInitialLoad(quality)}
            qualityData={quality.data}
            qualityError={quality.error}
            spotId={place?.id}
            now={now}
            conditions={conditions.data}
            activity={best?.activity}
            loading={isInitialLoad(conditions)}
            statusIsError={Boolean(places.error ?? conditions.error)}
            statusText={
              places.error ??
              conditions.error ??
              (conditions.loading ? t("조건 조회 중입니다.") : selectionMessage)
            }
          />
          <HomeTides id={place?.id} placeSettled={placeSettled} />
          <BeachPicksCard />
          <TasteBanner best={best} recommendation={recommendation} />
          <TastePicksCard />
          <RouteCard />
        <LivecamModule />
      </AppShell>
    </article>
  );
}

export function HomePage() {
  // 같은 라우트(#home)에서 폭으로 레이아웃을 갈아 끼웁니다. 데스크탑은 모바일을
  // 넓힌 것이 아니라 문법이 달라서(카드 스택 ↔ 괘선 LabelRow) 마크업을
  // 공유하지 않습니다. 한 컴포넌트 안에서 isDesktop 삼항으로 나누지 않습니다.
  const isDesktop = useIsDesktop();
  // 이 화면은 실제 수집 데이터만 읽습니다. 상단 「데이터 구분」이 더미로
  // 선택돼 있어도 `/api/data` 로 고정합니다(`/api/demo` 는 은퇴해 404).
  return (
    <DataOrigin.Provider value="data">
      {isDesktop ? <HomeDesktop /> : <HomeScreen />}
    </DataOrigin.Provider>
  );
}
