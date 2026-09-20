import type { ClassifiedWaterPlace } from "./productData";

export const DEFAULT_PROVINCE = "gangwon";
export const WATER_PLACE_PAGE_SIZE = 100;
export type WaterPlaceKind = "" | "beach" | "valley";
export interface WaterPlaceQuery {
  district?: string;
  kind?: WaterPlaceKind;
  page?: number;
}
export interface WaterPlacePage {
  rows: ClassifiedWaterPlace[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}
export interface RegionCatalog {
  provinces: {
    code: string;
    label: string;
    districts: { code: string; label: string }[];
  }[];
}

/** Administrative codes stay the same when the display language changes. */
export function waterPlacesPath(search = "", query: WaterPlaceQuery = {}) {
  const params = new URLSearchParams({
    q: search,
    province: DEFAULT_PROVINCE,
    page: String(query.page ?? 1),
    page_size: String(WATER_PLACE_PAGE_SIZE),
  });
  if (query.district) params.set("district", query.district);
  if (query.kind) params.set("kind", query.kind);
  return `places?${params}`;
}
