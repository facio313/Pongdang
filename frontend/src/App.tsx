import { useEffect, useState } from "react";
import { DataInfoPage } from "./DataInfoPage";
import { DataPage } from "./DataPage";
import { date, type Dataset, type Summary } from "./data";
import { canonicalDataUrl, pageFromHash } from "./navigation";
import { useResource } from "./useResource";
import { WaterIndexHubPage } from "./WaterIndexHubPage";
import { WaterIndexMapPage } from "./WaterIndexMapPage";
import { WaterForecastPage } from "./WaterForecastPage";
import { LivecamHubPage } from "./LivecamHubPage";
import { TideTimerPage } from "./TideTimerPage";
import { FirstSwimPage } from "./FirstSwimPage";
import { WaterQualityPage } from "./WaterQualityPage";

const featurePages = {
  "water-index": { label: "Water Index", render: () => <WaterIndexHubPage /> },
  "water-index-map": { label: "지도 배치", render: () => <WaterIndexMapPage /> },
  "water-forecast": { label: "Water Forecast", render: () => <WaterForecastPage /> },
  livecam: { label: "라이브캠", render: () => <LivecamHubPage /> },
  tide: { label: "물때 타이머", render: () => <TideTimerPage /> },
  "first-swim": { label: "첫 입수", render: () => <FirstSwimPage /> },
  "water-quality": { label: "수질 교차검증", render: () => <WaterQualityPage /> },
} as const;

export default function App() {
  const [page, setPage] = useState(() => pageFromHash(window.location.hash));
  const [selectedKey, setSelectedKey] = useState("metrics");
  const [revision, setRevision] = useState(0);
  const summary = useResource<Summary>("summary", revision);
  const catalog = useResource<Dataset[]>("catalog", revision);

  useEffect(() => {
    const url = canonicalDataUrl(window.location.href);
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    const change = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);

  function openDataset(key: string) {
    setSelectedKey(key);
    window.location.hash = "data";
  }

  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 이동</a>
      <header className="app-header">
        <span>Pongdang</span>
        <nav aria-label="주요 메뉴">
          <a href="#data" aria-current={page === "data" ? "page" : undefined}>데이터 조회</a>
          <a href="#info" aria-current={page === "info" ? "page" : undefined}>데이터 정보</a>
          {Object.entries(featurePages).map(([key, feature]) => (
            <a key={key} href={"#" + key} aria-current={page === key ? "page" : undefined}>{feature.label}</a>
          ))}
          <a href="/">포트폴리오</a>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="toolbar">
          <span>
            {summary.data ? "Pongdang DB 연결됨" : summary.loading ? "DB 연결 확인 중" : "DB 조회 불가"}
            {" · "}실제 수집 데이터 · 읽기 전용 · KST
          </span>
          <span>현황 조회: {date(summary.data?.queried_at)}</span>
          <button disabled={summary.loading} onClick={() => setRevision((value) => value + 1)}>
            전체 새로고침
          </button>
        </div>
        {summary.error && (
          <p role="alert">
            DB 현황을 불러오지 못했습니다. {summary.error} 데이터 구조는 계속 확인할 수 있습니다.
          </p>
        )}
        {catalog.error && (
          <p role="alert">데이터셋 목록을 불러오지 못했습니다. 전체 새로고침으로 다시 조회해 주세요.</p>
        )}
        {page in featurePages ? featurePages[page as keyof typeof featurePages].render() : page === "info" ? (
          <DataInfoPage catalog={catalog.data ?? []} summary={summary.data} openDataset={openDataset} />
        ) : (
          <DataPage
            catalog={catalog.data ?? []}
            summary={summary.data}
            selectedKey={selectedKey}
            selectDataset={setSelectedKey}
            revision={revision}
          />
        )}
      </main>
    </>
  );
}
