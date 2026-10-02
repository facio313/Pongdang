import { useSyncExternalStore } from "react";
import {
  isGuest,
  onGuestModeChange,
  readGuestCourse,
  writeGuestCourse,
} from "./guestStore";
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
/** 브라우저에 두는 것은 **작업 중 코스**뿐입니다.
 *
 *  추천 결과(`recommendation`)와 계산된 경로(`route`)는 서버 응답이고 시각이
 *  박혀 있어, 되살리면 옛 순간의 점수를 지금 것처럼 보여 줍니다. 코스는 고른
 *  장소 목록과 날짜라 그 문제가 없습니다. */
const PERSISTED = ["planInput", "plan"] as const;

function hydrate(): TravelSession {
  const empty: TravelSession = {
    recommendation: null,
    planInput: null,
    plan: null,
    route: null,
  };
  if (!isGuest()) return empty;
  const stored = readGuestCourse();
  if (stored === null || typeof stored !== "object") return empty;
  const source = stored as Partial<TravelSession>;
  return { ...empty, planInput: source.planInput ?? null, plan: source.plan ?? null };
}

let state: TravelSession = hydrate();
const listeners = new Set<() => void>();
export function setTravelSession(update: Partial<TravelSession>) {
  state = { ...state, ...update };
  if (isGuest())
    writeGuestCourse(
      Object.fromEntries(PERSISTED.map((key) => [key, state[key]])),
    );
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
// 작업 중인 것은 탭을 옮겨도 남습니다. 브라우저 저장소에 두는 것은
// **로그인하지 않은 사람의 작업 중 코스**뿐이고(guestStore 의 setGuestMode),
// 계정에 저장된 코스는 서버에만 있습니다.
export function useTravelSession() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

// 게스트 여부는 보호된 조회의 401 로 알게 되므로 첫 렌더보다 늦게 정해집니다.
// 정해지는 순간 저장해 둔 코스를 되읽습니다 -- 안 하면 새로 고친 게스트가
// 만들던 코스를 잃습니다. 렌더 중이 아니라 구독에서 하므로 React 가 상태를
// 밀어 넣는 것으로 보지 않습니다.
onGuestModeChange((guest) => {
  if (!guest) return;
  const restored = hydrate();
  if (restored.planInput || restored.plan) setTravelSession(restored);
});
