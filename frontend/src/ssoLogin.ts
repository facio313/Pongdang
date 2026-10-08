const RETURN_PATH_KEY = "pd-return-path";
const UNAVAILABLE = "로그인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export class SsoLoginError extends Error {}

export interface SsoLoginState {
  authenticated: boolean;
  localTest: boolean;
  registrationAvailable: boolean;
}

async function sessionResponse(response: Response, allowAnonymous = false, localTest = false): Promise<SsoLoginState> {
  if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
    throw new SsoLoginError(UNAVAILABLE);
  }
  if (response.status === 429) throw new SsoLoginError("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  if (!(allowAnonymous && [401, 403].includes(response.status))) {
    if (response.status === 401) throw new SsoLoginError(localTest
      ? "로컬 테스트 계정의 아이디 또는 비밀번호를 확인해 주세요."
      : "아이디 또는 비밀번호를 확인해 주세요.");
    if (response.status === 403) throw new SsoLoginError("Pongdang 접근 권한이 없습니다. 관리자에게 문의해 주세요.");
    if (!response.ok) throw new SsoLoginError(UNAVAILABLE);
  }
  const result: unknown = await response.json();
  return {
    authenticated: response.ok && typeof result === "object" && result !== null && "authenticated" in result && result.authenticated === true,
    localTest: typeof result === "object" && result !== null && "environment" in result && result.environment === "local_test",
    registrationAvailable: typeof result === "object" && result !== null && "registration_available" in result && result.registration_available === true,
  };
}

/** The bridge identifies the isolated local provider before credentials are entered. */
export async function readSsoLoginState(base: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<SsoLoginState> {
  return sessionResponse(await fetcher(`${base}api/auth/state`, {
    credentials: "same-origin", redirect: "error", cache: "no-store", signal,
  }), true);
}

/** The same-origin bridge completes the existing SSO/OAuth exchange. Passwords
 * are never stored, and only a fresh protected session check confirms success. */
export async function signInSso(base: string, username: string, password: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<void> {
  const options = { credentials: "same-origin", redirect: "error", cache: "no-store", signal } as const;
  // Never send credentials to a Vite/SPA HTML fallback on an unconfigured host.
  const state = await readSsoLoginState(base, signal, fetcher);
  if (!(await sessionResponse(await fetcher(`${base}api/auth/login`, {
    ...options, method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim(), password }),
  }), false, state.localTest)).authenticated) throw new SsoLoginError(UNAVAILABLE);
  if (!(await readSsoLoginState(base, signal, fetcher)).authenticated) throw new SsoLoginError(UNAVAILABLE);
}

/** Expire this app's session, then verify that the browser is anonymous before
 * discarding its in-memory personal data. An HTML fallback is never success. */
export async function signOutSso(base: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<void> {
  const options = { credentials: "same-origin", redirect: "error", cache: "no-store", signal } as const;
  const verifyAnonymous = async (response: Response, allowed: number[]) => {
    if (response.redirected || !allowed.includes(response.status)
      || !response.headers.get("content-type")?.includes("application/json")) {
      throw new SsoLoginError("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null || !("authenticated" in result) || result.authenticated !== false) {
      throw new SsoLoginError("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };
  await verifyAnonymous(await fetcher(`${base}api/auth/logout`, {
    ...options, method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }), [200]);
  await verifyAnonymous(await fetcher(`${base}api/auth/state`, options), [200, 401]);
}

type LoginLocation = Pick<Location, "origin" | "pathname" | "search" | "hash" | "assign" | "replace">;
type LoginStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Navigate through the existing domain OAuth2 gate. Only that gate establishes
 * the Pongdang session and checks access-pongdang; the app never handles a password. */
export function beginSsoLogin(base: string, location: LoginLocation, storage: () => LoginStorage) {
  try {
    storage().setItem(RETURN_PATH_KEY, `${location.pathname}${location.search}${location.hash}`);
  } catch {
    // If storage is unavailable the callback can still return to the home page.
  }
  location.assign(`${base}auth/continue`);
}

/** A callback navigation creates fresh resource reads. Never infer authentication
 * from an SSO response: the protected APIs remain the authority on this session. */
export function resumeSsoLogin(base: string, location: LoginLocation, storage: () => LoginStorage) {
  if (location.pathname !== `${base}auth/continue`) return;
  let destination = `${base}#home`;
  try {
    const saved = storage().getItem(RETURN_PATH_KEY);
    storage().removeItem(RETURN_PATH_KEY);
    const target = saved ? new URL(saved, location.origin) : null;
    if (target && target.origin === location.origin
      && (target.pathname === "/" || target.pathname === base)
      && !target.username && !target.password) {
      destination = `${target.pathname}${target.search}${target.hash}`;
    }
  } catch {
    // Invalid or inaccessible storage falls back to this app's home page.
  }
  location.replace(destination);
}
