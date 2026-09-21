import { t } from "./i18n";
import type { ReactNode } from "react";
import { AppTabBar, type TabKey } from "./appTabBar";
import { SideMenuButton, SideMenuOutlet, SideMenuProvider } from "./sideMenu";
import { LOGO_ALT, logoUrl } from "./brand";
// 물결 굴곡은 히어로와 공유합니다(waveShape.ts 주석). 푸터는 뒤집어 씁니다.
import { WAVE_LOOP_PATH, WAVE_PATH } from "./waveShape";

/** 본문 흐름을 유지하며 모바일 주요 버튼을 하단 탭 위에 두는 공용 슬롯. */
export function AppActions({ children }: { children: ReactNode }) {
  return <div className="pd-action-slot">{children}</div>;
}

/** 화면 상단 헤더. 화면마다 복붙돼 있던 상태바 마크업을 대신합니다.
 *
 *  시계는 데스크톱의 목업 폰 프레임에서만 보입니다. 실기기(풀블리드)에서는
 *  바로 위에 OS 의 진짜 시계가 있어 두 개가 겹쳐 보이므로 pongdang.css 가
 *  숨깁니다. 노치 여백도 거기 .pd-header 가 잡습니다. */
export function AppHeader({
  title,
  time,
  onCobalt = false,
}: {
  title: string;
  /** 목업 프레임용 시각 문자열. 없으면 자리만 비워 둡니다. */
  time?: string;
  onCobalt?: boolean;
}) {
  return (
    <div className={"pd-header" + (onCobalt ? " is-on-cobalt" : "")}>
      {/* 사이드 메뉴 손잡이. 예전에는 홈 히어로에만 있어 다른 탭에서는 계정 ·
          설정 · 출처로 들어갈 길이 없었습니다. 헤더는 모든 화면이 그리므로
          여기 둡니다(AppShell 밖에서 헤더만 쓰는 화면에서는 숨습니다). */}
      <span className="pd-header-left">
        <SideMenuButton />
        <span className="pd-header-time">{time}</span>
      </span>
      <span className="pd-header-mark">
        <img src={logoUrl()} alt={t(LOGO_ALT)} />
      </span>
      <span>{title}</span>
    </div>
  );
}

/** 앱 전역 규칙 문장입니다. 예전에는 화면마다 카드 아래 .pd-note 에 같은 말이
 *  반복돼(홈 · 오늘 · 명소 · 데스크탑에 네 벌) 11px 회색 문단이 화면의 절반을
 *  차지했습니다. **카드별 근거는 그대로 카드에 둡니다** -- 여기로 올리는 것은
 *  어느 화면에서나 똑같은 전역 규칙뿐입니다.
 *
 *  데스크탑의 대응물은 pongdangDesktop.tsx 의 FootNote 입니다. */
export function AppFootNote({
  wave = true,
}: {
  /** 물결 · 흐르는 파도를 그릴지. 본문 맨 아래 전체 폭 푸터에서는 히어로와
   *  대칭이 되지만, 지도 · 내 코스처럼 바텀시트 안에 들어가는 자리에서는
   *  굴곡이 잘려 장식 노이즈로만 남고 애니메이션이 계속 돕니다 -- 그때만
   *  false. 숨기지 않고 **그리지 않습니다**: display:none 은 애니메이션을
   *  멈추지 않습니다. */
  wave?: boolean;
} = {}) {
  return (
    <footer className={"pd-foot" + (wave ? "" : " is-flat")}>
      {/* 히어로가 코발트에서 본문으로 내려오는 물결을, 푸터는 거꾸로 세워
          본문에서 코발트로 되돌립니다. 굴곡은 같은 waveShape.ts 를 쓰고 CSS 가
          scaleY(-1) 로 뒤집습니다 -- 화면 위아래가 같은 물이어야 합니다. */}
      {wave && (
        <>
          <div className="pd-foot-anim" aria-hidden="true">
            <svg
              className="pd-foot-wave-back"
              viewBox="0 0 2880 96"
              preserveAspectRatio="none"
            >
              <path d={WAVE_LOOP_PATH} />
            </svg>
            <svg
              className="pd-foot-wave-front"
              viewBox="0 0 2880 96"
              preserveAspectRatio="none"
            >
              <path d={WAVE_LOOP_PATH} opacity="0.5" />
            </svg>
          </div>
          <svg
            className="pd-foot-wave"
            viewBox="0 0 1440 58"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={WAVE_PATH} />
          </svg>
        </>
      )}

      <div className="pd-foot-body">
        {/* 제품 이름은 아래 주의 문구가 이미 말하므로 표지는 장식입니다. */}
        <img className="pd-foot-brand" src={logoUrl()} alt="" aria-hidden />{t("값이 없으면 –로 두며 0점 · 정상 · 안전으로 치환하지 않습니다. 점수는 물놀이 조건 참고값이고 안전 판정이 아니며, 점수 · 수온 · 안전 상태는 서로 다른 값이라 하나로 요약하지 않습니다.")}</div>
    </footer>
  );
}

/** 제품 화면 5개(홈·오늘·추천·지도·내 코스)의 공용 셸입니다. 프레임·헤더·
 *  본문·하단 탭바·사이드 메뉴를 한 자리에서 렌더하므로, 각 화면은 내용만
 *  넘기면 됩니다.
 *
 *  히어로(코발트 레이어)가 있는 화면은 헤더가 히어로 안에 얹혀야 하므로,
 *  그 화면이 hero 안에 <AppHeader onCobalt /> 를 직접 넣고 title 은 생략합니다.
 *  hero 가 없으면 여기서 헤더를 렌더하며, 이때 title 이 필요합니다.
 *
 *  bare 를 주면 .pd-body 래퍼 없이 children 을 그대로 흘립니다 -- 지도처럼
 *  본문 패딩이 필요 없는 화면용입니다.
 *
 *  hero={null} 은 「헤더를 내가 본문 안에서 직접 그린다」는 뜻입니다(명소 지도
 *  뷰처럼 헤더가 지도 위에 얹히는 화면). 예전에는 그런 화면이 hero 를 아예
 *  넘기지 않아 워드마크가 두 줄로 겹쳐 보였고, 이제는 햄버거까지 두 개가
 *  됩니다. */
export function AppShell({
  tab,
  title,
  hero,
  bare = false,
  fullscreen = false,
  children,
}: {
  tab: TabKey;
  title?: string;
  hero?: ReactNode;
  bare?: boolean;
  /** 지도가 프레임을 다 쓰는 화면(지도 · 내 코스). 프레임 높이를 뷰포트에
   *  고정하고 페이지 스크롤을 끕니다 -- 넘치는 내용은 지도 위에 뜬 바텀 시트
   *  **안에서만** 스크롤합니다. 탭바 슬롯도 자리를 비웁니다.
   *
   *  이 모드는 bare 와 함께 씁니다. .pd-body 가 없으므로 AppFootNote 도 여기서
   *  그리지 않습니다 -- 전역 주의 문구는 화면이 시트 안 마지막에 직접 둡니다. */
  fullscreen?: boolean;
  children: ReactNode;
}) {
  return (
    <SideMenuProvider>
      <div className={"pd-app" + (fullscreen ? " is-fullscreen" : "")}>
        <div className={"pd-frame" + (fullscreen ? " is-fullscreen" : "")}>
          {hero === undefined ? <AppHeader title={title ?? ""} /> : hero}
          {bare ? (
            children
          ) : (
            <div className="pd-body">
              {children}
              <AppFootNote />
            </div>
          )}
          <AppTabBar active={tab} floating={fullscreen} />
          {/* 토큰이 .pd-app 에 있으므로 메뉴 패널도 그 안에서 그립니다. */}
          <SideMenuOutlet />
        </div>
      </div>
    </SideMenuProvider>
  );
}
