import { useSyncExternalStore } from "react";
import { t } from "./i18n";
import { useDebounced } from "./useDebounced";
import { useResource } from "./useResource";
import { useWaterPlaces } from "./useWaterPlaces";
import { DEFAULT_PROVINCE, type RegionCatalog, type WaterPlaceKind } from "./waterPlaceApi";
import { getWaterPlaceBrowserState, subscribeWaterPlaceBrowser, updateWaterPlaceBrowserState } from "./waterPlaceBrowserState";

/** A filter change starts a new result set at its first bounded page. */
export function useWaterPlaceBrowser() {
  const query = useSyncExternalStore(subscribeWaterPlaceBrowser, getWaterPlaceBrowserState);
  const places = useWaterPlaces(useDebounced(query.search), query);
  const regions = useResource<RegionCatalog>("regions");
  const district = regions.data?.provinces.find(item => item.code === DEFAULT_PROVINCE)?.districts.find(item => item.code === query.district);
  return {
    ...query,
    places,
    regionLabel: query.district ? t(district?.label ?? "선택 지역") : t("강원도 전체"),
    setSearch: (search: string) => updateWaterPlaceBrowserState({ search, page: 1 }),
    setDistrict: (district: string) => updateWaterPlaceBrowserState({ district, page: 1 }),
    setKind: (kind: WaterPlaceKind) => updateWaterPlaceBrowserState({ kind, page: 1 }),
    setPage: (page: number) => updateWaterPlaceBrowserState({ page }),
  };
}
