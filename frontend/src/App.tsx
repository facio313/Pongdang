import { useEffect, useState } from "react";
import { DataOrigin, type Origin } from "./DataOrigin";
import { DataWorkspace } from "./DataWorkspace";
import { DevIndexPage } from "./DevIndexPage";
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
type Page = ProductKey | "data" | "info" | "dev";

function pageFromHash(): Page {
  const key = window.location.hash.replace(/^#/, "");
  if (key === "info" || key === "collector") return "info";
  if (key === "data") return "data";
  if (key === "dev") return "dev";
  if (key in productPages) return key as ProductKey;
  // 빈 해시와 알 수 없는 해시(삭제된 프리뷰 화면 포함)는 홈으로 들어옵니다.
  return "home";
}

export default function App() {
  const [origin, setOrigin] = useState<Origin>(
    ["data", "collector"].includes(
      new URLSearchParams(window.location.search).get("data") ?? "",
    )
      ? "data"
      : "demo",
  );
  const [page, setPage] = useState<Page>(pageFromHash);
  useEffect(() => {
    const change = () => setPage(pageFromHash());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  function changeOrigin(next: Origin) {
    setOrigin(next);
    const url = new URL(window.location.href);
    url.searchParams.set("data", next);
    window.history.replaceState(null, "", url);
  }
  const isData = page === "data" || page === "info";
  return (
    <DataOrigin.Provider value={origin}>
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <main id="main-content" tabIndex={-1}>
        {isData ? (
          <DataWorkspace
            key={origin}
            page={page as "data" | "info"}
            origin={origin}
            setOrigin={changeOrigin}
          />
        ) : page === "dev" ? (
          <DevIndexPage />
        ) : (
          productPages[page as ProductKey].render()
        )}
      </main>
    </DataOrigin.Provider>
  );
}
