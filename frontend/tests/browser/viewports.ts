import { DESKTOP_MIN, TABLET_MIN } from "../../src/breakpoints";

export { DESKTOP_MIN, TABLET_MIN };

/** 브라우저 테스트가 쓰는 대표 폭입니다. 숫자를 스펙마다 적어 두면 분기점이
 *  움직일 때 조용히 어긋납니다 -- 실제로 데스크탑 기준이 1080 에서 960 으로
 *  내려갔을 때 `width < 1080` 로 갈라 놓은 스펙들이 960~1079 구간을 모바일로
 *  착각했습니다. 그래서 여기서 breakpoints.ts 를 읽어 파생시킵니다. */
export const MOBILE_WIDTH = 390;
/** 태블릿 구간의 한가운데. 지금은 이 구간도 모바일 레이아웃을 씁니다
 *  (useViewport 를 쓰는 화면이 아직 없습니다). */
export const TABLET_WIDTH = (TABLET_MIN + DESKTOP_MIN) >> 1;
/** 모바일 레이아웃이 유효한 마지막 폭. */
export const MOBILE_MAX_WIDTH = DESKTOP_MIN - 1;
/** 디자인 기준 데스크탑 폭. */
export const DESKTOP_WIDTH = 1440;

/** 그 폭에서 데스크탑 레이아웃이 뜨는지. `useIsDesktop()` 과 같은 기준입니다. */
export function isDesktopWidth(width: number): boolean {
  return width >= DESKTOP_MIN;
}

/** 폭에 따라 모바일·데스크탑 선택자를 고릅니다. 스펙들이 저마다
 *  `width < 1080 ? a : b` 를 적던 자리입니다. */
export function byWidth<T>(width: number, mobile: T, desktop: T): T {
  return isDesktopWidth(width) ? desktop : mobile;
}
