import { useEffect, useRef, useState, type ReactNode } from "react";
import { DataOrigin } from "./DataOrigin";
import {
  AiSuggestion,
  GradeChip,
  Icon,
  MetricValue,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { AppHeader, AppShell } from "./AppShell";
import { HomeDesktop } from "./HomeDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { useTravelSession } from "./travelSession";
import { isInitialLoad, useResource } from "./useResource";
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
  loading = false,
}: {
  placeName: string;
  conditions?: Conditions;
  /** 조건 조회 중. 「자료 없음」(–)과 구분해 그립니다. */
  loading?: boolean;
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

        {/* 예전에는 이 자리가 점선 pd-slot 이었습니다. 실제 수집한 기온 ·
            수온 · 파고 · 강수가 들어 있는데도 「미구현」으로 읽혔습니다.
            점선은 아직 설계되지 않은 자리에만 씁니다. */}
        <div className="hm-hero-visual">
          <div className="hm-hero-visual-head">
            {conditionModeLabel(conditions)} 기준 날씨와 바다
          </div>
          <dl className="hm-hero-metrics">
            <div>
              <dt>기온</dt>
              <dd className="pd-num">
                <MetricValue
                  conditions={conditions}
                  name="air_temperature"
                  loading={loading}
                  glass
                />
              </dd>
            </div>
            <div>
              <dt>수온</dt>
              <dd className="pd-num">
                <MetricValue
                  conditions={conditions}
                  name="water_temperature"
                  loading={loading}
                  glass
                />
              </dd>
            </div>
            <div>
              <dt>파고</dt>
              <dd className="pd-num">
                <MetricValue
                  conditions={conditions}
                  name="wave_height"
                  loading={loading}
                  glass
                />
              </dd>
            </div>
            <div>
              <dt>바람</dt>
              <dd className="pd-num">
                <MetricValue
                  conditions={conditions}
                  name="wind_speed"
                  loading={loading}
                  glass
                />
              </dd>
            </div>
            <div>
              <dt>1시간 강수량</dt>
              <dd className="pd-num">
                <MetricValue
                  conditions={conditions}
                  name="precipitation"
                  loading={loading}
                  glass
                />
              </dd>
            </div>
          </dl>
        </div>

        <div className="hm-hero-row">
          <h1 className="hm-hero-sentence">
            오늘의 물놀이 조건
            <br />
            자료를 확인하세요
          </h1>
          <div className="hm-hero-score">
            <div className="pd-num hm-hero-score-num">
              {loading ? (
                <Skeleton width="1.6em" glass label="점수 조회 중" />
              ) : (
                (conditionScore(conditions) ?? "–")
              )}
            </div>
            <GradeChip
              score={conditionScore(conditions)}
              loading={loading}
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
  statusIsError,
  conditions,
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
  loading?: boolean;
  quality: string;
  qualityLoading?: boolean;
  qualityData?: WaterQualityGrade;
  qualityError?: string;
  spotId?: number;
  now: string;
}) {
  const tiles: { name: string; metric?: string; value?: string }[] = [
    { name: "수온", metric: "water_temperature" },
    { name: "파고", metric: "wave_height" },
    { name: "강수", metric: "precipitation" },
    { name: "수질 · 최근 검사", value: quality },
  ];
  return (
    <div className="pd-card">
      <div className="pd-card-title">오늘 한눈에</div>
      <div className="hm-tiles">
        {tiles.map((tile) => {
          const tileLoading = tile.metric ? loading : qualityLoading;
          // 조회 중은 「값 없음」이 아니므로 is-empty 를 붙이지 않습니다.
          const empty =
            !tileLoading &&
            (tile.metric
              ? metricText(conditions, tile.metric) === "–"
              : tile.value === "–");
          return (
            <div
              className={"hm-tile" + (empty ? " is-empty" : "")}
              key={tile.name}
            >
              <div className="pd-num hm-tile-value">
                {tile.metric ? (
                  <MetricValue
                    conditions={conditions}
                    name={tile.metric}
                    loading={loading}
                    width="2.6em"
                  />
                ) : tileLoading ? (
                  <Skeleton width="2.6em" />
                ) : (
                  tile.value
                )}
              </div>
              <div className="hm-tile-name">{tile.name}</div>
            </div>
          );
        })}
      </div>
      <WaterQualityDetails data={qualityData} error={qualityError} className="pd-note" />
      <HourlyConditions id={spotId} now={now} />
      <p className="pd-note" role={statusIsError ? "alert" : "status"}>
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

function SideMenu({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // onClose 는 호출부가 인라인 화살표로 넘깁니다. 그대로 의존성에 넣으면 렌더
  // 마다 effect 가 다시 돌아 포커스를 계속 닫기 버튼으로 뺏어옵니다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // 메뉴는 뷰포트 전체를 덮는 모달입니다(.hm-menu 가 position: fixed). 열려
  // 있는 동안 ① 뒤 본문이 따라 스크롤되지 않게 잠그고 ② Esc 로 닫히게 하고
  // ③ 포커스를 메뉴 안으로 들여보낸 뒤 ④ 닫을 때 열었던 버튼으로 되돌립니다.
  // 예전에는 role="dialog" 만 있어서, 키보드로 열 수는 있어도 빠져나올 수
  // 없었습니다.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      // 초점을 메뉴 안에서 순환시킵니다. 모달 밖으로 탭이 빠져나가면 보이지
      // 않는 본문을 더듬게 됩니다.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="hm-backdrop"
        onClick={onClose}
        aria-label="사이드 메뉴 닫기"
        tabIndex={-1}
      />
      <div
        className="hm-menu"
        role="dialog"
        aria-modal="true"
        aria-label="사이드 메뉴"
        ref={panel}
      >
        <div className="hm-menu-head">
          <div className="hm-menu-head-top">
            <span className="pd-header-mark">PONGDANG</span>
            <button
              type="button"
              className="hm-menu-close"
              onClick={onClose}
              aria-label="닫기"
              ref={closeButton}
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
            loading={isInitialLoad(conditions)}
            onOpenMenu={() => setMenuOpen(true)}
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
