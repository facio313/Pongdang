import { t } from "./i18n.ts";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { loadResource } from "./useResource";
import type { Place, RowPage } from "./productData";
import { usePlacePhotos } from "./usePlacePhotos";
import { resourceRefreshGeneration, subscribeResourceRefresh } from "./resourceRefresh";

// Saved plans can refer to places outside the current 100-row search page.
export function usePlacesById(ids: number[]) {
  const generation = useSyncExternalStore(subscribeResourceRefresh, resourceRefreshGeneration, resourceRefreshGeneration);
  const key = JSON.stringify(
    [...new Set(ids)]
      .filter((id) => Number.isSafeInteger(id) && id > 0)
      .slice(0, 20),
  );
  const [result, setResult] = useState<{
    key: string;
    rows: Place[];
    error?: string;
  }>();
  useEffect(() => {
    const selected = JSON.parse(key) as number[];
    if (!selected.length) return;
    let active = true;
    // Keep the unfiltered dataset so saved restaurants and lodging remain valid.
    // Concurrent/remounted consumers share each read, and only three run at once.
    void Promise.all(
      selected.map((id) =>
        loadResource<RowPage<Place>>(
          import.meta.env.BASE_URL,
          `datasets/spots?page_size=1&filter_column=id&filter_value=${id}`,
        ),
      ),
    ).then((results) => {
      if (!active) return;
      const rows = results.flatMap((result) => result.data?.rows ?? []);
      setResult({
        key,
        rows,
        ...(results.some((result) => result.error || result.refreshError)
          ? { error: "일부 코스 장소를 조회하지 못했습니다." }
          : {}),
      });
    });
    return () => { active = false; };
  }, [key, generation]);
  // 조회 전 · 키가 바뀐 직후에도 **같은 참조**를 돌려줍니다. 매 렌더 새 객체를
  // 만들면 이 결과로 계산한 지도 마커가 계속 새 배열이 되어, 지도가 끊임없이
  // 다시 그려집니다.
  const pending = useMemo(
    () => ({ key, rows: [] as Place[], error: undefined as string | undefined }),
    [key],
  );
  const current = result?.key === key ? result : pending;
  const photos = usePlacePhotos(current.rows);
  return { ...current, error: current.error ? t(current.error) : undefined, rows: photos.rows ?? current.rows, loading: key !== "[]" && result?.key !== key };
}
