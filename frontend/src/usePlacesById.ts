import { useEffect, useState } from "react";
import { travelJson } from "./travelApi";
import type { Place, RowPage } from "./productData";

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
  return result?.key === key ? result : { key, rows: [] };
}
