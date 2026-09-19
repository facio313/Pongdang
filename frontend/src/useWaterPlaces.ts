import {
  productPlaces,
  type ClassifiedWaterPlace,
  type Place,
} from "./productData";
import type { DefaultPlaceSelection } from "./useProductData";
import { useResource } from "./useResource";

/** 분류된 물놀이 장소 목록.
 *
 *  `livecams/preview/places` 를 읽습니다. 이름이 라이브캠이지만 이것이 **분류된
 *  장소 목록을 돌려주는 유일한 API** 입니다 -- 서버가 카카오 카테고리와 장소명을
 *  보고 beach · valley 를 판정해 `place_kind` 로 내려줍니다.
 *
 *  `datasets/spots` 를 쓰면 안 됩니다. 그쪽 `type` 은 **수집 종류**(수집기가 쓴
 *  `beach_search_result` · `tourism` 따위)라서 `type === "beach"` 로 걸리지
 *  않습니다. 화면이 쓰는 `type` 은 productPlaces 가 `place_kind` 를 옮겨 담은
 *  것입니다.
 *
 *  검색어가 없으면 기본 장소 선정 결과를 앞에 붙입니다. 그쪽이 근거를 보고
 *  고른 순서라, 아무것도 검색하지 않았을 때 맨 위에 와야 하는 장소입니다.
 *
 *  서버가 100건에서 자릅니다. 그 사실은 화면이 밝혀야 합니다 -- 목록이 전부인
 *  것처럼 보이면 안 됩니다. */
export function useWaterPlaces(search = "") {
  const catalog = useResource<ClassifiedWaterPlace[]>(
    "livecams/preview/places?q=" + encodeURIComponent(search),
  );
  const defaultPlace = useResource<DefaultPlaceSelection>(
    search ? null : "water-index/default-place",
  );
  const merged = search
    ? catalog
    : {
        ...catalog,
        error: defaultPlace.error ?? catalog.error,
        data:
          defaultPlace.data || catalog.data
            ? [...(defaultPlace.data?.rows ?? []), ...(catalog.data ?? [])]
            : undefined,
      };
  // 기본 장소 선정 결과와 검색 목록이 같은 장소를 담을 수 있습니다. 먼저 온
  // 것(근거로 고른 쪽)을 남깁니다.
  const rows: Place[] | undefined = merged.data
    ? productPlaces(merged.data).rows.filter(
        (place, index, all) =>
          all.findIndex((item) => item.id === place.id) === index,
      )
    : undefined;
  return {
    rows,
    total: rows?.length ?? 0,
    /** 서버가 근거를 보고 고른 기본 장소. 화면이 처음 무엇을 펼칠지 정할 때
     *  씁니다. 검색 중에는 조회하지 않으므로 undefined 입니다. */
    defaultPlaceId: defaultPlace.data?.place?.id,
    loading: merged.loading,
    previousData: merged.previousData,
    error: merged.error,
  };
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
