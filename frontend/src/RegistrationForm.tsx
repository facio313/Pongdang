import { useEffect, useRef, useState, type FormEvent } from "react";
import { t } from "./i18n";
import { SsoLoginError } from "./ssoLogin";
import { registerSso, REGISTRATION_UNAVAILABLE } from "./ssoRegistration";

export function RegistrationForm({ onComplete, onPendingChange }: {
  onComplete: (username: string) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => () => { request.current?.abort(); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (request.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = form.elements.namedItem("password") as HTMLInputElement;
    const confirmation = form.elements.namedItem("passwordConfirmation") as HTMLInputElement;
    if (Array.from(password.value).length < 14 || Array.from(password.value).length > 128
      || !/[A-Z]/.test(password.value) || !/[a-z]/.test(password.value)
      || !/[0-9]/.test(password.value) || !/[\p{P}\p{S}]/u.test(password.value)) {
      setError("비밀번호는 영문 대·소문자, 숫자, 특수문자를 포함한 14~128자로 입력해 주세요.");
      password.focus();
      return;
    }
    if (password.value !== confirmation.value) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      confirmation.focus();
      return;
    }
    const input = { username: String(values.get("username") ?? ""), displayName: String(values.get("displayName") ?? ""), email: String(values.get("email") ?? ""), password: password.value };
    values.delete("password");
    values.delete("passwordConfirmation");
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
    request.current = controller;
    setPending(true);
    onPendingChange(true);
    setError(undefined);
    try {
      await registerSso(import.meta.env.BASE_URL, input, signal);
      if (!controller.signal.aborted) onComplete(input.username.trim().toLowerCase());
    } catch (failure: unknown) {
      if (!controller.signal.aborted) {
        setError(failure instanceof SsoLoginError && !signal.aborted ? failure.message : REGISTRATION_UNAVAILABLE);
        password.focus();
      }
    } finally {
      input.password = "";
      password.value = "";
      confirmation.value = "";
      request.current = null;
      onPendingChange(false);
      if (!controller.signal.aborted) setPending(false);
    }
  };
  return <form className="pd-login-form" onSubmit={submit} aria-busy={pending}>
    <p className="pd-registration-context">{t("Bonifacio 통합 계정으로 가입합니다. 이미 계정이 있다면 로그인해 주세요.")}</p>
    <p className="pd-registration-context">{t("가입 즉시 Pongdang을 이용할 수 있습니다. 다른 서비스의 이용 권한은 포함되지 않습니다.")}</p>
    <label>{t("아이디")}<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]{0,63}" maxLength={64} aria-describedby="pd-registration-username-help" required readOnly={pending} /></label>
    <p className="pd-registration-help" id="pd-registration-username-help">{t("영문·숫자로 시작하는 1~64자, 밑줄(_)과 하이픈(-)을 사용할 수 있습니다.")}</p>
    <label>{t("이름")}<input name="displayName" autoComplete="nickname" maxLength={120} required readOnly={pending} /></label>
    <label>{t("이메일")}<input name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required readOnly={pending} /></label>
    <label>{t("비밀번호")}<input name="password" type="password" autoComplete="new-password" maxLength={256} aria-describedby="pd-registration-password-help" required readOnly={pending} /></label>
    <p className="pd-registration-help" id="pd-registration-password-help">{t("비밀번호는 영문 대·소문자, 숫자, 특수문자를 포함한 14~128자로 입력해 주세요.")}</p>
    <label>{t("비밀번호 확인")}<input name="passwordConfirmation" type="password" autoComplete="new-password" maxLength={256} required readOnly={pending} /></label>
    {error && <p className="pd-login-error" role="alert">{t(error)}</p>}
    <button type="submit" className="pd-login-submit" disabled={pending}>{t(pending ? "회원가입 중…" : "회원가입")}</button>
  </form>;
}
