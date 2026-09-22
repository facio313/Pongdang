import { useSyncExternalStore } from "react";
import type {
  PlanInput,
  RecommendationResult,
  RouteResult,
  TripPlan,
} from "./travelApi";
interface TravelSession {
  recommendation: RecommendationResult | null;
  planInput: PlanInput | null;
  plan: TripPlan | null;
  route: RouteResult | null;
}
let state: TravelSession = {
  recommendation: null,
  planInput: null,
  plan: null,
  route: null,
};
const listeners = new Set<() => void>();
export function setTravelSession(update: Partial<TravelSession>) {
  state = { ...state, ...update };
  listeners.forEach((listener) => listener());
}

/** Load a saved plan without discarding a route just calculated for that plan. */
export function adoptSavedPlan(plan: TripPlan) {
  if (state.route?.route_calculated && state.plan?.plan_id === plan.plan_id) return;
  setTravelSession({
    plan,
    planInput: { request: plan.request, stops: plan.input_stops },
    recommendation: null,
    route: null,
  });
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
// Ephemeral unsaved work survives tab navigation; private data is never persisted in browser storage.
export function useTravelSession() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
