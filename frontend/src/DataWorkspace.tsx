import { t } from "./i18n.ts";
import { useState } from "react";
import { TravelLanguageSelector } from "./TravelLanguageSelector";
import { DataInfoPage } from "./DataInfoPage";
import { DataPage } from "./DataPage";
import { date, type Dataset, type Summary } from "./data";
import { useResource } from "./useResource";
import { featurePages } from "./featureRoutes";

// 데이터 조회 · 데이터 정보 화면. 제품 화면(홈·오늘·추천·지도·내 코스)과 분리된
// 개발/검증용 화면이며, 상단 헤더와 기능별 데이터 화면 링크는 여기에서만
// 나타납니다. 합성 더미는 폐기되어 읽는 대상은 항상 pongdang_data 입니다.
export function DataWorkspace({ page }: { page: "data" | "info" }) {
  const [selectedKey, setSelectedKey] = useState("spots");
  const [revision, setRevision] = useState(0);
  const summary = useResource<Summary>("summary", revision);
  const summaryData = summary.data ?? summary.previousData;
  const catalog = useResource<Dataset[]>("catalog");
  function openDataset(key: string) {
    setSelectedKey(key);
    window.location.hash = "data";
  }
  return (
    <>
      <div className="toolbar origin-selector">
        <label>{t("데이터 구분")}{" "}
          <select aria-label={t("데이터 구분")} value="data" disabled>
            <option value="data">{t("Pongdang 수집 데이터")}</option>
          </select>
        </label>
        <strong>{t("Pongdang 자체 DB · 실제 자료 · 읽기 전용")}</strong>
        <details>
          <summary>{t("언어 선택")}</summary>
          <TravelLanguageSelector />
        </details>
      </div>
      <header className="app-header">
        <span>Pongdang</span>
        <nav aria-label={t("주요 메뉴")}>
          <a href="#data" aria-current={page === "data" ? "page" : undefined}>{t("데이터 조회")}</a>
          <a href="#info" aria-current={page === "info" ? "page" : undefined}>{t("데이터 정보")}</a>
          <a href="#ai">{t("AI에게 물어보기")}</a>
          {Object.entries(featurePages).map(([key, label]) => (
            <a key={key} href={"#" + key}>
              {t(label)}
            </a>
          ))}
          <a href="#home">{t("앱 화면")}</a>
          <a href="/">{t("포트폴리오")}</a>
        </nav>
      </header>
      <div className="toolbar">
        <span>
          {summary.data
            ? t("Pongdang DB 연결됨")
            : summary.loading
              ? t("DB 연결 확인 중")
              : t("DB 조회 불가")}{" "}{t("· Pongdang 자체 DB / pongdang_data · 읽기 전용 · KST")}</span>
        <span>{t("현황 조회: {time}", { time: date(summaryData?.queried_at) })}</span>
        <button
          disabled={summary.loading}
          onClick={() => setRevision((value) => value + 1)}
        >{t("조회 다시하기")}</button>
      </div>
      {summary.error && (
        <p role="alert">
          {t("DB 현황을 불러오지 못했습니다. {error} 설명과 데이터 구조는 계속 확인할 수 있습니다.", { error: summary.error })}
        </p>
      )}
      {catalog.error && (
        <p role="alert">{t("데이터셋 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.")}</p>
      )}
      {page === "info" ? (
        <DataInfoPage catalog={catalog.data ?? []} openDataset={openDataset} />
      ) : (
        <DataPage
          catalog={catalog.data ?? []}
          summary={summaryData}
          selectedKey={selectedKey}
          selectDataset={setSelectedKey}
          revision={revision}
        />
      )}
    </>
  );
}
