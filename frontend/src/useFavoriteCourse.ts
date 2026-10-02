import { isLoginRequiredMessage, suppressLoginRequired } from "./authError";
import { t } from "./i18n";
import { LATEST_FAVORITE_PLAN_PATH, planItems, type TripPlan } from "./travelApi";
import { useResource } from "./useResource";

export function useFavoriteCourse() {
  const response = useResource<{ rows: TripPlan[] }>(LATEST_FAVORITE_PLAN_PATH);
  const loginRequired = isLoginRequiredMessage(response.error);
  const resource = suppressLoginRequired(response);
  const plan = resource.data?.rows.find((row) => row.plan_id && row.is_favorite) ?? null;
  const route = plan?.route_snapshot?.route_calculated ? plan.route_snapshot.route : null;
  return {
    plan,
    route,
    items: route?.items ?? planItems(plan),
    href: plan?.plan_id
      ? `#map?view=course&plan_id=${encodeURIComponent(plan.plan_id)}`
      : "#map?view=course",
    loginRequired,
    error: resource.error,
    message: loginRequired
      ? t("로그인하면 즐겨찾기한 코스를 볼 수 있어요.")
      : resource.error ?? t(resource.loading
        ? "즐겨찾기 코스를 불러오는 중입니다."
        : "즐겨찾기한 코스가 없습니다. 지도에서 코스의 별표를 눌러 주세요."),
  };
}
