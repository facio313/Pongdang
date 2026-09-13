import { useFeatureResult } from "./useFeatureResult";
import { FeatureData } from "./FeatureData";
import "./firstSwim.css";

export function FirstSwimPage() {
  const result = useFeatureResult("notifications");
  return (
    <article className="first-swim">
      <h1>올해 첫 입수 가능 알림</h1>
      <p className="fs-lede">첫 입수일 계산과 알림은 준비 중입니다. 수온만으로 입수 가능 여부를 판정하지 않습니다.</p>
      <div className="fs-panel">
        <div className="fs-cols">
          <div className="fs-col"><div className="fs-col-label">첫 입수 날</div><p className="empty-state">{result.text}</p></div>
          <div className="fs-col"><div className="fs-col-label">연도별 입수 비교</div><p className="empty-state">{result.detail}</p></div>
        </div>
      </div>
      <FeatureData keys={["metrics", "snapshots"]} description="저장된 수온과 원본 관측 시각은 수집 자료에서 확인할 수 있습니다." />
    </article>
  );
}
