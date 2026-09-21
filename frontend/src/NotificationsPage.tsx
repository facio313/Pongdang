import { useState } from "react";
import { displayTime } from "./aiApi";
import { t } from "./i18n";
import { InlineLanguageSelector } from "./TravelLanguageSelector";
import { NotificationSettings } from "./NotificationSettings";
import { NotificationEvidence } from "./NotificationEvidence";
import { notificationConditionLabel, notificationDeliveryLabel, type NotificationSubscription, type NotificationEvent, type NotificationEvaluation, type NotificationPage } from "./notificationApi";
import { useNotificationResource } from "./useNotificationResource";
import { useAction } from "./useAction";
import { travelJson } from "./travelApi";
import "./notifications.css";

const PAGE_SIZE = 25;

function Pages({ offset, count, loading, onChange }: { offset: number; count: number; loading: boolean; onChange: (value: number) => void }) {
  return <div className="notification-pages">
    <button type="button" disabled={loading || offset === 0} onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}>{t("이전")}</button>
    <span>{t("{page}페이지", { page: offset / PAGE_SIZE + 1 })}</span>
    <button type="button" disabled={loading || count < PAGE_SIZE || offset + PAGE_SIZE > 10000} onClick={() => onChange(offset + PAGE_SIZE)}>{t("다음")}</button>
  </div>;
}

export function NotificationsPage() {
  const [revision, setRevision] = useState(0);
  const [offset, setOffset] = useState(0);
  const [eventOffset, setEventOffset] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState<NotificationSubscription | null>(null);
  const [message, setMessage] = useState("");
  const action = useAction();
  const subscriptions = useNotificationResource<NotificationPage<NotificationSubscription>>(`notifications/subscriptions?limit=${PAGE_SIZE}&offset=${offset}`, revision);
  const events = useNotificationResource<NotificationPage<NotificationEvent>>(`notifications/events?limit=${PAGE_SIZE}&offset=${eventOffset}${selectedId ? `&subscription_id=${encodeURIComponent(selectedId)}` : ""}`, revision);
  const evaluations = useNotificationResource<NotificationPage<NotificationEvaluation>>(selectedId ? `notifications/subscriptions/${encodeURIComponent(selectedId)}/evaluations?limit=1&offset=0` : null, revision);
  const rows = subscriptions.data?.rows ?? [];
  const selected = rows.find(row => row.id === selectedId);
  const evaluation = evaluations.data?.rows[0];
  const currentEvaluation = evaluation && selected && evaluation.subscription_revision === selected.revision ? evaluation : undefined;
  const refresh = () => setRevision(value => value + 1);
  const changed = () => { setEditing(null); refresh(); };
  return <article className="feature-page notifications-page">
    <InlineLanguageSelector />
    <a className="feature-back" href="#home">{t("← 퐁당 앱으로")}</a>
    <h1>{t("첫 입수 · 수온 알림")}</h1>
    <p>{t("구독한 장소의 실제 수온 관측과 알림 이력을 확인합니다. 수온 기준 충족은 입수 안전 판정이 아닙니다.")}</p>
    <section id="notification-settings" aria-label={t(editing ? "알림 구독 수정" : "새 알림 구독")}>
      <h2>{t(editing ? "알림 구독 수정" : "새 알림 구독")}</h2>
      <NotificationSettings key={editing ? `${editing.id}:${editing.revision}` : "new"} subscription={editing} onSaved={id => {
        if (editing) setMessage("알림 구독을 수정했습니다. 새 설정의 평가를 기다립니다.");
        setOffset(0); setEventOffset(0); setSelectedId(id); changed();
      }} onCancel={() => setEditing(null)} />
    </section>
    <section aria-label={t("내 알림 구독")}>
      <div className="notification-heading"><h2>{t("내 알림 구독")}</h2><button type="button" onClick={refresh} disabled={subscriptions.loading || action.busy}>{t("상태 다시 확인")}</button></div>
      {subscriptions.loading && <p role="status">{t("알림 구독을 조회하고 있습니다.")}</p>}
      {subscriptions.error && <p role="alert">{subscriptions.error}</p>}
      {subscriptions.data && rows.length === 0 && <p>{t("이 페이지에 저장된 알림 구독이 없습니다.")}</p>}
      {rows.length > 0 && <div className="table-scroll" tabIndex={0} role="region" aria-label={t("구독 목록 표")}><table>
        <thead><tr>{["장소", "연도", "선호 수온", "최근 평가", "수신 방식", "구독 관리"].map(label => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td>{row.spot_name ?? t("장소 ID {id}", { id: row.spot_id })}</td>
          <td>{row.year}</td><td>{row.minimum_temperature_c}°C</td>
          <td>{notificationConditionLabel(row)}<br /><small>{displayTime(row.last_evaluated_at)}</small></td>
          <td>{t(row.channel === "email" ? "이메일" : "앱 내 알림")}{row.channel === "email" && row.delivery_configuration !== "configured" && <p>{t("이메일 발송 설정 필요")}</p>}</td>
          <td><div className="notification-actions">
            <button type="button" onClick={() => { setSelectedId(row.id); setEventOffset(0); }}>{t("평가·알림 보기")}</button>
            <button type="button" disabled={action.busy} onClick={() => { setEditing(row); setMessage(""); document.getElementById("notification-settings")?.scrollIntoView({ block: "start" }); }}>{t("수정")}</button>
            <button type="button" disabled={!row.active || action.busy} onClick={() => {
              setMessage("");
              void action.run(async signal => {
                await travelJson(import.meta.env.BASE_URL, `notifications/subscriptions/${encodeURIComponent(row.id)}`, "DELETE", undefined, signal);
                if (!signal.aborted) { setMessage("알림 구독을 해지했습니다."); changed(); }
              });
            }}>{t("해지")}</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
      {action.error && <p role="alert">{action.error}</p>}
      {message && <p role="status">{t(message)}</p>}
      <Pages offset={offset} count={rows.length} loading={subscriptions.loading} onChange={value => { setOffset(value); setSelectedId(""); setEventOffset(0); }} />
    </section>
    {selectedId && <section aria-label={t("최근 평가 근거")}>
      <h2>{t("최근 평가 근거")}{selected && <> · {selected.spot_name ?? t("장소 ID {id}", { id: selected.spot_id })}</>}</h2>
      {evaluations.loading && <p role="status">{t("평가 근거를 조회하고 있습니다.")}</p>}
      {evaluations.error && <p role="alert">{evaluations.error}</p>}
      {currentEvaluation && <><p>{displayTime(currentEvaluation.evaluated_at)}</p><NotificationEvidence evidence={currentEvaluation.evidence} /></>}
      {evaluations.data && selected && !currentEvaluation && <p>{t("현재 구독 설정의 첫 평가를 기다리고 있습니다.")}</p>}
    </section>}
    <section aria-label={t("발생한 알림")}>
      <div className="notification-heading"><h2>{t("발생한 알림")}</h2>{selectedId && <button type="button" onClick={() => { setSelectedId(""); setEventOffset(0); }}>{t("전체 알림 보기")}</button>}</div>
      {events.loading && <p role="status">{t("발생한 알림을 조회하고 있습니다.")}</p>}
      {events.error && <p role="alert">{events.error}</p>}
      {events.data && events.data.rows.length === 0 && <p>{t("이 페이지에 발생한 알림이 없습니다. 구독의 평가 상태를 확인해 주세요.")}</p>}
      {(events.data?.rows.length ?? 0) > 0 && <div className="table-scroll" tabIndex={0} role="region" aria-label={t("이벤트 이력 표")}><table>
        <thead><tr>{["발생 시각", "장소", "알림 내용", "처리 상태", "근거"].map(label => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
        <tbody>{events.data?.rows.map(event => <tr key={event.id}>
          <td>{displayTime(event.created_at)}</td>
          <td>{rows.find(row => row.spot_id === event.evidence.spot_id)?.spot_name ?? t("장소 ID {id}", { id: event.evidence.spot_id ?? "–" })}</td>
          <td>{t("선호 수온 {temperature}°C 충족 알림", { temperature: event.evidence.minimum_temperature_c ?? "–" })}</td>
          <td>{notificationDeliveryLabel(event.delivery_state)}{event.state !== "active" && <p>{t(event.state === "superseded" ? "관측 또는 구독이 변경된 과거 알림" : "취소된 알림")}</p>}</td>
          <td><details><summary>{t("상세 근거")}</summary><NotificationEvidence evidence={event.evidence} /></details></td>
        </tr>)}</tbody>
      </table></div>}
      <Pages offset={eventOffset} count={events.data?.rows.length ?? 0} loading={events.loading} onChange={setEventOffset} />
      <p className="table-note">{t("메일 서비스 접수는 실제 수신 완료를 뜻하지 않습니다. 알림은 발생 당시의 관측 기록입니다.")}</p>
    </section>
  </article>;
}
