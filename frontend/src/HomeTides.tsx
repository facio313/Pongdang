import { useEffect, useState } from "react";
import { t } from "./i18n";
import { formatValue, periodPath, tideTimeLabel, type TideResult } from "./productData";
import { isInitialLoad, useResource } from "./useResource";
import { settledWithoutPlace } from "./useProductData";
import { RESOURCE_REFRESH_INTERVAL } from "./resourceRefresh";
import "./homeTides.css";

/** Read a two-day horizon every 30 minutes; advance the displayed events each minute. */
export function HomeTides({ id, placeSettled }: { id?: number; placeSettled: boolean }) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const queryAt = new Date(Math.floor(Date.parse(now) / RESOURCE_REFRESH_INTERVAL) * RESOURCE_REFRESH_INTERVAL).toISOString();
  const tides = settledWithoutPlace(
    useResource<TideResult>(periodPath("tides/events", id, queryAt, 2)),
    placeSettled,
  );
  const loading = isInitialLoad(tides);
  const events = [...(tides.data?.rows ?? []), tides.data?.next_low, tides.data?.next_high]
    .filter((event) => event != null)
    .filter((event) => ["high", "low"].includes(event.kind) && event.state !== "stale" && Date.parse(event.event_at) >= Date.parse(now))
    .sort((a, b) => Date.parse(a.event_at) - Date.parse(b.event_at))
    .filter((event, index, rows) => rows.findIndex((row) => row.kind === event.kind) === index);
  return (
    <section className="pd-card pd-home-tides" aria-label={t("다음 간조·만조")}>
      <h2>{t("다음 간조·만조")}</h2>
      <p className="pd-home-tides-source">{t("국립해양조사원 공식 조석 예측")}</p>
      {events.length > 0 && (
        <ol className="pd-home-tides-events">
          {events.map((event) => (
            <li key={event.event_id}>
              <strong>{t(event.kind === "high" ? "만조" : "간조")}</strong>
              <time dateTime={event.event_at}>{tideTimeLabel(event.event_at)}</time>
              <span>{t("조위")} {formatValue(event.height, event.unit ?? "")}</span>
              <span className="pd-home-tides-station">
                {t("관측소")} {event.station_name}
                {typeof event.distance_km === "number" ? ` · ${event.distance_km.toFixed(1)}km` : ""}
                {event.spatial_relation === "nearby_station_context" && t(" · 해당 해변의 직접 예측이 아닙니다.")}
              </span>
            </li>
          ))}
        </ol>
      )}
      {tides.error ? <p role="alert">{tides.error}</p> : loading ? (
        <p role="status">{t("조석 조회 중")}</p>
      ) : !events.length ? (
        <p role="status">{t(id ? "연결된 다음 간조·만조 예측이 없습니다." : "장소 선택 필요")}</p>
      ) : events.length < 2 ? (
        <p role="status">{t("일부 물때만 수집되었습니다.")}</p>
      ) : null}
      <p className="pd-home-tides-source">{t("사건 시각만으로 현재 조류나 활동 적합 여부를 판단하지 않습니다.")}</p>
    </section>
  );
}
