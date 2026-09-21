import { travelJson } from "./travelApi.ts";

export type DataRefreshStatus = "queued" | "running" | "succeeded" | "partial" | "failed";

export interface DataRefreshJob {
  request_id: string;
  status: DataRefreshStatus;
  requested_at: string;
  finished_at: string | null;
  failed_jobs: string[];
}

export function refreshFinished(job: DataRefreshJob) {
  return job.status === "succeeded" || job.status === "partial" || job.status === "failed";
}

function refreshJob(value: unknown): DataRefreshJob {
  if (!value || typeof value !== "object") throw new Error("새로고침 응답 형식을 확인할 수 없습니다.");
  const job = value as Partial<DataRefreshJob>;
  if (typeof job.request_id !== "string" || !job.request_id ||
      !["queued", "running", "succeeded", "partial", "failed"].includes(job.status ?? "") ||
      typeof job.requested_at !== "string" || !Number.isFinite(Date.parse(job.requested_at)) ||
      !(job.finished_at === null || (typeof job.finished_at === "string" && Number.isFinite(Date.parse(job.finished_at)))) ||
      !Array.isArray(job.failed_jobs) || !job.failed_jobs.every((item) => typeof item === "string")) {
    throw new Error("새로고침 응답 형식을 확인할 수 없습니다.");
  }
  return job as DataRefreshJob;
}

export async function requestDataRefresh(base: string, fetcher: typeof fetch = fetch) {
  return refreshJob(await travelJson<unknown>(base, "refresh", "POST", {}, AbortSignal.timeout(20000), fetcher));
}

export async function readDataRefresh(base: string, requestId: string, fetcher: typeof fetch = fetch) {
  return refreshJob(await travelJson<unknown>(base, `refresh/${encodeURIComponent(requestId)}`, "GET", undefined, AbortSignal.timeout(20000), fetcher));
}
