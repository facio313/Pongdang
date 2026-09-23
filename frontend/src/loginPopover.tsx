import { t } from "./i18n";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { LoginPopoverControl, goToLogin } from "./loginPopoverState";
import "./loginPopover.css";

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
