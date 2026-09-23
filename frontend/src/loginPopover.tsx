import { t } from "./i18n";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./loginPopover.css";

const RETURN_HASH_KEY = "pd-return-hash";

/** 로그인 팝오버로 이동하기 전에 돌아올 화면(hash)을 남겨 둡니다. `/auth/continue`
 *  가 SSO 통과 후 이 값을 읽어 원래 화면으로 되돌립니다. */
function goToLogin() {
  try {
    sessionStorage.setItem(RETURN_HASH_KEY, window.location.hash);
  } catch {
    // 세션 저장소를 못 쓰면(사생활 보호 모드 등) 그냥 홈으로 돌아갑니다.
  }
  window.location.href = `${import.meta.env.BASE_URL}auth/continue`;
}

/** 앱이 뜰 때 한 번 확인합니다. `/auth/continue` 는 SSO 를 통과해야만 도달하는
 *  경로이므로, 여기 있다는 것은 로그인이 막 끝났다는 뜻입니다 -- 남겨 둔 화면으로
 *  튕겨 보내고 그 경로 자체는 주소창에 남기지 않습니다. */
export function resumeAfterLogin() {
  if (!window.location.pathname.endsWith("/auth/continue")) return;
  let returnHash = "#home";
  try {
    returnHash = sessionStorage.getItem(RETURN_HASH_KEY) || returnHash;
    sessionStorage.removeItem(RETURN_HASH_KEY);
  } catch {
    // 세션 저장소를 못 읽어도 홈으로는 돌려보낼 수 있습니다.
  }
  window.location.replace(`${import.meta.env.BASE_URL}${returnHash}`);
}

const LoginPopoverControl = createContext<{
  reason: string | null;
  requireLogin: (reason?: string) => void;
  close: () => void;
} | null>(null);

/** 로그인이 필요한 동작(취향 저장 · 즐겨찾기 · 내 코스 등)을 시작하는 훅/화면이
 *  부르는 손잡이입니다. 컨텍스트 밖(Provider 가 없는 화면)에서는 조용히
 *  무시합니다 -- sideMenu.tsx 의 SideMenuButton 과 같은 방어. */
export function useRequireLogin() {
  const control = useContext(LoginPopoverControl);
  return control?.requireLogin ?? (() => {});
}

function LoginPopoverPanel({
  reason,
  onClose,
}: {
  reason?: string;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const loginButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    loginButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [tabindex]:not([tabindex='-1'])",
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
  }, [onClose]);
  return (
    <>
      <button
        type="button"
        className="pd-login-backdrop"
        onClick={onClose}
        aria-label={t("로그인 안내 닫기")}
        tabIndex={-1}
      />
      <div
        className="pd-login-popover"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pd-login-title"
        ref={panel}
      >
        <h2 id="pd-login-title">{t("로그인이 필요합니다")}</h2>
        <p>{t(reason ?? "이 기능은 로그인한 이용자만 사용할 수 있습니다.")}</p>
        <div className="pd-login-actions">
          <button
            type="button"
            className="pd-login-close"
            onClick={onClose}
          >{t("닫기")}</button>
          <button
            type="button"
            className="pd-login-submit"
            onClick={goToLogin}
            ref={loginButton}
          >{t("로그인")}</button>
        </div>
      </div>
    </>
  );
}

export function LoginPopoverProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <LoginPopoverControl.Provider
      value={{
        reason,
        requireLogin: (nextReason) => setReason(nextReason ?? ""),
        close: () => setReason(null),
      }}
    >
      {children}
    </LoginPopoverControl.Provider>
  );
}

/** 팝오버가 실제로 그려지는 자리입니다. sideMenu.tsx 의 SideMenuOutlet 처럼,
 *  색 토큰이 `.pd-app` 에 있으므로 **반드시 그 안**에서 호출해야 합니다. */
export function LoginPopoverOutlet() {
  const control = useContext(LoginPopoverControl);
  if (!control || control.reason == null) return null;
  return (
    <LoginPopoverPanel reason={control.reason || undefined} onClose={control.close} />
  );
}
