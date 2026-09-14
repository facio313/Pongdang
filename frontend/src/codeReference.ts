import { codeName, codeNeedsReview, isCodeField } from "./codeNames.ts";
import type { Dataset, Row } from "./data.ts";

export interface CodeReference {
  field: string;
  fieldLabel: string;
  raw: string;
  label: string;
  resolved: boolean;
  count: number;
  rowIds: string[];
  origins: string[];
  guidance?: { text: string; url: string };
}

export const unresolvedCodeLabel = "설명 확인 필요";

export function displayCodeName(dataset: string, field: string, raw: string): string | undefined {
  const label = codeName(dataset, field, raw);
  return label === "미등록 코드" ? unresolvedCodeLabel : label;
}

/** Only the bounded, currently loaded page is inspected; source records stay intact. */
export function collectCodeReferences(dataset: Dataset, rows: Row[]): CodeReference[] {
  const entries = new Map<string, CodeReference>();
  const columns = dataset.columns.filter((column) => isCodeField(dataset.key, column.key));
  for (const row of rows) {
    const origins = ["source", "provider", "catalog_source", "task_name"].flatMap((field) => {
      if (!dataset.columns.some((column) => column.key === field)) return [];
      const value = row[field];
      if (typeof value !== "string" || !value) return [];
      const label = codeName(dataset.key, field, value);
      return [label && label !== "미등록 코드" ? `${label} (${value})` : value];
    });
    for (const column of columns) {
      const value = row[column.key];
      if (value === null || value === undefined || value === "" || typeof value === "object") continue;
      const raw = String(value);
      const guidance = raw === "PROVIDER_10" && row.task_name === "khoa_roms" &&
        ((dataset.key === "runs" && column.key === "error_code") ||
          (dataset.key === "collection-jobs" && column.key === "last_error"))
        ? {
          text: "ROMS 서비스의 공식 코드 10 안내는 요청 파라미터 값·형식 오류입니다. 과거 기록에는 코드만 남아 있어 당시 어떤 요청 항목이 문제였는지는 확인할 수 없습니다.",
          url: "https://www.data.go.kr/data/15142227/openapi.do",
        } : undefined;
      const key = JSON.stringify([column.key, raw, guidance?.url]);
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          field: column.key, fieldLabel: column.label, raw,
          label: displayCodeName(dataset.key, column.key, raw) ?? unresolvedCodeLabel,
          resolved: !codeNeedsReview(dataset.key, column.key, raw),
          count: 0, rowIds: [], origins: [],
          ...(guidance ? { guidance } : {}),
        };
        entries.set(key, entry);
      }
      entry.count += 1;
      if ((typeof row.id === "number" || typeof row.id === "string") && entry.rowIds.length < 3 && !entry.rowIds.includes(String(row.id))) {
        entry.rowIds.push(String(row.id));
      }
      for (const origin of origins) {
        if (!entry.origins.includes(origin)) entry.origins.push(origin);
      }
    }
  }
  return [...entries.values()].sort((left, right) =>
    Number(left.resolved) - Number(right.resolved) || left.field.localeCompare(right.field) || left.raw.localeCompare(right.raw),
  );
}

export function codeReviewText(dataset: Dataset, entries: CodeReference[]): string {
  return [
    `테이블: ${dataset.title} (${dataset.key})`,
    `출처: ${dataset.source}`,
    "현재 조회한 페이지의 코드 확인 정보입니다. 원본값의 뜻이 확인되지 않은 항목은 설명 확인 필요로 표시합니다.",
    ...entries.map((entry) => JSON.stringify({
      field: entry.field, field_label: entry.fieldLabel, code: entry.raw,
      description: entry.label, resolved: entry.resolved, page_count: entry.count,
      example_row_ids: entry.rowIds, origins: entry.origins,
      ...(entry.guidance ? { official_guidance: entry.guidance } : {}),
    })),
  ].join("\n");
}
