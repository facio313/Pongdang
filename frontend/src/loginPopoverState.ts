import { beginSsoLogin, resumeSsoLogin } from "./ssoLogin";

/** 돌아올 화면을 남기고 도메인의 기존 OAuth2 로그인 흐름으로 이동합니다. */
export function goToLogin() {
  beginSsoLogin(import.meta.env.BASE_URL, window.location, () => window.sessionStorage);
}

/** OAuth2 복귀 후 원래 화면을 새로 열어 세션에 맞는 알림·취향을 다시 읽습니다. */
export function resumeAfterLogin() {
  resumeSsoLogin(import.meta.env.BASE_URL, window.location, () => window.sessionStorage);
}

/** 알림 이력처럼 별도 화면에서도 같은 로그인 경로를 사용합니다. */
export function useRequireLogin() {
  return goToLogin;
}
