import { useState } from "react";
import { useResource } from "./useResource";
import {
  conditionPath,
  periodPath,
  type Conditions,
  type Place,
  type RowPage,
  type Forecast,
  type TideResult,
  type QualityRow,
} from "./productData";
export function useProductData() {
  const [now] = useState(() => new Date().toISOString());
  const places = useResource<RowPage<Place>>(
    "datasets/spots?page_size=100&q=강릉",
  );
  const rows = places.data?.rows ?? [];
  const place =
    rows.find((row) => row.name.includes("경포") && row.type === "beach") ??
    rows.find((row) => row.type === "beach");
  const conditions = useResource<Conditions>(conditionPath(place?.id));
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
