import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { travelJson } from "./travelApi";
import { t } from "./i18n";
import { RESOURCE_REFRESH_INTERVAL, resourceRefreshGeneration, subscribeResourceRefresh } from "./resourceRefresh";

// Owner-only notification data stays in this mounted view, outside public caches.
export function useNotificationResource<T>(path: string | null, revision = 0) {
  const [refreshId, setRefreshId] = useState(0);
  const refresh = useCallback(() => setRefreshId(value => value + 1), []);
  const generation = useSyncExternalStore(subscribeResourceRefresh, resourceRefreshGeneration, resourceRefreshGeneration);
  const key = `${path}:${revision}:${refreshId}:${generation}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
    void travelJson<T>(import.meta.env.BASE_URL, path, "GET", undefined, signal).then(
      data => { if (!controller.signal.aborted) setResult({ key, data }); },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error: signal.aborted
          ? "알림 조회 시간이 초과됐습니다. 다시 확인해 주세요."
          : error instanceof Error ? error.message : "알림을 조회하지 못했습니다." });
      },
    );
    return () => controller.abort();
  }, [key, path]);
  useEffect(() => {
    if (!path) return;
    const update = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(update, RESOURCE_REFRESH_INTERVAL);
    return () => window.clearInterval(timer);
  }, [path, key, refresh]);
  const current = result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error ? t(current.error) : undefined, loading: Boolean(path && !current), refresh };
}
