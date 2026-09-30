import { t } from "./i18n";
import type { Activity } from "./aiApi";
import { comparisonPlace, distinctComparisonPlaces } from "./comparisonPlaces";
import {
  placeMatchesId, productPlaces,
  type ClassifiedWaterPlace, type Conditions, type Place, type RowPage,
} from "./productData";
import { useConditionSummaries } from "./useConditionSummaries";
import { useResource } from "./useResource";

/** Compare the collected catalog across regions, using bounded summary batches. */
export function useComparisonPlaces(
  place: Place | undefined, activity: Activity, reference: Conditions | undefined, loading: boolean,
) {
  const catalog = useResource<RowPage<ClassifiedWaterPlace>>(place && ["beach", "valley", "lake", "reservoir"].includes(place.type ?? "")
    ? `places?kind=${place.type}&page_size=100` : null);
  const places = productPlaces(catalog.data?.rows ?? []).rows;
  const catalogReference = places.find((candidate) => placeMatchesId(candidate, place?.id));
  const candidates = places.filter((candidate) => !placeMatchesId(candidate, place?.id));
  const summaries = useConditionSummaries(
    reference ? candidates.map((candidate) => candidate.id) : [], activity,
    reference?.mode === "forecast" ? "forecast" : "observation",
  );
  const rows = place ? distinctComparisonPlaces(
    comparisonPlace({ ...place,
      province_code: place.province_code ?? catalogReference?.province_code,
      district_code: place.district_code ?? catalogReference?.district_code,
    }, reference, loading),
    // Do not choose from whichever batch happens to arrive first.
    summaries.settled ? candidates.map((candidate) => comparisonPlace(candidate, summaries.byId.get(candidate.id))) : [],
  ) : [];
  const error = catalog.error ?? summaries.error;
  const scope = catalog.data && catalog.data.total > places.length
    ? ` · ${t("조회된 {count}곳 기준", { count: places.length })}` : "";
  return {
    rows,
    error,
    status: error ?? (place ? catalog.loading || !summaries.settled || loading
      ? t("다른 지역 비교 장소 조회 중")
      : (rows.length === 1
        ? t("수집된 동일 유형 장소에서 점수·수온이 다른 비교 장소가 없습니다. 점수 자료가 없는 장소는 제외합니다.")
        : t("다른 시·군 우선 · 근거가 많은 곳부터 최대 2곳 · 같은 점수·수온 조합 제외")) + scope
      : undefined),
  };
}
