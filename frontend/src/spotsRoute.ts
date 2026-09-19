import type { Place } from "./productData";

// 명소 탭(#spots)의 라우팅과 정렬 설정입니다. 예전에는 예시 목록
// (spotsCatalog.ts)과 한 파일에 섞여 있었는데, 그 파일이 지어낸 점수 · 거리 ·
// 운영시간을 들고 있어 통째로 걷어냈습니다. 라우팅은 데이터와 무관하므로
// 여기 남깁니다.

export type SpotSort = "name" | "score";

/** 「거리순」은 없습니다. 현재 위치에서 장소까지의 거리를 주는 API 가 없고,
 *  프론트에 좌표 거리 계산도 없습니다. 예전에는 예시 상수의 distanceKm 로
 *  정렬하는 시늉을 했습니다 -- 동작하지 않는 컨트롤은 두지 않습니다. */
export const SPOT_SORTS: { key: SpotSort; label: string }[] = [
  { key: "name", label: "이름순" },
  { key: "score", label: "퐁당 점수순" },
];

/** 점수순에서 «–» 는 0 으로 취급하지 않고 뒤로 보냅니다 -- 값이 없는 것과
 *  낮은 것은 다릅니다. 점수는 고른 장소만 조회하므로, 목록 대부분은 점수가
 *  없어 이름순이 사실상 기본입니다. */
export function sortPlaces(
  rows: Place[],
  sort: SpotSort,
  scoreOf: (place: Place) => number | null = () => null,
): Place[] {
  const sorted = [...rows];
  if (sort === "score")
    return sorted.sort((a, b) => {
      const left = scoreOf(a);
      const right = scoreOf(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return right - left;
    });
  return sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** `#spots` 해시의 뷰와 선택 장소 id 를 읽습니다. featureRoutes.ts 의 readRoute
 *  와 같은 `spot_id` 파라미터 · 같은 검증 규칙을 씁니다.
 *
 *  예전에는 여기서 예시 목록을 뒤져 Spot 객체를 돌려줬습니다. 이제 목록은
 *  서버에서 오므로 id 만 돌려주고, 장소를 찾는 것은 화면의 몫입니다. */
export function readSpotsRoute(hash: string): {
  view: "list" | "map";
  spotId: number | undefined;
} {
  const query = new URLSearchParams(hash.replace(/^#/, "").split("?")[1] ?? "");
  const raw = query.get("spot_id") ?? "";
  return {
    view: query.get("view") === "map" ? "map" : "list",
    spotId: /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : undefined,
  };
}

/** 목록 · 상세 · 지도가 같은 링크를 만들도록 한 곳에 모읍니다. */
export function spotLink(place: { id: number }) {
  return `#spots?spot_id=${place.id}`;
}
