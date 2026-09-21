import { t } from "./i18n.ts";
import type { Activity } from "./aiApi";
import { metricText, conditionRetentionText } from "./productData";
import { useHourlyScores } from "./useHourlyScores";

/** 오늘 시간대별 예보 표.
 *
 *  네 시각(09 · 12 · 15 · 18)은 데스크탑 홈의 막대와 같습니다. 같은 날 같은
 *  장소를 두 화면이 서로 다른 시각으로 보여 주면 값이 어긋난 것처럼 읽히므로,
 *  조회도 그쪽과 **같은 훅**을 씁니다 -- 예전에는 이 파일이 자체 useResource
 *  네 개를 돌려 시각 목록이 두 곳에 따로 적혀 있었습니다.
 *
 *  활동도 부르는 쪽이 정합니다. 여기만 수영으로 고정돼 있어서, 온천이 뽑힌 날
 *  위 카드 제목은 「온천 점수를 이루는 것들」인데 이 표는 수영 예보였습니다. */
export function HourlyConditions({
  id,
  now,
  activity,
}: {
  id?: number;
  now: string;
  /** 고른 활동. 없으면 조회하지 않습니다(useHourlyScores 주석). */
  activity?: Activity;
}) {
  const hours = useHourlyScores(id, now, activity);
  return (
    <div className="pd-slot">
      <table aria-label={t("오늘 시간대별 수집 예보")}>
        <caption>{t("오늘 시간대별 예보 (09–18시)")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("시각")}</th>
            <th scope="col">{t("수온")}</th>
            <th scope="col">{t("파고")}</th>
            <th scope="col">{t("강수량")}</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour.hour}>
              <th scope="row">{t("{hour}시", { hour: hour.hour })}</th>
              {(["water_temperature", "wave_height", "precipitation"] as const).map(
                (name) => (
                  <td key={name} title={hour.error}>
                    {hour.loading
                      ? t("조회 중")
                      : hour.error
                        ? t("조회 실패")
                        : metricText(hour.data, name)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {hours.some(hour => hour.data?.retained) && <p className="pd-retained-note" role="status">
        {conditionRetentionText(hours.find(hour => hour.data?.retained)?.data)}
      </p>}
      <span>
        {t("관측소·격자 예보입니다. ‘최대’는 구간 최대값, ‘강수없음’·범위는 제공기관 표현입니다. 발표시각 미제공 예보가 포함될 수 있습니다.")}</span>
    </div>
  );
}
