import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { t } from "./i18n";
import { LoginPopoverControl } from "./loginPopoverState";
import { Icon } from "./pongdangUi";
import { invalidateResources } from "./resourceRefresh";
import { signInSso, SsoLoginError } from "./ssoLogin";
import "./loginPopover.css";

function LoginPopoverPanel({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    usernameInput.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])");
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      request.current?.abort();
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (request.current || !usernameInput.current || !passwordInput.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(undefined);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
    try {
      await signInSso(import.meta.env.BASE_URL, usernameInput.current.value, passwordInput.current.value, signal);
      if (controller.signal.aborted) return;
      invalidateResources();
      onClose();
    } catch (failure: unknown) {
      if (!controller.signal.aborted) {
        setError(failure instanceof SsoLoginError && !signal.aborted
          ? failure.message : "로그인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        passwordInput.current?.focus();
      }
    } finally {
      if (passwordInput.current) passwordInput.current.value = "";
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  return <div className="pd-app pd-login-root">
    <button type="button" className="pd-login-backdrop" onClick={onClose} aria-label={t("로그인 닫기")} tabIndex={-1} />
    <div className="pd-login-popover" role="dialog" aria-modal="true" aria-labelledby="pd-login-title" ref={panel}>
      <button type="button" className="pd-login-close" onClick={onClose} aria-label={t("닫기")}><Icon name="close" size={20} /></button>
      <h2 id="pd-login-title">{t("로그인")}</h2>
      <form className="pd-login-form" onSubmit={submit} aria-busy={pending}>
        <label>{t("아이디")}<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required readOnly={pending} ref={usernameInput} /></label>
        <label>{t("비밀번호")}<input type="password" name="password" autoComplete="current-password" required readOnly={pending} ref={passwordInput} /></label>
        {error && <p className="pd-login-error" role="alert">{t(error)}</p>}
        <button type="submit" className="pd-login-submit" disabled={pending}>{t(pending ? "로그인 중…" : "로그인")}</button>
      </form>
    </div>
  </div>;
}

/** One provider covers both product shells and stand-alone personal-data pages. */
export function LoginPopoverProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const control = useMemo(() => ({ open: () => setOpen(true) }), []);
  return <LoginPopoverControl.Provider value={control}>
    {children}
    {isOpen && <LoginPopoverPanel onClose={close} />}
  </LoginPopoverControl.Provider>;
}
