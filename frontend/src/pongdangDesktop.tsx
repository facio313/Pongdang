import type { CSSProperties, ReactNode } from "react";
import { NAV_ITEMS, type TabKey } from "./appNav";
import { SideMenuButton, SideMenuOutlet, SideMenuProvider } from "./sideMenu";
import { gradeOf } from "./groupAGrade";
import { GradeIcon, Icon } from "./pongdangUi";
import "./pongdangDesktop.css";

// 데스크탑(≥1080px) 화면 7개가 공유하는 레이아웃 프리미티브입니다. 핸드오프
// 「구현 가이드 — 데스크탑 · 모바일」 §2 의 "데스크탑 공통 문법"이 여기 전부
// 들어 있고, 화면은 이 네 가지 조립만으로 그립니다.
//
//   DesktopNav  상단 인라인 네비 (모바일 하단 탭바의 데스크탑 대응)
//   DesktopHero 코발트 면 + 물결 경계
//   LabelRow    200px 라벨 열 + 1fr 본문. 본문의 기본 단위
//   FootNote    미연동 항목 · 안전 판단 불가 문구
//
// 표시 전용입니다. 데이터 훅을 부르지 않고 전부 props 로만 받습니다 -- 같은
// 값을 모바일 레이아웃과 나눠 쓰기 위해서입니다.
//
// 카드 · 그림자 · 흰 테두리는 쓰지 않습니다. 구분은 괘선과 여백으로만 만듭니다.

/** 물결 경계. 코발트 히어로가 흰 본문으로 넘어가는 자리에 깔립니다. */
const WAVE_PATH =
  "M0 34 C 160 8, 320 8, 480 30 S 800 62, 960 34 S 1280 6, 1440 26 L1440 58 L0 58Z";

/** 애니메이션 파도용. 위 경계와 같은 굴곡을 2880 폭으로 이어 붙여, 가로로
 *  흘렸을 때 이음매가 보이지 않게 합니다. */
const WAVE_LOOP_PATH =
  "M0 54 C 160 28, 320 28, 480 50 S 800 82, 960 54 S 1280 26, 1440 46 " +
  "S 1760 28, 1920 50 S 2240 82, 2400 54 S 2720 26, 2880 46 L2880 96 L0 96Z";

export function DesktopNav({
  active,
  context,
  onSurface = false,
}: {
  /** 현재 화면. 모바일 탭바와 같은 키를 씁니다. */
  active: TabKey;
  /** 오른쪽 끝 컨텍스트 문구. 예: "강릉 경포해변 · 9월 15일 · 예보 06:00 기준" */
  context?: ReactNode;
  /** 흰 배경 위에 얹힐 때(코발트 히어로가 없는 화면). */
  onSurface?: boolean;
}) {
  return (
    <nav
      className={"pd-dk-nav" + (onSurface ? " is-on-surface" : "")}
      aria-label="주요 탭"
    >
      {/* 탭바가 담는 여행 흐름 밖의 항목(저장한 코스 · 즐겨찾기 · 알림 설정 ·
          데이터 출처 · 이용 안내)으로 들어가는 유일한 길입니다. 예전에는 이
          손잡이가 모바일 셸(AppShell)에만 있어서, 1080px 이상에서는 그 다섯
          곳에 닿을 방법이 전혀 없었습니다. */}
      <SideMenuButton />
      <a className="pd-dk-nav-mark" href="#home">
        PONGDANG
      </a>
      <span className="pd-dk-nav-links">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.key}
            className="pd-dk-nav-link"
            href={"#" + item.key}
            aria-current={item.key === active ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </span>
      {context !== undefined && (
        <span className="pd-dk-nav-context">{context}</span>
      )}
    </nav>
  );
}

export function DesktopHero({
  nav,
  wave = "static",
  band = false,
  minHeight,
  children,
}: {
  /** 네비는 히어로 안에 얹힙니다. 코발트 위에 놓이는 형태가 기본입니다. */
  nav?: ReactNode;
  /** "animated" 는 홈 화면 전용입니다. 다른 화면은 정적 경계만 씁니다. */
  wave?: "static" | "animated";
  /** 지도 · 내 코스처럼 히어로를 얇은 띠로 줄이는 화면. */
  band?: boolean;
  minHeight?: number;
  children: ReactNode;
}) {
  const style: CSSProperties | undefined =
    minHeight === undefined ? undefined : { minHeight };
  return (
    <header
      className={"pd-dk-hero" + (band ? " is-band" : "")}
      style={style}
    >
      {nav}
      <div className="pd-dk-hero-body">{children}</div>
      {wave === "animated" && (
        // 2겹입니다. 뒤 겹이 느리고 옅어서 깊이가 생깁니다. 「동작 줄이기」를
        // 켜면 pongdangDesktop.css 가 멈춥니다.
        <div className="pd-dk-hero-anim" aria-hidden="true">
          <svg
            className="pd-dk-wave-back"
            viewBox="0 0 2880 96"
            preserveAspectRatio="none"
          >
            <path d={WAVE_LOOP_PATH} fill="#ffffff" />
          </svg>
          <svg
            className="pd-dk-wave-front"
            viewBox="0 0 2880 96"
            preserveAspectRatio="none"
          >
            <path d={WAVE_LOOP_PATH} fill="#ffffff" opacity="0.5" />
          </svg>
        </div>
      )}
      <svg
        className="pd-dk-hero-wave"
        viewBox="0 0 1440 58"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d={WAVE_PATH} fill="#ffffff" />
      </svg>
    </header>
  );
}

export function LabelRow({
  kick,
  title,
  chip,
  desc,
  link,
  columns,
  children,
}: {
  /** 라벨 열 맨 위의 작은 대문자 말머리. */
  kick?: string;
  title: ReactNode;
  /** 상태 칩(StateChip 등). 미연동 · 예시 데이터 표기를 생략하지 않습니다. */
  chip?: ReactNode;
  desc?: ReactNode;
  link?: { href: string; label: string };
  /** 기본은 `200px 1fr`. 3열이 필요한 화면만 덮어씁니다. */
  columns?: string;
  children: ReactNode;
}) {
  const style = columns
    ? ({ "--dk-row-columns": columns } as CSSProperties)
    : undefined;
  return (
    <section className="pd-dk-row" style={style}>
      <div className="pd-dk-row-label">
        {kick && <div className="pd-dk-kick">{kick}</div>}
        <h2 className="pd-dk-row-title">{title}</h2>
        {chip && <div className="pd-dk-row-chip">{chip}</div>}
        {desc && <p className="pd-dk-row-desc">{desc}</p>}
        {link && (
          <a className="pd-dk-row-link" href={link.href}>
            {link.label} →
          </a>
        )}
      </div>
      <div className="pd-dk-row-body">{children}</div>
    </section>
  );
}

/** 데스크탑의 점수 표기입니다. 모바일은 알약 칩(GradeChip) 하나로 끝내지만,
 *  데스크탑은 큰 숫자를 먼저 세우고 그 아래 아이콘 + 등급명을 붙입니다
 *  (19a 40px · 18e 106px · 19b 72px).
 *
 *  네 겹 규칙은 그대로입니다 -- 숫자 · 등급명 · 등급 아이콘 · 색이 항상 함께
 *  갑니다. 칩과 달리 숫자를 두 번 쓰지 않습니다. 값이 없으면 «–» 이며 0 점으로
 *  치환하지 않습니다. 등급 판정은 groupAGrade.ts 가 단일 출처입니다.
 *
 *  unscoredLabel 은 「산정 대상 아님」처럼 없음의 이유를 밝혀야 하는 자리에만
 *  씁니다. 이유를 모르면 기본값(「평가값 없음」)을 그대로 두세요. */
export function DesktopScore({
  score,
  size = 40,
  align = "left",
  unscoredLabel,
}: {
  score: number | null;
  size?: number;
  align?: "left" | "right";
  unscoredLabel?: string;
}) {
  const grade = gradeOf(score);
  const label = score === null && unscoredLabel ? unscoredLabel : grade.label;
  return (
    <div
      className={"pd-dk-score" + (align === "right" ? " is-right" : "")}
      data-grade={grade.key}
      style={{ "--dk-score-size": `${size}px` } as CSSProperties}
    >
      <div className="pd-dk-num pd-dk-score-num">{score ?? "–"}</div>
      <div className="pd-dk-score-grade">
        <GradeIcon gradeKey={grade.key} size={13} />
        {label}
      </div>
    </div>
  );
}

/** LabelRow 본문을 세로 괘선으로 나눕니다. columns 를 주지 않으면 자식 수만큼
 *  균등 분할합니다. */
export function SplitBody({
  columns,
  children,
}: {
  columns?: string;
  children: ReactNode;
}) {
  const style = columns
    ? ({ "--dk-split-columns": columns } as CSSProperties)
    : undefined;
  return (
    <div className="pd-dk-split" style={style}>
      {children}
    </div>
  );
}

/** 화면마다 두 벌로 쓰지 않기 위한 기본 문구입니다. 값이 없다는 것은 0 점 ·
 *  정상 · 안전이 아니라는 핸드오프 규칙을 화면에 그대로 남깁니다.
 *
 *  예전에는 이 문구가 「위 수치는 레이아웃 확인용 예시이며」로 시작했습니다.
 *  화면이 예시 상수를 그리던 때에는 맞는 말이었지만, 이제 실제 수집값을
 *  읽으므로 그대로 두면 **반대 방향으로 거짓말**이 됩니다 -- 진짜 관측값을
 *  예시라고 말하게 됩니다. 아직 예시인 자리는 그 자리에서 칩으로 밝힙니다. */
const DEFAULT_FOOT_NOTE =
  "점수는 물놀이 조건 참고값이며 안전 판정이 아닙니다. " +
  "값이 없으면 «–» 로 두며 0 점 · 정상 · 안전으로 치환하지 않습니다. " +
  "점수 · 수온 · 안전 상태 · 신뢰도는 서로 다른 값이며 하나로 요약하지 않습니다.";

export function FootNote({
  missing,
  note = DEFAULT_FOOT_NOTE,
  alert = false,
}: {
  /** 「아직 실연동되지 않은 항목 — …」 뒤에 붙는 목록. */
  missing: string;
  note?: ReactNode;
  /** 경고 바 형태(붉은 바탕 + 삼각 경고). */
  alert?: boolean;
}) {
  return (
    <footer className={"pd-dk-foot" + (alert ? " is-alert" : "")}>
      <div className="pd-dk-foot-missing">
        {alert && <Icon name="warning" size={14} />}
        아직 실연동되지 않은 항목 — {missing}
      </div>
      <p className="pd-dk-foot-note">{note}</p>
    </footer>
  );
}

/** 데스크탑 화면의 바깥 껍데기. 토큰 루트(.pd-desktop)와 1600px 상한을 잡고,
 *  모바일 셸과 같은 사이드 메뉴를 답니다 -- 폭에 따라 갈 수 있는 곳이 달라지면
 *  안 됩니다. */
export function DesktopShell({ children }: { children: ReactNode }) {
  return (
    <SideMenuProvider>
      <div className="pd-desktop">
        <div className="pd-desktop-page">{children}</div>
        {/* 메뉴 패널의 색 토큰(--pd-*)은 `.pd-app` 에 선언돼 있습니다. 여기는
            `--dk-*` 팔레트라 그 안에 그대로 두면 흰 패널이 투명해집니다.
            패널은 position: fixed 라 이 껍데기가 자리를 차지하지 않습니다. */}
        <div className="pd-app pd-desktop-menu-root">
          <SideMenuOutlet />
        </div>
      </div>
    </SideMenuProvider>
  );
}
