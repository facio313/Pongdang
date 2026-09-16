import { MAP_LOCATIONS } from "./mapLocations";

// 명소 탭(20a · 20b · 20c)의 **예시 목록**입니다. 명소 API 는 아직 연동되지
// 않았고, 이 화면들은 레이아웃 확인이 목적입니다. 그래서 화면에는 「예시
// 데이터」 · 「명소 API 미연동」 칩을 반드시 함께 띄웁니다.
//
// 값은 핸드오프 디자인(모바일 20a · 데스크탑 19a)의 수치를 그대로 옮긴 것이며
// 임의로 바꾸지 않았습니다. 실연동 시 이 파일을 훅으로 교체하고 화면은 그대로
// 둘 수 있도록, 화면이 쓰는 모양(Spot)만 여기서 정의합니다.
//
// 지키는 규칙(핸드오프 데이터 표기 규칙):
//  - 점수가 없으면 `null` 이며 0 이 아닙니다. 화면은 «–» 로 씁니다.
//  - 「산정 대상 아님」처럼 없음의 이유를 아는 경우에만 unscoredLabel 을 채웁니다.
//  - 좌표는 실제 검증된 값(mapLocations.ts)만 씁니다. 없으면 지도에 찍지
//    않고 그 사실을 화면에 밝힙니다. 임의 좌표를 지어내지 않습니다.

export type SpotCategory = "해변" | "온천" | "카페" | "문화" | "서핑";

export interface Spot {
  id: number;
  name: string;
  /** 화면에 그대로 쓰는 카테고리 표기. 필터용 키는 category 입니다. */
  category: SpotCategory;
  categoryLabel: string;
  /** 퐁당 점수(물놀이 조건 점수). 산정 대상이 아니면 null 입니다. */
  score: number | null;
  /** 점수가 없는 이유를 아는 경우에만 채웁니다. */
  unscoredLabel?: string;
  /** 현재 위치 기준 거리. 거리 계산도 미연동이라 예시 값입니다. */
  distanceKm: number;
  /** 「상시 개방」 · 「운영 중」 · 「운영 종료」 */
  operating: string;
  /** 운영 상태가 닫힘이면 붉게 씁니다. */
  operatingClosed?: boolean;
  /** 운영시간 · 주차 같은 부가 표기. */
  operatingNote?: string;
  address: string;
  summary: string;
  /** mapLocations.ts 의 검증된 좌표 키. 없으면 지도에 찍지 않습니다. */
  location?: keyof typeof MAP_LOCATIONS;
  /** 상세 화면의 괘선 표. 값이 없으면 null 로 두고 «–» 로 씁니다. */
  detail: {
    openSeason: string | null;
    parking: string | null;
    facility: string | null;
    contact: string | null;
  };
  /** 상세 화면 점수 카드의 근거 한 줄. 없으면 비웁니다. */
  scoreBasis?: string;
  /** 신뢰도는 점수 · 안전 상태와 다른 값입니다. 색도 전용색을 씁니다. */
  confidence?: { label: string; sources: string };
}

const GYEONGPO: Spot = {
  id: 1,
  name: "경포해변",
  category: "해변",
  categoryLabel: "해변",
  score: 72,
  distanceKm: 1.2,
  operating: "상시 개방",
  operatingNote: "주차 가능",
  address: "강릉시 강문동",
  summary: "강릉에서 가장 넓은 해수욕장. 소개 텍스트는 API 값을 그대로 씁니다.",
  location: "gyeongpo",
  detail: {
    openSeason: "7/1 – 8/24 해수욕장",
    parking: "가능 · 유료",
    facility: "샤워장 · 탈의실",
    contact: null,
  },
  scoreBasis:
    "수온 22.1°C · 파고 0.6m 기준입니다. 점수는 안전 판정이 아니며, 신뢰도와도 다른 값입니다.",
  confidence: { label: "신뢰도 보통", sources: "관측 2/3 출처" },
};

const SACHEONJIN_ONSEN: Spot = {
  id: 3,
  name: "사천진 온천",
  category: "온천",
  categoryLabel: "온천",
  score: 70,
  distanceKm: 6.8,
  operating: "운영 중",
  operatingNote: "10:00–21:00",
  address: "강릉시 사천면",
  summary: "물놀이 뒤 휴식 코스로 추천 탭에서도 쓰이는 지점입니다.",
  // `sacheonjin` 은 사천진**해변** 지점의 검증 좌표입니다. 온천은 별개
  // 장소이므로 좌표가 확인되기 전까지 지도에 찍지 않습니다.
  detail: {
    openSeason: null,
    parking: "가능",
    facility: "탈의실 · 휴게실",
    contact: null,
  },
  scoreBasis:
    "수온 22.1°C 기준입니다. 점수는 안전 판정이 아니며, 신뢰도와도 다른 값입니다.",
  confidence: { label: "신뢰도 낮음", sources: "관측 1/3 출처" },
};

const JEONGDONGJIN: Spot = {
  id: 4,
  name: "정동진 해변",
  category: "해변",
  categoryLabel: "해변",
  score: 66,
  distanceKm: 18.5,
  operating: "상시 개방",
  operatingNote: "야간 조명",
  address: "강릉시 강동면",
  summary: "일출 명소로 야간 조명이 있습니다.",
  detail: {
    openSeason: "7/1 – 8/24 해수욕장",
    parking: "가능",
    facility: null,
    contact: null,
  },
};

const ANMOK_COFFEE: Spot = {
  id: 2,
  name: "안목 커피거리",
  category: "카페",
  categoryLabel: "카페",
  score: null,
  unscoredLabel: "산정 대상 아님",
  distanceKm: 4.3,
  operating: "운영 중",
  operatingNote: "09:00–22:00",
  address: "강릉시 견소동",
  summary:
    "해변을 따라 카페가 이어지는 거리. 물놀이 조건 점수는 산정 대상이 아닙니다.",
  // mapLocations.ts 의 `anmok` 은 안목**해변** 지점의 검증 좌표입니다.
  // 카페거리는 별개 장소이므로 그 좌표를 빌려 쓰지 않습니다.
  detail: {
    openSeason: null,
    parking: "가능 · 유료",
    facility: null,
    contact: null,
  },
};

const OTHER_SPOTS: Spot[] = [
  ANMOK_COFFEE,
  SACHEONJIN_ONSEN,
  JEONGDONGJIN,
  {
    id: 5,
    name: "오죽헌",
    category: "문화",
    categoryLabel: "문화 · 전시",
    score: null,
    unscoredLabel: "산정 대상 아님",
    distanceKm: 3.1,
    operating: "운영 종료",
    operatingClosed: true,
    operatingNote: "09:00–18:00",
    address: "강릉시 죽헌동",
    summary:
      "비 오는 날 대안 일정으로 붙일 수 있는 실내 명소입니다.",
    detail: {
      openSeason: null,
      parking: "가능 · 무료",
      facility: null,
      contact: null,
    },
  },
];

/** 명소 목록(20a · 19a)에 싣는 첫 장입니다. */
export const SPOTS: Spot[] = [GYEONGPO, ...OTHER_SPOTS];

/** 히어로에 쓰는 전체 건수. 목록에 실린 5건은 그 중 첫 장입니다. */
export const SPOT_TOTAL = 128;

// 홈의 명소 두 줄은 목록과 **다른 질의**입니다 -- 하나는 오늘 조건이 바다를
// 권할 때의 해변 카테고리, 다른 하나는 고른 취향으로 거른 카테고리입니다.
// 실연동 시에도 서로 다른 요청이 되므로 목록을 잘라 쓰지 않고 따로 둡니다.
// 경포해변 · 사천진 온천처럼 겹치는 명소는 같은 객체를 공유해 id 와 상세
// 내용이 어긋나지 않게 합니다.

const ANMOK_BEACH: Spot = {
  id: 6,
  name: "안목해변",
  category: "해변",
  categoryLabel: "해변",
  score: 68,
  distanceKm: 4.3,
  operating: "상시 개방",
  address: "강릉시 견소동",
  summary: "커피거리와 이어지는 해변입니다.",
  location: "anmok",
  detail: {
    openSeason: "7/1 – 8/24 해수욕장",
    parking: "가능 · 유료",
    facility: null,
    contact: null,
  },
};

const SACHEONJIN_BEACH: Spot = {
  id: 7,
  name: "사천진해변",
  category: "해변",
  categoryLabel: "해변",
  score: 54,
  distanceKm: 6.8,
  operating: "상시 개방",
  address: "강릉시 사천면",
  summary: "규모가 작아 붐비지 않는 해변입니다.",
  location: "sacheonjin",
  detail: {
    openSeason: "7/1 – 8/24 해수욕장",
    parking: "가능",
    facility: null,
    contact: null,
  },
};

const GANGMUN_SURF: Spot = {
  id: 8,
  name: "강문 서핑스팟",
  category: "서핑",
  categoryLabel: "서핑",
  score: 86,
  distanceKm: 2.4,
  operating: "운영 중",
  address: "강릉시 강문동",
  summary: "강습과 장비 대여가 함께 있는 서핑 지점입니다.",
  detail: {
    openSeason: null,
    parking: "가능",
    facility: "샤워장",
    contact: null,
  },
};

const JUMUNJIN_SPA: Spot = {
  id: 9,
  name: "주문진 스파",
  category: "온천",
  categoryLabel: "온천",
  score: null,
  unscoredLabel: "산정 대상 아님",
  distanceKm: 19.0,
  operating: "운영 중",
  address: "강릉시 주문진읍",
  summary: "북쪽 끝 코스에 붙일 수 있는 실내 온천입니다.",
  detail: {
    openSeason: null,
    parking: "가능",
    facility: null,
    contact: null,
  },
};

const GYEONGPO_LAKE: Spot = {
  id: 10,
  name: "경포호 산책로",
  category: "문화",
  categoryLabel: "문화",
  score: null,
  unscoredLabel: "산정 대상 아님",
  distanceKm: 1.6,
  operating: "상시 개방",
  address: "강릉시 저동",
  summary: "경포호를 한 바퀴 도는 산책로입니다.",
  detail: {
    openSeason: null,
    parking: "가능 · 무료",
    facility: null,
    contact: null,
  },
};

/** 홈 「바다가 좋은 오늘 · 해변 명소」. 데스크탑은 4칸 그리드로, 모바일은
 *  가로 스크롤로 같은 목록을 보여줍니다. */
export const BEACH_PICKS: Spot[] = [
  GYEONGPO,
  ANMOK_BEACH,
  SACHEONJIN_BEACH,
  JEONGDONGJIN,
];

/** 홈 「고른 취향의 명소」. 취향은 추천 화면과 같은 서핑 · 온천 고정입니다. */
export const TASTE_PICKS: Spot[] = [
  SACHEONJIN_ONSEN,
  GANGMUN_SURF,
  JUMUNJIN_SPA,
];
export const TASTE_LABEL = "서핑 · 온천";

/** 상세 화면은 목록에 없는 명소(홈 줄에서 들어온 것)도 열 수 있어야 합니다. */
const ALL_SPOTS: Spot[] = [
  ...SPOTS,
  ANMOK_BEACH,
  SACHEONJIN_BEACH,
  GANGMUN_SURF,
  JUMUNJIN_SPA,
  GYEONGPO_LAKE,
];

/** 상세 화면의 「주변 명소 · 거리순」. 여기의 거리는 **현재 위치가 아니라 그
 *  명소로부터의 거리**라서 목록의 distanceKm 과 다릅니다. 두 값을 섞지 않도록
 *  따로 둡니다. 실연동 시 서버가 기준 좌표와 함께 내려줄 값입니다. */
export const NEARBY_SPOTS: { spot: Spot; fromSpotKm: number }[] = [
  { spot: GANGMUN_SURF, fromSpotKm: 0.9 },
  { spot: GYEONGPO_LAKE, fromSpotKm: 1.4 },
  { spot: ANMOK_COFFEE, fromSpotKm: 4.3 },
  { spot: SACHEONJIN_ONSEN, fromSpotKm: 6.8 },
];

/** 지도에 찍을 수 있는 명소 -- 검증된 좌표(mapLocations.ts)가 있는 것만입니다.
 *  명소 지도는 목록 첫 장이 아니라 여기서 핀을 만듭니다. 좌표가 없는 명소는
 *  임의 위치를 만들지 않고 빠지며, 화면이 그 수를 함께 밝힙니다. */
export const MAPPABLE_SPOTS: Spot[] = ALL_SPOTS.filter((spot) => spot.location);

/** 데스크탑 지도(18c)의 왼쪽 목록에 쓰는 지점별 수온. 지점에 저장된 값은
 *  점수와 수온뿐이며 둘 다 예시입니다. */
export const SPOT_WATER_TEMP: Record<number, string> = {
  1: "22.1°C",
  6: "21.8°C",
  7: "21.2°C",
};

export type SpotSort = "popular" | "distance" | "score";

export const SPOT_SORTS: { key: SpotSort; label: string }[] = [
  { key: "popular", label: "인기순" },
  { key: "distance", label: "거리순" },
  { key: "score", label: "퐁당 점수순" },
];

/** 정렬은 실연동 시 서버 재요청으로 바뀝니다. 지금은 예시 목록을 그대로
 *  늘어놓기만 하며, 점수순에서 «–» 는 0 으로 취급하지 않고 뒤로 보냅니다 --
 *  값이 없는 것과 낮은 것은 다르기 때문입니다. */
export function sortSpots(spots: Spot[], sort: SpotSort): Spot[] {
  const rows = [...spots];
  if (sort === "distance")
    return rows.sort((a, b) => a.distanceKm - b.distanceKm);
  if (sort === "score")
    return rows.sort((a, b) => {
      if (a.score === null && b.score === null) return 0;
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });
  return rows;
}

/** 지도에 찍을 수 있는 명소만 고릅니다. 좌표가 검증되지 않은 명소는 핀을
 *  만들지 않고, 화면이 그 수를 함께 밝힙니다. */
export function mappableSpots(spots: Spot[]) {
  return spots.flatMap((spot) =>
    spot.location
      ? [{ spot, ...MAP_LOCATIONS[spot.location] }]
      : [],
  );
}

/** `#spots` 해시의 뷰와 선택 명소를 읽습니다. featureRoutes.ts 의 readRoute 와
 *  같은 `spot_id` 파라미터 · 같은 검증 규칙을 씁니다. */
export function readSpotsRoute(hash: string): {
  view: "list" | "map";
  spot: Spot | undefined;
} {
  const query = new URLSearchParams(hash.replace(/^#/, "").split("?")[1] ?? "");
  const raw = query.get("spot_id") ?? "";
  const id = /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : undefined;
  return {
    view: query.get("view") === "map" ? "map" : "list",
    spot: ALL_SPOTS.find((item) => item.id === id),
  };
}

/** 목록 · 상세 · 지도가 같은 링크를 만들도록 한 곳에 모읍니다. */
export function spotLink(spot: Spot) {
  return `#spots?spot_id=${spot.id}`;
}
