import { useState } from "react";
import { useResource } from "./useResource";
import { useConditions } from "./useConditions";
import {
  periodPath,
  productPlaces,
  type ClassifiedWaterPlace,
  type RowPage,
  type Forecast,
  type TideResult,
  type QualityRow,
} from "./productData";
export interface DefaultPlaceSelection {
  place: ClassifiedWaterPlace | null;
  display_name: string;
  status: "preferred" | "fallback" | "no_current_data" | "no_places";
  message: string;
  rows: ClassifiedWaterPlace[];
}
export function useProductData() {
  const [now] = useState(() => new Date().toISOString());
  const catalog = useResource<DefaultPlaceSelection>("water-index/default-place");
  const places = { ...catalog, data: catalog.data ? productPlaces(catalog.data.rows) : undefined };
  const place = catalog.data?.place ? productPlaces([catalog.data.place]).rows[0] : undefined;
  const displayName = catalog.data?.display_name ?? "강릉 경포대 해수욕장";
  const selectionMessage = catalog.error ?? (catalog.loading
    ? "기본 해수욕장의 수집 자료를 확인하고 있습니다."
    : catalog.data?.message ?? "기본 해수욕장을 조회하지 못했습니다.");
  const conditions = useConditions(place?.id);
  return { now, places, place, conditions, displayName, selectionMessage };
}
export function useTodayData(id: number | undefined, now: string) {
  const forecasts = useResource<RowPage<Forecast>>(
    periodPath("water-forecast/forecasts", id, now),
  );
  const tides = useResource<TideResult>(periodPath("tides/events", id, now, 2));
  const quality = useResource<RowPage<QualityRow>>(
    id ? `quality/comparisons?spot_id=${id}&page_size=100` : null,
  );
  return { forecasts, tides, quality };
}
