/** 레이아웃 3단 분기 기준. `useViewport()`/`useIsDesktop()` 및 각 CSS 파일의
 *  미디어쿼리가 이 숫자와 동기화되어야 합니다(빌드타임 공유가 없어 CSS 쪽은
 *  리터럴 값에 `keep in sync with breakpoints.ts` 주석을 남기는 방식으로 관리).
 *
 *    mobile   : < TABLET_MIN
 *    tablet   : TABLET_MIN ~ DESKTOP_MIN - 1
 *    desktop  : >= DESKTOP_MIN
 */
export const TABLET_MIN = 640;
export const DESKTOP_MIN = 960;

export const TABLET_QUERY = `(min-width:${TABLET_MIN}px)`;
export const DESKTOP_QUERY = `(min-width:${DESKTOP_MIN}px)`;
