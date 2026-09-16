import { useEffect, useState, type ReactNode } from "react";
import { DataOrigin } from "./DataOrigin";
import { AiSuggestion, GradeChip, Icon, StateChip } from "./pongdangUi";
import { AppHeader, AppShell } from "./AppShell";
import { HomeDesktop } from "./HomeDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { useTravelSession } from "./travelSession";
import { useResource } from "./useResource";
import { useProductData } from "./useProductData";
import { WaterQualityDetails } from "./WaterQualityDetails";
import { HourlyConditions } from "./HourlyConditions";
import {
  dateLabel,
  conditionScore,
  conditionScoreText,
  conditionModeLabel,
  timeLabel,
  metricText,
  evidenceText,
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

const MENU_ITEMS: {
  label: string;
  href?: string;
  state?: "uncollected";
}[] = [
  { label: "저장한 코스", href: "#my-courses" },
  { label: "지점 즐겨찾기", href: "#favorites" },
  { label: "알림 설정", href: "#first-swim" },
  { label: "데이터 출처와 갱신", href: "#info" },
  { label: "이용 안내", href: "#info" },
  { label: "설정", href: "#recommend" },
];

function Hero({
  placeName,
  onOpenMenu,
  conditions,
}: {
  placeName: string;
  conditions?: Conditions;
  onOpenMenu: () => void;
}) {
  return (
    <header className="pd-hero">
      <AppHeader title="홈" time={timeLabel(new Date().toISOString())} onCobalt />
      <div className="hm-hero-inner">
        <div className="hm-hero-top">
          <button
            type="button"
            className="hm-menu-button"
            onClick={onOpenMenu}
            aria-label="사이드 메뉴 열기"
          >
            <Icon name="menu" size={18} />
          </button>
          <span className="pd-lbl hm-hero-place">
            <Icon name="pin" size={12} />
            {placeName} · {HERO_DATE}
          </span>
        </div>

        <div className="pd-slot is-on-cobalt hm-hero-visual">
          <div>
            <div>{conditionModeLabel(conditions)} 기준 날씨와 바다</div>
            <p>기온 {metricText(conditions, "air_temperature")} · 수온 {metricText(conditions, "water_temperature")}</p>
            <p>파고 {metricText(conditions, "wave_height")} · 바람 {metricText(conditions, "wind_speed")}</p>
            <p>1시간 강수량 {metricText(conditions, "precipitation")}</p>
          </div>
        </div>

        <div className="hm-hero-row">
          <h1 className="hm-hero-sentence">
            오늘의 물놀이 조건
            <br />
            자료를 확인하세요
          </h1>
          <div className="hm-hero-score">
            <div className="pd-num hm-hero-score-num">
              {conditionScore(conditions) ?? "–"}
            </div>
            <GradeChip
              score={conditionScore(conditions)}
              glass
              bare
            />
          </div>
        </div>

        <p className="hm-hero-note">
          {conditionScoreText(conditions)} {evidenceText(conditions)} 안전 상태:{" "}
          {conditions?.safety_status ?? "unknown"}.
        </p>
      </div>
    </header>
  );
}

function GlanceCard({
  statusText,
  conditions,
  quality,
  qualityData,
  qualityError,
  spotId,
  now,
}: {
  statusText: string;
  conditions?: Conditions;
  quality: string;
  qualityData?: WaterQualityGrade;
  qualityError?: string;
  spotId?: number;
  now: string;
}) {
  const tiles = [
    { name: "수온", value: metricText(conditions, "water_temperature") },
    { name: "파고", value: metricText(conditions, "wave_height") },
    { name: "강수", value: metricText(conditions, "precipitation") },
    { name: "수질 · 최근 검사", value: quality },
  ];
  return (
    <div className="pd-card">
      <div className="pd-card-title">오늘 한눈에</div>
      <div className="hm-tiles">
        {tiles.map((tile) => (
          <div
            className={"hm-tile" + (tile.value === "–" ? " is-empty" : "")}
            key={tile.name}
          >
            <div className="pd-num hm-tile-value">{tile.value}</div>
            <div className="hm-tile-name">{tile.name}</div>
          </div>
        ))}
      </div>
      <WaterQualityDetails data={qualityData} error={qualityError} className="pd-note" />
      <HourlyConditions id={spotId} now={now} />
      <p className="pd-note">
        <StateChip kind={conditions ? "live" : "no_data"} /> {conditionModeLabel(conditions)} 기준이며
        강수는 강수량입니다. 자료가 없거나 상충하면 –로 표시합니다. {statusText}
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
            <span className="pd-slot hm-pick-photo">
              {spot.name}
              <br />
              대표 사진
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
      <p className="pd-note">
        {error ||
          (loading
            ? "물 풍경을 고르는 중입니다."
            : cameras.length
              ? "위치와 관계없이 고른 랜덤 물 풍경입니다. 카드를 누르면 해당 카메라가 열립니다. 배경은 영상 썸네일이 아닙니다."
              : "현재 목록에 열 수 있는 물 풍경 카메라가 없습니다.")}{" "}
        {expired && "목록 유효기간이 지나 원본 페이지로 연결합니다. 다른 풍경 보기로 새로 불러오세요. "}
        <a href="#livecam">전체 라이브캠 →</a>
      </p>
      <p className="pd-note">Webcams provided by <a href="https://www.windy.com/" target="_blank" rel="noopener noreferrer">windy.com</a></p>
    </div>
  );
}

function SideMenu({ onClose }: { onClose: () => void }) {
  // 메뉴는 뷰포트 전체를 덮으므로(.hm-menu 가 position: fixed), 열려 있는
  // 동안 뒤 본문이 따라 스크롤되지 않게 잠급니다.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="hm-backdrop"
        onClick={onClose}
        aria-label="사이드 메뉴 닫기"
      />
      <div className="hm-menu" role="dialog" aria-label="사이드 메뉴">
        <div className="hm-menu-head">
          <div className="hm-menu-head-top">
            <span className="pd-header-mark">PONGDANG</span>
            <button
              type="button"
              className="hm-menu-close"
              onClick={onClose}
              aria-label="닫기"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="hm-menu-profile">
            <span className="hm-menu-avatar">
              사진
              <br />
              없음
            </span>
            <div>
              <div className="hm-menu-signin">Pongdang</div>
              <div className="hm-menu-signin-sub">
                기존 SSO 세션으로 개인 코스를 관리합니다
              </div>
            </div>
          </div>
        </div>
        <nav className="hm-menu-list" aria-label="사이드 메뉴 항목">
          {MENU_ITEMS.map((item) =>
            item.href ? (
              <a className="hm-menu-item" href={item.href} key={item.label}>
                {item.label}
              </a>
            ) : (
              <button
                type="button"
                className="hm-menu-item"
                key={item.label}
                disabled
              >
                {item.label}
                <StateChip kind="uncollected" />
              </button>
            ),
          )}
        </nav>
        <p className="hm-menu-note">
          개인 코스·즐겨찾기·알림은 본인의 SSO 세션을 사용합니다. 설정에서 추천
          취향을 변경할 수 있습니다.
        </p>
      </div>
    </>
  );
}

function HomeScreen() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { now, place, places, conditions, displayName, selectionMessage } = useProductData();
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
            onOpenMenu={() => setMenuOpen(true)}
          />
        }
      >
          <GlanceCard
            quality={quality.loading ? "조회 중" : quality.error ? "조회 실패"
              : waterQualityLabel(quality.data)}
            qualityData={quality.data}
            qualityError={quality.error}
            spotId={place?.id}
            now={now}
            conditions={conditions.data}
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
        {menuOpen && <SideMenu onClose={() => setMenuOpen(false)} />}
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
