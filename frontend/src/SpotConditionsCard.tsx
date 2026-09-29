import { activities } from "./aiApi";
import { EvidenceNote } from "./EvidenceNote";
import { gradeOf } from "./groupAGrade";
import { t } from "./i18n";
import { GradeIcon, ScoreExplainer, ScoreGauge, Skeleton } from "./pongdangUi";
import { conditionModeLabel, dateLabel, timeLabel } from "./productData";
import type { Recommendation } from "./recommendationApi";
import { RecommendationReason } from "./RecommendationReason";
import { spotConditionDisplay } from "./recommendationText";
import { componentBars, scoreReason, scoreTitle } from "./scoreMeaning";
import "./spotConditionsCard.css";

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
      : scoreTitle(conditions!.activity);
  return <section className="spot-conditions" aria-labelledby="spot-conditions-title" aria-busy={loading}>
    <header className="spot-conditions-heading">
      <div>
        <p className="spot-conditions-kicker">{t("오늘 이 장소의 물놀이 조건")}</p>
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
    <EvidenceNote data={conditions} compact chip={false} extra={<ScoreExplainer data={conditions} />} />
  </section>;
}
