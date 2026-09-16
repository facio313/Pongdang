import type { ReactNode } from "react";
import { AppTabBar, type TabKey } from "./appTabBar";

/** 화면 상단 헤더. 화면마다 복붙돼 있던 상태바 마크업을 대신합니다.
 *
 *  시계는 데스크톱의 목업 폰 프레임에서만 보입니다. 실기기(풀블리드)에서는
 *  바로 위에 OS 의 진짜 시계가 있어 두 개가 겹쳐 보이므로 pongdang.css 가
 *  숨깁니다. 노치 여백도 거기 .pd-header 가 잡습니다. */
export function AppHeader({
  title,
  time,
  onCobalt = false,
}: {
  title: string;
  /** 목업 프레임용 시각 문자열. 없으면 자리만 비워 둡니다. */
  time?: string;
  onCobalt?: boolean;
}) {
  return (
    <div className={"pd-header" + (onCobalt ? " is-on-cobalt" : "")}>
      <span className="pd-header-time">{time}</span>
      <span className="pd-header-mark">PONGDANG</span>
      <span>{title}</span>
    </div>
  );
}

/** 제품 화면 5개(홈·오늘·추천·지도·내 코스)의 공용 셸입니다. 프레임·헤더·
 *  본문·하단 탭바를 한 자리에서 렌더하므로, 각 화면은 내용만 넘기면 됩니다.
 *
 *  히어로(코발트 레이어)가 있는 화면은 헤더가 히어로 안에 얹혀야 하므로,
 *  그 화면이 hero 안에 <AppHeader onCobalt /> 를 직접 넣고 title 은 생략합니다.
 *  hero 가 없으면 여기서 헤더를 렌더하며, 이때 title 이 필요합니다.
 *
 *  bare 를 주면 .pd-body 래퍼 없이 children 을 그대로 흘립니다 -- 지도처럼
 *  본문 패딩이 필요 없는 화면용입니다. */
export function AppShell({
  tab,
  title,
  hero,
  bare = false,
  children,
}: {
  tab: TabKey;
  title?: string;
  hero?: ReactNode;
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="pd-app">
      <div className="pd-frame">
        {hero ?? <AppHeader title={title ?? ""} />}
        {bare ? children : <div className="pd-body">{children}</div>}
        <AppTabBar active={tab} />
      </div>
    </div>
  );
}
