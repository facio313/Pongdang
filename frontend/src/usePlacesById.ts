import { useEffect, useMemo, useState } from "react";
import { travelJson } from "./travelApi";
import type { Place, RowPage } from "./productData";
import { usePlacePhotos } from "./usePlacePhotos";

// Saved plans can refer to places outside the current 100-row search page.
export function usePlacesById(ids: number[]) {
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
    const controller = new AbortController();
    void Promise.allSettled(
      selected.map((id) =>
        travelJson<RowPage<Place>>(
          import.meta.env.BASE_URL,
          `datasets/spots?page_size=1&filter_column=id&filter_value=${id}`,
          "GET",
          undefined,
          controller.signal,
        ),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const rows = results.flatMap((result) =>
        result.status === "fulfilled" ? result.value.rows : [],
      );
      setResult({
        key,
        rows,
        ...(results.some((result) => result.status === "rejected")
          ? { error: "일부 코스 장소를 조회하지 못했습니다." }
          : {}),
      });
    });
    return () => controller.abort();
  }, [key]);
  // 조회 전 · 키가 바뀐 직후에도 **같은 참조**를 돌려줍니다. 매 렌더 새 객체를
  // 만들면 이 결과로 계산한 지도 마커가 계속 새 배열이 되어, 지도가 끊임없이
  // 다시 그려집니다.
  const pending = useMemo(
    () => ({ key, rows: [] as Place[], error: undefined as string | undefined }),
    [key],
  );
  const current = result?.key === key ? result : pending;
  const photos = usePlacePhotos(current.rows);
  return { ...current, rows: photos.rows ?? current.rows, loading: key !== "[]" && result?.key !== key };
}
