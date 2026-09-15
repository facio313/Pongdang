import { useEffect, useState } from "react";

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
        const response = await fetch(
          `${import.meta.env.BASE_URL}api/${origin}/${path}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            response.status === 401 ? "기존 SSO 로그인이 필요합니다."
              : response.status === 403 ? "Pongdang 접근 권한을 확인해 주세요."
              : response.status === 503 ? "서버 자료를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요."
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
