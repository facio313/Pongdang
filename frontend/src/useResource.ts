import { useEffect, useState } from "react";
import { travelJson } from "./travelApi";

export function useResource<T>(path: string | null, revision = 0) {
  const origin = "data";
  const key = `${origin}:${path}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    async function load() {
      try {
        const payload = await travelJson<T>(
          import.meta.env.BASE_URL, path!, "GET", undefined, controller.signal,
        );
        if (!controller.signal.aborted) setResult({ key, data: payload });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key,
            error:
              error instanceof Error
                ? error.message
                : "데이터를 불러오지 못했습니다.",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [path, key, origin]);
  return path === null
    ? { loading: false, data: undefined, previousData: undefined, error: undefined }
    : result?.key === key
    ? { ...result, previousData: result.data, loading: false }
    : {
        loading: true,
        data: undefined,
        previousData: result?.data,
        error: undefined,
      };
}
