import "./appTabBar.css";

export type TabKey = "home" | "today" | "recommend" | "map" | "my-courses";

const TABS: { key: TabKey; label: string }[] = [
  { key: "home", label: "홈" },
  { key: "today", label: "오늘" },
  { key: "recommend", label: "추천" },
  { key: "map", label: "지도" },
  { key: "my-courses", label: "내 코스" },
];

// 확정된 5개 화면(홈·오늘·추천·지도·내 코스)의 공용 하단 탭바입니다.
// 화면마다 따로 두지 않고 이 컴포넌트 하나만 씁니다.
export function AppTabBar({ active }: { active: TabKey }) {
  return (
    <div className="pd-tabbar-slot">
      <nav className="pd-tabbar" aria-label="주요 탭">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            className="pd-tab"
            href={"#" + tab.key}
            aria-current={tab.key === active ? "page" : undefined}
          >
            {tab.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
