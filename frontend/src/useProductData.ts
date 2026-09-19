import { useState } from "react";
import { useResource } from "./useResource";
import { useConditions } from "./useConditions";
import { useBestActivity } from "./useBestActivity";
import {
  periodPath,
  productPlaces,
  type ClassifiedWaterPlace,
  type RowPage,
  type Forecast,
  type TideResult,
  type WaterQualityGrade,
} from "./productData";
export interface DefaultPlaceSelection {
  place: ClassifiedWaterPlace | null;
  display_name: string;
  status: "preferred" | "fallback" | "no_current_data" | "no_places";
  message: string;
  rows: ClassifiedWaterPlace[];
}
/** `mode: "best"` 는 여섯 활동을 모두 조회해 오늘 가장 좋은 활동을 고릅니다.
 *  홈 히어로가 수영 한 종목에 고정돼 있던 자리를 대신합니다. 기본값은 예전대로
 *  수영 한 번만 조회합니다. */
export function useProductData(mode: "swim" | "best" = "swim") {
  const [now] = useState(() => new Date().toISOString());
  const catalog = useResource<DefaultPlaceSelection>("water-index/default-place");
  const places = { ...catalog, data: catalog.data ? productPlaces(catalog.data.rows) : undefined };
  const place = catalog.data?.place ? productPlaces([catalog.data.place]).rows[0] : undefined;
  const displayName = catalog.data?.display_name ?? "강릉 경포대 해수욕장";
  const selectionMessage = catalog.error ?? (catalog.loading
    ? "기본 해수욕장의 수집 자료를 확인하고 있습니다."
    : catalog.data?.message ?? "기본 해수욕장을 조회하지 못했습니다.");
  // 훅은 조건부로 부를 수 없으므로 두 쪽을 모두 부르되, 쓰지 않는 쪽에는 id 를
  // 넘기지 않습니다. id 가 없으면 conditionPath 가 null 이라 요청이 나가지
  // 않으므로, 호출 수는 그대로여도 조회 횟수는 고른 모드만큼입니다 -- 홈이
  // 여섯 활동을 보느라 오늘 탭까지 여섯 번 더 조회하게 만들지 않으려는 것입니다.
  const activities = useBestActivity(mode === "best" ? place?.id : undefined);
  const single = useConditions(mode === "best" ? undefined : place?.id);
  // best 가 없어도 근거·안전 문장은 나와야 하므로 첫 활동(수영) 상태로 물러섭니다.
  const conditions =
    mode === "best" ? (activities.best ?? activities.all[0]) : single;
  // 히어로 위쪽 관측 패널(기온·수온·파고·바람·강수)은 활동과 무관한 「지금
  // 날씨와 바다」입니다. 서버는 그 활동이 보는 지표만 내려주므로, 여기에
  // best 응답을 쓰면 갯벌이 뽑힌 날 수온·파고가 통째로 «–» 가 됩니다.
  // 수영 응답이 해양 지표를 가장 넓게 담고 있어 기준으로 씁니다(all[0] 이
  // 수영이라 조회가 더 늘지 않습니다).
  const baseline = mode === "best" ? activities.all[0] : single;
  return {
    now,
    places,
    place,
    conditions,
    baseline,
    best: activities.best,
    activities: activities.all,
    displayName,
    selectionMessage,
  };
}
export function useTodayData(id: number | undefined, now: string) {
  const forecasts = useResource<RowPage<Forecast>>(
    periodPath("water-forecast/forecasts", id, now),
  );
  const tides = useResource<TideResult>(periodPath("tides/events", id, now, 2));
  const quality = useResource<WaterQualityGrade>(
    id ? `quality/grade?spot_id=${id}` : null,
  );
  return { forecasts, tides, quality };
}
