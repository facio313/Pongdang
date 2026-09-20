// 브랜드 표지(로고) 한 곳. 예전에는 화면마다 `PONGDANG` 이라는 **문자열**이
// 박혀 있어서(모바일 헤더 · 사이드 메뉴 · 데스크탑 네비) 표지를 바꾸려면 세
// 군데를 따로 고쳐야 했고, 자간 · 굵기도 파일마다 조금씩 달랐습니다.
//
// 이제 표지는 이미지 한 장이며, 경로는 여기서만 만듭니다.

/** 로고 이미지 경로.
 *
 *  `/logo.png` 절대경로를 쓰면 안 됩니다 -- 운영 배포는 `/pongdang/` 하위이고
 *  Vite base 는 APP_BASE_PATH 로 바뀝니다(mascots.ts 와 같은 이유). */
export function logoUrl(): string {
  return import.meta.env.BASE_URL + "logo.png";
}

/** 로고의 alt 텍스트. 제품 이름이 옆에 이미 적힌 자리(푸터의 주의 문구 등)에서는
 *  `alt=""` 로 두어 같은 이름이 두 번 읽히지 않게 합니다. */
export const LOGO_ALT = "퐁당";
