import { Fragment, useEffect, useState } from "react";
import { DataOrigin } from "./DataOrigin";
import { DataWorkspace } from "./DataWorkspace";
import { DevIndexPage } from "./DevIndexPage";
import { AiConciergePage } from "./AiConciergePage";
import { FeatureDataPage } from "./FeatureDataPage";
import { LivecamPreviewPage } from "./LivecamPreviewPage";
import { featurePages, readRoute, type FeaturePage } from "./featureRoutes";
import { HomePage } from "./HomePage";
import { TodayPage } from "./TodayPage";
import { RecommendPage } from "./RecommendPage";
import { MapPage } from "./MapPage";
import { MyCoursesPage } from "./MyCoursesPage";

// 확정된 제품 화면 5개. 하단 공용 탭바(appTabBar.tsx)와 같은 키를 씁니다.
const productPages = {
  home: { label: "홈", render: () => <HomePage /> },
  today: { label: "오늘", render: () => <TodayPage /> },
  recommend: { label: "추천", render: () => <RecommendPage /> },
  map: { label: "지도", render: () => <MapPage /> },
  "my-courses": { label: "내 코스", render: () => <MyCoursesPage /> },
} as const;

type ProductKey = keyof typeof productPages;

type Screen =
  | { kind: "product"; key: ProductKey }
  | { kind: "dev" }
  | { kind: "route"; route: ReturnType<typeof readRoute> };

/** 제품 화면(탭)은 여기서 먼저 받고, 나머지는 featureRoutes 의 readRoute 가
 *  해석합니다. readRoute 는 모르는 해시를 `data` 로 떨어뜨리므로, 해시가
 *  실제로 `#data` 가 아닌데 `data` 가 나왔다면 빈 해시이거나 알 수 없는
 *  해시입니다. 그 경우는 기본 진입 화면인 홈으로 보냅니다. */
function screenFromHash(hash: string): Screen {
  const rawPage = hash.replace(/^#/, "").split("?")[0];
  if (Object.hasOwn(productPages, rawPage))
    return { kind: "product", key: rawPage as ProductKey };
  if (rawPage === "dev") return { kind: "dev" };
  const route = readRoute(hash);
  if (route.page === "data" && rawPage !== "data")
    return { kind: "product", key: "home" };
  return { kind: "route", route };
}

export default function App() {
  const [screen, setScreen] = useState(() =>
    screenFromHash(window.location.hash),
  );
  useEffect(() => {
    const change = () => setScreen(screenFromHash(window.location.hash));
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("data") && url.searchParams.get("data") !== "data") {
      url.searchParams.set("data", "data");
      window.history.replaceState(null, "", url);
    }
  }, []);
  return (
    <DataOrigin.Provider value="data">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        본문으로 이동
      </a>
      <main id="main-content" tabIndex={-1}>
        {screen.kind === "product" ? (
          <Fragment key={window.location.hash}>{productPages[screen.key].render()}</Fragment>
        ) : screen.kind === "dev" ? (
          <DevIndexPage />
        ) : screen.route.page === "ai" ? (
          <AiConciergePage
            key={JSON.stringify(screen.route)}
            initialContext={{
              ...(screen.route.spotId ? { spot_id: screen.route.spotId } : {}),
              activity: screen.route.activity,
              ...(screen.route.from && screen.route.until
                ? { time_text: `${screen.route.from}/${screen.route.until}` }
                : {}),
            }}
          />
        ) : screen.route.page === "livecam" ? (
          <LivecamPreviewPage />
        ) : Object.hasOwn(featurePages, screen.route.page) ? (
          <FeatureDataPage
            key={JSON.stringify(screen.route)}
            page={screen.route.page as FeaturePage}
            spotId={screen.route.spotId}
            activity={screen.route.activity ?? "swim"}
            from={screen.route.from}
            until={screen.route.until}
          />
        ) : (
          <DataWorkspace page={screen.route.page === "info" ? "info" : "data"} />
        )}
      </main>
    </DataOrigin.Provider>
  );
}
