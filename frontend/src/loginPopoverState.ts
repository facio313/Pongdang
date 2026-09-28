import { createContext, useContext } from "react";
import { resumeSsoLogin } from "./ssoLogin";

export const LoginPopoverControl = createContext<{ open: () => void } | null>(null);

/** OAuth2 복귀 후 원래 화면을 새로 열어 세션에 맞는 알림·취향을 다시 읽습니다. */
export function resumeAfterLogin() {
  resumeSsoLogin(import.meta.env.BASE_URL, window.location, () => window.sessionStorage);
}

/** Product screens and notification history share the same inline login form. */
export function useRequireLogin() {
  const control = useContext(LoginPopoverControl);
  if (!control) throw new Error("LoginPopoverProvider is required");
  return control.open;
}
