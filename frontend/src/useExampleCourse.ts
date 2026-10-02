import { useMemo } from "react";
import { placeRegionLabel } from "./productData";
import { useHomeBeaches } from "./useHomeBeaches";

/** 처음 온 사람에게 보여 줄 **예시** 코스.
 *
 *  홈의 「고른 취향의 명소」와 「물놀이 최적경로」는 아직 아무것도 고르지 않은
 *  사람에게 빈 칸과 「추천에서 장소를 고르고…」 안내문만 보여 주었습니다. 그
 *  화면이 첫 화면이므로, 제품이 무엇을 만들어 주는지 한 번도 보여 주지 못한 채
 *  끝납니다.
 *
 *  **지어낸 코스가 아닙니다.** 수집된 해수욕장 목록에서 같은 시·군의 세 곳을
 *  고른 것이고, 점수·거리·소요 시간을 붙이지 않습니다 -- 예시에 숫자를 달면
 *  그 숫자가 계산된 것으로 읽힙니다. 조회도 새로 하지 않습니다: 바로 위
 *  「바다가 좋은 오늘」이 쓰는 `useHomeBeaches` 와 같은 결과를 나눠 씁니다.
 */
export function useExampleCourse() {
  const beaches = useHomeBeaches();
  const course = useMemo(() => {
    const rows = beaches.rows ?? [];
    if (rows.length < 2) return undefined;
    // 한 코스는 하루에 돌 수 있어야 하므로 같은 시·군으로 묶습니다. 지역이
    // 섞인 세 곳을 「반나절 코스」라고 부르면 그것이 거짓이 됩니다.
    const byRegion = new Map<string, typeof rows>();
    for (const place of rows) {
      // 「지역 미확인」으로 묶지 않습니다. 어디인지 모르는 세 곳을 한 코스로
      // 부르면 그 코스가 거짓입니다.
      const region = placeRegionLabel(place, "");
      if (!region) continue;
      byRegion.set(region, [...(byRegion.get(region) ?? []), place]);
    }
    const [region, places] =
      [...byRegion].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
    if (!region || !places || places.length < 2) return undefined;
    return { region, places: places.slice(0, 3) };
  }, [beaches.rows]);
  return { course, loading: beaches.loading, error: beaches.error };
}
