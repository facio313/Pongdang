import { useFeatureResult } from "./useFeatureResult";
import { FeatureData } from "./FeatureData";
import "./tideTimer.css";

export function TideTimerPage() {
  const result = useFeatureResult("tide");
  return (
    <article className="tide-timer">
      <h1>물때 액티비티 타이머</h1>
      <p className="tt-lede">조위 관측과 예측 자료를 확인하는 화면입니다. 활동별 추천 시간 계산은 준비 중입니다.</p>
      <div className="tt-panel">
        <h2>활동 시간과 물때</h2>
        <div className="tt-act-grid"><p className="empty-state">계산된 활동 시간대가 없습니다.</p></div>
        <div className="tt-tide-compact"><span className="tt-tide-pill">{result.text}</span></div>
        <p className="tt-note">{result.detail}</p>
      </div>
      <FeatureData keys={["metrics", "snapshots"]} description="조위 등 원본 지표를 조회합니다. 관측과 예보의 구분, 대상 시각, 유효 기간을 함께 확인해 주세요." />
    </article>
  );
}
