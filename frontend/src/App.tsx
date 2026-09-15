import { useEffect, useState } from "react";
import { DataInfoPage } from "./DataInfoPage";
import { DataPage } from "./DataPage";
import { date, type Dataset, type Summary } from "./data";
import { useResource } from "./useResource";
import { DataOrigin } from "./DataOrigin";
import { AiConciergePage } from "./AiConciergePage";
import { FeatureDataPage } from "./FeatureDataPage";
import { featurePages, readRoute, type FeaturePage } from "./featureRoutes";

export default function App() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("data") && url.searchParams.get("data") !== "data") {
      url.searchParams.set("data", "data");
      window.history.replaceState(null, "", url);
    }
  }, []);
  return <DataOrigin.Provider value="data">
    <div className="toolbar origin-selector"><label>데이터 구분 <select aria-label="데이터 구분" value="data" disabled><option value="data">Pongdang 수집 데이터</option></select></label><strong>Pongdang 자체 DB · 실제 자료 · 읽기 전용</strong></div>
    <Workspace />
  </DataOrigin.Provider>;
}
function Workspace() {
  const [route, setRoute] = useState(() => readRoute(window.location.hash));
  const [selectedKey, setSelectedKey] = useState("spots");
  const [revision, setRevision] = useState(0);
  const summary = useResource<Summary>("summary", revision);
  const summaryData = summary.data ?? summary.previousData;
  const catalog = useResource<Dataset[]>("catalog");
  useEffect(() => {
    const change = () => setRoute(readRoute(window.location.hash));
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  function openDataset(key: string) { setSelectedKey(key); window.location.hash = "data"; }
  return <>
    <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); document.getElementById("main-content")?.focus(); }}>본문으로 이동</a>
    <header className="app-header"><span>Pongdang</span><nav aria-label="주요 메뉴">
      <a href="#data" aria-current={route.page === "data" ? "page" : undefined}>데이터 조회</a>
      <a href="#info" aria-current={route.page === "info" ? "page" : undefined}>데이터 정보</a>
      <a href="#ai" aria-current={route.page === "ai" ? "page" : undefined}>AI에게 물어보기</a>
      {Object.entries(featurePages).map(([key, label]) => <a key={key} href={"#" + key} aria-current={route.page === key ? "page" : undefined}>{label}</a>)}
      <a href="/">포트폴리오</a>
    </nav></header>
    <main id="main-content" tabIndex={-1}>
      {route.page === "ai" ? <AiConciergePage key={JSON.stringify(route)} initialContext={{ ...(route.spotId ? { spot_id: route.spotId } : {}), activity: route.activity, ...(route.from && route.until ? { time_text: `${route.from}/${route.until}` } : {}) }} />
        : Object.hasOwn(featurePages, route.page) ? <FeatureDataPage key={JSON.stringify(route)} page={route.page as FeaturePage} spotId={route.spotId} activity={route.activity ?? "swim"} from={route.from} until={route.until} /> : <>
          <div className="toolbar"><span>{summary.data ? "Pongdang DB 연결됨" : summary.loading ? "DB 연결 확인 중" : "DB 조회 불가"} · Pongdang 자체 DB / pongdang_data · 읽기 전용 · KST</span><span>현황 조회: {date(summaryData?.queried_at)}</span><button disabled={summary.loading} onClick={() => setRevision((value) => value + 1)}>전체 새로고침</button></div>
          {summary.error && <p role="alert">DB 현황을 불러오지 못했습니다. {summary.error} 설명과 데이터 구조는 계속 확인할 수 있습니다.</p>}
          {catalog.error && <p role="alert">데이터셋 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.</p>}
          {route.page === "info" ? <DataInfoPage catalog={catalog.data ?? []} openDataset={openDataset} /> : <DataPage catalog={catalog.data ?? []} summary={summaryData} selectedKey={selectedKey} selectDataset={setSelectedKey} revision={revision} />}
        </>}
    </main>
  </>;
}
