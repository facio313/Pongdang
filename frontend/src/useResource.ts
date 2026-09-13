import { useEffect, useState } from "react";
import { requestData } from "./api";

export function useResource<T>(path: string, revision = 0) {
  const key = `${path}:${revision}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const payload = await requestData<T>(import.meta.env.BASE_URL, path, controller.signal);
        if (!controller.signal.aborted) setResult({ key, data: payload });
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({
            key,
            error: error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.",
          });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [path, key]);
  return result?.key === key
    ? { ...result, loading: false }
    : { loading: true, data: undefined, error: undefined };
}
