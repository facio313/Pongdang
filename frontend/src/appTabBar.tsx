import { NAV_ITEMS, type TabKey } from "./appNav";
import { Icon } from "./pongdangUi";
import "./appTabBar.css";

export type { TabKey };

// 확정된 제품 화면의 공용 하단 인디케이터입니다. 화면마다 따로 두지 않고 이
// 컴포넌트 하나만 씁니다. 항목 목록은 appNav.ts 가 단일 출처이며, 데스크탑
// 상단 네비(pongdangDesktop.tsx)가 같은 목록을 씁니다.
export function AppTabBar({
  active,
  floating = false,
}: {
  active: TabKey;
  /** 풀스크린 지도 화면. 탭바는 이미 fixed 라 자리를 차지하지 않아도 되고,
   *  흐름에 슬롯 높이가 남아 있으면 지도 면이 그만큼 잘립니다. 슬롯은 폭
   *  실측(100cqw) 때문에 남겨 두고 높이만 0 으로 둡니다. */
  floating?: boolean;
}) {
  return (
    <div className={"pd-tabbar-slot" + (floating ? " is-floating" : "")}>
      <nav className="pd-tabbar" aria-label="주요 탭">
        {NAV_ITEMS.map((tab) => (
          <a
            key={tab.key}
            className="pd-tab"
            href={"#" + tab.key}
            aria-current={tab.key === active ? "page" : undefined}
          >
            <Icon name={tab.icon} size={18} />
            <span className="pd-tab-label">{tab.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
