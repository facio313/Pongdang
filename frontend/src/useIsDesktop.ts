import { useSyncExternalStore } from "react";
import { DESKTOP_QUERY, TABLET_QUERY } from "./breakpoints";

/** MediaQueryList 는 모듈 스코프에서 한 번만 만듭니다. 구독자마다 새로
 *  matchMedia 를 부르면 getSnapshot 이 매번 다른 객체를 보게 되고, 구독 해제도
 *  다른 객체에 걸립니다. */
const tabletQuery =
  typeof window === "undefined" ? null : window.matchMedia(TABLET_QUERY);
const desktopQuery =
  typeof window === "undefined" ? null : window.matchMedia(DESKTOP_QUERY);

function subscribe(onChange: () => void) {
  tabletQuery?.addEventListener("change", onChange);
  desktopQuery?.addEventListener("change", onChange);
  return () => {
    tabletQuery?.removeEventListener("change", onChange);
    desktopQuery?.removeEventListener("change", onChange);
  };
}

export type Viewport = "mobile" | "tablet" | "desktop";

function getSnapshot(): Viewport {
  if (desktopQuery?.matches) return "desktop";
  if (tabletQuery?.matches) return "tablet";
  return "mobile";
}

/** 지금 폭이 모바일/태블릿/데스크탑 중 어느 구간인지 돌려줍니다
 *  (`breakpoints.ts` 의 TABLET_MIN/DESKTOP_MIN 기준).
 *
 *  SSR 이 없으므로 첫 렌더에서 곧바로 동기 평가됩니다 -- 모바일로 한 번
 *  그렸다가 다른 구간으로 갈아 끼우는 깜빡임이 없습니다.
 *
 *  이 값으로 **레이아웃 컴포넌트를 통째로 갈아 끼우세요.** 한 컴포넌트 안에서
 *  삼항으로 마크업을 분기하지 않습니다(가이드 §1). 데이터 훅 · 등급 판정 ·
 *  문구 상수는 세 레이아웃이 공유하고, 마크업과 CSS 만 나눕니다. */
export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, getSnapshot, () => "mobile");
}

/** `useViewport() === "desktop"` 의 얇은 wrapper. 기존 2단 분기 호출부와의
 *  호환을 위해 남겨둡니다. */
export function useIsDesktop(): boolean {
  return useViewport() === "desktop";
}
