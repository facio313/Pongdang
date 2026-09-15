import { conditionScoreText, conditionComponentsText, type Conditions } from "./productData";

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
          <summary>분야별 점수·산정 기준·출처</summary>
          <p>{conditionComponentsText(data)}</p>
          <p>{index.methodology} · 방법론 {index.model_id} {index.model_version}</p>
          <dl>
            {index.components.map((item) => (
              <div key={item.metric}>
                <dt>{item.label}</dt>
                <dd>{item.criterion}</dd>
              </div>
            ))}
          </dl>
          <ul>
            {index.sources.map((source) => (
              <li key={source.id}>
                <a href={/^https:\/\//.test(source.url) ? source.url : undefined}
                  target="_blank" rel="noreferrer">{source.title}</a> · {source.usage}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
