import { t } from "./i18n.ts";
import { useState } from "react";
import { kstDate, timeLabel, type Place } from "./productData";
import {
  LATEST_FAVORITE_PLAN_PATH,
  exclusionReasonsText,
  kakaoRouteLink,
  originFromPlace,
  routeReasonsText,
  travelJson,
  selectedTransport,
  withTransport,
  type PlanInput,
  type RecommendationResult,
  type RouteResult,
  type TripPlan,
  type TransportMode,
} from "./travelApi";
import { setTravelSession, useTravelSession } from "./travelSession";
import { forgetResource } from "./useResource";
import type { useAction } from "./useAction";
import { courseCandidateRanks } from "./courseEditing";

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
  editing?: { input: PlanInput | null; changed: boolean },
) {
  const session = useTravelSession();
  const [transportChoice, setTransportChoice] = useState<{
    source: typeof session.planInput;
    mode: TransportMode;
  } | null>(null);
  const transport = transportChoice?.source === session.planInput
    ? transportChoice.mode : selectedTransport(session.planInput?.request);
  const setTransport = (mode: TransportMode) => setTransportChoice({ source: session.planInput, mode });
  const [originId, setOriginId] = useState<number | null>(null);
  const savedOrigin = session.route?.route?.origin ?? session.planInput?.request.origin;
  const selectedOrigin =
    editing ? coursePlaceRows.find((place) => place.id === editing.input?.stops[0]?.spot_id)
    : candidateRows.find((place) => place.id === originId)
    ?? candidateRows.find((place) => savedOrigin?.latitude === place.lat && savedOrigin?.longitude === place.lng)
    ?? candidateRows.find((place) => savedOrigin?.spot_id === place.id)
    ?? candidateRows[0];

  // 편집 목록은 체크한 첫 장소에서 출발하며 사용자가 정한 순서를 유지합니다.
  // 편집 목록이 없는 모바일 화면은 기존의 방문 순서 최적화를 사용합니다.
  const optimizeCourseRoute = async (signal: AbortSignal, recalculate = false) => {
    const input = editing ? editing.input : session.planInput;
    const stops = input?.stops ?? [];
    if (!input || !stops.length)
      throw new Error(
        "경로를 계산할 방문 장소가 없습니다. 추천에서 코스를 만들거나 저장한 코스를 열어 주세요.",
      );
    if (stops.length > 5) throw new Error(t("경로 후보는 최대 5곳입니다. 추천에서 코스를 다시 골라 주세요."));
    if (session.route?.route_calculated && !recalculate && !editing?.changed
      && selectedTransport(session.route.plan_input?.request) === transport)
      return { input: session.route.plan_input ?? input, route: session.route, recommendation: session.recommendation };
    const originPlace = selectedOrigin;
    if (!originPlace)
      throw new Error(t("출발지로 쓸 좌표가 있는 등록 장소가 없습니다."));
    // 지도 코스는 명시적으로 고른 필수 방문 집합이므로, 모든 정차지가
    // 필수이고 방문 수는 정차지 수와 같습니다.
    const must_include = stops.map((item) => item.spot_id);
    const catalogIds = new Set(must_include);
    const origin = originFromPlace(originPlace, catalogIds);
    if (!origin) throw new Error(t("출발지로 쓸 좌표가 있는 등록 장소가 없습니다."));
    const departure = new Date(Date.now() + 600000).toISOString();
    const request = {
      ...withTransport(input.request, transport),
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
    const ranks = courseCandidateRanks(recommendations, must_include);
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
        preserve_order: Boolean(editing),
        request,
      },
      signal,
    );
    if (!result.route_calculated || !result.route || !result.plan_input) {
      throw new Error(t("경로 미계산: {reason}", {
        reason: routeReasonsText(result.reason_codes) || t("경로 계산 조건을 확인해 주세요."),
      }));
    }
    return { input: result.plan_input, route: result, recommendation: recommendations };
  };

  // 「코스 생성」은 폼 없이 경로 최적화(필요할 때만) + 저장을 한 번에 합니다.
  const createCourse = (
    onSaved: (plan: TripPlan) => void,
  ) =>
    void action.run(async (signal) => {
      const calculated = await optimizeCourseRoute(signal);
      if (signal.aborted) return;
      const plan = await travelJson<TripPlan>(
        import.meta.env.BASE_URL,
        "travel/plans",
        "POST",
        calculated.input,
        signal,
      );
      if (!signal.aborted) {
        setTravelSession({ plan, planInput: calculated.input, route: calculated.route, recommendation: calculated.recommendation });
        forgetResource("travel/plans?limit=100&offset=0");
        onSaved(plan);
      }
    });

  // 계산과 저장이 모두 성공한 뒤에만 현재 코스와 목록을 갱신합니다.
  const recalculateCourse = () =>
    void action.run(async (signal) => {
      if (!session.plan?.plan_id)
        throw new Error("다시 계산할 저장된 코스가 없습니다.");
      const calculated = await optimizeCourseRoute(signal, true);
      if (signal.aborted) return;
      const plan = await travelJson<TripPlan>(
        import.meta.env.BASE_URL,
        `travel/plans/${session.plan.plan_id}`,
        "PUT",
        { ...calculated.input, expected_revision: session.plan.revision },
        signal,
      );
      if (!signal.aborted) {
        setTravelSession({ plan, planInput: calculated.input, route: calculated.route, recommendation: calculated.recommendation });
        forgetResource("travel/plans?limit=100&offset=0");
        forgetResource(`travel/plans/${plan.plan_id}`);
        forgetResource(LATEST_FAVORITE_PLAN_PATH);
      }
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
        transport,
      )
    : null;

  return {
    originId,
    transport,
    setTransport,
    setOriginId,
    selectedOrigin,
    createCourse,
    recalculateCourse,
    candidateTrip,
  };
}
