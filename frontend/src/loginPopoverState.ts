import { createContext, useContext } from "react";

const RETURN_HASH_KEY = "pd-return-hash";

/** 로그인 팝오버로 이동하기 전에 돌아올 화면(hash)을 남겨 둡니다. `/auth/continue`
 *  가 SSO 통과 후 이 값을 읽어 원래 화면으로 되돌립니다. */
export function goToLogin() {
  try {
    sessionStorage.setItem(RETURN_HASH_KEY, window.location.hash);
  } catch {
    // 세션 저장소를 못 쓰면(사생활 보호 모드 등) 그냥 홈으로 돌아갑니다.
  }
  window.location.href = `${import.meta.env.BASE_URL}auth/continue`;
}

/** 앱이 뜰 때 한 번 확인합니다. `/auth/continue` 는 SSO 를 통과해야만 도달하는
 *  경로이므로, 여기 있다는 것은 로그인이 막 끝났다는 뜻입니다 -- 남겨 둔 화면으로
 *  튕겨 보내고 그 경로 자체는 주소창에 남기지 않습니다. */
export function resumeAfterLogin() {
  if (!window.location.pathname.endsWith("/auth/continue")) return;
  let returnHash = "#home";
  try {
    returnHash = sessionStorage.getItem(RETURN_HASH_KEY) || returnHash;
    sessionStorage.removeItem(RETURN_HASH_KEY);
  } catch {
    // 세션 저장소를 못 읽어도 홈으로는 돌려보낼 수 있습니다.
  }
  window.location.replace(`${import.meta.env.BASE_URL}${returnHash}`);
}

export const LoginPopoverControl = createContext<{
  reason: string | null;
  requireLogin: (reason?: string) => void;
  close: () => void;
} | null>(null);

/** 로그인이 필요한 동작(취향 저장 · 즐겨찾기 · 내 코스 등)을 시작하는 훅/화면이
 *  부르는 손잡이입니다. 컨텍스트 밖(Provider 가 없는 화면)에서는 조용히
 *  무시합니다 -- sideMenu.tsx 의 SideMenuButton 과 같은 방어. */
export function useRequireLogin() {
  const control = useContext(LoginPopoverControl);
  return control?.requireLogin ?? (() => {});
}
