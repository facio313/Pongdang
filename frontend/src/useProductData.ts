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
export function useProductData() {
  const [now] = useState(() => new Date().toISOString());
  // Provider category classification also includes collected search-result
  // records whose region is empty and whose city appears only in the address.
  // This read-only endpoint needs neither Windy credentials nor a provider call.
  const catalog = useResource<ClassifiedWaterPlace[]>(
    "livecams/preview/places?q=강릉",
  );
  const places = { ...catalog, data: catalog.data ? productPlaces(catalog.data) : undefined };
  const rows = places.data?.rows ?? [];
  const place =
    rows.find((row) => row.name.includes("경포") && row.type === "beach") ??
    rows.find((row) => row.type === "beach");
  const conditions = useConditions(place?.id);
  return { now, places, place, conditions };
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
