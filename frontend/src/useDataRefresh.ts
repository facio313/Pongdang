import { useSyncExternalStore } from "react";
import { readDataRefresh, refreshFinished, requestDataRefresh, type DataRefreshJob } from "./dataRefreshApi";
import { invalidateResources } from "./resourceRefresh";

interface RefreshState {
  pending: boolean;
  job?: DataRefreshJob;
  error?: string;
}

// Keep one operation across menu closes, navigation, and responsive layout changes.
let state: RefreshState = { pending: false };
const listeners = new Set<() => void>();
const snapshot = () => state;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
function publish(next: RefreshState) {
  state = next;
  for (const listener of listeners) listener();
}

async function refresh() {
  if (state.pending) return;
  // If status polling failed, resume the known job instead of collecting twice.
  let job = state.job && !refreshFinished(state.job) ? state.job : undefined;
  publish({ pending: true, job });
  // Show the newest already-published data immediately, then read again after
  // the requested collection/calculation completes. Retention prevents gaps.
  invalidateResources();
  const stopAt = Date.now() + 10 * 60000;
  try {
    job = job
      ? await readDataRefresh(import.meta.env.BASE_URL, job.request_id)
      : await requestDataRefresh(import.meta.env.BASE_URL);
    publish({ pending: true, job });
    while (!refreshFinished(job)) {
      if (Date.now() >= stopAt) throw new Error("새로고침이 아직 진행 중입니다. 잠시 후 상태를 다시 확인해 주세요.");
      await new Promise((resolve) => setTimeout(resolve, 3000));
      job = await readDataRefresh(import.meta.env.BASE_URL, job.request_id);
      publish({ pending: true, job });
    }
    // Completed subsets may have changed even when some collection jobs failed.
    invalidateResources();
    publish({ pending: false, job });
  } catch (error) {
    publish({ pending: false, job, error: error instanceof Error ? error.message : "새로고침하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
}

export function useDataRefresh() {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { ...current, refresh, canResume: !!current.job && !refreshFinished(current.job) };
}
