import { useState } from "react";
import { DataOrigin } from "./DataOrigin";
import { AiSuggestion, GradeChip, Icon, StateChip } from "./pongdangUi";
import { AppTabBar } from "./appTabBar";
import { useTravelSession } from "./travelSession";
import { useResource } from "./useResource";
import { useProductData } from "./useProductData";
import {
  dateLabel,
  conditionScore,
  conditionScoreText,
  conditionModeLabel,
  timeLabel,
  metricText,
  evidenceText,
  qualityGrade,
  type Conditions,
  type QualityRow,
  type RowPage,
} from "./productData";
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
    <header className="hm-hero">
      <div className="hm-sbar">
        <span>{timeLabel(new Date().toISOString())}</span>
        <span className="hm-sbar-mark">PONGDANG</span>
        <span>홈</span>
      </div>
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
          <span className="hm-lbl hm-hero-place">
            <Icon name="pin" size={12} />
            {placeName} · {HERO_DATE}
          </span>
        </div>

        <div className="hm-slot is-on-cobalt hm-hero-visual">
          파도 · 날씨 애니메이션 시각화 영역
          <br />
          (해 · 비 · 파고 종합, 위치 기반 · 별도 작업)
        </div>

        <div className="hm-hero-row">
          <h1 className="hm-hero-sentence">
            오늘의 물놀이 조건
            <br />
            자료를 확인하세요
          </h1>
          <div className="hm-hero-score">
            <div className="hm-num hm-hero-score-num">
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
}: {
  statusText: string;
  conditions?: Conditions;
  quality: string;
}) {
  const tiles = [
    { name: "수온", value: metricText(conditions, "water_temperature") },
    { name: "파고", value: metricText(conditions, "wave_height") },
    { name: "강수", value: metricText(conditions, "precipitation") },
    { name: "수질", value: quality },
  ];
  return (
    <div className="hm-card">
      <div className="hm-card-title">오늘 한눈에</div>
      <div className="hm-tiles">
        {tiles.map((tile) => (
          <div
            className={"hm-tile" + (tile.value === "–" ? " is-empty" : "")}
            key={tile.name}
          >
            <div className="hm-num hm-tile-value">{tile.value}</div>
            <div className="hm-tile-name">{tile.name}</div>
          </div>
        ))}
      </div>
      <div className="hm-slot hm-graph-slot">시간대별 그래프 (09–18시)</div>
      <p className="hm-note">
        <StateChip kind={conditions ? "live" : "no_data"} /> {conditionModeLabel(conditions)} 기준이며
        강수는 강수량입니다. 자료가 없거나 상충하면 –로 표시합니다. {statusText}
      </p>
    </div>
  );
}

function TasteBanner() {
  return (
    <div className="hm-card">
      <AiSuggestion
        headline="취향만 알려주면 코스를 짜드려요"
        basis={
          "선택한 취향과 실제 장소 카탈로그, 해당 시각의 환경 근거를 비교합니다. 추천 이유와 미확인 조건은 결과에서 함께 확인하세요."
        }
      />
      <a className="hm-primary" href="#recommend">
        취향 고르기 →
      </a>
    </div>
  );
}

function RouteCard() {
  const session = useTravelSession();
  return (
    <div className="hm-card">
      <div className="hm-card-top">
        <div className="hm-card-title">물놀이 최적경로</div>
        <StateChip kind="partial" />
      </div>
      <div className="hm-slot hm-route-slot">
        {session.route?.route
          ? `${session.route.route.items.map((item) => item.name).join(" → ")} · 예상 이동 ${session.route.route.travel_minutes}분`
          : "추천에서 장소를 고르고 지도에서 경로를 요청하세요"}
      </div>
      <a className="hm-secondary" href="#map?view=course">
        경로 탐색 →
      </a>
      <p className="hm-note">
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
    <div className="hm-card">
      <div className="hm-card-top">
        <div className="hm-card-top" style={{ gap: 8 }}>
          <span className="hm-badge-round">
            <Icon name="livecam" size={16} />
          </span>
          <div className="hm-card-title">라이브캠 물멍</div>
        </div>
        <button className="pd-state-chip" disabled={loading} onClick={() => setShuffleSeed(newWebcamShuffleSeed)}>다른 풍경 보기</button>
      </div>
      <div className="hm-cam-row">
        {cameras.map(({ camera: cam, href, label }, index) => (
          <a className="hm-cam" href={href} target="_blank" rel="noopener noreferrer" key={cam.provider_camera_id}>
            <span
              className="hm-cam-thumb"
              style={{ background: CAM_BACKGROUNDS[index], display: "block" }}
            />
            <span className="hm-cam-label">{cam.title} · {label}</span>
          </a>
        ))}
      </div>
      <p className="hm-note">
        {error ||
          (loading
            ? "물 풍경을 고르는 중입니다."
            : cameras.length
              ? "위치와 관계없이 고른 랜덤 물 풍경입니다. 카드를 누르면 해당 카메라가 열립니다. 배경은 영상 썸네일이 아닙니다."
              : "현재 목록에 열 수 있는 물 풍경 카메라가 없습니다.")}{" "}
        {expired && "목록 유효기간이 지나 원본 페이지로 연결합니다. 다른 풍경 보기로 새로 불러오세요. "}
        <a href="#livecam">전체 라이브캠 →</a>
      </p>
      <p className="hm-note">Webcams provided by <a href="https://www.windy.com/" target="_blank" rel="noopener noreferrer">windy.com</a></p>
    </div>
  );
}

function SideMenu({ onClose }: { onClose: () => void }) {
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
            <span className="hm-sbar-mark">PONGDANG</span>
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
  const { place, places, conditions, displayName, selectionMessage } = useProductData();
  const quality = useResource<RowPage<QualityRow>>(
    place ? `quality/comparisons?spot_id=${place.id}&page_size=100` : null,
  );

  return (
    <article className="home-page">
      <div className="hm-frame">
        <Hero
          placeName={displayName}
          conditions={conditions.data}
          onOpenMenu={() => setMenuOpen(true)}
        />
        <div className="hm-body">
          <GlanceCard
            quality={qualityGrade(quality.data?.rows ?? [])}
            conditions={conditions.data}
            statusText={
              places.error ??
              conditions.error ??
              (conditions.loading ? "조건 조회 중입니다." : selectionMessage)
            }
          />
          <TasteBanner />
          <RouteCard />
          <LivecamModule />
          <AppTabBar active="home" />
        </div>
        {menuOpen && <SideMenu onClose={() => setMenuOpen(false)} />}
      </div>
    </article>
  );
}

export function HomePage() {
  // 이 화면은 실제 수집 데이터만 읽습니다. 상단 「데이터 구분」이 더미로
  // 선택돼 있어도 `/api/data` 로 고정합니다(`/api/demo` 는 은퇴해 404).
  return (
    <DataOrigin.Provider value="data">
      <HomeScreen />
    </DataOrigin.Provider>
  );
}
