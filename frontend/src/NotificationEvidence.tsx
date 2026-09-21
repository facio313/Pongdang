import { displayTime } from "./aiApi";
import { t } from "./i18n";
import { notificationReasonLabels, type NotificationEvidence as Evidence } from "./notificationApi";

export function NotificationEvidence({ evidence }: { evidence: Evidence }) {
  const reading = evidence.observation;
  const reasons = notificationReasonLabels(evidence);
  const normalized = evidence.temperature_normalization;
  return <div className="notification-evidence">
    {reading && <p>
      {t("관측 수온")} {normalized?.value ?? reading.numeric_value ?? "–"} {normalized ? "°C" : reading.unit} · {displayTime(reading.observed_at)}
      <br />{t("관측 출처")} {reading.provider} · {evidence.station_relationship?.source_id ?? "–"}
      {evidence.station_relationship?.relation === "representative_station" && <> · {t("대표 관측소 자료")}</>}
    </p>}
    {reasons.length > 0 && <ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
  </div>;
}
