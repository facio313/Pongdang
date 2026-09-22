import { t } from "./i18n.ts";
import { useState } from "react";
import { kstDate, timeLabel, type Place } from "./productData";
import {
  exclusionReasonsText,
  kakaoRouteLink,
  originFromPlace,
  travelJson,
  type RecommendationResult,
  type RouteResult,
  type TripPlan,
} from "./travelApi";
import { setTravelSession, useTravelSession } from "./travelSession";
import type { useAction } from "./useAction";

/** 지도 코스의 방문 순서 최적화 + 저장. 데스크탑(MapDesktop.tsx)과 모바일
 *  (MapPage.tsx)이 같은 서버 계약(travel/recommendations →
 *  travel/routes/recommend)을 쓰므로 두 화면이 이 훅 하나를 공유합니다 --
 *  예전에는 두 파일에 거의 같은 코드가 복붙되어 있었고, 그래서 한쪽에만
 *  기능(출발지 선택)이 반영되는 일이 생겼습니다.
 *
 *  candidateRows 는 출발지로 고를 수 있는, 좌표가 있는 등록 장소 목록입니다
 *  (예: mappablePlaces 로 거른 결과). 고르지 않았으면 첫 번째 장소가
 *  기본값입니다 -- 출발지 선택 UI가 없던 예전 모바일과 같은 동작입니다.
 *
 *  action 은 호출부가 만든 useAction() 인스턴스를 그대로 받습니다 -- 모바일
 *  에서는 「코스에 넣기」·「즐겨찾기」와 같은 액션 상태(action.busy)를 공유해야
 *  전체 시트가 함께 비활성화되므로, 훅이 따로 만들지 않습니다. */
export function useCourseRouteOptimization(
  candidateRows: Place[],
  courseSpotIds: number[],
  coursePlaceRows: Place[],
  action: ReturnType<typeof useAction>,
) {
  const session = useTravelSession();
  const [originId, setOriginId] = useState<number | null>(null);
  const selectedOrigin =
    candidateRows.find((place) => place.id === originId) ?? candidateRows[0];

  // 후보지 정차지 집합을 실제 출발지·시각으로 순열 탐색해 방문 순서를
  // 최적화합니다(추천 화면의 경로 계산과 같은 서버 로직). 이미 사용자가 고른
  // 출발지·시각으로 계산해 둔 경로가 있으면(session.route.route_calculated)
  // 다시 계산해 덮어쓰지 않고 그대로 씁니다.
  const optimizeCourseRoute = async (signal: AbortSignal) => {
    const stops = session.planInput?.stops ?? [];
    if (!session.planInput || !stops.length)
      throw new Error(
        "경로를 계산할 방문 장소가 없습니다. 추천에서 코스를 만들거나 저장한 코스를 열어 주세요.",
      );
    if (session.route?.route_calculated)
      return session.route.plan_input ?? session.planInput;
    const originPlace = selectedOrigin;
    if (!originPlace)
      throw new Error(t("출발지로 쓸 좌표가 있는 등록 장소가 없습니다."));
    // 지도 코스는 명시적으로 고른 필수 방문 집합이므로, 모든 정차지가
    // 필수이고 방문 수는 정차지 수와 같습니다.
    const must_include = stops.map((item) => item.spot_id);
    const catalogIds = new Set(must_include);
    const origin = originFromPlace(originPlace, catalogIds)!;
    const departure = new Date(Date.now() + 600000).toISOString();
    const request = {
      ...session.planInput.request,
      dates: [kstDate(departure)],
      day_trip: true,
      departure_time: timeLabel(departure),
      origin,
      must_include,
    };
    const recommendations = await travelJson<RecommendationResult>(
      import.meta.env.BASE_URL,
      "travel/recommendations",
      "POST",
      { request, limit: 5 },
      signal,
    );
    const ranks = recommendations.recommendations
      .filter((item) => must_include.includes(item.spot_id))
      .map((item) => item.rank);
    if (ranks.length !== must_include.length || !recommendations.selection_token)
      throw new Error(
        t("선택 장소 {count}곳 중 {count2}곳만 현재 조건에서 경로 후보로 확인했습니다. ", { count: must_include.length, count2: ranks.length }) +
          (exclusionReasonsText(recommendations.excluded, must_include) ||
            t("후보를 다시 선택해 주세요.")),
      );
    const result = await travelJson<RouteResult>(
      import.meta.env.BASE_URL,
      "travel/routes/recommend",
      "POST",
      {
        selection_token: recommendations.selection_token,
        candidate_ranks: ranks,
        stop_count: ranks.length,
        stay_minutes: 60,
        include_geometry: true,
        request,
      },
      signal,
    );
    if (signal.aborted) return session.planInput;
    setTravelSession({
      recommendation: recommendations,
      route: result,
      ...(result.plan_input
        ? { planInput: result.plan_input, plan: null }
        : {}),
    });
    return result.plan_input ?? session.planInput;
  };

  // 「코스 생성」은 폼 없이 경로 최적화(필요할 때만) + 저장을 한 번에 합니다.
  const createCourse = (
    onSaved: (plan: TripPlan) => void,
  ) =>
    void action.run(async (signal) => {
      const planInput = await optimizeCourseRoute(signal);
      if (signal.aborted) return;
      const plan = await travelJson<TripPlan>(
        import.meta.env.BASE_URL,
        "travel/plans",
        "POST",
        planInput,
        signal,
      );
      if (!signal.aborted) {
        setTravelSession({ plan });
        onSaved(plan);
      }
    });

  // 이미 저장된 코스도 정차지 구성은 그대로 두고 방문 순서 최적화와 이동시간을
  // 다시 계산해 저장할 수 있어야 합니다.
  const recalculateCourse = () =>
    void action.run(async (signal) => {
      if (!session.plan?.plan_id)
        throw new Error("다시 계산할 저장된 코스가 없습니다.");
      const planInput = await optimizeCourseRoute(signal);
      if (signal.aborted) return;
      const plan = await travelJson<TripPlan>(
        import.meta.env.BASE_URL,
        `travel/plans/${session.plan.plan_id}`,
        "PUT",
        { ...planInput, expected_revision: session.plan.revision },
        signal,
      );
      if (!signal.aborted) setTravelSession({ plan });
    });

  // 아직 경로를 계산하지 않은 후보지도, 고른 출발지 + 목록 순서 그대로
  // 카카오맵 길찾기를 열 수 있어야 합니다(계산은 방문 순서 최적화일 뿐,
  // 길찾기 자체는 순서만 있으면 됩니다).
  const candidateTrip = selectedOrigin
    ? kakaoRouteLink(
        { latitude: selectedOrigin.lat, longitude: selectedOrigin.lng },
        courseSpotIds.map((id) => {
          const place = coursePlaceRows.find((row) => row.id === id);
          return { latitude: place?.lat ?? null, longitude: place?.lng ?? null };
        }),
      )
    : null;

  return {
    originId,
    setOriginId,
    selectedOrigin,
    createCourse,
    recalculateCourse,
    candidateTrip,
  };
}
