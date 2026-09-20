import { t } from "./i18n.ts";
import { Fragment, useContext, useState } from "react";
import type { Cell, Column, Dataset, Row, RowsResult, Summary } from "./data";
import { categories, text, number, date, labels } from "./data";
import { useResource } from "./useResource";
import { DataOrigin } from "./DataOrigin";
import { codeName, isCodeField } from "./codeNames";

function CellValue({
  value,
  column,
  datasetKey,
}: {
  value: Cell | undefined;
  column: Column;
  datasetKey: string;
}) {
  if (value === null || value === undefined)
    return (
      <span className="null-value" title={t("저장된 값 없음")}>
        NULL
      </span>
    );
  if (typeof value === "object")
    return <pre>{JSON.stringify(value, null, 2)}</pre>;
  if (value === "") return <span className="null-value">{t("빈 문자열 (\"\")")}</span>;
  const label = codeName(datasetKey, column.key, String(value)) ?? ([
    "state",
    "status",
    "safety_status",
    "decision",
    "availability",
  ].includes(column.key)
    ? labels[String(value)]
    : undefined);
  if (label)
    return (
      <>
        <span className="status-value">{t(label)}</span>
        <small><code>{String(value)}</code></small>
      </>
    );
  return <>{text(value, column.type)}</>;
}

function RowDetails({ dataset, row }: { dataset: Dataset; row: Row }) {
  return (
    <div className="row-detail-content">
      <h3>{t("ID {id} · 전체 필드 상세", { id: text(row.id) })}</h3>
      <table
        className="detail-table"
        aria-label={t("{dataset} ID {id} 상세", { dataset: t(dataset.title), id: text(row.id) })}
      >
        <thead>
          <tr>
            <th>{t("필드 · 타입")}</th>
            <th>{t("표시값 / 설명")}</th>
            <th>{t("DB 원본값")}</th>
          </tr>
        </thead>
        <tbody>
          {dataset.columns.map((column) => (
            <tr key={column.key}>
              <th scope="row">
                {t(column.label)}
                <br />
                <code>{column.key}</code>
                <br />
                <small>{column.type}</small>
              </th>
              <td>
                <CellValue value={row[column.key]} column={column} datasetKey={dataset.key} />
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
      aria-label={t("{dataset} 데이터", { dataset: t(dataset.title) })}
    >
      <div className="dataset-title">
        <h2>{t(dataset.title)}</h2>
        <code>{dataset.table}</code>
        <span>{t(categories[dataset.category] ?? dataset.category)}</span>
      </div>
      <p>{t(dataset.description)}</p>
      <p className="table-note">
        {t("출처: {source} · NULL = 값 없음 · 상태와 유효 기간은 저장 당시 기준입니다.", { source: t(dataset.source) })}
        {dataset.columns.some((column) => isCodeField(dataset.key, column.key)) &&
          t(" 코드 필드는 코드명과 DB 원본 코드를 함께 표시합니다. 검색·필터는 원본 코드 기준이며, 미등록 코드는 뜻을 추정하지 않습니다.")}
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
          aria-label={t("데이터 검색")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={
            dataset.search.length
              ? t("이름·출처·상태 검색")
              : t("열 필터를 사용하세요")
          }
          disabled={!dataset.search.length}
          maxLength={100}
        />
        <select
          aria-label={t("필터 열")}
          value={filterColumn}
          onChange={(event) => setFilterColumn(event.target.value)}
        >
          <option value="">{t("열 필터 선택")}</option>
          {dataset.columns
            .filter((column) => column.type !== "json")
            .map((column) => (
              <option key={column.key} value={column.key}>
                {t(column.label)} ({column.key})
              </option>
            ))}
        </select>
        <input
          aria-label={t("필터 값")}
          value={filterInput}
          onChange={(event) => setFilterInput(event.target.value)}
          disabled={!filterColumn}
          placeholder={t("정확히 일치하는 원본값")}
          maxLength={100}
        />
        <button type="submit">{t("조회")}</button>
        <button type="button" onClick={reset}>{t("초기화")}</button>
        <button
          type="button"
          disabled={result.loading}
          onClick={() => setLocalRevision((value) => value + 1)}
        >{t("새로고침")}</button>
      </form>
      <div className="toolbar">
        <span role="status">
          {result.loading
            ? t("조회 중…")
            : result.error
              ? t("조회 실패")
              : t("조회 결과 {total}건 · 현재 {range}행", { total: number(total), range: rows.length
                  ? number((page - 1) * size + 1) + "–" + number((page - 1) * size + rows.length)
                  : "0" })}
        </span>
        <label>
          {t("페이지당 행 수")} {" "}
          <select
            aria-label={t("페이지당 행 수")}
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
        </label>
        <label>
          <input
            type="checkbox"
            checked={wrap}
            onChange={(event) => setWrap(event.target.checked)}
          />{t("긴 값 줄바꿈")}</label>
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
          {allExpanded ? t("상세 모두 접기") : t("현재 페이지 상세 모두 펼치기")}
        </button>
      </div>
      <details className="column-picker">
        <summary>
          {t("표시할 열 ({count}/{total}) · 기본 전체 표시", { count: columns.length, total: dataset.columns.length })}
        </summary>
        <div className="toolbar">
          <button
            onClick={() =>
              setVisible(dataset.columns.map((column) => column.key))
            }
          >{t("전체 열")}</button>
          <button
            onClick={() =>
              setVisible(
                dataset.columns.slice(0, 7).map((column) => column.key),
              )
            }
          >{t("앞쪽 7개 열")}</button>
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
              {t(column.label)} <code>({column.key})</code>
            </label>
          ))}
        </div>
      </details>
      {result.error ? (
        <div role="alert">
          <p>{t("데이터를 불러오지 못했습니다. {error}", { error: result.error })}</p>
          <button onClick={() => setLocalRevision((value) => value + 1)}>{t("다시 시도")}</button>
        </div>
      ) : (
        <div
          className={"table-scroll data-scroll" + (wrap ? "" : " no-wrap")}
          role="region"
          aria-label={t("{dataset} 표 · 가로 세로 스크롤", { dataset: t(dataset.title) })}
          tabIndex={0}
          aria-busy={result.loading}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("상세")}</th>
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
                      {t(column.label)}{" "}
                      {sort === column.key
                        ? direction === "desc"
                          ? "↓"
                          : "↑"
                        : "↕"}
                      <code>{column.key}</code>
                      {isCodeField(dataset.key, column.key) && <small>{t("코드명 / 원본 코드")}</small>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.loading ? (
                <tr>
                  <td colSpan={columns.length + 1}>{t("조회 중…")}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <Fragment key={String(row.id)}>
                    <tr className="record">
                      <td>
                        <button
                          aria-label={t("ID {id} 행 상세", { id: text(row.id) })}
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
                          {expanded.has(String(row.id)) ? t("접기") : t("펼치기")}
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
                              datasetKey={dataset.key}
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
                ? t("조건에 맞는 데이터가 없습니다.")
                : t("아직 저장된 데이터가 없습니다. 테이블은 존재하지만 현재 행은 0건입니다.")}
            </p>
          )}
        </div>
      )}
      <div className="pagination">
        <div>
          <button
            disabled={page <= 1 || result.loading}
            onClick={() => changePage(1)}
          >{t("처음")}</button>
          <button
            disabled={page <= 1 || result.loading}
            onClick={() => changePage(page - 1)}
          >{t("이전")}</button>
          <label>{t("페이지")}{" "}
            <input
              key={page}
              aria-label={t("페이지 번호")}
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
          >{t("다음")}</button>
          <button
            disabled={page >= pages || result.loading || !!result.error}
            onClick={() => changePage(pages)}
          >{t("마지막")}</button>
        </div>
        <span className="table-note">
          {t("조회 시각: {time} KST", { time: date(result.data?.queried_at) })}
        </span>
      </div>
      {total !== undefined && total > size * 1000 && (
        <p>{t("최대 1,000페이지까지 조회합니다. 더 오래된 기록은 검색·필터로 범위를 좁혀 주세요.")}</p>
      )}
      <details>
        <summary>
          {t("테이블 설명 · 전체 필드 구조 ({count}개)", { count: dataset.columns.length })}
        </summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("필드명")}</th>
                <th>{t("설명")}</th>
                <th>{t("조회 타입")}</th>
                <th>{t("텍스트 검색")}</th>
              </tr>
            </thead>
            <tbody>
              {dataset.columns.map((column) => (
                <tr key={column.key}>
                  <td>
                    <code>{column.key}</code>
                  </td>
                  <td>{t(column.label)}</td>
                  <td>{column.type}</td>
                  <td>{dataset.search.includes(column.key) ? t("가능") : "—"}</td>
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
      (t(dataset.title) + " " + dataset.title + " " + dataset.table + " " + t(dataset.source) + " " + dataset.source)
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
          ? t("더미 데이터 조회 (실제 관측 아님)")
          : t("Pongdang 수집 데이터 조회")}
      </h1>
      {summary?.heartbeat?.effective_state === "stale" && (
        <p>
          {t("Collector 활동 신호가 오래되었습니다 (마지막: {time} KST). 저장 이력이며 현재 가동 여부를 뜻하지 않습니다.", { time: date(summary.heartbeat.last_seen_at) })}
        </p>
      )}
      <div className="toolbar">
        <input
          type="search"
          aria-label={t("테이블 검색")}
          placeholder={t("테이블명·출처 검색")}
          value={tableSearch}
          onChange={(event) => setTableSearch(event.target.value)}
        />
        <select
          aria-label={t("데이터 분류")}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">{t("전체 분류")}</option>
          {Object.entries(categories).map(([key, value]) => (
            <option key={key} value={key}>
              {t(value)}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            disabled={!summary}
            checked={populatedOnly}
            onChange={(event) => setPopulatedOnly(event.target.checked)}
          />{t("데이터 있는 테이블만")}</label>
        <label>
          <input
            type="checkbox"
            disabled={!summary}
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
          />{t("데이터 있는 표 모두 펼치기")}</label>
      </div>
      <details
        open={overviewOpen}
        onToggle={(event) => setOverviewOpen(event.currentTarget.open)}
      >
        <summary>
          {t("전체 테이블 현황 · {count}/{total}개 · 테이블명을 누르면 해당 데이터 조회", { count: filtered.length, total: catalog.length })}
        </summary>
        <div
          className="table-scroll"
          role="region"
          aria-label={t("전체 테이블 현황")}
          tabIndex={0}
        >
          <table className="overview-table">
            <thead>
              <tr>
                <th>{t("데이터셋")}</th>
                <th>{t("DB 테이블")}</th>
                <th>{t("분류")}</th>
                <th>{t("저장 행")}</th>
                <th>{t("허용 열")}</th>
                <th>{t("최근 기록 · KST")}</th>
                <th>{t("출처")}</th>
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
                      {t(dataset.title)}
                    </button>
                  </td>
                  <td>
                    <code>{dataset.table}</code>
                  </td>
                  <td>{t(categories[dataset.category] ?? dataset.category)}</td>
                  <td className="numeric">
                    {number(counts.get(dataset.key)?.count)}
                  </td>
                  <td className="numeric">{dataset.columns.length}</td>
                  <td>
                    {dataset.time
                      ? date(counts.get(dataset.key)?.latest_at)
                      : t("시간 필드 없음")}
                  </td>
                  <td>{t(dataset.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p>{t("조건에 맞는 테이블이 없습니다.")}</p>}
        </div>
      </details>
      <div className="toolbar">
        {!showAll && (
          <label>{t("조회 테이블")}{" "}
            <select
              aria-label={t("조회 테이블")}
              value={selected?.key ?? ""}
              onChange={(event) => choose(event.target.value)}
            >
              {catalog.map((dataset) => (
                <option key={dataset.key} value={dataset.key}>
                  {t("{dataset} · {count}건", { dataset: t(dataset.title), count: number(counts.get(dataset.key)?.count) })}
                </option>
              ))}
            </select>
          </label>
        )}
        <span>
          {showAll
            ? t("{count}개 표를 함께 표시합니다. 각 표는 최대 100행씩 조회하며 검색·페이지를 따로 조작할 수 있습니다.", { count: shown.length })
            : t("기본 100행·전체 열. 표 안에서 가로·세로 스크롤하고 여러 행의 상세를 함께 펼칠 수 있습니다.")}
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
                {t(dataset.title)}
              </a>
            </Fragment>
          ))}
        </p>
      )}
      {!catalog.length && <p>{t("데이터셋 목록을 불러오는 중입니다.")}</p>}
      {showAll && !shown.length && (
        <p>{t("선택한 범위에 데이터가 있는 테이블이 없습니다.")}</p>
      )}
      {shown.map((dataset) => (
        <DatasetTable key={dataset.key} dataset={dataset} revision={revision} />
      ))}
      <p className="table-note">{t("공개 카탈로그·수집 근거·평가·실행 이력의 허용 필드만 조회합니다. 회원 정보·인증 정보·원문 응답은 포함하지 않습니다. unknown은 판단 불가, unavailable은 제공 불가이며 안전함이나 실시간 관측을 뜻하지 않습니다. 현황 건수는 최대 30초 캐시됩니다.")}</p>
    </>
  );
}
