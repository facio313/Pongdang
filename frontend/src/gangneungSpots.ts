import { useEffect } from "react";
import { useResource } from "./useResource";
import type { RowsResult } from "./data";

// 장소 카탈로그(`spots`) 조회. 홈 · 오늘 · 추천 화면이 지점명을 같은 방식으로
// 읽도록 공유합니다. 이 테이블에서 쓰는 값은 장소명 · 지역 · 주소 · 검증
// 상태뿐이며 점수 · 수온 같은 판정값은 저장되어 있지 않습니다. 조회에
// 실패하면 화면은 예시 상수로 표시하고 그 사실을 함께 밝혀야 합니다.

const SPOTS_QUERY = "datasets/spots?page_size=100&q=강릉";

export interface ResolvedSpot {
  name: string;
  address: string | null;
  region: string | null;
  verification: string | null;
  linked: boolean;
}

/** 장소 카탈로그(`spots`)에서 강릉 지점을 읽어옵니다. 이 테이블에서 쓰는 값은
 *  장소명 · 지역 · 주소 · 검증 상태뿐이며, 점수 · 수온 등 판정값은 저장되어
 *  있지 않습니다. 조회에 실패하면 화면은 예시 상수로 표시하고 그 사실을
 *  밝혀야 합니다. */
export function useGangneungSpots(pageName: string) {
  const spots = useResource<RowsResult>(SPOTS_QUERY);

  useEffect(() => {
    if (spots.error)
      console.warn(
        "[%s] 장소 카탈로그 조회 실패 · path=%s · %s · 지점명은 예시 상수로 표시합니다.",
        pageName,
        SPOTS_QUERY,
        spots.error,
      );
  }, [spots.error, pageName]);

  const rows = spots.data?.rows ?? [];
  const resolve = (match: string, fallbackName: string): ResolvedSpot => {
    const row = rows.find(
      (item) => typeof item.name === "string" && item.name.includes(match),
    );
    return {
      name: typeof row?.name === "string" ? row.name : fallbackName,
      address: typeof row?.address === "string" ? row.address : null,
      region: typeof row?.region === "string" ? row.region : null,
      verification:
        typeof row?.catalog_verification === "string"
          ? row.catalog_verification
          : null,
      linked: row !== undefined,
    };
  };

  return {
    rows,
    resolve,
    loading: spots.loading,
    error: spots.error,
    /** 화면 하단 주석에 그대로 붙일 수 있는 연결 상태 문장. */
    statusText: spots.loading
      ? "장소 카탈로그를 불러오는 중입니다."
      : spots.error
        ? `장소 카탈로그를 불러오지 못했습니다(${spots.error}) — 지점명은 예시 상수입니다.`
        : `강릉 검색 결과 ${rows.length}건을 장소 카탈로그에서 읽었습니다.`,
  };
}
