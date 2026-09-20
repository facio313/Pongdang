import { t } from "./i18n.ts";
import { conditionScoreText, conditionComponentsText, conditionCriterionText, type Conditions } from "./productData";

/** Evidence and scoring criteria use the existing page typography; no display
 * value is calculated from raw measurements in the browser. */
export function ConditionScoreDetails({ data, className }: {
  data?: Conditions;
  className?: string;
}) {
  const index = data?.condition_score;
  return (
    <div className={className}>
      <p>{conditionScoreText(data)}</p>
      {index && (
        <details>
          <summary>{t("분야별 점수·산정 기준·출처")}</summary>
          <p>{conditionComponentsText(data)}</p>
          <p>{t(index.methodology)} · {t("방법론 {model} {version}", { model: index.model_id, version: index.model_version })}</p>
          <dl>
            {index.components.map((item) => (
              <div key={item.metric}>
                <dt>{t(item.label)}</dt>
                <dd>{conditionCriterionText(item.criterion)}</dd>
              </div>
            ))}
          </dl>
          <ul>
            {index.sources.map((source) => (
              <li key={source.id}>
                <a href={/^https:\/\//.test(source.url) ? source.url : undefined}
                  target="_blank" rel="noreferrer">{source.title}</a> · {t(source.usage)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
