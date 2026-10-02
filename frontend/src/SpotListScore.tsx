import { activities, displayTime, type Activity } from "./aiApi";
import { firstSwimDataLabel } from "./firstSwimTemperature";
import { gradeOf } from "./groupAGrade";
import { t } from "./i18n";
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

/** 목록 한 줄의 점수. **스스로 조회하지 않습니다.**
 *
 *  예전에는 줄마다 `useRecommendation(spotId)` 를 불렀습니다. 목록 한 화면에
 *  들어가는 것만으로 추천 조회가 장소 수만큼 나갔고, 요청 큐의 동시 실행은
 *  셋뿐이라(resourceQueue) 그 요청들이 서로를 굶겨 20초 타임아웃으로 떨어졌습니다.
 *  그래서 「점수 없음」이 절반 넘게 섞인 목록이 나왔습니다 -- 점수가 없는 것이
 *  아니라 **읽지 못한 것**이었고, 화면은 그 둘을 같은 말로 적었습니다.
 *
 *  이제 목록이 조건 요약을 묶음으로 한 번에 읽고(useConditionSummaries,
 *  usePlacePhotos 와 같은 원칙) 이 컴포넌트는 받은 값을 그립니다. */
export function SpotListScore({
  spotId,
  score,
  activity,
  retained = false,
  loading = false,
  /** 서버가 왜 요약을 내리지 못했는지. 점수가 없는 이유를 title 로 남깁니다. */
  unavailable,
}: {
  spotId: number;
  score: number | null;
  activity?: Activity;
  retained?: boolean;
  loading?: boolean;
  unavailable?: string;
}) {
  return (
    <span className="spot-list-score" id={`spot-list-score-${spotId}`} aria-busy={loading}>
      {loading ? <span className="spot-list-score-status">{t("점수 조회 중")}</span>
        : score !== null ? <>
          <strong className="spot-list-score-value" style={{ color: gradeOf(score).color }}>
            {t("{score}점", { score })}
          </strong>
          <span className="spot-list-score-basis">
            {activity && t(activities[activity])}
            {retained && <> · {t("이전 자료")}</>}
          </span>
        </> : <span className="spot-list-score-status" title={unavailable}>
          {t("조건 자료 준비 중")}
        </span>}
      <FirstSwimListStatus spotId={spotId} />
    </span>
  );
}
