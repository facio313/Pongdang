import { useState, type ReactNode } from "react";
import { DataOrigin } from "./DataOrigin";
import { gradeOf } from "./groupAGrade";
import {
  AiSuggestion,
  ComponentBars,
  GradeChip,
  Icon,
  MetricValue,
  ScoreExplainer,
  ScoreGauge,
  ScoreReason,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { activities, type Activity } from "./aiApi";
import { componentBars, scoreReason, scoreTitle, verdictOf } from "./scoreMeaning";
import type { ActivityCondition } from "./useBestActivity";
import { AppHeader, AppShell } from "./AppShell";
import { EvidenceNote } from "./EvidenceNote";
import { HomeDesktop } from "./HomeDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { useTravelSession } from "./travelSession";
import { isInitialLoad, useResource } from "./useResource";
import { useProductData } from "./useProductData";
import { WaterQualityDetails } from "./WaterQualityDetails";
import { HourlyConditions } from "./HourlyConditions";
import {
  dateLabel,
  conditionModeLabel,
  timeLabel,
  waterQualityLabel,
  type Conditions,
  type WaterQualityGrade,
} from "./productData";
import {
  BEACH_PICKS,
  TASTE_LABEL,
  TASTE_PICKS,
  spotLink,
  type Spot,
} from "./spotsCatalog";
import { newWebcamShuffleSeed } from "./livecamPreviewApi";
import { previewPlayerUrl, safeWebcamUrl } from "./livecamApi";
import { useWebcamCatalog } from "./useWebcamCatalog";
import "./homePage.css";

// Keep the product layout; only server evidence supplies condition values.
const HERO_DATE = dateLabel();
const CAM_BACKGROUNDS = [
  "linear-gradient(160deg,#4fb3d9,#1d6fd8)",
  "linear-gradient(160deg,#e0a72a,#b97a1d)",
  "linear-gradient(160deg,#6b8fae,#33475a)",
];

function Hero({
  placeName,
  conditions,
  baseline,
  best,
  loading = false,
  baselineLoading = false,
}: {
  placeName: string;
  conditions?: Conditions;
  /** 활동과 무관한 「지금 날씨와 바다」의 기준 응답. 점수용 응답과 다릅니다 --
   *  서버는 그 활동이 보는 지표만 내려주기 때문입니다(useProductData 주석). */
  baseline?: Conditions;
  /** 오늘 이 장소에서 조건이 가장 좋은 활동. 없으면 고를 것이 없다는 뜻입니다. */
  best: ActivityCondition | null;
  /** 조건 조회 중. 「자료 없음」(–)과 구분해 그립니다. */
  loading?: boolean;
  baselineLoading?: boolean;
}) {
  const verdict =
    best && !loading ? verdictOf(best.activity, gradeOf(best.score).key) : null;
  return (
    <header className="pd-hero">
      <AppHeader title="홈" time={timeLabel(new Date().toISOString())} onCobalt />
      <div className="hm-hero-inner">
        <div className="hm-hero-top">
          <span className="pd-lbl hm-hero-place">
            <Icon name="pin" size={12} />
            {placeName} · {HERO_DATE}
          </span>
        </div>

        {/* 예전에는 이 자리가 점선 pd-slot 이었습니다. 실제 수집한 기온 ·
            수온 · 파고 · 강수가 들어 있는데도 「미구현」으로 읽혔습니다.
            점선은 아직 설계되지 않은 자리에만 씁니다. */}
        <div className="hm-hero-visual">
          <div className="hm-hero-visual-head">
            {conditionModeLabel(baseline)} 기준 날씨와 바다
          </div>
          <dl className="hm-hero-metrics">
            <div>
              <dt>기온</dt>
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
              <dt>수온</dt>
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
              <dt>파고</dt>
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
              <dt>바람</dt>
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
              <dt>1시간 강수량</dt>
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
              <Skeleton width="7em" glass label="오늘의 활동 조회 중" />
            ) : best ? (
              <>
                오늘 가장 좋은 활동
                <br />
                <b>{activities[best.activity]}</b>
              </>
            ) : (
              <>
                오늘 점수를 낼 수 있는
                <br />
                활동이 없어요
              </>
            )}
          </h1>
          <div className="hm-hero-score">
            <div className="pd-num hm-hero-score-num">
              {loading ? (
                <Skeleton width="1.6em" glass label="점수 조회 중" />
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
        <ScoreReason
          text={scoreReason(best?.data).text}
          loading={loading}
          glass
        />

        {/* 이 자리는 예전에 근거 전문 한 문단이었습니다. 문구는 그대로 두고
            「근거 보기」 안으로 층만 나눕니다(EvidenceNote 주석 참고). */}
        <EvidenceNote data={conditions} className="hm-hero-note" glass />

        <div className="hm-hero-actions">
          <a className="pd-inline pd-tap" href="#today">
            활동 여섯 가지 모두 보기 →
          </a>
          <ScoreExplainer data={conditions} />
        </div>
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
        오늘 한눈에
        {activity ? ` · ${activities[activity]} 점수를 이루는 것들` : ""}
      </div>
      {loading || bars.length ? (
        <ComponentBars bars={bars} loading={loading} />
      ) : (
        <p className="pd-note">
          점수를 이루는 항목을 읽지 못했습니다. 아래 상태 문장을 확인하세요.
        </p>
      )}

      {/* 수질은 점수에 들어가지 않습니다(백엔드 activity_score 의 입력에
          없습니다). 위 항목들과 같은 줄에 두면 점수 근거로 오인되므로 자리를
          나누고 그 사실을 배지로 밝힙니다. */}
      <div className="hm-glance-aside">
        <span className="hm-glance-aside-name">수질 · 최근 검사</span>
        <span className="pd-num hm-glance-aside-value">
          {qualityLoading ? <Skeleton width="2.6em" /> : quality}
        </span>
        <span className="pd-state-chip">점수 미반영</span>
      </div>

      <WaterQualityDetails data={qualityData} error={qualityError} className="pd-note" />
      <HourlyConditions id={spotId} now={now} />
      <p className="pd-note" role={statusIsError ? "alert" : "status"}>
        <StateChip kind={conditions ? "live" : "no_data"} /> {conditionModeLabel(conditions)} 기준이며
        강수는 강수량입니다. 자료가 없거나 상충하면 –로 표시합니다. 항목 점수는
        100점 만점이며, 총점은 이 항목들을 같은 비중으로 평균낸 값입니다. {statusText}
      </p>
    </div>
  );
}

/** 홈의 명소 가로 줄. 「바다가 좋은 오늘」과 「고른 취향의 명소」가 같은 모양을
 *  쓰므로 한 컴포넌트로 둡니다. 사진은 아직 확보되지 않아 빈 슬롯입니다. */
function SpotScroller({
  title,
  note,
  link,
  spots,
  children,
}: {
  title: string;
  note: string;
  link: { href: string; label: string };
  spots: Spot[];
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
        {spots.map((spot) => (
          <a className="hm-pick" href={spotLink(spot)} key={spot.id}>
            {/* 사진은 아직 미확보입니다. 예전에는 점선 pd-slot 이었는데, 한
                화면에 8칸 넘게 반복되면서 앱 전체가 미완성으로 읽혔습니다.
                점선은 미설계 섹션에만 두고 여기는 중립 자리표시자입니다. */}
            <span className="hm-pick-photo" aria-label={`${spot.name} 대표 사진 준비 중`}>
              <Icon name="pin" size={20} />
            </span>
            <span className="hm-pick-name">{spot.name}</span>
            <span className="hm-pick-meta">
              {spot.categoryLabel} · {spot.distanceKm}km
            </span>
            <span className="hm-pick-score">
              <GradeChip
                score={spot.score}
                prefix="퐁당"
                label={spot.score === null ? spot.unscoredLabel : undefined}
              />
            </span>
          </a>
        ))}
      </div>
      <div className="pd-note hm-picks-foot">{children}</div>
    </div>
  );
}

function BeachPicksCard() {
  return (
    <SpotScroller
      title="바다가 좋은 오늘 · 해변 명소"
      note="위 「오늘 한눈에」가 바다를 권했기 때문에 해변 카테고리를 먼저 보여줍니다."
      link={{ href: "#spots", label: "명소 전체" }}
      spots={BEACH_PICKS}
    >
      <StateChip kind="example" />
      <span className="pd-state-chip">명소 API 미연동</span>
      공공 API를 백엔드에서 가공한 목록입니다.
    </SpotScroller>
  );
}

function TastePicksCard() {
  return (
    <SpotScroller
      title={`고른 취향의 명소 · ${TASTE_LABEL}`}
      note={`선택한 취향(${TASTE_LABEL})에 해당하는 카테고리만 걸러 보여줍니다. 카페를 고르면 같은 자리에 카페 명소가 들어옵니다.`}
      link={{ href: "#spots", label: "더 보기" }}
      spots={TASTE_PICKS}
    >
      퐁당 점수는 물놀이 조건이 있는 명소에만 산정됩니다. 없으면 <b>–</b>이며
      0점이 아닙니다.
    </SpotScroller>
  );
}

function TasteBanner() {
  return (
    <div className="pd-card">
      <AiSuggestion
        headline="취향만 알려주면 코스를 짜드려요"
        basis={
          "선택한 취향과 실제 장소 카탈로그, 해당 시각의 환경 근거를 비교합니다. 추천 이유와 미확인 조건은 결과에서 함께 확인하세요."
        }
      />
      <a className="pd-primary hm-cta" href="#recommend">
        취향 고르기 →
      </a>
    </div>
  );
}

function RouteCard() {
  const session = useTravelSession();
  return (
    <div className="pd-card">
      <div className="hm-card-top">
        <div className="pd-card-title">물놀이 최적경로</div>
        <StateChip kind="partial" />
      </div>
      <div className="pd-slot hm-route-slot">
        {session.route?.route
          ? `${session.route.route.items.map((item) => item.name).join(" → ")} · 예상 이동 ${session.route.route.travel_minutes}분`
          : "추천에서 장소를 고르고 지도에서 경로를 요청하세요"}
      </div>
      <a className="pd-secondary hm-cta" href="#map?view=course">
        경로 탐색 →
      </a>
      <p className="pd-note">
        추천에서 고른 실제 장소를 지도에서 확인하고, 출발지를 정해 경로를 요청할
        수 있습니다.
      </p>
    </div>
  );
}

function LivecamModule() {
  const [shuffleSeed, setShuffleSeed] = useState(newWebcamShuffleSeed);
  const { result, error, loading, expired, now } = useWebcamCatalog(1, "", shuffleSeed);
  const cameras = (result?.rows ?? []).flatMap(camera => {
    const player = previewPlayerUrl(camera, result!.valid_until, now);
    const href = player ?? safeWebcamUrl(camera.public_page, camera.provider_camera_id);
    return href ? [{ camera, href, label: player ? "타임랩스" : "원본 보기" }] : [];
  }).slice(0, 3);
  return (
    <div className="pd-card">
      <div className="hm-card-top">
        <div className="hm-card-top hm-card-top-tight">
          <span className="hm-badge-round">
            <Icon name="livecam" size={16} />
          </span>
          <div className="pd-card-title">라이브캠 물멍</div>
        </div>
        <button className="pd-state-chip pd-tap" disabled={loading} onClick={() => setShuffleSeed(newWebcamShuffleSeed)}>다른 풍경 보기</button>
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
            ? "물 풍경을 고르는 중입니다."
            : cameras.length
              ? "위치와 관계없이 고른 랜덤 물 풍경입니다. 카드를 누르면 해당 카메라가 열립니다. 배경은 영상 썸네일이 아닙니다."
              : "현재 목록에 열 수 있는 물 풍경 카메라가 없습니다.")}{" "}
        {expired && "목록 유효기간이 지나 원본 페이지로 연결합니다. 다른 풍경 보기로 새로 불러오세요. "}
        {/* 문단 안에 흐르는 인라인 링크입니다. min-height 는 인라인 요소에
            듣지 않으므로, 줄 높이를 깨지 않고 히트박스만 넓히는 .pd-tap 을
            함께 붙입니다(pongdang.css 터치 타깃 주석). */}
        <a className="pd-inline pd-tap" href="#livecam">전체 라이브캠 →</a>
      </p>
      <p className="pd-note">Webcams provided by <a className="pd-inline pd-tap" href="https://www.windy.com/" target="_blank" rel="noopener noreferrer">windy.com</a></p>
    </div>
  );
}

function HomeScreen() {
  // 홈은 여섯 활동을 모두 보고 오늘 가장 좋은 하나를 고릅니다. 다른 화면은
  // 예전처럼 수영 한 번만 조회합니다(useProductData 의 mode 주석 참고).
  const { now, place, places, conditions, baseline, best, displayName, selectionMessage } =
    useProductData("best");
  const quality = useResource<WaterQualityGrade>(
    place ? `quality/grade?spot_id=${place.id}` : null,
  );

  return (
    <article className="home-page">
      <AppShell
        tab="home"
        hero={
          <Hero
            placeName={displayName}
            conditions={conditions.data}
            baseline={baseline.data}
            best={best}
            loading={isInitialLoad(conditions)}
            baselineLoading={isInitialLoad(baseline)}
          />
        }
      >
          <GlanceCard
            quality={quality.error ? "조회 실패" : waterQualityLabel(quality.data)}
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
              (conditions.loading ? "조건 조회 중입니다." : selectionMessage)
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
