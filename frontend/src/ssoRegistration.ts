import { readSsoLoginState, SsoLoginError } from "./ssoLogin.ts";

export const REGISTRATION_UNAVAILABLE = "회원가입 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export interface RegistrationInput {
  username: string;
  displayName: string;
  email: string;
  password: string;
}

/** Only the central account writer can confirm a new account. Registration does
 * not create a session; the existing login exchange still verifies every grant. */
export async function registerSso(base: string, input: RegistrationInput, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<void> {
  const state = await readSsoLoginState(base, signal, fetcher);
  if (!state.registrationAvailable) throw new SsoLoginError("현재 회원가입을 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  const response = await fetcher(`${base}api/auth/register`, {
    method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store", signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: input.username.trim().toLowerCase(), displayName: input.displayName.trim(), email: input.email.trim().toLowerCase(), password: input.password }),
  });
  if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) throw new SsoLoginError(REGISTRATION_UNAVAILABLE);
  const result: unknown = await response.json();
  const detail = typeof result === "object" && result !== null && "detail" in result ? result.detail : undefined;
  if (response.status === 409 && detail === "SSO_REGISTRATION_CONFLICT") throw new SsoLoginError("이미 사용 중인 아이디 또는 이메일입니다. 기존 계정으로 로그인하거나 다른 정보를 입력해 주세요.");
  if (response.status === 400) throw new SsoLoginError("입력한 회원가입 정보를 확인해 주세요.");
  if (response.status === 429) throw new SsoLoginError("회원가입 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  if (response.status !== 201 || typeof result !== "object" || result === null
    || !("registered" in result) || result.registered !== true) throw new SsoLoginError(REGISTRATION_UNAVAILABLE);
}
