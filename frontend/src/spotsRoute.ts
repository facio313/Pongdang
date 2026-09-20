import type { Place } from "./productData";

// 명소 탭(#spots)의 라우팅과 정렬 설정입니다. 예전에는 예시 목록
// (spotsCatalog.ts)과 한 파일에 섞여 있었는데, 그 파일이 지어낸 점수 · 거리 ·
// 운영시간을 들고 있어 통째로 걷어냈습니다. 라우팅은 데이터와 무관하므로
// 여기 남깁니다.

/** 목록은 이름순 하나입니다.
 *
 *  「거리순」은 현재 위치에서 장소까지의 거리를 주는 API 가 없고 프론트에 좌표
 *  거리 계산도 없어 두지 않습니다. 예전에는 예시 상수의 distanceKm 로 정렬하는
 *  시늉을 했습니다.
 *
 *  「퐁당 점수순」도 같은 이유로 걷어냈습니다. 점수는 고른 장소 하나만
 *  조회하므로 목록의 점수를 모르고, 그래서 두 화면 모두 비교 함수에 언제나
 *  null 을 주는 기본값을 넘기고 있었습니다 -- 눌러도 순서가 바뀌지 않는
 *  버튼이었습니다. 목록 전체의 점수를 얻으려면 장소 수만큼 조회해야 하는데,
 *  그건 이 목록이 할 일이 아닙니다.
 *
 *  동작하지 않는 컨트롤은 두지 않습니다. */
export function sortPlaces(rows: Place[]): Place[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "ko"));
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
