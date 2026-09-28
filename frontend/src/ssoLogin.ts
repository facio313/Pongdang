const RETURN_PATH_KEY = "pd-return-path";
const UNAVAILABLE = "로그인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export class SsoLoginError extends Error {}

async function sessionResponse(response: Response, allowAnonymous = false): Promise<boolean> {
  if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
    throw new SsoLoginError(UNAVAILABLE);
  }
  if (response.status === 429) throw new SsoLoginError("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  if (allowAnonymous && [401, 403].includes(response.status)) return false;
  if (response.status === 401) throw new SsoLoginError("아이디 또는 비밀번호를 확인해 주세요.");
  if (response.status === 403) throw new SsoLoginError("Pongdang 접근 권한이 없습니다. 관리자에게 문의해 주세요.");
  if (!response.ok) throw new SsoLoginError(UNAVAILABLE);
  const result: unknown = await response.json();
  return typeof result === "object" && result !== null && "authenticated" in result && result.authenticated === true;
}

/** The same-origin bridge completes the existing SSO/OAuth exchange. Passwords
 * are never stored, and only a fresh protected session check confirms success. */
export async function signInSso(base: string, username: string, password: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<void> {
  const options = { credentials: "same-origin", redirect: "error", cache: "no-store", signal } as const;
  // Never send credentials to a Vite/SPA HTML fallback on an unconfigured host.
  await sessionResponse(await fetcher(`${base}api/auth/state`, options), true);
  if (!await sessionResponse(await fetcher(`${base}api/auth/login`, {
    ...options, method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim(), password }),
  }))) throw new SsoLoginError(UNAVAILABLE);
  if (!await sessionResponse(await fetcher(`${base}api/auth/state`, options))) throw new SsoLoginError(UNAVAILABLE);
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
