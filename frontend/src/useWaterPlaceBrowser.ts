import { useSyncExternalStore } from "react";
import { t } from "./i18n";
import { useDebounced } from "./useDebounced";
import { useResource } from "./useResource";
import { useWaterPlaces } from "./useWaterPlaces";
import { DEFAULT_PROVINCE, WATER_PLACE_PAGE_SIZE, type RegionCatalog, type WaterPlaceKind, type WaterPlacePageSize } from "./waterPlaceApi";
import { getWaterPlaceBrowserState, subscribeWaterPlaceBrowser, updateWaterPlaceBrowserState, waterPlaceBrowserPage } from "./waterPlaceBrowserState";

/** A filter change starts a new result set at its first bounded page. */
export function useWaterPlaceBrowser(pageSize: WaterPlacePageSize = WATER_PLACE_PAGE_SIZE) {
  const query = useSyncExternalStore(subscribeWaterPlaceBrowser, getWaterPlaceBrowserState);
  const page = waterPlaceBrowserPage(query, pageSize);
  const places = useWaterPlaces(useDebounced(query.search), { ...query, page, pageSize });
  const regions = useResource<RegionCatalog>("regions");
  const district = regions.data?.provinces.find(item => item.code === DEFAULT_PROVINCE)?.districts.find(item => item.code === query.district);
  return {
    ...query,
    page,
    pageSize,
    places,
    regionLabel: query.district ? t(district?.label ?? "선택 지역") : t("강원도 전체"),
    setSearch: (search: string) => updateWaterPlaceBrowserState({ search, page: 1, pageSize }),
    setDistrict: (district: string) => updateWaterPlaceBrowserState({ district, page: 1, pageSize }),
    setKind: (kind: WaterPlaceKind) => updateWaterPlaceBrowserState({ kind, page: 1, pageSize }),
    setPage: (page: number) => updateWaterPlaceBrowserState({ page, pageSize }),
  };
}
