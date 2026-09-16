import { NAV_ITEMS, type TabKey } from "./appNav";
import "./appTabBar.css";

export type { TabKey };

// 확정된 제품 화면의 공용 하단 인디케이터입니다. 화면마다 따로 두지 않고 이
// 컴포넌트 하나만 씁니다. 항목 목록은 appNav.ts 가 단일 출처이며, 데스크탑
// 상단 네비(pongdangDesktop.tsx)가 같은 목록을 씁니다.
export function AppTabBar({ active }: { active: TabKey }) {
  return (
    <div className="pd-tabbar-slot">
      <nav className="pd-tabbar" aria-label="주요 탭">
        {NAV_ITEMS.map((tab) => (
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
