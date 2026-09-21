import { displayTime } from "./aiApi";
import { t } from "./i18n";
import { kstDate } from "./productData";
import { NotificationEvidence } from "./NotificationEvidence";
import { notificationConditionLabel, notificationDeliveryLabel, type NotificationSubscription, type NotificationEvent, type NotificationEvaluation, type NotificationPage } from "./notificationApi";
import { useNotificationResource } from "./useNotificationResource";
import "./notifications.css";

export function NotificationSummary({ spotId, appearance }: { spotId?: number; appearance?: "mobile" | "desktop" }) {
  const subscriptions = useNotificationResource<NotificationPage<NotificationSubscription>>(spotId ? `notifications/subscriptions?limit=1&offset=0&spot_id=${spotId}&year=${kstDate().slice(0, 4)}` : null);
  const subscription = subscriptions.data?.rows[0];
  const events = useNotificationResource<NotificationPage<NotificationEvent>>(subscription ? `notifications/events?limit=1&offset=0&subscription_id=${encodeURIComponent(subscription.id)}` : null);
  const evaluations = useNotificationResource<NotificationPage<NotificationEvaluation>>(subscription ? `notifications/subscriptions/${encodeURIComponent(subscription.id)}/evaluations?limit=1&offset=0` : null);
  const event = events.data?.rows[0];
  const evaluation = evaluations.data?.rows[0];
  const currentEvaluation = evaluation?.subscription_revision === subscription?.revision ? evaluation : undefined;
  const refresh = () => { subscriptions.refresh(); events.refresh(); evaluations.refresh(); };
  return <div className="notification-summary">
    {!spotId && <p>{t("장소를 선택하면 수온 알림을 확인합니다.")}</p>}
    {subscriptions.loading && <p role="status">{t("알림 구독을 조회하고 있습니다.")}</p>}
    {subscriptions.error && <p role="alert">{subscriptions.error}</p>}
    {subscriptions.data && !subscription && <p>{t("이 장소의 올해 알림 구독이 없습니다.")}</p>}
    {subscription && <>
      <strong>{notificationConditionLabel(subscription)}</strong>
      <p>{t("선호 수온 {temperature}°C", { temperature: subscription.minimum_temperature_c })} · {t("최근 평가")} {displayTime(subscription.last_evaluated_at)}</p>
      {currentEvaluation && <NotificationEvidence evidence={currentEvaluation.evidence} />}
      {evaluations.error && <p role="alert">{evaluations.error}</p>}
      {events.error && <p role="alert">{events.error}</p>}
      {event && <p>{t("최근 알림")} · {notificationDeliveryLabel(event.delivery_state)} · {displayTime(event.created_at)}{event.subscription_revision !== subscription.revision && <> · {t("이전 설정의 알림")}</>}</p>}
      {events.data && !event && <p>{t("아직 발생한 알림이 없습니다.")}</p>}
    </>}
    <div className="notification-summary-actions">
      <button type="button" className={appearance === "desktop" ? "pd-dk-button is-quiet" : appearance === "mobile" ? "pd-secondary" : undefined} onClick={refresh} disabled={!spotId || subscriptions.loading}>{t("상태 다시 확인")}</button>
      <a className={appearance === "desktop" ? "pd-dk-button" : appearance === "mobile" ? "pd-primary" : undefined} href="#first-swim">{t("알림 설정·이력 보기 →")}</a>
    </div>
    <p className={appearance === "desktop" ? "sk-note" : "pd-note"}>{t("수온 기준 충족은 입수 안전 판정이 아닙니다.")}</p>
  </div>;
}
