import { useState } from "react";
import {
  recommendationPlan,
  travelJson,
  TravelRequestError,
  type RecommendationResult,
  type RouteResult,
  type TravelChatResponse,
  type TravelRequest,
} from "./travelApi";
import type { OriginOption, RouteRequestValue } from "./RouteRequestForm";
import { setTravelSession, useTravelSession } from "./travelSession";
import { useResource } from "./useResource";
import type { DefaultPlaceSelection } from "./useProductData";
import type { ModelTraceTurn } from "./aiApi";
import { requestInLanguage, useTravelLanguage } from "./travelLanguage";
import { t } from "./i18n.ts";
import { placeRegionLabel } from "./productData";
import { setTravelRegion } from "./travelRegion";

export interface Bubble {
  role: "user" | "assistant";
  content: string;
}

/** Route conditions a conversation cannot express; the form has to supply them. */
const NEEDS_FORM = [
  "route_origin_and_departure_required",
  "origin_coordinates_required",
  "route_date_required",
  "route_departure_in_past",
];

/** What the route form offers: the server's own candidates, plus the
 *  collection's default place as somewhere to start from. Only places with
 *  stored coordinates can become an origin. */
export function useRouteFormSources() {
  const session = useTravelSession();
  const recommendations = session.recommendation?.recommendations ?? [];
  const defaultPlace = useResource<DefaultPlaceSelection>(
    recommendations.length ? "water-index/default-place" : null,
  );
  const listed = new Set(recommendations.map((item) => item.name));
  const originOptions: OriginOption[] = [
    ...recommendations.map((item) => ({
      id: item.spot_id,
      name: item.name,
      region: placeRegionLabel(item, ""),
      lat: item.confirmed.latitude,
      lng: item.confirmed.longitude,
    })),
    ...(defaultPlace.data?.rows ?? [])
      .filter((row) => !listed.has(row.name))
      .map((row) => ({
        id: row.id,
        name: row.name,
        region: placeRegionLabel(row, ""),
        lat: row.lat,
        lng: row.lng,
      })),
  ].filter(
    (option, index, all) =>
      all.findIndex((item) => item.id === option.id) === index,
  );
  return {
    originOptions,
    candidates: recommendations.map((item) => ({
      rank: item.rank,
      spot_id: item.spot_id,
      name: item.name,
      region: placeRegionLabel(item, ""),
    })),
  };
}

/** The conversation and the separate route request, shared by the mobile and
 *  desktop recommendation screens so both send the same contract.
 *
 *  The caller supplies its own `useAction`, keeping one request in flight per
 *  screen, and the form state to start from. */
export function useTravelConcierge({
  opener,
  baseRequest,
  action,
}: {
  opener: string;
  baseRequest: () => TravelRequest;
  action: { busy: boolean; run: (job: (signal: AbortSignal) => Promise<void>) => Promise<void> };
}) {
  const { locale } = useTravelLanguage();
  const session = useTravelSession();
  const [conversation, setBubbles] = useState<Bubble[]>([]);
  // A greeting follows the UI language until the first real turn. Once a
  // conversation starts, preserve its original text when languages change.
  const bubbles: Bubble[] = conversation.length
    ? conversation
    : [{ role: "assistant", content: t(opener) }];
  const [draft, setDraft] = useState("");
  const [chatRequest, setChatRequest] = useState<TravelRequest | null>(null);
  const [lastTrace, setLastTrace] = useState<ModelTraceTurn[] | null>(null);
  const asked = bubbles.filter((bubble) => bubble.role === "user").length;

  const publish = (result: RecommendationResult) => {
    if (result.request.region) setTravelRegion(result.request.region);
    setTravelSession({
      recommendation: result,
      plan: null,
      route: null,
      planInput: result.recommendations.length
        ? recommendationPlan(result, result.request.dates[0])
        : null,
    });
  };

  // keepTurn 이 여기 있었습니다. 화면이 들고 있던 고정 대본의 다음 질문을
  // 로컬에 미리 띄우는 함수였는데, 그 대본이 사라져 띄울 다음 질문이
  // 없습니다. 이제 되묻는 것은 서버뿐입니다(RecommendPage 의 OPENER).

  const send = (text: string) => {
    const message = text.trim();
    if (!message) return;
    // `action: "conversation"` lets the server decide from the message whether
    // this is a list request or the separate route request, as the contract
    // specifies. The client never makes that call for the user.
    const history = bubbles
      .filter((bubble) => bubble.content.trim())
      .slice(-8)
      .map((bubble) => ({
        role: bubble.role,
        content: bubble.content.slice(0, 2000),
      }));
    setBubbles((current) => [
      ...(current.length ? current : bubbles),
      { role: "user", content: message },
    ]);
    setDraft("");
    void action.run(async (signal) => {
      const request = requestInLanguage(chatRequest ?? baseRequest(), locale);
      // Provider place IDs differ by language. An old selection must not steer
      // a new-language search back to the previous catalogue.
      const token = (session.recommendation?.request.locale ?? "ko") === locale
        ? session.recommendation?.selection_token : undefined;
      const result = await travelJson<TravelChatResponse>(
        import.meta.env.BASE_URL,
        "ai/chat",
        "POST",
        {
          message,
          history,
          context: { region: request.region ?? "gangwon" },
          travel: {
            action: "conversation",
            request,
            ...(token ? { selection_token: token } : {}),
          },
        },
        signal,
      );
      if (signal.aborted) return;
      // The server's own request state becomes the next form state.
      const nextRequest = result.travel?.request ?? result.travel_results?.recommendations?.request ?? request;
      setChatRequest(nextRequest);
      if (nextRequest.region) setTravelRegion(nextRequest.region);
      setLastTrace(result.model_trace ?? []);
      setBubbles((current) => [
        ...current,
        ...[result.answer, result.clarification]
          .filter(
            (content, index, all): content is string =>
              Boolean(content?.trim()) && all.indexOf(content) === index,
          )
          .map((content) => ({ role: "assistant" as const, content })),
      ]);
      if (result.travel_results?.recommendations)
        publish(result.travel_results.recommendations);
      const route = result.travel_results?.route_recommendation;
      if (route) {
        setTravelSession({ route });
        // A conversation cannot supply an origin coordinate or a departure
        // clock, so point at the form that can instead of leaving the server's
        // reason codes as the last word.
        if (!route.route_calculated && route.reason_codes.some((code) => NEEDS_FORM.includes(code)))
          setBubbles((current) => [
            ...current,
            {
              role: "assistant",
              content:
                t("아래 「경로 계산 조건」에서 출발지와 출발 시각을 넣으면 방문 순서를 계산합니다. 현재 위치 또는 등록 장소를 출발지로 고를 수 있습니다."),
            },
          ]);
      }
    });
  };

  const requestRoute = (value: RouteRequestValue) =>
    void action.run(async (signal) => {
      const base = session.recommendation;
      if (!base?.selection_token)
        throw new Error(
          "경로를 계산할 추천 후보가 없습니다. 먼저 추천을 받아 주세요.",
        );
      const chosen = value.candidate_ranks
        .map(
          (rank) =>
            base.recommendations.find((item) => item.rank === rank)?.spot_id,
        )
        .filter((id): id is number => typeof id === "number");
      const request: TravelRequest = {
        ...base.request,
        dates: [value.date],
        day_trip: true,
        origin: value.origin,
        departure_time: value.departure_time,
      };
      const call = (selection_token: string, candidate_ranks: number[]) =>
        travelJson<RouteResult>(
          import.meta.env.BASE_URL,
          "travel/routes/recommend",
          "POST",
          {
            selection_token,
            candidate_ranks,
            stop_count: Math.min(value.stop_count, candidate_ranks.length),
            stay_minutes: value.stay_minutes,
            include_geometry: true,
            request,
          },
          signal,
        );
      let result: RouteResult;
      try {
        result = await call(base.selection_token, value.candidate_ranks);
      } catch (error) {
        // A selection expires 30 minutes after the list was issued. Re-read the
        // same places instead of making the user start the flow again.
        if (!(error instanceof TravelRequestError) || error.status !== 410)
          throw error;
        const fresh = await travelJson<RecommendationResult>(
          import.meta.env.BASE_URL,
          "travel/recommendations",
          "POST",
          { request: { ...request, must_include: chosen }, limit: 5 },
          signal,
        );
        const ranks = fresh.recommendations
          .filter((item) => chosen.includes(item.spot_id))
          .map((item) => item.rank);
        if (!fresh.selection_token || ranks.length !== chosen.length)
          throw new Error(
            "추천이 만료된 뒤 같은 장소를 현재 조건에서 다시 확인하지 못했습니다. 추천을 다시 받아 주세요.",
            { cause: error },
          );
        publish(fresh);
        result = await call(fresh.selection_token, ranks);
      }
      if (signal.aborted) return;
      setTravelSession({
        route: result,
        ...(result.plan_input
          ? { planInput: result.plan_input, plan: null }
          : {}),
      });
    });

  const reset = () => {
    setBubbles([]);
    setDraft("");
    setChatRequest(null);
    setLastTrace(null);
  };

  const changeRegion = (region: string) => {
    setChatRequest((current) => current ? { ...current, region } : null);
    // A new region needs a new candidate selection/token. This only clears
    // the local preview; a saved course remains unchanged on the server.
    setTravelSession({ recommendation: null, plan: null, planInput: null, route: null });
  };

  return {
    session,
    bubbles,
    asked,
    draft,
    setDraft,
    chatRequest,
    changeRegion,
    lastTrace,
    publish,
    send,
    requestRoute,
    reset,
  };
}
