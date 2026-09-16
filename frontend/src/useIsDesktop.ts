import { useSyncExternalStore } from "react";

/** 데스크탑 레이아웃 분기 기준. 핸드오프 「구현 가이드 — 데스크탑 · 모바일」 §1
 *  의 값입니다. 1080 미만은 모바일 레이아웃을 그대로 쓰고, 1080 이상에서만
 *  데스크탑 문법(괘선 · 200px 라벨 열)으로 바뀝니다. */
const DESKTOP_QUERY = "(min-width:1080px)";

/** MediaQueryList 는 모듈 스코프에서 한 번만 만듭니다. 구독자마다 새로
 *  matchMedia 를 부르면 getSnapshot 이 매번 다른 객체를 보게 되고, 구독 해제도
 *  다른 객체에 걸립니다. */
const query =
  typeof window === "undefined" ? null : window.matchMedia(DESKTOP_QUERY);

function subscribe(onChange: () => void) {
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

function getSnapshot() {
  return query?.matches ?? false;
}

/** 지금 데스크탑 폭(≥1080px)인지 돌려줍니다.
 *
 *  SSR 이 없으므로 첫 렌더에서 곧바로 동기 평가됩니다 -- 모바일로 한 번
 *  그렸다가 데스크탑으로 갈아 끼우는 깜빡임이 없습니다.
 *
 *  이 값으로 **레이아웃 컴포넌트를 통째로 갈아 끼우세요.** 한 컴포넌트 안에서
 *  isDesktop 삼항으로 마크업을 분기하지 않습니다(가이드 §1). 데이터 훅 · 등급
 *  판정 · 문구 상수는 두 레이아웃이 공유하고, 마크업과 CSS 만 나눕니다. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
