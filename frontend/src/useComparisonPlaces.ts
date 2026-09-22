import { t } from "./i18n";
import { productPlaces, type ClassifiedWaterPlace, type Place } from "./productData";
import { useResource } from "./useResource";

interface NearbyPlaces {
  rows: ClassifiedWaterPlace[];
  status: "ready" | "coordinates_unavailable";
}

/** The reference stays first; the server searches the whole deduplicated catalog. */
export function useComparisonPlaces(place?: Place) {
  const nearby = useResource<NearbyPlaces>(place ? `places/nearby?spot_id=${place.id}` : null);
  return {
    rows: place ? [place, ...productPlaces(nearby.data?.rows ?? []).rows] : [],
    error: nearby.error,
    status: nearby.error ?? (place ? nearby.loading
      ? t("주변 비교 장소 조회 중")
      : nearby.data?.status === "coordinates_unavailable"
        ? t("기준 장소의 좌표가 없어 주변 비교 장소를 찾을 수 없습니다.")
        : t("기준 장소 + 가까운 동일 유형 장소 최대 2곳 · 직선거리 기준")
      : undefined),
  };
}
