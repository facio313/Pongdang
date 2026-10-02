import { useState } from "react";
import { t } from "./i18n";
import { LATEST_FAVORITE_PLAN_PATH, travelJson, type TripPlan } from "./travelApi";
import { useAction } from "./useAction";
import { forgetResource } from "./useResource";
import "./courseFavorite.css";

export function CourseFavoriteButton({ plan, disabled = false }: { plan: TripPlan; disabled?: boolean }) {
  const action = useAction();
  // Show the acknowledged write immediately; a fresh list response takes over.
  const [saved, setSaved] = useState<{ source: TripPlan; value: boolean }>();
  const favorite = saved?.source === plan ? saved.value : !!plan.is_favorite;
  const toggle = () => void action.run(async (signal) => {
    if (!plan.plan_id) return;
    const updated = await travelJson<TripPlan>(
      import.meta.env.BASE_URL, `travel/plans/${plan.plan_id}/favorite`, "PUT",
      { is_favorite: !favorite }, signal,
    );
    if (signal.aborted) return;
    setSaved({ source: plan, value: !!updated.is_favorite });
    forgetResource("travel/plans?limit=100&offset=0");
    forgetResource(LATEST_FAVORITE_PLAN_PATH);
    forgetResource(`travel/plans/${plan.plan_id}`);
  });
  return <>
    <button
      type="button"
      className="course-favorite-button"
      aria-label={t("코스 즐겨찾기")}
      aria-pressed={favorite}
      title={t(favorite ? "즐겨찾기 해제" : "즐겨찾기 추가")}
      disabled={disabled || action.busy || !plan.plan_id}
      onClick={toggle}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.34l-5.63 2.96 1.08-6.27L2.9 9.6l6.3-.9L12 3Z" />
      </svg>
    </button>
    {action.error && <p className="course-favorite-error" role="alert">{action.error}</p>}
  </>;
}
