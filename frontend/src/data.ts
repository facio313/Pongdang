export type Cell =
  | string
  | number
  | boolean
  | null
  | Cell[]
  | { [key: string]: Cell };
export type Row = Record<string, Cell>;
export interface Column {
  key: string;
  label: string;
  type: string;
}
export interface Dataset {
  key: string;
  title: string;
  category: string;
  source: string;
  description: string;
  table: string;
  columns: Column[];
  search: string[];
  time: string | null;
  count?: number;
  latest_at?: string | null;
}
export interface Summary {
  is_demo?: boolean;
  database?: string;
  demo_manifest?: {
    version: string;
    created_at: string;
    notice: string;
    scenarios: { key: string; label: string }[];
    reference_spots: { id: number; name: string }[];
    counts: Record<string, number>;
    limitations: string[];
  };
  queried_at: string;
  datasets: Dataset[];
  heartbeat: {
    state: string;
    effective_state: string;
    last_seen_at: string;
    age_seconds: number;
    current_tasks: string[];
  } | null;
  providers: {
    provider: string;
    state: string;
    count: number;
    latest_at: string;
  }[];
  tasks: {
    task_name: string;
    status: string;
    started_at: string;
    finished_at: string;
    error_code: string;
  }[];
  forecasts: { availability: string; safety_status: string; count: number }[];
}
export interface RowsResult {
  dataset: Dataset;
  rows: Row[];
  total: number;
  page: number;
  page_size: number;
  queried_at: string;
}
export const categories: Record<string, string> = {
  collected: "수집 데이터",
  derived: "계산 결과",
  catalog: "장소·기준 자료",
  operations: "실행 기록",
};
export const number = (value: number | undefined) =>
  value === undefined ? "—" : value.toLocaleString("ko-KR");
export function date(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("sv-SE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZone: "Asia/Seoul",
      }).format(new Date(value))
    : "기록 없음";
}
export function text(value: Cell | undefined, type?: string): string {
  if (value === null || value === undefined) return "—";
  if (type === "datetime" && typeof value === "string") return date(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
export const labels: Record<string, string> = {
  demo: "합성 더미 (실제 수집 아님)",
  stale: "활동 신호 오래됨",
  running: "실행 중",
  starting: "시작 중",
  stopped: "중지 기록",
  degraded: "일부 작업 실패",
  succeeded: "성공",
  failed: "실패",
  skipped: "건너뜀",
  unknown: "판단 불가",
  missing: "근거 없음",
  unavailable: "제공 불가",
  available: "제공 가능",
  partial: "일부 근거",
  live: "수집 기록",
};
