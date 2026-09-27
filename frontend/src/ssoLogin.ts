const RETURN_PATH_KEY = "pd-return-path";

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
