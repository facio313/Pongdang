import { useMemo } from "react";
import {
  productPlaces,
  placeMatchesId,
  type ClassifiedWaterPlace,
  type Place,
} from "./productData";
import type { DefaultPlaceSelection } from "./useProductData";
import { useResource } from "./useResource";
import { usePlacePhotos } from "./usePlacePhotos";
import { waterPlacesPath, WATER_PLACE_PAGE_SIZE, type WaterPlacePage, type WaterPlaceQuery } from "./waterPlaceApi";

/** 분류된 물놀이 장소 목록.
 *
 *  `/places`가 행정구역·분류 필터를 적용한 100행 페이지와 전체 건수를 줍니다.
 *  서버가 판정한 beach · valley 분류를 `place_kind`로 유지합니다.
 *
 *  `datasets/spots` 를 쓰면 안 됩니다. 그쪽 `type` 은 **수집 종류**(수집기가 쓴
 *  `beach_search_result` · `tourism` 따위)라서 `type === "beach"` 로 걸리지
 *  않습니다. 화면이 쓰는 `type` 은 productPlaces 가 `place_kind` 를 옮겨 담은
 *  것입니다.
 *
 *  기본 장소는 현재 페이지에 있을 때만 우선 선택합니다. 기본 장소의 전체 행을
 *  합치면 페이지·지역 필터를 벗어나고 사진·조건 요약의 100행 상한도 넘습니다. */
export function useWaterPlaces(search = "", query: WaterPlaceQuery = {}) {
  const catalog = useResource<WaterPlacePage>(waterPlacesPath(search, query));
  const defaultPlace = useResource<DefaultPlaceSelection>(
    search || query.district || query.kind || (query.page ?? 1) !== 1
      ? null : "water-index/default-place",
  );
  // 합치기와 걸러내기를 **메모 안에서** 합니다. 예전에는 둘 다 매 렌더에서
  // 새 배열을 만들었고, 그 새 참조가 usePlacePhotos 메모 → 지도 마커 →
  // KakaoMapCanvas 의 effect 까지 그대로 번져 **지도를 매 렌더 헐고 다시
  // 지었습니다**. 지도가 다시 지어지며 부모를 또 렌더시켜, 멈추지 않는
  // 렌더 루프가 됐습니다(모바일 MapPage 는 JSON 키로 이걸 우회하고 있었고,
  // 데스크탑 지도에는 그 우회가 없었습니다). 원인은 여기 하나입니다.
  const rows: Place[] | undefined = useMemo(
    () => catalog.data ? productPlaces(catalog.data.rows).rows : undefined,
    [catalog.data],
  );
  const photos = usePlacePhotos(rows);
  return {
    rows: photos.rows,
    total: catalog.data?.total ?? 0,
    page: catalog.data?.page ?? query.page ?? 1,
    pageSize: catalog.data?.page_size ?? WATER_PLACE_PAGE_SIZE,
    hasMore: catalog.data?.has_more ?? false,
    /** 서버가 근거를 보고 고른 기본 장소. 화면이 처음 무엇을 펼칠지 정할 때
     *  씁니다. 검색 중에는 조회하지 않으므로 undefined 입니다. */
    defaultPlaceId: rows?.find((place) => placeMatchesId(place, defaultPlace.data?.place?.id))?.id,
    loading: catalog.loading,
    previousData: catalog.previousData,
    error: catalog.error,
  };
}

/** A detail link can point outside the current page or administrative filter. */
export function useWaterPlace(spotId: number) {
  const catalog = useResource<ClassifiedWaterPlace[]>(`livecams/preview/places?spot_id=${spotId}`);
  const place = useMemo(
    () => catalog.data ? productPlaces(catalog.data).rows.find((row) => row.id === spotId) : undefined,
    [catalog.data, spotId],
  );
  return { ...catalog, place };
}

/** 지도에 찍을 수 있는 장소만 고릅니다. 좌표가 없는 장소는 핀을 만들지 않고,
 *  화면이 그 수를 함께 밝힙니다 -- 없는 위치를 임의로 만들지 않습니다. */
export function mappablePlaces(rows: Place[] = []) {
  return rows.flatMap((place) =>
    typeof place.lat === "number" && typeof place.lng === "number"
      ? [{ place, latitude: place.lat, longitude: place.lng }]
      : [],
  );
}
