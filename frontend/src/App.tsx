import { useEffect, useState } from "react";
import { CollectorPage } from "./CollectorPage";
import { DataPage } from "./DataPage";
import { date, type Dataset, type Summary } from "./data";
import { useResource } from "./useResource";

export default function App() {
  const [page, setPage] = useState(
    window.location.hash === "#collector" ? "collector" : "data",
  );
  const [selectedKey, setSelectedKey] = useState("spots");
  const [revision, setRevision] = useState(0);
  const summary = useResource<Summary>("summary", revision);
  const summaryData = summary.data ?? summary.previousData;
  const catalog = useResource<Dataset[]>("catalog");
  useEffect(() => {
    const change = () => {
      if (window.location.hash === "#collector") setPage("collector");
      else if (["", "#data"].includes(window.location.hash)) setPage("data");
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  function openDataset(key: string) {
    setSelectedKey(key);
    window.location.hash = "data";
  }
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <header className="app-header">
        <span>Pongdang</span>
        <nav aria-label="주요 메뉴">
          <a href="#data" aria-current={page === "data" ? "page" : undefined}>
            데이터 조회
          </a>
          <a
            href="#collector"
            aria-current={page === "collector" ? "page" : undefined}
          >
            Collector 설명
          </a>
          <a href="/">포트폴리오</a>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="toolbar">
          <span>
            {summary.data
              ? "cksDB 연결됨"
              : summary.loading
                ? "DB 연결 확인 중"
                : "DB 조회 불가"}{" "}
            · Multtara · 읽기 전용 · KST
          </span>
          <span>현황 조회: {date(summaryData?.queried_at)}</span>
          <button
            disabled={summary.loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            전체 새로고침
          </button>
        </div>
        {summary.error && (
          <p role="alert">
            DB 현황을 불러오지 못했습니다. {summary.error} 설명과 데이터 구조는
            계속 확인할 수 있습니다.
          </p>
        )}
        {catalog.error && (
          <p role="alert">
            데이터셋 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.
          </p>
        )}
        {page === "collector" ? (
          <CollectorPage summary={summaryData} openDataset={openDataset} />
        ) : (
          <DataPage
            catalog={catalog.data ?? []}
            summary={summaryData}
            selectedKey={selectedKey}
            selectDataset={setSelectedKey}
            revision={revision}
          />
        )}
      </main>
    </>
  );
}
