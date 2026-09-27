const UNAVAILABLE = "로그인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export class SsoLoginError extends Error {}

type SsoResponse = { status?: string; data?: { authentication_level?: number; redirect?: string } };

async function readSsoResponse(response: Response): Promise<SsoResponse> {
  if (response.status === 429) throw new SsoLoginError("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  if (response.status === 401 || response.status === 403) throw new SsoLoginError("아이디 또는 비밀번호를 확인해 주세요.");
  if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
    throw new SsoLoginError(UNAVAILABLE);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("status" in result) || result.status !== "OK") {
    throw new SsoLoginError(UNAVAILABLE);
  }
  return result as SsoResponse;
}

/** Use the existing same-origin Authelia session, never a Pongdang password store.
 * The preflight also prevents sending credentials to Vite's HTML fallback when
 * this origin has no SSO service. Only the requested callback means 1FA suffices. */
export async function signInSso(
  username: string,
  password: string,
  targetURL: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<"authenticated" | "continue"> {
  const options = { credentials: "same-origin", redirect: "error", cache: "no-store", signal } as const;
  const state = await readSsoResponse(await fetcher("/sso/api/state", options));
  if (typeof state.data?.authentication_level !== "number") throw new SsoLoginError(UNAVAILABLE);
  const result = await readSsoResponse(await fetcher("/sso/api/firstfactor", {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim(), password, targetURL, requestMethod: "GET", keepMeLoggedIn: false }),
  }));
  // A missing/different redirect can mean a second factor or access policy still
  // needs attention. Let the existing SSO portal complete that decision.
  return result.data?.redirect === targetURL ? "authenticated" : "continue";
}
