import { useState } from "react";
import { DataOrigin } from "./DataOrigin";
import {
  AiSuggestion,
  GradeChip,
  Icon,
  StateChip,
} from "./pongdangUi";
import { useGangneungSpots } from "./gangneungSpots";
import "./homePage.css";

// 홈. 최우선 진입 화면으로, 위치 기반 종합 상태를 한 번에 보여주고 추천 ·
// 경로 · 라이브캠으로 보냅니다. 하단 탭바 5개(홈 · 오늘 · 추천 · 지도 ·
// 내 코스) 중 홈이 기본 진입입니다.
//
// 데이터 연결 상태
//  - 지점(장소명 · 지역 · 주소 · 검증 상태): `/api/data/datasets/spots` 실연동.
//  - 그 외(점수 · 수온 · 파고 · 강수 · 수질 · 경로 · 라이브캠): 저장된 값이
//    없습니다. AGENTS.md 상 점수 · 안전 판정은 별도 구현 · 검증 전까지
//    unknown 이고 수집은 점수화가 아니므로, 아래 상수는 레이아웃 확인용
//    예시이며 화면에 「예시 데이터」/「수집 미구현」 칩으로 표기합니다.
//
// 디자인이 아직 없는 세 자리(파도 · 날씨 애니메이션, 시간대별 그래프, 지도
// 경로 렌더링)는 점선 슬롯으로 남겨 무엇이 들어올 자리인지 밝힙니다.

const HERO_DATE = "9월 15일";
const HERO_SCORE = 82;

const GLANCE_TILES: { name: string; value: string; empty?: boolean }[] = [
  { name: "수온", value: "22.1°" },
  { name: "파고", value: "0.6m" },
  { name: "강수", value: "10%" },
  { name: "수질", value: "–", empty: true },
];

const CAMS = [
  { id: "gyeongpo", match: "경포", label: "경포", gradient: "linear-gradient(160deg,#4fb3d9,#1d6fd8)" },
  { id: "anmok", match: "안목", label: "안목", gradient: "linear-gradient(160deg,#e0a72a,#b97a1d)" },
  { id: "sacheonjin", match: "사천진", label: "사천진", gradient: "linear-gradient(160deg,#6b8fae,#33475a)" },
];

const MENU_ITEMS: {
  label: string;
  href?: string;
  state?: "uncollected";
}[] = [
  { label: "저장한 코스", state: "uncollected" },
  { label: "지점 즐겨찾기", state: "uncollected" },
  { label: "알림 설정", state: "uncollected" },
  { label: "데이터 출처와 갱신", href: "#info" },
  { label: "이용 안내", href: "#info" },
  { label: "설정", state: "uncollected" },
];

function Hero({
  placeName,
  onOpenMenu,
}: {
  placeName: string;
  onOpenMenu: () => void;
}) {
  return (
    <header className="hm-hero">
      <div className="hm-sbar">
        <span>9:41</span>
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
            오늘은 물놀이하기
            <br />
            아주 좋아요
          </h1>
          <div className="hm-hero-score">
            <div className="hm-num hm-hero-score-num">{HERO_SCORE}</div>
            <GradeChip score={HERO_SCORE} glass bare />
          </div>
        </div>

        <p className="hm-hero-note">
          점수는 경포해변 예보 기준이며 다른 지점의 실측값이 아닙니다. 점수 ·
          수온 · 안전 상태 · 신뢰도는 서로 다른 값이며 하나로 요약하지 않습니다.
          위 점수는 예시 데이터입니다.
        </p>
      </div>
    </header>
  );
}

function GlanceCard({ statusText }: { statusText: string }) {
  return (
    <div className="hm-card">
      <div className="hm-card-title">오늘 한눈에</div>
      <div className="hm-tiles">
        {GLANCE_TILES.map((tile) => (
          <div
            className={"hm-tile" + (tile.empty ? " is-empty" : "")}
            key={tile.name}
          >
            <div className="hm-num hm-tile-value">{tile.value}</div>
            <div className="hm-tile-name">{tile.name}</div>
          </div>
        ))}
      </div>
      <div className="hm-slot hm-graph-slot">시간대별 그래프 (09–18시)</div>
      <p className="hm-note">
        <StateChip kind="example" /> 수온 · 파고 · 강수는 경포해변 예보 값이며
        지점별 실측이 아닙니다. 수질은 저장된 값이 없어 –이며 0 · 정상 · 안전을
        뜻하지 않습니다. {statusText}
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
          "오늘 경포해변 예보(점수 82 · 파고 0.6m · 수온 22.1°C, 예시 데이터)와 " +
          "저장된 활동 3종(수영 · 래프팅 · 휴식)만으로 후보를 고릅니다. " +
          "출처 · 기상청 · 국립해양조사원"
        }
      />
      <a className="hm-primary" href="#recommend">
        취향 고르기 →
      </a>
    </div>
  );
}

function RouteCard() {
  return (
    <div className="hm-card">
      <div className="hm-card-top">
        <div className="hm-card-title">물놀이 최적경로</div>
        <StateChip kind="example" />
      </div>
      <div className="hm-slot hm-route-slot">지도 · 경로 렌더링 영역</div>
      <a className="hm-secondary" href="#water-index-map">
        경로 탐색 →
      </a>
      <p className="hm-note">
        경로 계산과 지도 위 경로 렌더링은 아직 구현되지 않았습니다. 지금은 기존
        지도 배치 화면으로 이동합니다.
      </p>
    </div>
  );
}

function LivecamModule() {
  return (
    <div className="hm-card">
      <div className="hm-card-top">
        <div className="hm-card-top" style={{ gap: 8 }}>
          <span className="hm-badge-round">
            <Icon name="livecam" size={16} />
          </span>
          <div className="hm-card-title">라이브캠 물멍</div>
        </div>
        <StateChip kind="uncollected" />
      </div>
      <div className="hm-cam-row">
        {CAMS.map((cam) => (
          <a className="hm-cam" href="#livecam" key={cam.id}>
            <span
              className="hm-cam-thumb"
              style={{ background: cam.gradient, display: "block" }}
            />
            <span className="hm-cam-label">{cam.label}</span>
          </a>
        ))}
      </div>
      <p className="hm-note">
        영상 연동이 아직 구현되지 않아 썸네일은 자리표시자입니다. 탭하면
        라이브캠 화면(A5)으로 들어갑니다.
      </p>
    </div>
  );
}

function TabBar() {
  return (
    <>
      <nav className="hm-tabbar" aria-label="주요 탭">
        <a className="hm-tab" href="#home" aria-current="page">
          홈
        </a>
        <a className="hm-tab" href="#today">
          오늘
        </a>
        <a className="hm-tab" href="#recommend">
          추천
        </a>
        <a className="hm-tab" href="#water-index-map">
          지도
        </a>
        <button type="button" className="hm-tab" disabled>
          내 코스
        </button>
      </nav>
      <p className="hm-tabbar-note">
        내 코스 화면은 아직 없어 비활성입니다. 지도는 기존 지도 배치 화면으로
        이동합니다.
      </p>
    </>
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
            <span className="hm-menu-avatar">사진
              <br />
              없음
            </span>
            <div>
              <div className="hm-menu-signin">로그인해 주세요</div>
              <div className="hm-menu-signin-sub">
                계정 기능은 아직 없습니다
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
          「데이터 출처와 갱신」·「이용 안내」만 기존 데이터 정보 화면으로
          연결됩니다. 나머지 항목은 아직 구현되지 않았습니다.
        </p>
      </div>
    </>
  );
}

function HomeScreen() {
  const [menuOpen, setMenuOpen] = useState(false);
  const spots = useGangneungSpots("HomePage");
  const gyeongpo = spots.resolve("경포", "강릉 경포해변");

  return (
    <article className="home-page">
      <div className="hm-frame">
        <Hero placeName={gyeongpo.name} onOpenMenu={() => setMenuOpen(true)} />
        <div className="hm-body">
          <GlanceCard statusText={spots.statusText} />
          <TasteBanner />
          <RouteCard />
          <LivecamModule />
          <TabBar />
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
