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
