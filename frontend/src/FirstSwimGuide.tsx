import { useEffect, useRef } from "react";
import { displayTime } from "./aiApi";
import { t } from "./i18n";
import { distanceLabel } from "./placeDistance";
import { NotificationSummary } from "./NotificationSummary";
import { Icon } from "./pongdangUi";
import { useFirstSwimTemperature } from "./useFirstSwimTemperature";
import type { TemperatureReading } from "./firstSwimTemperature";
import "./firstSwimGuide.css";

export function FirstSwimPreview({ reading }: { reading: TemperatureReading }) {
  const label = t("수온");
  return <span className="first-swim-preview" title={`${label} · ${reading.stationName} · ${distanceLabel(reading.distanceKm)} · ${displayTime(reading.observedAt)}`}>
    <span>{label} {reading.value}°C</span>
  </span>;
}

function FirstSwimObservation({ spotId }: { spotId: number }) {
  const { state, reason, reading, error } = useFirstSwimTemperature(spotId);
  return <div className="first-swim-observation">
    {state === "loading" ? <p role="status">{t("수온 조회 중")}</p>
      : state === "error" ? <p role="alert">{error}</p>
      : <>
        <p>{reading
          ? <strong>{t(reading.relation === "station_observation_point" ? "수온" : "주변 수온")} {reading.value}°C</strong>
          : t(reason)}</p>
        {state === "stale" && <p role="status">{t("이전 관측")}</p>}
        {reading && <dl className="first-swim-explanation">
          <div><dt>{t("관측소")}</dt><dd>{reading.stationName}{reading.relation === "representative_station" && <> · {t("대표 관측소 자료")}</>}</dd></div>
          <div><dt>{t("장소에서 거리")}</dt><dd>{distanceLabel(reading.distanceKm)}{reading.distanceKm !== null && <> · {t("직선거리")}</>}</dd></div>
          <div><dt>{t("관측 시각")}</dt><dd>{displayTime(reading.observedAt)}</dd></div>
          <div><dt>{t("수온 유효 시각")}</dt><dd>{displayTime(reading.validUntil)}</dd></div>
          <div><dt>{t("관측 출처")}</dt><dd>{reading.provider}</dd></div>
          {reading.observationScope && <div><dt>{t("관측 범위")}</dt><dd>{reading.observationScope}</dd></div>}
        </dl>}
        {reading?.relation === "nearby_station_context" && <p className="first-swim-context-note">{t("주변 수온은 참고 자료이며, 이 장소의 첫 입수 알림 기준에는 사용하지 않습니다.")}</p>}
      </>}
  </div>;
}

export function FirstSwimGuide({ spotId, desktop = false }: { spotId: number; desktop?: boolean }) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
    if (query.get("section") === "first-swim") {
      section.current?.scrollIntoView({ block: "start" });
      section.current?.focus({ preventScroll: true });
    }
  }, [spotId]);

  return <section
    ref={section}
    id="first-swim-guide"
    className={`first-swim-guide ${desktop ? "is-desktop" : "pd-card"}`}
    aria-labelledby="first-swim-guide-title"
    tabIndex={-1}
  >
    <div className="first-swim-heading">
      <Icon name="swim" size={20} />
      <h2 id="first-swim-guide-title" className={desktop ? "pd-dk-row-title" : "pd-card-title"}>{t("첫 입수 안내")}</h2>
    </div>
    <p className="first-swim-intro">{t("이 장소의 수온이 내가 정한 기준에 닿으면 첫 입수 알림을 받을 수 있어요.")}</p>
    <FirstSwimObservation spotId={spotId} />
    <dl className="first-swim-explanation">
      <div><dt>{t("내 수온 기준")}</dt><dd>{t("원하는 수온을 직접 정하고, 이 장소의 관측 수온과 비교합니다.")}</dd></div>
      <div><dt>{t("알림이 생기는 때")}</dt><dd>{t("구독 후 유효한 관측 수온이 기준 이상인 것을 처음 확인하면 알림을 만듭니다.")}</dd></div>
      <div><dt>{t("자료가 부족할 때")}</dt><dd>{t("관측소 연결이 없거나 수온 자료가 오래되면 기준 충족 여부를 확인할 수 없습니다.")}</dd></div>
    </dl>
    <p className={desktop ? "sk-note" : "pd-note"}>{t("실제 입수 기록이나 올해 최초 입수 가능일을 뜻하지 않습니다.")}</p>
    <h3 className={desktop ? "pd-dk-kick" : "pd-card-title"}>{t("이 장소의 알림")}</h3>
    <NotificationSummary spotId={spotId} appearance={desktop ? "desktop" : "mobile"} />
  </section>;
}
