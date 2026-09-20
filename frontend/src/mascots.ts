// 마스코트 24포즈의 용도 매핑입니다. 핸드오프 「구현 가이드 — 데스크탑 ·
// 모바일」 §5 의 표를 그대로 옮겼습니다.
//
// 마스코트는 장식이 아니라 **항목 표지**입니다 -- 같은 개념에는 언제나 같은
// 포즈가 와야 합니다. 화면 코드가 파일명을 직접 쓰면 그 규칙이 조용히
// 깨지므로, 화면은 파일명이 아니라 용도(MascotRole)로만 고릅니다.

export type MascotRole =
  | "home"
  | "surf"
  | "swim"
  | "rafting"
  | "rest"
  | "hotspring"
  | "cafe"
  | "spot"
  | "tube"
  | "snorkel"
  | "ai"
  | "firstSwim"
  | "map"
  | "course"
  | "livecam"
  | "empty";

const MASCOT_FILE: Record<MascotRole, string> = {
  home: "surfwave.png",
  surf: "surf.png",
  swim: "swimcap.png",
  rafting: "waterfall.png",
  rest: "deckchair.png",
  hotspring: "onsen.png",
  cafe: "drink.png",
  spot: "bucket.png",
  tube: "tube.png",
  snorkel: "snorkel.png",
  ai: "relax.png",
  firstSwim: "lifevest.png",
  map: "camera.png",
  course: "towel.png",
  // 라이브캠 「물멍」. 지도의 camera.png 를 빌려 쓰지 않습니다 -- 한 포즈가 두
  // 개념의 표지가 되면 규칙이 무너집니다.
  livecam: "floatback.png",
  empty: "lying.png",
};

/** 용도에 해당하는 마스코트 이미지 경로.
 *
 *  `/mascot/...` 절대경로를 쓰면 안 됩니다 -- 운영 배포는 `/pongdang/` 하위이고
 *  Vite base 는 APP_BASE_PATH 로 바뀝니다. BASE_URL 은 항상 `/` 로 끝납니다. */
export function mascotUrl(role: MascotRole): string {
  return import.meta.env.BASE_URL + "mascot/" + MASCOT_FILE[role];
}

/** 표지용 alt 텍스트. 마스코트는 정보를 더하지 않는 표지이므로, 옆에 이름이
 *  이미 있는 자리에서는 `alt=""` 로 두고 읽히지 않게 하는 편이 낫습니다. */
export const MASCOT_ALT = "퐁당 호랑이";

/** 개발용 미리보기(#desktop-kit)가 전체 목록을 훑을 때 씁니다. */
export const MASCOT_ROLES = Object.keys(MASCOT_FILE) as MascotRole[];
