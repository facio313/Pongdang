import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon, StateChip } from "./pongdangUi";
import { LOGO_ALT, logoUrl } from "./brand";
import "./sideMenu.css";

/** 사이드 메뉴(탭 밖) 항목입니다. 탭바가 담는 여행 흐름(오늘 · 추천 · 지도 ·
 *  내 코스) 밖의 계정 · 설정 · 출처 항목만 둡니다. */
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
  // 「설정」은 #recommend 로 갔습니다. 거기는 설정 화면이 아니라 추천 탭이고,
  // 탭바에서 이미 갈 수 있는 곳입니다. 설정 화면이 생기기 전까지는 그 이름으로
  // 다른 곳에 데려다 놓지 않습니다.
  { label: "설정", state: "uncollected" },
];

/** 메뉴를 여는 손잡이입니다. 셸(AppShell)이 상태를 들고 있고, 헤더 안의
 *  햄버거 버튼은 화면마다 따로 있으므로 컨텍스트로 잇습니다. 컨텍스트 밖에서
 *  헤더를 그리는 화면(개발용 페이지)에서는 null 이라 버튼을 숨깁니다. */
const SideMenuControl = createContext<{
  open: () => void;
  close: () => void;
  isOpen: boolean;
} | null>(null);

/** 헤더 왼쪽 햄버거. 예전에는 홈 히어로에만 있어서 다른 탭에서는 사이드 메뉴로
 *  들어갈 길이 없었습니다. 이제 AppHeader 가 항상 그립니다. */
export function SideMenuButton() {
  const control = useContext(SideMenuControl);
  if (!control) return null;
  return (
    <button
      type="button"
      className="pd-menu-button pd-tap"
      onClick={control.open}
      aria-label="사이드 메뉴 열기"
    >
      <Icon name="menu" size={18} />
    </button>
  );
}

function SideMenuPanel({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // onClose 는 호출부가 인라인 화살표로 넘깁니다. 그대로 의존성에 넣으면 렌더
  // 마다 effect 가 다시 돌아 포커스를 계속 닫기 버튼으로 뺏어옵니다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // 메뉴는 뷰포트 전체를 덮는 모달입니다(.pd-menu 가 position: fixed). 열려
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
        className="pd-backdrop"
        onClick={onClose}
        aria-label="사이드 메뉴 닫기"
        tabIndex={-1}
      />
      <div
        className="pd-menu"
        role="dialog"
        aria-modal="true"
        aria-label="사이드 메뉴"
        ref={panel}
      >
        <div className="pd-menu-head">
          <div className="pd-menu-head-top">
            <span className="pd-header-mark">
              <img src={logoUrl()} alt={LOGO_ALT} />
            </span>
            <button
              type="button"
              className="pd-menu-close"
              onClick={onClose}
              aria-label="닫기"
              ref={closeButton}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="pd-menu-profile">
            <span className="pd-menu-avatar">
              사진
              <br />
              없음
            </span>
            <div>
              <div className="pd-menu-signin">Pongdang</div>
              <div className="pd-menu-signin-sub">
                기존 SSO 세션으로 개인 코스를 관리합니다
              </div>
            </div>
          </div>
        </div>
        <nav className="pd-menu-list" aria-label="사이드 메뉴 항목">
          {MENU_ITEMS.map((item) =>
            item.href ? (
              <a
                className="pd-menu-item"
                href={item.href}
                key={item.label}
                onClick={onClose}
              >
                {item.label}
              </a>
            ) : (
              <button
                type="button"
                className="pd-menu-item"
                key={item.label}
                disabled
              >
                {item.label}
                <StateChip kind="uncollected" />
              </button>
            ),
          )}
        </nav>
        <p className="pd-menu-note">
          개인 코스·즐겨찾기·알림은 본인의 SSO 세션을 사용합니다. 추천 취향은
          추천 탭의 취향 단계에서 바꿉니다.
        </p>
      </div>
    </>
  );
}

/** 사이드 메뉴의 상태를 들고 있는 껍데기입니다. AppShell 이 감싸므로 셸을 쓰는
 *  모든 화면(홈 · 오늘 · 추천 · 명소 · 지도 · 내 코스 · 상세)에서 같은 메뉴가
 *  열립니다. 예전에는 HomePage 안에만 있었습니다. */
export function SideMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  // 해시가 바뀌면(메뉴 항목 이동 · 뒤로 가기) 열린 채로 남지 않게 닫습니다.
  useEffect(() => {
    const onHashChange = () => setOpen(false);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return (
    <SideMenuControl.Provider
      value={{ isOpen, open: () => setOpen(true), close: () => setOpen(false) }}
    >
      {children}
    </SideMenuControl.Provider>
  );
}

/** 메뉴 패널이 실제로 그려지는 자리입니다. 패널은 position: fixed 라 어디에
 *  두든 뷰포트를 덮지만, 색 토큰(--pd-surface 등)이 `.pd-app` 에 선언돼 있어
 *  **반드시 .pd-app 안**이어야 합니다. 밖에 두면 토큰이 풀려 흰 패널이
 *  투명해집니다. */
export function SideMenuOutlet() {
  const control = useContext(SideMenuControl);
  if (!control?.isOpen) return null;
  return <SideMenuPanel onClose={control.close} />;
}
