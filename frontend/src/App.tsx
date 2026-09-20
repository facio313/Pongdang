import { Fragment, useEffect, useState } from "react";
import { DataOrigin } from "./DataOrigin";
import { DataWorkspace } from "./DataWorkspace";
import { DevIndexPage } from "./DevIndexPage";
import { DesktopKitPage } from "./DesktopKitPage";
import { AiConciergePage } from "./AiConciergePage";
import { FeatureDataPage } from "./FeatureDataPage";
import { LivecamPreviewPage } from "./LivecamPreviewPage";
import { featurePages, readRoute, type FeaturePage } from "./featureRoutes";
import { HomePage } from "./HomePage";
import { TodayPage } from "./TodayPage";
import { RecommendPage } from "./RecommendPage";
import { MapPage } from "./MapPage";
import { MyCoursesPage } from "./MyCoursesPage";
import { SpotsPage } from "./SpotsPage";
import { useI18n } from "./i18n";

// 확정된 제품 화면 6개. 하단 공용 탭바(appTabBar.tsx)·데스크탑 상단 네비와 같은
// 키를 씁니다(appNav.ts).
const productPages = {
  home: { label: "홈", render: () => <HomePage /> },
  today: { label: "오늘", render: () => <TodayPage /> },
  recommend: { label: "추천", render: () => <RecommendPage /> },
  spots: { label: "명소", render: () => <SpotsPage /> },
  map: { label: "지도", render: () => <MapPage /> },
  "my-courses": { label: "내 코스", render: () => <MyCoursesPage /> },
} as const;

type ProductKey = keyof typeof productPages;

type Screen =
  | { kind: "product"; key: ProductKey }
  | { kind: "dev" }
  | { kind: "desktop-kit" }
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
  // 개발 전용. productPages 에 넣지 않으므로 탭바에는 나타나지 않습니다.
  if (rawPage === "desktop-kit") return { kind: "desktop-kit" };
  const route = readRoute(hash);
  if (route.page === "data" && rawPage !== "data")
    return { kind: "product", key: "home" };
  return { kind: "route", route };
}

export default function App() {
  const { locale, t } = useI18n();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const [screen, setScreen] = useState(() =>
    screenFromHash(window.location.hash),
  );
  useEffect(() => {
    const change = () => {
      setScreen(screenFromHash(window.location.hash));
      // 해시가 바뀌면 화면이 통째로 갈립니다(아래 Fragment key). 그런데
      // window.scrollY 는 그대로라, 홈을 끝까지 내려 본 뒤 「오늘」을 누르면
      // 오늘 화면 중간에서 시작했습니다. 같은 탭 안의 뷰 전환
      // (#spots ↔ #spots?view=map)도 화면이 통째로 바뀌므로 함께 올립니다.
      //
      // 본문 건너뛰기 링크는 해시를 바꾸지 않고(preventDefault + focus) 넘어가므로
      // 여기 걸리지 않습니다.
      window.scrollTo({ top: 0 });
    };
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
        {t("본문으로 이동")}
      </a>
      <main id="main-content" tabIndex={-1}>
        {screen.kind === "product" ? (
          <Fragment key={window.location.hash}>{productPages[screen.key].render()}</Fragment>
        ) : screen.kind === "dev" ? (
          <DevIndexPage />
        ) : screen.kind === "desktop-kit" ? (
          <DesktopKitPage />
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
