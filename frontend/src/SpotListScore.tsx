import { activities, displayTime } from "./aiApi";
import { firstSwimDataLabel } from "./firstSwimTemperature";
import { gradeOf } from "./groupAGrade";
import { t } from "./i18n";
import { spotConditionDisplay } from "./recommendationText";
import { useRecommendation } from "./useRecommendation";
import { useFirstSwimTemperature } from "./useFirstSwimTemperature";
import "./spotListScore.css";

function FirstSwimListStatus({ spotId }: { spotId: number }) {
  const { state, reading, reason, error } = useFirstSwimTemperature(spotId);
  const label = t(firstSwimDataLabel(state, reading));
  const detail = reading
    ? `${t(reading.relation === "nearby_station_context" ? "주변 수온" : "수온")} ${reading.value}°C · ${reading.stationName} · ${displayTime(reading.observedAt)}`
    : state === "loading" ? label : error ?? t(reason);
  return <span className="spot-list-temperature" data-state={state} aria-busy={state === "loading"}
    title={reading?.relation === "nearby_station_context"
      ? `${detail}\n${t("주변 수온은 참고 자료이며, 이 장소의 첫 입수 알림 기준에는 사용하지 않습니다.")}` : detail}>
    {label}
  </span>;
}

/** Only mounted for the current page; shares the detail view's score and cache. */
export function SpotListScore({ spotId }: { spotId: number }) {
  const { data, loading, error } = useRecommendation(spotId);
  const { conditions, score } = spotConditionDisplay(data);
  return (
    <span className="spot-list-score" id={`spot-list-score-${spotId}`} aria-busy={loading}>
      {loading ? <span className="spot-list-score-status">{t("점수 조회 중")}</span>
        : score !== null ? <>
          <strong className="spot-list-score-value" style={{ color: gradeOf(score).color }}>
            {t("{score}점", { score })}
          </strong>
          <span className="spot-list-score-basis">
            {conditions && t(activities[conditions.activity])}
            {conditions?.retained && <> · {t("이전 자료")}</>}
          </span>
        </> : <span className="spot-list-score-status">
          {t(error ? "점수 조회 실패" : "점수 없음")}
        </span>}
      <FirstSwimListStatus spotId={spotId} />
    </span>
  );
}
