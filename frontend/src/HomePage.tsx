import { ProductPlaceSelector } from "./ProductPlaceSelector";
import { t } from "./i18n.ts";
import { useState, type ReactNode } from "react";
import { DataOrigin } from "./DataOrigin";
import { gradeOf } from "./groupAGrade";
import {
  AiSuggestion,
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
import { componentBars, scoreReason, scoreTitle, verdictOf } from "./scoreMeaning";
import { RecommendationReason } from "./RecommendationReason";
import { activityHeadline, missingChoiceHeadline } from "./recommendationText";
import type { Recommendation } from "./recommendationApi";
import type { ActivityCondition } from "./useBestActivity";
import { AppHeader, AppShell } from "./AppShell";
import { WaterQualityDetails } from "./WaterQualityDetails";
import { PlacePhoto, PlacePhotoCredit } from "./PlacePhoto";
import type { PlacePhoto as Photo } from "./placePhotos";
import { usePlacePhotos } from "./usePlacePhotos";
import { HomeDesktop } from "./HomeDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { useTravelSession } from "./travelSession";
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
import { spotLink } from "./spotsRoute";
import { useWaterPlaces } from "./useWaterPlaces";
import { sessionWebcamShuffleSeed, shuffleWebcams } from "./livecamPreviewApi";
import { WAVE_LOOP_PATH } from "./waveShape";
import { previewPlayerUrl, safeWebcamUrl } from "./livecamApi";
import { useWebcamCatalog } from "./useWebcamCatalog";
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
  const verdict =
    best && !loading ? verdictOf(best.activity, gradeOf(best.score).key) : null;
  return (
    <header className="pd-hero">
      <AppHeader title={t("홈")} time={timeLabel(new Date().toISOString())} onCobalt />
      <div className="hm-hero-inner">
        <div className="hm-hero-top">
          <span className="pd-lbl hm-hero-place">
            <Icon name="pin" size={12} />
            {placeName} · {dateLabel()}
          </span>
        </div>

        <ProductPlaceSelector placeName={placeName} />

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
          <div className="hm-hero-score">
            <div className="pd-num hm-hero-score-num">
              {loading ? (
                <Skeleton width="1.6em" glass label={t("점수 조회 중")} />
              ) : (
                (best?.score ?? "–")
              )}
            </div>
            <GradeChip
              score={best?.score ?? null}
              prefix={best ? scoreTitle(best.activity) : undefined}
              loading={loading}
              glass
              bare
            />
          </div>
        </div>

        <ScoreGauge score={best?.score ?? null} loading={loading} glass />
        {/* 등급명은 상태어라 가도 되는지가 읽히지 않습니다. 「양호」 옆에 그래서
            뭘 해도 되는지를 한 줄로 붙입니다. 값이 없으면 문장을 지어내지 않고
            비워 둡니다 -- 모르는 것을 「괜찮다」로 바꾸지 않기 위해서입니다. */}
        {verdict && <p className="hm-hero-verdict">{verdict}</p>}
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
  children,
}: {
  title: string;
  note: string;
  link: { href: string; label: string };
  places: { id: number; name: string; meta: string; photo?: Photo }[];
  children: ReactNode;
}) {
  return (
    <div className="pd-card">
      <div className="hm-picks-head">
        <div className="pd-card-title">{title}</div>
        <a className="hm-picks-link pd-inline" href={link.href}>
          {link.label} →
        </a>
      </div>
      <p className="pd-note hm-picks-note">{note}</p>
      <div className="hm-picks-row">
        {places.map((place) => (
          <div className="hm-pick" key={place.id}>
            <a className="place-photo-link" href={spotLink(place)}>
              <PlacePhoto className="hm-pick-photo" name={place.name} photo={place.photo} />
              <span className="hm-pick-name">{place.name}</span>
              <span className="hm-pick-meta">{place.meta}</span>
            </a>
            <PlacePhotoCredit photo={place.photo} />
          </div>
        ))}
        {/* 점수 칩이 있던 자리입니다. 명소마다 점수를 붙이려면 장소마다 한
            번씩 조회해야 해서, 목록에서는 약속하지 않고 상세에서 읽습니다. */}
      </div>
      <div className="pd-note hm-picks-foot">{children}</div>
    </div>
  );
}

/** 예전에는 이 줄이 spotsCatalog 의 해변 4곳이었고 거리 · 점수가 지어낸
 *  값이었습니다. 이제 서버가 분류한 실제 해변을 싣습니다. */
function BeachPicksCard() {
  const places = useWaterPlaces("");
  const beaches = (places.rows ?? [])
    .filter((place) => place.type === "beach")
    .slice(0, 4)
    .map((place) => ({
      id: place.id,
      name: place.name,
      meta: placeRegionLabel(place),
      photo: place.photo,
    }));
  if (!beaches.length)
    return (
      <div className="pd-card">
        <div className="pd-card-title">{t("바다가 좋은 오늘 · 해변 명소")}</div>
        <p className="pd-note" role={places.error ? "alert" : "status"}>
          <StateChip kind={places.rows ? "no_data" : "partial"} />{" "}
          {places.error ??
            (places.loading
              ? t("해변 목록을 조회하고 있습니다.")
              : t("수집된 해변이 아직 없습니다."))}
        </p>
      </div>
    );
  return (
    <SpotScroller
      title={t("바다가 좋은 오늘 · 해변 명소")}
      note={t("서버가 카테고리와 장소명을 보고 해변으로 분류한 곳입니다.")}
      link={{ href: "#spots", label: t("명소 전체") }}
      places={beaches}
    >
      <StateChip kind="live" />
      {t("명소를 고르면 그곳의 퐁당 점수를 조회합니다. 거리 · 운영시간은 아직 내려주는 API 가 없습니다. 대표 사진은 수집된 사진이 있는 장소에 표시합니다.")}</SpotScroller>
  );
}

/** 예전에는 「고른 취향의 명소 · 서핑 · 온천」이 늘 떠 있었습니다. 고른 적이
 *  없는데도 고른 것처럼 보였습니다 -- 취향은 파일 안 상수였습니다.
 *
 *  실제로 고른 취향은 추천 결과 안에만 남습니다(matched_preferences). 추천을
 *  받기 전에는 보여 줄 것이 없으므로 그 사실을 적고 추천으로 보냅니다. */
function TastePicksCard() {
  const session = useTravelSession();
  const photoPicks = usePlacePhotos((session.recommendation?.recommendations ?? [])
    .slice(0, 4)
    .map((item) => ({
      id: item.spot_id,
      name: item.name,
      meta: placeRegionLabel(item),
    })));
  const picks = photoPicks.rows ?? [];
  const tags = [
    ...new Set(
      (session.recommendation?.recommendations ?? []).flatMap((item) =>
        item.matched_preferences.map((preference) => preference.tag),
      ),
    ),
  ];
  if (!picks.length)
    return (
      <div className="pd-card">
        <div className="pd-card-title">{t("고른 취향의 명소")}</div>
        {/* 「취향 고르기 →」 버튼은 바로 위 TasteBanner 것 하나만 둡니다.
            두 카드가 붙어 있어 같은 버튼이 두 번 보였습니다. 여기서는 이
            자리가 왜 비어 있는지만 말합니다. */}
        <p className="pd-note">
          {t("아직 고른 취향이 없습니다. 위 「취향 고르기」로 취향을 고르면 그 결과가 여기에 들어옵니다.")}</p>
      </div>
    );
  return (
    <SpotScroller
      title={t("고른 취향의 명소{tags}", { tags: tags.length ? ` · ${tags.map((tag) => t(tag)).join(" · ")}` : "" })}
      note={t("추천에서 고른 취향에 맞춰 서버가 고른 장소입니다.")}
      link={{ href: "#recommend", label: t("추천 다시 보기") }}
      places={picks}
    >
      {t("퐁당 점수는 물놀이 조건이 있는 명소에만 산정됩니다. 없으면 –이며 0점이 아닙니다.")}</SpotScroller>
  );
}

function TasteBanner() {
  return (
    <div className="pd-card">
      <AiSuggestion
        headline={t("취향만 알려주면 코스를 짜드려요")}
        basis={
          t("선택한 취향과 실제 장소 카탈로그, 해당 시각의 환경 근거를 비교합니다. 추천 이유와 미확인 조건은 결과에서 함께 확인하세요.")
        }
      />
      <a className="pd-primary hm-cta" href="#recommend">
        {t("취향 고르기 →")}</a>
    </div>
  );
}

function RouteCard() {
  const session = useTravelSession();
  return (
    <div className="pd-card">
      <div className="hm-card-top">
        <div className="pd-card-title">{t("물놀이 최적경로")}</div>
        <StateChip kind="partial" />
      </div>
      <div className="pd-slot hm-route-slot">
        {session.route?.route
          ? t("{places} · 예상 이동 {minutes}분", { places: session.route.route.items.map((item) => item.name).join(" → "), minutes: session.route.route.travel_minutes })
          : t("추천에서 장소를 고르고 지도에서 경로를 요청하세요")}
      </div>
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
    return href ? [{ camera, href, label: player ? t("타임랩스") : t("원본 보기") }] : [];
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
            <span
              className="hm-cam-thumb"
              style={{ background: CAM_BACKGROUNDS[index] }}
            />
            <span className="hm-cam-label">{cam.title} · {label}</span>
          </a>
        ))}
      </div>
      <p className="pd-note" role={error ? "alert" : "status"}>
        {error ||
          (loading
            ? t("물 풍경을 고르는 중입니다.")
            : cameras.length
              ? t("위치와 관계없이 고른 랜덤 물 풍경입니다. 카드를 누르면 해당 카메라가 열립니다. 배경은 영상 썸네일이 아닙니다.")
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
          <BeachPicksCard />
          <TasteBanner />
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
