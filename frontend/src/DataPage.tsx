import { Fragment, useContext, useState } from "react";
import type { Cell, Column, Dataset, Row, RowsResult, Summary } from "./data";
import { categories, text, number, date, labels } from "./data";
import { useResource } from "./useResource";
import { DataOrigin } from "./DataOrigin";

function CellValue({
  value,
  column,
}: {
  value: Cell | undefined;
  column: Column;
}) {
  if (value === null || value === undefined)
    return (
      <span className="null-value" title="저장된 값 없음">
        NULL
      </span>
    );
  if (typeof value === "object")
    return <pre>{JSON.stringify(value, null, 2)}</pre>;
  if (value === "") return <span className="null-value">빈 문자열 ("")</span>;
  const label = [
    "state",
    "status",
    "safety_status",
    "decision",
    "availability",
  ].includes(column.key)
    ? labels[String(value)]
    : undefined;
  if (label)
    return (
      <>
        <span className="status-value">{label}</span>
        <small>{String(value)}</small>
      </>
    );
  return <>{text(value, column.type)}</>;
}

function RowDetails({ dataset, row }: { dataset: Dataset; row: Row }) {
  return (
    <div className="row-detail-content">
      <h3>ID {text(row.id)} · 전체 필드 상세</h3>
      <table
        className="detail-table"
        aria-label={dataset.title + " ID " + text(row.id) + " 상세"}
      >
        <thead>
          <tr>
            <th>필드 · 타입</th>
            <th>표시값 / 설명</th>
            <th>DB 원본값</th>
          </tr>
        </thead>
        <tbody>
          {dataset.columns.map((column) => (
            <tr key={column.key}>
              <th scope="row">
                {column.label}
                <br />
                <code>{column.key}</code>
                <br />
                <small>{column.type}</small>
              </th>
              <td>
                <CellValue value={row[column.key]} column={column} />
              </td>
              <td>
                <pre>
                  {row[column.key] === null
                    ? "NULL"
                    : typeof row[column.key] === "object"
                      ? JSON.stringify(row[column.key], null, 2)
                      : row[column.key] === ""
                        ? '""'
                        : String(row[column.key])}
                </pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DatasetTable({
  dataset,
  revision,
}: {
  dataset: Dataset;
  revision: number;
}) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(100);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("id");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [filterColumn, setFilterColumn] = useState("");
  const [filterInput, setFilterInput] = useState("");
  const [filter, setFilter] = useState({ column: "", value: "" });
  const [localRevision, setLocalRevision] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [wrap, setWrap] = useState(true);
  const [visible, setVisible] = useState(
    dataset.columns.map((column) => column.key),
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
    "datasets/" + dataset.key + "?" + params,
    revision + localRevision,
  );
  const columns = dataset.columns.filter((column) =>
    visible.includes(column.key),
  );
  const total = result.data?.total;
  const rows = result.data?.rows ?? [];
  const pages = Math.min(
    1000,
    total === undefined ? 1 : Math.max(1, Math.ceil(total / size)),
  );
  const allExpanded =
    rows.length > 0 && rows.every((row) => expanded.has(String(row.id)));
  function reset() {
    setSearch("");
    setQuery("");
    setFilterColumn("");
    setFilterInput("");
    setFilter({ column: "", value: "" });
    setPage(1);
    setExpanded(new Set());
  }
  function changePage(next: number) {
    setPage(next);
    setExpanded(new Set());
  }
  return (
    <section
      className="dataset-section"
      id={"dataset-" + dataset.key}
      aria-label={dataset.title + " 데이터"}
    >
      <div className="dataset-title">
        <h2>{dataset.title}</h2>
        <code>{dataset.table}</code>
        <span>{categories[dataset.category]}</span>
      </div>
      <p>{dataset.description}</p>
      <p className="table-note">
        출처: {dataset.source} · NULL = 값 없음 · 상태와 유효 기간은 저장 당시
        기준입니다.
      </p>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search);
          setFilter({ column: filterColumn, value: filterInput });
          changePage(1);
        }}
      >
        <input
          type="search"
          aria-label="데이터 검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={
            dataset.search.length
              ? "이름·출처·상태 검색"
              : "열 필터를 사용하세요"
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
                {column.label} ({column.key})
              </option>
            ))}
        </select>
        <input
          aria-label="필터 값"
          value={filterInput}
          onChange={(event) => setFilterInput(event.target.value)}
          disabled={!filterColumn}
          placeholder="정확히 일치하는 원본값"
          maxLength={100}
        />
        <button type="submit">조회</button>
        <button type="button" onClick={reset}>
          초기화
        </button>
        <button
          type="button"
          disabled={result.loading}
          onClick={() => setLocalRevision((value) => value + 1)}
        >
          새로고침
        </button>
      </form>
      <div className="toolbar">
        <span role="status">
          {result.loading
            ? "조회 중…"
            : result.error
              ? "조회 실패"
              : "조회 결과 " +
                number(total) +
                "건 · 현재 " +
                (rows.length
                  ? number((page - 1) * size + 1) +
                    "–" +
                    number((page - 1) * size + rows.length)
                  : "0") +
                "행"}
        </span>
        <label>
          페이지당{" "}
          <select
            aria-label="페이지당 행 수"
            value={size}
            onChange={(event) => {
              setSize(Number(event.target.value));
              changePage(1);
            }}
          >
            <option>25</option>
            <option>50</option>
            <option>100</option>
          </select>
          건
        </label>
        <label>
          <input
            type="checkbox"
            checked={wrap}
            onChange={(event) => setWrap(event.target.checked)}
          />
          긴 값 줄바꿈
        </label>
        <button
          disabled={!rows.length || result.loading}
          onClick={() =>
            setExpanded(
              allExpanded
                ? new Set()
                : new Set(rows.map((row) => String(row.id))),
            )
          }
        >
          {allExpanded ? "상세 모두 접기" : "현재 페이지 상세 모두 펼치기"}
        </button>
      </div>
      <details className="column-picker">
        <summary>
          표시할 열 ({columns.length}/{dataset.columns.length}) · 기본 전체 표시
        </summary>
        <div className="toolbar">
          <button
            onClick={() =>
              setVisible(dataset.columns.map((column) => column.key))
            }
          >
            전체 열
          </button>
          <button
            onClick={() =>
              setVisible(
                dataset.columns.slice(0, 7).map((column) => column.key),
              )
            }
          >
            앞쪽 7개 열
          </button>
        </div>
        <div className="column-options">
          {dataset.columns.map((column) => (
            <label key={column.key}>
              <input
                type="checkbox"
                checked={visible.includes(column.key)}
                disabled={visible.length === 1 && visible.includes(column.key)}
                onChange={() =>
                  setVisible((current) =>
                    current.includes(column.key)
                      ? current.filter((key) => key !== column.key)
                      : [...current, column.key],
                  )
                }
              />
              {column.label} <code>({column.key})</code>
            </label>
          ))}
        </div>
      </details>
      {result.error ? (
        <div role="alert">
          <p>데이터를 불러오지 못했습니다. {result.error}</p>
          <button onClick={() => setLocalRevision((value) => value + 1)}>
            다시 시도
          </button>
        </div>
      ) : (
        <div
          className={"table-scroll data-scroll" + (wrap ? "" : " no-wrap")}
          role="region"
          aria-label={dataset.title + " 표 · 가로 세로 스크롤"}
          tabIndex={0}
          aria-busy={result.loading}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>상세</th>
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
                        changePage(1);
                      }}
                    >
                      {column.label}{" "}
                      {sort === column.key
                        ? direction === "desc"
                          ? "↓"
                          : "↑"
                        : "↕"}
                      <code>{column.key}</code>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.loading ? (
                <tr>
                  <td colSpan={columns.length + 1}>조회 중…</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <Fragment key={String(row.id)}>
                    <tr className="record">
                      <td>
                        <button
                          aria-label={"ID " + text(row.id) + " 행 상세"}
                          aria-expanded={expanded.has(String(row.id))}
                          aria-controls={dataset.key + "-row-" + String(row.id)}
                          onClick={() =>
                            setExpanded((current) => {
                              const next = new Set(current);
                              if (next.has(String(row.id)))
                                next.delete(String(row.id));
                              else next.add(String(row.id));
                              return next;
                            })
                          }
                        >
                          {expanded.has(String(row.id)) ? "접기" : "펼치기"}
                        </button>
                      </td>
                      {columns.map((column) => (
                        <td
                          className={
                            column.type === "number" ? "numeric" : undefined
                          }
                          key={column.key}
                        >
                          <div className="cell-value">
                            <CellValue
                              value={row[column.key]}
                              column={column}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                    {expanded.has(String(row.id)) && (
                      <tr
                        className="row-detail"
                        id={dataset.key + "-row-" + String(row.id)}
                      >
                        <td colSpan={columns.length + 1}>
                          <RowDetails dataset={dataset} row={row} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
          {!result.loading && rows.length === 0 && (
            <p className="empty-state">
              {query || filter.value
                ? "조건에 맞는 데이터가 없습니다."
                : "아직 저장된 데이터가 없습니다. 테이블은 존재하지만 현재 행은 0건입니다."}
            </p>
          )}
        </div>
      )}
      <div className="pagination">
        <div>
          <button
            disabled={page <= 1 || result.loading}
            onClick={() => changePage(1)}
          >
            처음
          </button>
          <button
            disabled={page <= 1 || result.loading}
            onClick={() => changePage(page - 1)}
          >
            이전
          </button>
          <label>
            페이지{" "}
            <input
              key={page}
              aria-label="페이지 번호"
              type="number"
              min={1}
              max={pages}
              defaultValue={page}
              disabled={result.loading || !!result.error}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const next = Number(event.currentTarget.value);
                  if (Number.isInteger(next) && next >= 1 && next <= pages)
                    changePage(next);
                }
              }}
              onBlur={(event) => {
                const next = Number(event.currentTarget.value);
                if (Number.isInteger(next) && next >= 1 && next <= pages)
                  changePage(next);
                else event.currentTarget.value = String(page);
              }}
            />
          </label>
          <span>/ {number(pages)}</span>
          <button
            disabled={page >= pages || result.loading || !!result.error}
            onClick={() => changePage(page + 1)}
          >
            다음
          </button>
          <button
            disabled={page >= pages || result.loading || !!result.error}
            onClick={() => changePage(pages)}
          >
            마지막
          </button>
        </div>
        <span className="table-note">
          조회 시각: {date(result.data?.queried_at)} KST
        </span>
      </div>
      {total !== undefined && total > size * 1000 && (
        <p>
          최대 1,000페이지까지 조회합니다. 더 오래된 기록은 검색·필터로 범위를
          좁혀 주세요.
        </p>
      )}
      <details>
        <summary>
          테이블 설명 · 전체 필드 구조 ({dataset.columns.length}개)
        </summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>필드명</th>
                <th>설명</th>
                <th>조회 타입</th>
                <th>텍스트 검색</th>
              </tr>
            </thead>
            <tbody>
              {dataset.columns.map((column) => (
                <tr key={column.key}>
                  <td>
                    <code>{column.key}</code>
                  </td>
                  <td>{column.label}</td>
                  <td>{column.type}</td>
                  <td>{dataset.search.includes(column.key) ? "가능" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function DataPage({
  catalog,
  summary,
  selectedKey,
  selectDataset,
  revision,
}: {
  catalog: Dataset[];
  summary?: Summary;
  selectedKey: string;
  selectDataset: (key: string) => void;
  revision: number;
}) {
  const [category, setCategory] = useState("all");
  const [tableSearch, setTableSearch] = useState("");
  const [populatedOnly, setPopulatedOnly] = useState(false);
  const origin = useContext(DataOrigin);
  const [showAll, setShowAll] = useState(origin === "demo");
  const [overviewOpen, setOverviewOpen] = useState(true);
  const counts = new Map(
    summary?.datasets.map((dataset) => [dataset.key, dataset]),
  );
  const filtered = catalog.filter(
    (dataset) =>
      (category === "all" || dataset.category === category) &&
      (!populatedOnly || (counts.get(dataset.key)?.count ?? 0) > 0) &&
      (dataset.title + " " + dataset.table + " " + dataset.source)
        .toLowerCase()
        .includes(tableSearch.toLowerCase()),
  );
  const selected =
    catalog.find((dataset) => dataset.key === selectedKey) ?? catalog[0];
  const shown = showAll
    ? filtered.filter((dataset) => (counts.get(dataset.key)?.count ?? 0) > 0)
    : selected
      ? [selected]
      : [];
  function choose(key: string) {
    selectDataset(key);
    setShowAll(false);
  }
  return (
    <>
      <h1>
        {summary?.is_demo
          ? "더미 데이터 조회 (실제 관측 아님)"
          : "Multtara DB 조회"}
      </h1>
      {summary?.heartbeat?.effective_state === "stale" && (
        <p>
          Collector 활동 신호가 오래되었습니다 (마지막:{" "}
          {date(summary.heartbeat.last_seen_at)} KST). 저장 이력이며 현재 가동
          여부를 뜻하지 않습니다.
        </p>
      )}
      <div className="toolbar">
        <input
          type="search"
          aria-label="테이블 검색"
          placeholder="테이블명·출처 검색"
          value={tableSearch}
          onChange={(event) => setTableSearch(event.target.value)}
        />
        <select
          aria-label="데이터 분류"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">전체 분류</option>
          {Object.entries(categories).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            disabled={!summary}
            checked={populatedOnly}
            onChange={(event) => setPopulatedOnly(event.target.checked)}
          />
          데이터 있는 테이블만
        </label>
        <label>
          <input
            type="checkbox"
            disabled={!summary}
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
          />
          데이터 있는 표 모두 펼치기
        </label>
      </div>
      <details
        open={overviewOpen}
        onToggle={(event) => setOverviewOpen(event.currentTarget.open)}
      >
        <summary>
          전체 테이블 현황 · {filtered.length}/{catalog.length}개 · 테이블명을
          누르면 해당 데이터 조회
        </summary>
        <div
          className="table-scroll"
          role="region"
          aria-label="전체 테이블 현황"
          tabIndex={0}
        >
          <table className="overview-table">
            <thead>
              <tr>
                <th>데이터셋</th>
                <th>DB 테이블</th>
                <th>분류</th>
                <th>저장 행</th>
                <th>허용 열</th>
                <th>최근 기록 · KST</th>
                <th>출처</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((dataset) => (
                <tr
                  className={
                    !showAll && selected?.key === dataset.key
                      ? "selected"
                      : undefined
                  }
                  key={dataset.key}
                >
                  <td>
                    <button onClick={() => choose(dataset.key)}>
                      {dataset.title}
                    </button>
                  </td>
                  <td>
                    <code>{dataset.table}</code>
                  </td>
                  <td>{categories[dataset.category]}</td>
                  <td className="numeric">
                    {number(counts.get(dataset.key)?.count)}
                  </td>
                  <td className="numeric">{dataset.columns.length}</td>
                  <td>
                    {dataset.time
                      ? date(counts.get(dataset.key)?.latest_at)
                      : "시간 필드 없음"}
                  </td>
                  <td>{dataset.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p>조건에 맞는 테이블이 없습니다.</p>}
        </div>
      </details>
      <div className="toolbar">
        {!showAll && (
          <label>
            조회 테이블{" "}
            <select
              aria-label="조회 테이블"
              value={selected?.key ?? ""}
              onChange={(event) => choose(event.target.value)}
            >
              {catalog.map((dataset) => (
                <option key={dataset.key} value={dataset.key}>
                  {dataset.title} · {number(counts.get(dataset.key)?.count)}건
                </option>
              ))}
            </select>
          </label>
        )}
        <span>
          {showAll
            ? shown.length +
              "개 표를 함께 표시합니다. 각 표는 최대 100행씩 조회하며 검색·페이지를 따로 조작할 수 있습니다."
            : "기본 100행·전체 열. 표 안에서 가로·세로 스크롤하고 여러 행의 상세를 함께 펼칠 수 있습니다."}
        </span>
      </div>
      {showAll && (
        <p>
          {shown.map((dataset, index) => (
            <Fragment key={dataset.key}>
              {index > 0 && " · "}
              <a
                href={"#dataset-" + dataset.key}
                onClick={(event) => {
                  event.preventDefault();
                  document
                    .getElementById("dataset-" + dataset.key)
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {dataset.title}
              </a>
            </Fragment>
          ))}
        </p>
      )}
      {!catalog.length && <p>데이터셋 목록을 불러오는 중입니다.</p>}
      {showAll && !shown.length && (
        <p>선택한 범위에 데이터가 있는 테이블이 없습니다.</p>
      )}
      {shown.map((dataset) => (
        <DatasetTable key={dataset.key} dataset={dataset} revision={revision} />
      ))}
      <p className="table-note">
        공개 카탈로그·수집 근거·평가·실행 이력의 허용 필드만 조회합니다. 회원
        정보·인증 정보·원문 응답은 포함하지 않습니다. unknown은 판단 불가,
        unavailable은 제공 불가이며 안전함이나 실시간 관측을 뜻하지 않습니다.
        현황 건수는 최대 30초 캐시됩니다.
      </p>
    </>
  );
}
