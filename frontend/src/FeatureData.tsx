import { useState } from "react";
import type { Dataset } from "./data";
import { DatasetTable } from "./DataPage";
import { useResource } from "./useResource";

/** Existing feature screens can inspect collected records without inventing scores. */
export function FeatureData({ keys, description }: { keys: string[]; description: string }) {
  const [selectedKey, setSelectedKey] = useState(keys[0]);
  const [revision, setRevision] = useState(0);
  const catalog = useResource<Dataset[]>("catalog", revision);
  const datasets = (catalog.data ?? []).filter((dataset) => keys.includes(dataset.key));
  const selected = datasets.find((dataset) => dataset.key === selectedKey) ?? datasets[0];
  return (
    <section aria-label="관련 수집 자료">
      <h2>관련 수집 자료</h2>
      <p>{description}</p>
      <div className="toolbar">
        {datasets.length > 0 && (
          <label>조회 자료{" "}
            <select value={selected?.key ?? ""} onChange={(event) => setSelectedKey(event.target.value)}>
              {datasets.map((dataset) => <option key={dataset.key} value={dataset.key}>{dataset.title}</option>)}
            </select>
          </label>
        )}
        <button disabled={catalog.loading} onClick={() => setRevision((value) => value + 1)}>자료 새로고침</button>
        <a href="#data">전체 데이터 조회</a>
      </div>
      {catalog.loading && <p role="status">수집 자료 목록을 확인하는 중입니다.</p>}
      {catalog.error && <p role="alert">수집 자료 목록을 불러오지 못했습니다. {catalog.error}</p>}
      {!catalog.loading && !catalog.error && !selected && <p>연결된 수집 자료가 없습니다.</p>}
      {selected && <DatasetTable key={selected.key} dataset={selected} revision={revision} />}
    </section>
  );
}
