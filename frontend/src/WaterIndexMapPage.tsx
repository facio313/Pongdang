import { useFeatureResult } from "./useFeatureResult";
import { FeatureData } from "./FeatureData";
import "./waterIndexMap.css";

export function WaterIndexMapPage() {
  const result = useFeatureResult("twin");
  return (
    <article className="water-index-map">
      <h1>Water Index 지도</h1>
      <p>지도의 위치 표시와 활동별 평가는 준비 중입니다. 수집된 장소 좌표는 아래 표에서 확인할 수 있습니다.</p>
      <div className="wim-stage">
        <div className="wim-map"><p className="empty-state">연결된 지도가 없습니다.</p></div>
        <div className="wim-panel"><h2>지점 상세</h2><p>{result.text} {result.detail}</p></div>
      </div>
      <FeatureData keys={["spots", "snapshots", "metrics"]} description="실제 수집 기록의 장소·좌표와 원본 근거를 조회합니다. 장소 등록은 운영 여부나 안전 확인을 의미하지 않습니다." />
    </article>
  );
}
