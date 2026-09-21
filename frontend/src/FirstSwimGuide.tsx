import { useEffect, useRef } from "react";
import { displayTime } from "./aiApi";
import { t } from "./i18n";
import { NotificationSummary } from "./NotificationSummary";
import { Icon } from "./pongdangUi";
import { useFirstSwimTemperature } from "./useFirstSwimTemperature";
import "./firstSwimGuide.css";

export function FirstSwimPreview({ spotId }: { spotId: number }) {
  const temperature = useFirstSwimTemperature(spotId);
  const text = typeof temperature.value === "number"
    ? `${temperature.value}°C`
    : temperature.state === "loading" ? t("수온 조회 중")
    : temperature.state === "error" ? t("수온 조회 실패")
    : temperature.state === "stale" ? t("수온 갱신 대기")
    : t("수온 미확인");
  return <span className="first-swim-preview" title={t("관측 수온")}>{text}</span>;
}

function FirstSwimObservation({ spotId }: { spotId: number }) {
  const { state, reason, value, observation, station, error } = useFirstSwimTemperature(spotId);
  return <div className="first-swim-observation">
    {state === "loading" ? <p role="status">{t("수온 조회 중")}</p>
      : state === "error" ? <p role="alert">{error}</p>
      : <>
        <p>{typeof value === "number"
          ? <strong>{t("관측 수온")} {value}°C</strong>
          : t(reason)}</p>
        {observation && station && <dl className="first-swim-explanation">
          <div><dt>{t("관측 출처")}</dt><dd>{observation.provider} · {station.name ?? station.source_id}{station.relation === "representative_station" && <> · {t("대표 관측소 자료")}</>}</dd></div>
          <div><dt>{t("관측 시각")}</dt><dd>{displayTime(observation.observed_at)}</dd></div>
          <div><dt>{t("수온 유효 시각")}</dt><dd>{displayTime(observation.valid_until)}</dd></div>
        </dl>}
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
