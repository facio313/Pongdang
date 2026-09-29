import { displayTime } from "./aiApi";
import { isLoginRequiredMessage } from "./authError";
import { t } from "./i18n";
import { useRequireLogin } from "./loginPopoverState";
import { kstDate } from "./productData";
import { NotificationEvidence } from "./NotificationEvidence";
import { notificationConditionLabel, notificationDeliveryLabel, type NotificationSubscription, type NotificationEvent, type NotificationEvaluation, type NotificationPage } from "./notificationApi";
import { useNotificationResource } from "./useNotificationResource";
import "./notifications.css";

export function NotificationSummary({ spotId, appearance, loginPrompt = true, showDisclaimer = true }: { spotId?: number; appearance?: "mobile" | "desktop"; loginPrompt?: boolean; showDisclaimer?: boolean }) {
  const requireLogin = useRequireLogin();
  const subscriptions = useNotificationResource<NotificationPage<NotificationSubscription>>(spotId ? `notifications/subscriptions?limit=1&offset=0&spot_id=${spotId}&year=${kstDate().slice(0, 4)}` : null);
  const subscription = subscriptions.data?.rows[0];
  const events = useNotificationResource<NotificationPage<NotificationEvent>>(subscription ? `notifications/events?limit=1&offset=0&subscription_id=${encodeURIComponent(subscription.id)}` : null);
  const evaluations = useNotificationResource<NotificationPage<NotificationEvaluation>>(subscription ? `notifications/subscriptions/${encodeURIComponent(subscription.id)}/evaluations?limit=1&offset=0` : null);
  const event = events.data?.rows[0];
  const evaluation = evaluations.data?.rows[0];
  const currentEvaluation = evaluation?.subscription_revision === subscription?.revision ? evaluation : undefined;
  const refresh = () => { subscriptions.refresh(); events.refresh(); evaluations.refresh(); };
  const needsLogin = loginPrompt && [subscriptions.error, events.error, evaluations.error].some(error =>
    isLoginRequiredMessage(error),
  );
  const loginUnconfigured = loginPrompt && subscriptions.error === t("Pongdang의 SSO 로그인 연동이 설정되지 않았습니다. 운영자의 로그인 연동 설정이 필요합니다.");
  if (needsLogin) return <div className="notification-summary">
    <p role="status">{t("기존 SSO 로그인이 필요합니다.")}</p>
    <div className="notification-summary-actions">
      <button type="button" className={appearance === "desktop" ? "pd-dk-button" : "pd-primary"} onClick={() => requireLogin()}>{t("로그인")}</button>
    </div>
  </div>;
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
      {loginUnconfigured && <button type="button" className={appearance === "desktop" ? "pd-dk-button" : "pd-primary"} onClick={() => requireLogin()}>{t("로그인")}</button>}
      <button type="button" className={appearance === "desktop" ? "pd-dk-button is-quiet" : appearance === "mobile" ? "pd-secondary" : undefined} onClick={refresh} disabled={!spotId || subscriptions.loading}>{t("상태 다시 확인")}</button>
      <a className={appearance === "desktop" ? "pd-dk-button is-quiet" : appearance === "mobile" ? "pd-secondary" : undefined} href="#first-swim">{t("알림 설정·이력 보기 →")}</a>
    </div>
    {showDisclaimer && <p className={appearance === "desktop" ? "sk-note" : "pd-note"}>{t("수온 기준 충족은 입수 안전 판정이 아닙니다.")}</p>}
  </div>;
}
