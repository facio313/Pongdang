import type { Place } from "./productData";

// 명소 탭(#spots)의 라우팅과 정렬 설정입니다. 예전에는 예시 목록
// (spotsCatalog.ts)과 한 파일에 섞여 있었는데, 그 파일이 지어낸 점수 · 거리 ·
// 운영시간을 들고 있어 통째로 걷어냈습니다. 라우팅은 데이터와 무관하므로
// 여기 남깁니다.

/** 목록 순서: **점수 있는 곳 먼저**, 그 안에서 점수 내림차순, 그다음 이름순.
 *
 *  예전에는 이름순 하나였습니다. 점수를 고른 장소 하나만 조회하던 때에는 목록의
 *  점수를 알 수 없었기 때문입니다. 그러나 그 결과 「점수 없음」이 절반 넘게 섞인
 *  목록이 이름순으로 늘어서, 첫 화면에 보이는 열 줄이 거의 다 「점수 없음」이
 *  되는 날이 있었습니다 -- 조건 자료가 있는 곳을 찾으려면 넘겨 봐야 했습니다.
 *
 *  이제 목록이 조건 요약을 **묶음으로** 한 번에 읽으므로(useConditionSummaries)
 *  점수를 알고 줄을 세울 수 있습니다. 「거리순」은 여전히 두지 않습니다 --
 *  현재 위치에서의 거리를 주는 API 가 없고, 동작하지 않는 컨트롤은 두지 않습니다.
 *
 *  `scores` 를 넘기지 않으면 예전처럼 이름순입니다. */
export function sortPlaces(
  rows: Place[],
  scores?: Map<number, number | null>,
): Place[] {
  const score = (place: Place) => scores?.get(place.id) ?? null;
  return [...rows].sort((a, b) => {
    const [left, right] = [score(a), score(b)];
    // 점수 없는 곳을 「0 점」으로 읽지 않습니다. 뒤로 보낼 뿐입니다.
    if ((left === null) !== (right === null)) return left === null ? 1 : -1;
    if (left !== null && right !== null && left !== right) return right - left;
    return a.name.localeCompare(b.name, "ko");
  });
}

/** 점수가 있는 곳과 없는 곳. 목록이 둘을 **묶어서** 보여 주도록 나눠 줍니다 --
 *  「점수 없음」 줄이 점수 있는 줄 사이에 섞여 있으면 목록이 고장난 것처럼
 *  읽힙니다. 없는 쪽은 「조건 자료 준비 중」으로 묶입니다. */
export function splitByScore(
  rows: Place[],
  scores?: Map<number, number | null>,
): { scored: Place[]; pending: Place[] } {
  const sorted = sortPlaces(rows, scores);
  if (!scores) return { scored: sorted, pending: [] };
  return {
    scored: sorted.filter((place) => (scores.get(place.id) ?? null) !== null),
    pending: sorted.filter((place) => (scores.get(place.id) ?? null) === null),
  };
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
