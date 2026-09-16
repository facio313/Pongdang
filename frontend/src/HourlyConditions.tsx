import { conditionPath, kstDate, metricText, type Conditions } from "./productData";
import { useResource } from "./useResource";

function ForecastHour({ id, day, hour }: { id?: number; day: string; hour: string }) {
  const result = useResource<Conditions>(conditionPath(id, "swim", `${day}T${hour}:00:00+09:00`));
  return <tr>
    <th scope="row">{hour}시</th>
    {(["water_temperature", "wave_height", "precipitation"] as const).map(name => <td key={name} title={result.error}>
      {result.loading ? "조회 중" : result.error ? "조회 실패" : metricText(result.data, name)}
    </td>)}
  </tr>;
}

export function HourlyConditions({ id, now }: { id?: number; now: string }) {
  return <div className="hm-slot">
    <table aria-label="오늘 시간대별 수집 예보">
      <caption>오늘 시간대별 예보 (09–18시)</caption>
      <thead><tr><th scope="col">시각</th><th scope="col">수온</th><th scope="col">파고</th><th scope="col">강수량</th></tr></thead>
      <tbody>{["09", "12", "15", "18"].map(hour => <ForecastHour key={hour} id={id} day={kstDate(now)} hour={hour} />)}</tbody>
    </table>
    <span>관측소·격자 예보입니다. ‘최대’는 구간 최대값, ‘강수없음’·범위는 제공기관 표현입니다. 발표시각 미제공 예보가 포함될 수 있습니다.</span>
  </div>;
}
