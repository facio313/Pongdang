import { useResource } from "./useResource";
import type { TripPlan } from "./travelApi";
import { suppressLoginRequired } from "./authError";

export interface PlanWithAlarm {
  plan: TripPlan;
  /** 이 코스의 동행 세션이 켜져 있는지. 조회 중·실패는 이 값이 아니라
   *  `sessions.loading`/`sessions.error`로 구분합니다. */
  alarm: boolean;
}

/** 저장한 코스(travel/plans)에 동행 알림 상태(travel/sessions)를 결합합니다.
 *  MyCoursesPage.tsx/CoursesDesktop.tsx 가 각각 따로 두던 매핑 로직(plan_id
 *  일치 && state === "active" && notifications.enabled)을 한 곳으로 모읍니다
 *  -- 조건 세 개짜리 매핑이라 손으로 두 번 옮기면 어긋나기 쉽습니다. */
export function useMyPlansWithAlarm() {
  const myPlansResource = useResource<{ rows: TripPlan[] }>(
    "travel/plans?limit=100&offset=0",
  );
  const sessionsResource = useResource<{
    rows: {
      plan_id: string;
      state: string;
      notifications: { enabled: boolean };
    }[];
  }>("travel/sessions?limit=100&offset=0");
  // 저장 코스 · 동행 세션 둘 다 개인정보라 익명 방문자는 로그인 필요를
  // 받습니다. 그건 실패가 아니라 「저장한 코스 없음」과 같은 사실이므로,
  // 코스 뷰를 열자마자 알림으로 띄우지 않고 빈 목록으로 다룹니다.
  const myPlans = suppressLoginRequired(myPlansResource);
  const sessions = suppressLoginRequired(sessionsResource);
  const plans: PlanWithAlarm[] = (myPlans.data?.rows ?? []).map((plan) => ({
    plan,
    alarm:
      sessions.data?.rows.some(
        (session) =>
          session.plan_id === plan.plan_id &&
          session.state === "active" &&
          session.notifications.enabled,
      ) ?? false,
  }));
  return { myPlans, sessions, plans };
}
