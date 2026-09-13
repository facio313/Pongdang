import { useFeatureResult } from "./useFeatureResult";
import { FeatureData } from "./FeatureData";
import "./waterForecast.css";

export function WaterForecastPage() {
  const result = useFeatureResult("forecast");
  return (
    <article className="water-forecast">
      <h1>Water Forecast</h1>
      <p className="wf-lede">제공처의 예보와 날짜별 활동 평가를 구분해 확인합니다. 활동 적합도 계산은 준비 중입니다.</p>
      <div className="wf-panel">
        <div className="wf-datebar"><p className="empty-state">{result.text}</p></div>
        <div className="wf-hero"><div className="wf-hero-body"><div className="wf-hero-sentence">평가값 없음</div><p>{result.detail}</p></div></div>
      </div>
      <FeatureData keys={["metrics", "snapshots", "forecasts"]} description="mode가 forecast인 지표는 예보이며 실시간 관측이 아닙니다. 발표 시각과 대상 시각, 유효 기간을 함께 확인해 주세요." />
    </article>
  );
}
