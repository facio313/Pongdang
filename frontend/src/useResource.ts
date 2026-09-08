import { useEffect, useState } from "react";

export function useResource<T>(path: string, revision = 0) {
  const key = `${path}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}api/collector/${path}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            typeof payload.detail === "string"
              ? payload.detail
              : "요청 조건을 확인해 주세요.",
          );
        if (!controller.signal.aborted) setResult({ key, data: payload as T });
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
  }, [path, key]);
  return result?.key === key
    ? { ...result, previousData: result.data, loading: false }
    : {
        loading: true,
        data: undefined,
        previousData: result?.data,
        error: undefined,
      };
}
