// 주요 탭 목록의 단일 출처입니다. 모바일은 하단 탭바(appTabBar.tsx), 데스크탑은
// 상단 인라인 네비(pongdangDesktop.tsx)로 **같은 목록을 다르게 그립니다.**
// 항목을 늘리거나 순서를 바꿀 때 고칠 곳은 여기 하나뿐입니다.
//
// 핸드오프 기준 5칸입니다 -- 홈 · 오늘 · 추천 · 명소 · 지도. 저장한 코스는
// 별도 탭이 아니라 지도 탭의 「코스 경로」 뷰(#map?view=course)에서 봅니다.

export type TabKey = "home" | "today" | "recommend" | "spots" | "map";

import type { IconName } from "./pongdangUi";

export interface NavItem {
  key: TabKey;
  label: string;
  /** 모바일 하단 탭바 전용입니다. 데스크탑 상단 네비는 텍스트만 씁니다 --
   *  가로로 넉넉히 펴지므로 아이콘이 없어도 스캔이 됩니다. */
  icon: IconName;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "홈", icon: "sun" },
  { key: "today", label: "오늘", icon: "wave" },
  { key: "recommend", label: "추천", icon: "sparkle" },
  { key: "spots", label: "명소", icon: "pin" },
  { key: "map", label: "지도", icon: "search" },
];
