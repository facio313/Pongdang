// 주요 탭 목록의 단일 출처입니다. 모바일은 하단 탭바(appTabBar.tsx), 데스크탑은
// 상단 인라인 네비(pongdangDesktop.tsx)로 **같은 목록을 다르게 그립니다.**
// 항목을 늘리거나 순서를 바꿀 때 고칠 곳은 여기 하나뿐입니다.
//
// 핸드오프 기준 6칸입니다 -- 홈 · 오늘 · 추천 · 명소 · 지도 · 내 코스.
// 「명소」가 네 번째로 들어가면서 모바일 탭바가 5칸에서 6칸이 됐습니다.

export type TabKey =
  | "home"
  | "today"
  | "recommend"
  | "spots"
  | "map"
  | "my-courses";

export interface NavItem {
  key: TabKey;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "홈" },
  { key: "today", label: "오늘" },
  { key: "recommend", label: "추천" },
  { key: "spots", label: "명소" },
  { key: "map", label: "지도" },
  { key: "my-courses", label: "내 코스" },
];
