import { useEffect, useState } from "react";
import { CollectorPage } from "./CollectorPage";
import { DataPage } from "./DataPage";
import { date, type Dataset, type Summary } from "./data";
import { useResource } from "./useResource";
import { DataOrigin, type Origin } from "./DataOrigin";

export default function App() {
  const [origin, setOrigin] = useState<Origin>(
    new URLSearchParams(window.location.search).get("data") === "demo"
      ? "demo"
      : "collector",
  );
  return (
    <>
      <div className="toolbar origin-selector">
        <label>
          데이터 구분{" "}
          <select
            aria-label="데이터 구분"
            value={origin}
            onChange={(event) => {
              const next = event.target.value as Origin;
              setOrigin(next);
              const url = new URL(window.location.href);
              if (next === "demo") url.searchParams.set("data", "demo");
              else url.searchParams.delete("data");
              window.history.replaceState(null, "", url);
            }}
          >
            <option value="collector">실제 cksDB 저장 데이터</option>
            <option value="demo">더미 데이터 · 실제 관측 아님</option>
          </select>
        </label>
        <strong>
          {origin === "demo"
            ? "합성 더미 전용: 실제 관측·예보·시설·안전 판단에 사용 금지"
            : "실제 저장 이력만 표시 · 더미와 분리"}
        </strong>
      </div>
      <DataOrigin.Provider value={origin}>
        <Workspace key={origin} origin={origin} />
      </DataOrigin.Provider>
    </>
  );
}

function Workspace({ origin }: { origin: Origin }) {
  const [page, setPage] = useState(
    window.location.hash === "#collector" ? "collector" : "data",
  );
  const [selectedKey, setSelectedKey] = useState(
    origin === "demo" ? "metrics" : "spots",
  );
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
              ? origin === "demo"
                ? "더미 DB 연결됨"
                : "cksDB 연결됨"
              : summary.loading
                ? "DB 연결 확인 중"
                : "DB 조회 불가"}{" "}
            ·{" "}
            {origin === "demo"
              ? "Pongdang 자체 DB / pongdang_demo"
              : "Multtara"}{" "}
            · 읽기 전용 · KST
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
        {origin === "demo" && summaryData?.demo_manifest && (
          <details open>
            <summary>
              더미 생성 내역 · {summaryData.demo_manifest.scenarios.length}개
              세트 · 실제 데이터와 분리
            </summary>
            <p>
              기준 장소:{" "}
              {summaryData.demo_manifest.reference_spots
                .map((spot) => spot.name + " (ID " + spot.id + ")")
                .join(", ")}
              . 계곡·온천·갯벌은 별도의 가상 장소입니다.
            </p>
            <p>
              세트:{" "}
              {summaryData.demo_manifest.scenarios
                .map((item) => item.key + " (" + item.label + ")")
                .join(" · ")}
            </p>
            <p>
              기온·습도는 지표명으로 검색하고, 세트명(clear, humid, rain, wind,
              stale, missing)으로 검색해 예시를 비교할 수 있습니다.
            </p>
            <p>
              생성: {date(summaryData.demo_manifest.created_at)} KST ·{" "}
              {summaryData.demo_manifest.version} · 합성 값으로 실제 수집
              성공·안전함·법적 채취 허용·시설 실재를 주장하지 않습니다.
            </p>
          </details>
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
