import { useFeatureResult } from "./useFeatureResult";
import { FeatureData } from "./FeatureData";
import "./waterQuality.css";

export function WaterQualityPage() {
  const result = useFeatureResult("quality");
  return (
    <article className="water-quality">
      <h1>수질 교차검증</h1>
      <p>수질 관측 원본을 확인합니다. 서로 다른 관측 지점과 채수일의 자료를 같은 측정값으로 합치지 않습니다.</p>
      <div className="wq-panel">
        <h2>교차검증 결과</h2>
        <p className="empty-state">{result.text}</p>
        <p>{result.detail}</p>
      </div>
      <FeatureData keys={["metrics", "snapshots", "calibrations", "lineage"]} description="pH, 용존산소, 탁도 등 수질 지표의 출처와 관측 시각을 확인할 수 있습니다." />
    </article>
  );
}
