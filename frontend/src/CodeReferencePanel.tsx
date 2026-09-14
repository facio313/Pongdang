import { useState } from "react";
import type { Dataset, Row } from "./data";
import { codeReviewText, collectCodeReferences } from "./codeReference";

export function CodeReferencePanel({ dataset, rows }: { dataset: Dataset; rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [copyState, setCopyState] = useState("");
  const entries = collectCodeReferences(dataset, rows);
  const unresolved = entries.filter((entry) => !entry.resolved).length;
  const filtered = entries.filter((entry) =>
    (!unresolvedOnly || !entry.resolved) &&
    [entry.field, entry.fieldLabel, entry.raw, entry.label, ...entry.origins].join(" ").toLowerCase().includes(query.trim().toLowerCase()),
  );
  if (!entries.length) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(codeReviewText(dataset, filtered));
      setCopyState("현재 목록의 코드 확인 정보를 복사했습니다.");
    } catch {
      setCopyState("복사하지 못했습니다. 아래 코드와 필드·출처를 선택해 복사해 주세요.");
    }
  }
  return (
    <details className="code-reference" id={`code-reference-${dataset.key}`}>
      <summary>이 페이지 코드 설명 · {entries.length}종{unresolved > 0 ? ` · 설명 확인 필요 ${unresolved}종` : " · 모두 설명 있음"}</summary>
      <p>현재 조회한 {rows.length}행에 나온 코드입니다. 한글 설명은 수집기 정의에 따라 표시하며 DB 원본값은 그대로 보존합니다.</p>
      {unresolved > 0 && <p>확인이 필요한 코드는 표시 설명이 없거나 제공처의 서비스별 뜻이 아직 확인되지 않은 항목입니다. 아래 필드·원본 코드·출처로 정의를 확인할 수 있습니다. 이 목록의 갱신은 자료 재수집과 별개입니다.</p>}
      <div className="toolbar">
        <input type="search" aria-label={`${dataset.title} 코드 설명 검색`} placeholder="코드·한글 설명·출처 검색" value={query} onChange={(event) => { setQuery(event.target.value); setCopyState(""); }} />
        <label><input type="checkbox" checked={unresolvedOnly} onChange={(event) => { setUnresolvedOnly(event.target.checked); setCopyState(""); }} />설명 확인 필요한 코드만</label>
        <button type="button" disabled={!filtered.length} onClick={() => void copy()}>코드 확인 정보 복사</button>
        <span role="status">{copyState}</span>
      </div>
      <div className="table-scroll code-reference-scroll">
        <table aria-label={`${dataset.title} 현재 페이지 코드 설명`}>
          <thead><tr><th>필드</th><th>원본 코드</th><th>뜻</th><th>이 페이지 건수</th><th>출처·작업 / 예시 행 ID</th></tr></thead>
          <tbody>{filtered.map((entry) => <tr key={JSON.stringify([entry.field, entry.raw, entry.guidance?.url])}>
            <td>{entry.fieldLabel}<br /><code>{entry.field}</code></td>
            <td><code>{entry.raw}</code></td>
            <td>{entry.label}{entry.guidance && <><p>{entry.guidance.text}</p><a href={entry.guidance.url} target="_blank" rel="noreferrer">ROMS 공식 코드 안내</a></>}</td>
            <td className="numeric">{entry.count}</td>
            <td>{entry.origins.length ? entry.origins.join(" · ") : dataset.source}<br /><small>행 ID: {entry.rowIds.join(", ") || "기록 없음"}</small></td>
          </tr>)}</tbody>
        </table>
        {!filtered.length && <p className="empty-state">조건에 맞는 코드가 없습니다.</p>}
      </div>
    </details>
  );
}
