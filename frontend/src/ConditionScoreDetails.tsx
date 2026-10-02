import { t } from "./i18n.ts";
import { InfoPopover } from "./pongdangUi";
import { conditionScoreText, conditionComponentsText, conditionCriterionText, stationContextText, type Conditions } from "./productData";

/** Evidence and scoring criteria use the existing page typography; no display
 * value is calculated from raw measurements in the browser.
 *
 * popover 를 켜면 접힌 기준·출처가 카드를 늘리지 않고 말풍선으로 열립니다
 * (InfoPopover 주석). 내용은 어느 쪽이든 같습니다. */
export function ConditionScoreDetails({ data, className, popover = false }: {
  data?: Conditions;
  className?: string;
  popover?: boolean;
}) {
  const index = data?.condition_score;
  const body = index && (
    <>
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
    </>
  );
  // 같은 관측소를 공유해 여러 해변 점수가 똑같이 나오는 날이 있습니다. 그
  // 사실은 **접기 밖**에서 읽혀야 합니다 -- 접어 두면 화면이 고장난 것처럼 보이고,
  // 펼쳐 본 사람만 이유를 알게 됩니다.
  const station = stationContextText(data);
  return (
    <div className={className}>
      {station && <p className="pd-station-context">{station}</p>}
      <p>{conditionScoreText(data)}</p>
      {body && (popover ? (
        <InfoPopover label={t("분야별 점수·산정 기준·출처")}>{body}</InfoPopover>
      ) : (
        <details>
          <summary>{t("분야별 점수·산정 기준·출처")}</summary>
          {body}
        </details>
      ))}
    </div>
  );
}
