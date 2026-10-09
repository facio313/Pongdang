import { activities } from "./aiApi";
import { EvidenceNote } from "./EvidenceNote";
import { gradeOf } from "./groupAGrade";
import { t } from "./i18n";
import { GradeIcon, ScoreExplainer, ScoreGauge, Skeleton } from "./pongdangUi";
import { conditionModeLabel, dateLabel, formatValue, timeLabel, type Conditions } from "./productData";
import type { Recommendation } from "./recommendationApi";
import { RecommendationReason } from "./RecommendationReason";
import { spotConditionDisplay } from "./recommendationText";
import { componentBars, scoreReason, scoreTitle } from "./scoreMeaning";
import "./spotConditionsCard.css";

function InlandContext({ conditions }: { conditions?: Conditions }) {
  if (!conditions || !["valley", "lake", "reservoir"].includes(conditions.place_kind ?? "")) return null;
  const records = [...conditions.metrics, ...(conditions.context_metrics ?? [])]
    .filter(metric => ["water_temperature", "river_level", "river_flow"].includes(metric.name));
  return <div className="pd-note">
    <p>{t("계곡·호수·저수지는 기상과 담수 관측을 사용합니다. 해양 파고·물때를 적용하지 않으며 수영 허가, 수질, 상류 강우·방류는 별도 확인이 필요합니다.")}</p>
    <details>
      <summary>{t("담수 수온·수위·유량 자료")}</summary>
      {records.length === 0 && <p>{t("연결된 담수 관측값이 없습니다. 수위·유량이나 입수 안전을 추정하지 않습니다.")}</p>}
      {records.map(metric => {
        const source = metric.evidence.length === 1 ? metric.evidence[0] : undefined;
        const number = metric.value ?? (metric.status === "stale" && !source?.is_missing ? source?.numeric_value : undefined);
        return <p key={`${metric.station_id}:${metric.name}`}>
          {metric.station_name ?? t("관측소")} · {t(metric.label)} {typeof number === "number" ? formatValue(number, metric.unit) : t("자료 없음")}
          {source && <> · {dateLabel(source.observed_at)} {timeLabel(source.observed_at)}</>}
          {metric.status === "stale" && <> · {t("과거 관측 · 현재값 아님")}</>}
          {metric.relation === "nearby_station_context" && <> · {t("주변 관측소 · 같은 수역 여부 미확인")}</>}
        </p>;
      })}
    </details>
  </div>;
}

export function SpotConditionsCard({ data, loading, error }: {
  data?: Recommendation;
  loading: boolean;
  error?: string;
}) {
  const { conditions, score } = spotConditionDisplay(data);
  const grade = gradeOf(score);
  const components = componentBars(conditions);
  const pending = conditions?.projection?.status === "pending";
  const title = loading ? t("점수 조회 중") : error && !data
    ? t("조건을 불러오지 못했습니다") : score === null
      ? t(pending ? "점수 갱신 대기" : "점수 산정 보류")
      : scoreTitle(conditions!.activity, conditions?.condition_score?.score_basis);
  return <section className="spot-conditions" aria-labelledby="spot-conditions-title" aria-busy={loading}>
    <header className="spot-conditions-heading">
      <div>
        <p className="spot-conditions-kicker">{t(conditions?.condition_score?.score_basis === "onsen_alternative" ? "이 장소의 야외 조건으로 비교한 대안" : "오늘 이 장소의 물놀이 조건")}</p>
        <h2 id="spot-conditions-title">{title}</h2>
        {conditions && <p className="spot-conditions-basis">
          {t(activities[conditions.activity])} · {conditionModeLabel(conditions)} · {dateLabel(conditions.at)} {timeLabel(conditions.at)}
          {conditions.retained && <> · {t("이전 자료")}</>}
        </p>}
      </div>
      {loading ? <Skeleton width="4em" label={t("점수 조회 중")} /> : score !== null && <div className="spot-conditions-score" data-grade={grade.key}>
        <div><strong className="pd-num">{score}</strong><span> / 100</span></div>
        <span className="spot-conditions-grade"><GradeIcon gradeKey={grade.key} />{t(grade.label)}</span>
      </div>}
    </header>
    {score !== null && <div className="spot-conditions-gauge"><ScoreGauge score={score} /></div>}
    {score === null && !loading && !error && <p className="spot-conditions-status" role="status">
      {t(pending ? "현재 시각에 사용할 계산 결과를 기다리고 있습니다." : "활동 점수를 표시할 수 없습니다. 확인된 자료와 사유를 아래에서 확인하세요.")}
    </p>}
    {score !== null && <p className="spot-conditions-reason">{scoreReason(conditions).text}</p>}
    {components.length > 0 && <dl className="spot-conditions-metrics">
      {components.map(item => <div key={item.metric} className={item.evaluated ? "" : "is-missing"}>
        <dt>{item.label}</dt>
        <dd><strong>{item.evaluated ? item.valueText : t("자료 없음")}</strong>
          <p>{item.reasons || (conditions?.retained ? t("이전 자료") : conditionModeLabel(conditions))}</p>
        </dd>
      </div>)}
    </dl>}
    <RecommendationReason data={data} error={error} loading={loading} />
    <InlandContext conditions={conditions} />
    <EvidenceNote data={conditions} compact chip={false} extra={<ScoreExplainer data={conditions} />} />
  </section>;
}
