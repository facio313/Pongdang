/** 패널이 지도를 덮는 가장자리(px)입니다. 지도에 `insets` 로 넘기면 핀이 패널
 *  뒤로 숨지 않습니다 -- 숨은 핀은 고를 수 없습니다.
 *
 *  값은 pongdangDesktop.css 의 `.pd-dk-mapshell` 토큰과 크롬 격자에서 옵니다:
 *  `--dk-map-nav-h`(68) · `--dk-map-panel-w`(352) · 격자 패딩 24 · 간격 16.
 *  CSS 를 고치면 여기도 같이 고쳐야 하므로 한 군데에 모아 둡니다. */
export const DESKTOP_MAP = {
  /** 패널이 없는 쪽의 여백. */
  edge: 24,
  /** 패널 한 장이 덮는 폭(패널 + 바깥 패딩 + 격자 간격). */
  panel: 352 + 24 + 16,
  /** 상단 코발트 띠가 덮는 높이. */
  nav: 68 + 16,
} as const;
