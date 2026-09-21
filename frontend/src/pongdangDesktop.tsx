import { t } from "./i18n";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { NAV_ITEMS, type TabKey } from "./appNav";
import { SideMenuButton, SideMenuOutlet, SideMenuProvider } from "./sideMenu";
import { gradeOf } from "./groupAGrade";
import { GradeIcon } from "./pongdangUi";
import { MASCOT_ALT, mascotUrl, type MascotRole } from "./mascots";
import { LOGO_ALT, logoUrl } from "./brand";
import { TRAVEL_LANGUAGES, setTravelLanguage, useTravelLanguage } from "./travelLanguage";
// 물결 굴곡은 모바일 홈 히어로와 공유합니다(waveShape.ts 주석).
import { WAVE_LOOP_PATH, WAVE_PATH } from "./waveShape";
import "./pongdangDesktop.css";

// 데스크탑(≥1080px) 화면 7개가 공유하는 레이아웃 프리미티브입니다. 핸드오프
// 「구현 가이드 — 데스크탑 · 모바일」 §2 의 "데스크탑 공통 문법"이 여기 전부
// 들어 있고, 화면은 이 네 가지 조립만으로 그립니다.
//
//   DesktopNav     상단 인라인 네비 (모바일 하단 탭바의 데스크탑 대응)
//   DesktopHero    코발트 면 + 물결 경계
//   DesktopMapShell 지도가 뷰포트를 다 쓰는 화면(지도 · 내 코스)의 무대
//   LabelRow       200px 라벨 열 + 1fr 본문. 본문의 기본 단위
//   FootNote       미연동 항목 · 안전 판단 불가 문구
//
// 표시 전용입니다. 데이터 훅을 부르지 않고 전부 props 로만 받습니다 -- 같은
// 값을 모바일 레이아웃과 나눠 쓰기 위해서입니다.
//
// 카드 · 그림자 · 흰 테두리는 쓰지 않습니다. 구분은 괘선과 여백으로만 만듭니다.

/** 헤더 안의 언어 전환. 사이드 메뉴에도 같은 선택지(TravelLanguageSelector)가
 *  있지만, 언어를 자주 바꾸는 사람이 메뉴를 열지 않고도 닿게 헤더에 둡니다.
 *  고르면 패널을 닫아 다시 눌러 접을 필요가 없게 합니다. */
function DesktopLanguageSwitcher() {
  const { locale } = useTravelLanguage();
  const current = TRAVEL_LANGUAGES.find((language) => language.locale === locale)!;
  const detailsRef = useRef<HTMLDetailsElement>(null);
  return (
    <details className="pd-dk-lang" ref={detailsRef}>
      <summary aria-label={t("언어 선택")}>{current.label}</summary>
      <div className="pd-dk-lang-panel" role="group" aria-label={t("언어 선택")}>
        {TRAVEL_LANGUAGES.map((language) => (
          <button
            type="button"
            key={language.locale}
            lang={language.locale}
            aria-pressed={locale === language.locale}
            onClick={() => {
              setTravelLanguage(language.locale);
              if (detailsRef.current) detailsRef.current.open = false;
            }}
          >
            {language.label}
          </button>
        ))}
      </div>
    </details>
  );
}

export function DesktopNav({
  active,
  context,
  onSurface = false,
  onMap = false,
}: {
  /** 현재 화면. 모바일 탭바와 같은 키를 씁니다. */
  active: TabKey;
  /** 오른쪽 끝 컨텍스트 문구. 예: "강릉 경포해변 · 9월 15일 · 예보 06:00 기준" */
  context?: ReactNode;
  /** 흰 배경 위에 얹힐 때(코발트 히어로가 없는 화면). */
  onSurface?: boolean;
  /** 풀스크린 지도 위에 얹힐 때. 네비가 그 화면의 **유일한 히어로 레이어**가
   *  되므로 코발트 면을 스스로 깝니다(디자인 시스템 v2 §07 — 히어로는 화면당
   *  하나, 항상 최상단). 지도 타일 위 가독성을 위해 별도의 반투명 스크림을
   *  만들지 않습니다: 그라디언트는 코발트 히어로 하나뿐입니다. */
  onMap?: boolean;
}) {
  return (
    <nav
      className={
        "pd-dk-nav" +
        (onSurface ? " is-on-surface" : "") +
        (onMap ? " is-on-map" : "")
      }
      aria-label={t("주요 탭")}
    >
      {/* 탭바가 담는 여행 흐름 밖의 항목(저장한 코스 · 즐겨찾기 · 알림 설정 ·
          데이터 출처 · 이용 안내)으로 들어가는 유일한 길입니다. 예전에는 이
          손잡이가 모바일 셸(AppShell)에만 있어서, 1080px 이상에서는 그 다섯
          곳에 닿을 방법이 전혀 없었습니다. */}
      <SideMenuButton />
      <a className="pd-dk-nav-mark" href="#home">
        <img src={logoUrl()} alt={t(LOGO_ALT)} />
      </a>
      <span className="pd-dk-nav-links">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.key}
            className="pd-dk-nav-link"
            href={"#" + item.key}
            aria-current={item.key === active ? "page" : undefined}
          >
            {t(item.label)}
          </a>
        ))}
      </span>
      <DesktopLanguageSwitcher />
      {context !== undefined && (
        <span className="pd-dk-nav-context">{context}</span>
      )}
    </nav>
  );
}

export function DesktopHero({
  nav,
  wave = "static",
  mascot,
  minHeight,
  children,
}: {
  /** 네비는 히어로 안에 얹힙니다. 코발트 위에 놓이는 형태가 기본입니다. */
  nav?: ReactNode;
  /** "animated" 는 홈 화면 전용입니다. 다른 화면은 정적 경계만 씁니다. */
  wave?: "static" | "animated";
  /** 히어로 오른쪽 위 표지. 자리 · 크기는 화면이 정하지 않습니다 --
   *  어느 화면을 가도 같은 곳에 같은 크기로 서 있어야 하므로 여기서만
   *  그리고, 화면은 어떤 포즈인지(MascotRole)만 고릅니다. */
  mascot?: MascotRole;
  /** 히어로 최소 높이는 CSS(--dk-hero-min-h)가 정합니다. 이 prop 은 그보다
   *  더 높게 잡아야 하는 화면만 씁니다. */
  minHeight?: number;
  children: ReactNode;
}) {
  const style: CSSProperties | undefined =
    minHeight === undefined ? undefined : { minHeight };
  return (
    <header
      className={"pd-dk-hero" + (mascot ? " has-mascot" : "")}
      style={style}
    >
      {nav}
      <div className="pd-dk-hero-body">
        {children}
        {mascot && (
          <img
            className="pd-dk-hero-mascot"
            src={mascotUrl(mascot)}
            alt={t(MASCOT_ALT)}
            width={200}
            height={200}
          />
        )}
      </div>

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

/** 풀스크린 지도 화면(지도 · 내 코스)의 무대입니다. `DesktopHero` 를 쓰지
 *  않는 유일한 두 화면이 이것을 대신 씁니다.
 *
 *  왜 히어로가 없나: 디자인 시스템 v2 §01 은 히어로(코발트 글래스) 레이어의
 *  역할을 「오늘의 상태 · **지도** · 라이브캠」이라고 적습니다. 지도 면 자체가
 *  히어로 레이어입니다. 그래서 지도 위에 코발트 히어로를 한 겹 더 쌓는 대신,
 *  **네비 띠 하나만 코발트로 두고 지도가 화면을 다 쓰게** 합니다. 화면당 코발트
 *  면은 여전히 하나입니다(§07).
 *
 *  나머지(검색 · 목록 · 근거 · 폼)는 전부 밝은 레이어 패널로 지도 위에 뜹니다
 *  -- 「근거 · 표 · 폼은 항상 밝은 레이어에」(§07). 지도 위에 떠 있는 패널은
 *  데스크탑에서 그림자를 쓰는 유일한 예외입니다(구현 가이드 §2).
 *
 *  페이지는 스크롤되지 않습니다. 넘치는 내용은 패널 **안에서** 스크롤합니다. */
export function DesktopMapShell({
  nav,
  map,
  children,
}: {
  /** `<DesktopNav … onMap />`. 지도 위에 절대배치되며 격자 밖입니다 --
   *  좌우 끝까지 가야 하므로 아래 크롬 격자의 패딩에 묶이면 안 됩니다. */
  nav: ReactNode;
  /** `<KakaoMapCanvas … />`. 캔버스가 inset:0 이라 무대가 relative 입니다. */
  map: ReactNode;
  /** 지도 위에 뜨는 것들(.pd-dk-mappanel · .pd-dk-mapcontrols). */
  children: ReactNode;
}) {
  return (
    <div className="pd-dk-mapshell">
      {map}
      {nav}
      {/* 크롬 레이어 자체는 클릭을 받지 않습니다(pointer-events:none). 그래야
          패널 사이의 빈 곳에서 지도를 끌 수 있습니다. 자식만 되살립니다. */}
      <div className="pd-dk-mapshell-chrome">{children}</div>
    </div>
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
        {t(label)}
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
  wave = true,
}: {
  /** 실제 미연동 항목이 있는 화면에서만 표시합니다. */
  missing?: string;
  note?: ReactNode;
  /** 경고 바 형태(붉은 바탕 + 삼각 경고). */
  alert?: boolean;
  /** 물결 · 흐르는 파도를 그릴지. 화면 전체 폭 푸터에서는 히어로와 대칭이
   *  되지만, 지도 위 패널(352px)처럼 좁은 면 안에서는 굴곡이 잘려 장식
   *  노이즈로만 남고 애니메이션이 지도 위에서 계속 돕니다 -- 그때만 false.
   *  숨기지 않고 **그리지 않습니다**: display:none 은 애니메이션을 멈추지
   *  않습니다. */
  wave?: boolean;
}) {
  // pd-dk-foot-missing 렌더링이 임시 비활성화된 동안만 미사용(cd77ce7).
  void missing;
  return (
    <footer
      className={
        "pd-dk-foot" + (alert ? " is-alert" : "") + (wave ? "" : " is-flat")
      }
    >
      {/* 히어로가 코발트에서 흰 본문으로 내려오는 물결을, 푸터는 거꾸로 세워
          흰 본문에서 코발트로 되돌립니다. 굴곡은 같은 waveShape.ts 를 쓰고
          CSS 가 scaleY(-1) 로 뒤집습니다 -- 위아래가 같은 물이어야 합니다. */}
      {wave && (
        <>
          <div className="pd-dk-foot-anim" aria-hidden="true">
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
          <svg
            className="pd-dk-foot-wave"
            viewBox="0 0 1440 58"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={WAVE_PATH} fill="#ffffff" />
          </svg>
        </>
      )}

      <div className="pd-dk-foot-body">
        {/* 제품 이름은 바로 아래 주의 문구가 이미 말하므로 표지는 장식입니다. */}
        <img className="pd-dk-foot-brand" src={logoUrl()} alt="" aria-hidden />
        {/* {missing && <div className="pd-dk-foot-missing">
          {alert && <Icon name="warning" size={14} />}{t("아직 실연동되지 않은 항목 — {items}", { items: t(missing) })}
        </div>} */}
        <p className="pd-dk-foot-note">{typeof note === "string" ? t(note) : note}</p>
      </div>
    </footer>
  );
}

/** 데스크탑 화면의 바깥 껍데기. 토큰 루트(.pd-desktop)와 1600px 상한을 잡고,
 *  모바일 셸과 같은 사이드 메뉴를 답니다 -- 폭에 따라 갈 수 있는 곳이 달라지면
 *  안 됩니다. */
export function DesktopShell({
  fullscreen = false,
  children,
}: {
  /** 지도가 뷰포트를 다 쓰는 화면(지도 · 내 코스). 페이지가 스크롤되지 않고
   *  1600px 본문 상한도 풀립니다 -- 그 상한은 **읽는 본문**을 위한 것이고
   *  지도 면은 본문이 아닙니다. */
  fullscreen?: boolean;
  children: ReactNode;
}) {
  return (
    <SideMenuProvider>
      <div className={"pd-desktop" + (fullscreen ? " is-fullscreen" : "")}>
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
