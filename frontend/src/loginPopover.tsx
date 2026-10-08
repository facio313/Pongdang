import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { t } from "./i18n";
import { LoginPopoverControl } from "./loginPopoverState";
import { Icon } from "./pongdangUi";
import { invalidateResources } from "./resourceRefresh";
import { readSsoLoginState, signInSso, SsoLoginError } from "./ssoLogin";
import { RegistrationForm } from "./RegistrationForm";
import "./loginPopover.css";

function LoginPopoverPanel({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const closeBlocked = useRef(false);
  const [pending, setPending] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registrationPending, setRegistrationPending] = useState(false);
  const [registeredUsername, setRegisteredUsername] = useState<string>();
  const [error, setError] = useState<string>();
  const [localTest, setLocalTest] = useState(false);
  const onRegistrationPending = useCallback((value: boolean) => {
    closeBlocked.current = value;
    setRegistrationPending(value);
  }, []);
  const close = () => { if (!closeBlocked.current) onClose(); };
  const changeMode = () => {
    if (pending || closeBlocked.current) return;
    setError(undefined);
    setRegistering(value => !value);
  };
  useEffect(() => { panel.current?.querySelector<HTMLInputElement>('input[name="username"]')?.focus(); }, [registering]);
  useEffect(() => {
    const connection = new AbortController();
    void readSsoLoginState(import.meta.env.BASE_URL, AbortSignal.any([connection.signal, AbortSignal.timeout(10000)]))
      .then((state) => { if (!connection.signal.aborted) setLocalTest(state.localTest); })
      .catch((failure: unknown) => {
        if (!connection.signal.aborted) setError(failure instanceof SsoLoginError
          ? failure.message : "로그인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    usernameInput.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (!closeBlocked.current) onClose(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])");
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      connection.abort();
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
    <button type="button" className="pd-login-backdrop" onClick={close} disabled={registrationPending} aria-label={t(registering ? "회원가입 닫기" : "로그인 닫기")} tabIndex={-1} />
    <div className="pd-login-popover" role="dialog" aria-modal="true" aria-labelledby="pd-login-title" ref={panel}>
      <button type="button" className="pd-login-close" onClick={close} disabled={registrationPending} aria-label={t("닫기")}><Icon name="close" size={20} /></button>
      <h2 id="pd-login-title">{t(registering ? "회원가입" : "로그인")}</h2>
      {registering ? <RegistrationForm onPendingChange={onRegistrationPending} onComplete={username => {
        setRegisteredUsername(username);
        setError(undefined);
        setRegistering(false);
      }} /> : <>
      {registeredUsername && <p className="pd-login-success" role="status">{t("회원가입이 완료되었습니다. 가입한 계정으로 로그인해 주세요.")}</p>}
      {localTest && <p className="pd-login-context">{t("로컬 테스트 계정으로 로그인해 주세요.")}</p>}
      <form className="pd-login-form" onSubmit={submit} aria-busy={pending}>
        <label>{t("아이디")}<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required readOnly={pending} defaultValue={registeredUsername} ref={usernameInput} /></label>
        <label>{t("비밀번호")}<input type="password" name="password" autoComplete="current-password" required readOnly={pending} ref={passwordInput} /></label>
        {error && <p className="pd-login-error" role="alert">{t(error)}</p>}
        <button type="submit" className="pd-login-submit" disabled={pending}>{t(pending ? "로그인 중…" : "로그인")}</button>
      </form>
      </>}
      <div className="pd-login-switch">
        <span>{t(registering ? "이미 계정이 있으신가요?" : "아직 계정이 없으신가요?")}</span>
        <button type="button" onClick={changeMode} disabled={pending || registrationPending}>{t(registering ? "로그인으로 돌아가기" : "회원가입")}</button>
      </div>
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
