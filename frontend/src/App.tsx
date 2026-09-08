import { useEffect, useState } from "react";
import { CollectorPage } from "./CollectorPage";
import { DataPage } from "./DataPage";
import type { Dataset, Summary } from "./data";
import { useResource } from "./useResource";

export default function App() {
  const [page, setPage] = useState(
    window.location.hash === "#data" ? "data" : "collector",
  );
  const [selectedKey, setSelectedKey] = useState("spots");
  const [revision, setRevision] = useState(0);
  const summary = useResource<Summary>("summary", revision);
  const catalog = useResource<Dataset[]>("catalog");
  useEffect(() => {
    const change = () => {
      if (window.location.hash === "#data") setPage("data");
      else if (["", "#collector"].includes(window.location.hash))
        setPage("collector");
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  function openDataset(key: string) {
    setSelectedKey(key);
    window.location.hash = "data";
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <header className="app-header">
        <a className="brand" href="#collector">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path
                d="M12 2C9 6 5 10 5 14a7 7 0 0 0 14 0c0-4-4-8-7-12Z"
                fill="currentColor"
              />
              <path
                d="M8 15a4 4 0 0 0 4 4"
                fill="none"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span>
            Pongdang<small>DATA WORKSPACE</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="주요 메뉴">
          <a
            className={page === "collector" ? "active" : ""}
            aria-current={page === "collector" ? "page" : undefined}
            href="#collector"
          >
            Collector 소개
          </a>
          <a
            className={page === "data" ? "active" : ""}
            aria-current={page === "data" ? "page" : undefined}
            href="#data"
          >
            데이터 조회
          </a>
        </nav>
        <a className="portfolio-link" href="/">
          포트폴리오 ↗
        </a>
      </header>
      <main id="main-content">
        <div className="workspace-bar">
          <span>
            <span
              className={`connection-dot ${summary.data ? "online" : ""}`}
            />
            {summary.data
              ? "cksDB 연결됨"
              : summary.loading
                ? "DB 연결 확인 중"
                : "DB 조회 불가"}
            <span className="meta-divider">/</span>Multtara
          </span>
          <button
            className="text-button"
            disabled={summary.loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            ↻ 현황 갱신
          </button>
        </div>
        {summary.error && (
          <div className="notice" role="alert">
            <div>
              <strong>DB 현황을 불러오지 못했습니다.</strong>
              <p>
                {summary.error} Collector 설명과 데이터셋 구조는 계속 확인할 수
                있습니다.
              </p>
            </div>
          </div>
        )}
        {catalog.error && (
          <div className="notice" role="alert">
            데이터셋 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.
          </div>
        )}
        {page === "collector" ? (
          <CollectorPage summary={summary.data} openDataset={openDataset} />
        ) : (
          <DataPage
            catalog={catalog.data ?? []}
            summary={summary.data}
            selectedKey={selectedKey}
            selectDataset={setSelectedKey}
          />
        )}
      </main>
      <footer className="app-footer">
        <span>
          Pongdang <span className="muted">/ Multtara data workspace</span>
        </span>
        <span>읽기 전용 조회 · KST</span>
      </footer>
    </div>
  );
}
