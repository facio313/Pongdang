import { useEffect, useRef, useState } from "react";
import type { Dataset, Row, RowsResult, Summary } from "./data";
import { categories, text, number, date } from "./data";
import { useResource } from "./useResource";

function RowDetails({
  dataset,
  row,
  close,
}: {
  dataset: Dataset;
  row: Row;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={close}
      className="detail-dialog"
      aria-labelledby="detail-title"
    >
      <header>
        <div>
          <p className="eyebrow">ROW DETAIL · ID {text(row.id)}</p>
          <h2 id="detail-title">{dataset.title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={() => ref.current?.close()}
          aria-label="상세 닫기"
        >
          ×
        </button>
      </header>
      <div className="detail-content">
        <p className="muted">
          조회 허용 필드입니다. —는 저장된 값이 없음을 뜻합니다.
        </p>
        <dl>
          {dataset.columns.map((column) => (
            <div key={column.key}>
              <dt>
                {column.label}
                <code>{column.key}</code>
              </dt>
              <dd>
                {column.type === "json" && row[column.key] !== null ? (
                  <pre>{JSON.stringify(row[column.key], null, 2)}</pre>
                ) : (
                  text(row[column.key], column.type)
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </dialog>
  );
}

function DatasetTable({ dataset }: { dataset: Dataset }) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("id");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [filterColumn, setFilterColumn] = useState("");
  const [filterInput, setFilterInput] = useState("");
  const [filter, setFilter] = useState({ column: "", value: "" });
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null);
  const [visible, setVisible] = useState(
    dataset.columns.slice(0, 7).map((column) => column.key),
  );
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(size),
    q: query,
    sort,
    direction,
    filter_column: filter.column,
    filter_value: filter.value,
  });
  const result = useResource<RowsResult>(
    `datasets/${dataset.key}?${params}`,
    revision,
  );
  const columns = dataset.columns.filter((column) =>
    visible.includes(column.key),
  );
  const total = result.data?.total;
  const pages = total === undefined ? 1 : Math.max(1, Math.ceil(total / size));
  function reset() {
    setSearch("");
    setQuery("");
    setFilterColumn("");
    setFilterInput("");
    setFilter({ column: "", value: "" });
    setPage(1);
  }
  return (
    <section className="panel dataset-panel">
      <div className="dataset-heading">
        <div>
          <span className="tag">{categories[dataset.category]}</span>
          <h2>{dataset.title}</h2>
          <code>{dataset.table}</code>
          <p>{dataset.description}</p>
        </div>
        <button
          className="button"
          disabled={result.loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          ↻ 새로고침
        </button>
      </div>
      <form
        className="table-tools"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search);
          setFilter({ column: filterColumn, value: filterInput });
          setPage(1);
        }}
      >
        <input
          className="search-input"
          aria-label="데이터 검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={
            dataset.search.length
              ? "이름·출처·상태 검색"
              : "이 데이터셋은 열 필터를 사용하세요"
          }
          disabled={!dataset.search.length}
          maxLength={100}
        />
        <select
          aria-label="필터 열"
          value={filterColumn}
          onChange={(event) => setFilterColumn(event.target.value)}
        >
          <option value="">열 필터 선택</option>
          {dataset.columns
            .filter((column) => column.type !== "json")
            .map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
        </select>
        <input
          className="filter-input"
          aria-label="필터 값"
          value={filterInput}
          onChange={(event) => setFilterInput(event.target.value)}
          disabled={!filterColumn}
          placeholder="정확히 일치하는 값"
          maxLength={100}
        />
        <button className="button" type="submit">
          조회
        </button>
        {(query || filter.value) && (
          <button className="text-button" type="button" onClick={reset}>
            초기화
          </button>
        )}
      </form>
      <div className="table-meta">
        <span role="status">
          {result.loading
            ? "조회 중…"
            : result.error
              ? "조회 실패"
              : `조회 결과 ${number(total)}건`}{" "}
          <span className="meta-divider">·</span> 최대 100건씩 조회
        </span>
        <details className="column-picker">
          <summary>표시할 열 ({columns.length})</summary>
          <div>
            {dataset.columns.map((column) => (
              <label key={column.key}>
                <input
                  type="checkbox"
                  checked={visible.includes(column.key)}
                  disabled={
                    visible.length === 1 && visible.includes(column.key)
                  }
                  onChange={() =>
                    setVisible((current) =>
                      current.includes(column.key)
                        ? current.filter((key) => key !== column.key)
                        : [...current, column.key],
                    )
                  }
                />
                {column.label}
              </label>
            ))}
          </div>
        </details>
      </div>
      {result.error ? (
        <div className="empty-state" role="alert">
          <strong>데이터를 불러오지 못했습니다.</strong>
          <p>{result.error}</p>
          <button
            className="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className="table-scroll" aria-busy={result.loading}>
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    aria-sort={
                      sort === column.key
                        ? direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      disabled={column.type === "json"}
                      onClick={() => {
                        setSort(column.key);
                        setDirection(
                          sort === column.key && direction === "desc"
                            ? "asc"
                            : "desc",
                        );
                        setPage(1);
                      }}
                    >
                      {column.label}{" "}
                      <span aria-hidden>
                        {sort === column.key
                          ? direction === "desc"
                            ? "↓"
                            : "↑"
                          : "↕"}
                      </span>
                    </button>
                  </th>
                ))}
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {result.loading
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      {columns.map((column) => (
                        <td key={column.key}>
                          <span className="skeleton" />
                        </td>
                      ))}
                      <td>
                        <span className="skeleton" />
                      </td>
                    </tr>
                  ))
                : result.data?.rows.map((row) => (
                    <tr key={String(row.id)}>
                      {columns.map((column) => (
                        <td key={column.key}>
                          <span
                            className="cell-value"
                            title={text(row[column.key], column.type)}
                          >
                            {text(row[column.key], column.type)}
                          </span>
                        </td>
                      ))}
                      <td>
                        <button
                          className="row-button"
                          onClick={() => setSelected(row)}
                          aria-label={`ID ${text(row.id)} 행 상세`}
                        >
                          보기 ↗
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!result.loading && result.data?.rows.length === 0 && (
            <div className="empty-state">
              <span className="empty-symbol" aria-hidden>
                ∅
              </span>
              <strong>
                {query || filter.value
                  ? "조건에 맞는 데이터가 없습니다."
                  : "아직 저장된 데이터가 없습니다."}
              </strong>
              <p>
                {query || filter.value
                  ? "검색어나 필터 값을 바꿔 보세요."
                  : "테이블은 존재하지만 현재 행은 0건입니다."}
              </p>
            </div>
          )}
        </div>
      )}
      <footer className="pagination">
        <div>
          <label>
            페이지당{" "}
            <select
              value={size}
              onChange={(event) => {
                setSize(Number(event.target.value));
                setPage(1);
              }}
            >
              <option>25</option>
              <option>50</option>
              <option>100</option>
            </select>
            건
          </label>
          <span className="muted">{date(result.data?.queried_at)} KST</span>
        </div>
        <div>
          <button
            className="button"
            disabled={page <= 1 || result.loading}
            onClick={() => setPage((value) => value - 1)}
          >
            이전
          </button>
          <span>
            {page} / {number(pages)}
          </span>
          <button
            className="button"
            disabled={page >= pages || page >= 1000 || result.loading}
            onClick={() => setPage((value) => value + 1)}
          >
            다음
          </button>
        </div>
      </footer>
      <p className="table-note">
        {page >= 1000
          ? "조회 범위에 도달했습니다. 필터로 범위를 좁혀 주세요. "
          : ""}
        출처: {dataset.source}. 상태는 저장 당시 값이며 현재 유효 여부와
        구분해서 확인하세요.
      </p>
      {selected && (
        <RowDetails
          dataset={dataset}
          row={selected}
          close={() => setSelected(null)}
        />
      )}
    </section>
  );
}

export function DataPage({
  catalog,
  summary,
  selectedKey,
  selectDataset,
}: {
  catalog: Dataset[];
  summary?: Summary;
  selectedKey: string;
  selectDataset: (key: string) => void;
}) {
  const [category, setCategory] = useState("all");
  const dataset =
    catalog.find((item) => item.key === selectedKey) ?? catalog[0];
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">DATABASE EXPLORER</p>
          <h1>저장 데이터 둘러보기</h1>
          <p className="lead">
            cksDB에 저장된 Multtara의 수집 자료와 계산 결과를 표로 조회합니다.
          </p>
        </div>
        <span className="read-only-badge">◉ 읽기 전용</span>
      </section>
      <div className="explorer-layout">
        <aside className="dataset-sidebar">
          <h2>
            데이터셋 <span>{catalog.length}</span>
          </h2>
          <select
            aria-label="데이터 분류"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">전체 분류</option>
            {Object.entries(categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <nav aria-label="데이터셋">
            {catalog
              .filter(
                (item) => category === "all" || item.category === category,
              )
              .map((item) => {
                const info = summary?.datasets.find(
                  (entry) => entry.key === item.key,
                );
                return (
                  <button
                    className={
                      selectedKey === item.key
                        ? "dataset-link active"
                        : "dataset-link"
                    }
                    aria-current={selectedKey === item.key ? "true" : undefined}
                    key={item.key}
                    onClick={() => selectDataset(item.key)}
                  >
                    <span>
                      {item.title}
                      <small>{categories[item.category]}</small>
                    </span>
                    <span className="dataset-count">{number(info?.count)}</span>
                  </button>
                );
              })}
          </nav>
          <p className="sidebar-note">
            관측 자료·공개 카탈로그·수집 이력의 허용 필드만 조회합니다. 회원
            정보나 인증 데이터는 포함하지 않습니다.
          </p>
        </aside>
        {dataset ? (
          <DatasetTable key={dataset.key} dataset={dataset} />
        ) : (
          <div className="panel empty-state">
            데이터셋 목록을 불러오는 중입니다.
          </div>
        )}
      </div>
    </>
  );
}
