import { ActivityAssessmentPanel } from "./ActivityAssessmentPanel";
import { FeatureData } from "./FeatureData";
import "./waterIndexHub.css";

const sections = [
  { href: "#water-forecast", title: "Water Forecast", detail: "원본 예보 확인 · 활동별 평가는 준비 중" },
  { href: "#water-index-map", title: "지점 지도", detail: "장소 좌표 확인 · 지도 연결은 준비 중" },
  { href: "#livecam", title: "라이브캠", detail: "검증된 영상 주소 연결 준비 중" },
  { href: "#tide", title: "물때 타이머", detail: "조위 원본 확인 · 활동 시간 계산은 준비 중" },
  { href: "#first-swim", title: "첫 입수 알림", detail: "검증된 기준과 이력으로 계산 준비 중" },
  { href: "#water-quality", title: "수질 교차검증", detail: "수질 원본 확인 · 신뢰도 계산은 준비 중" },
];

export function WaterIndexHubPage() {
  return (
    <article className="water-index-hub">
      <div className="hub-content">
        <h1>Water Index</h1>
        <p className="hub-lede">활동별 실제 자료와 조건 일치 점수를 확인하고 각 기능 화면으로 이동할 수 있습니다. 원본 자료는 아래 표에서 확인할 수 있습니다.</p>
        <ActivityAssessmentPanel />
        <div className="hub-grid">
          {sections.map((section) => (
            <div className="hub-card" key={section.href}>
              <div className="hub-card-top"><h2 className="hub-card-title">{section.title}</h2></div>
              <p>{section.detail}</p>
              <a className="hub-link-chip" href={section.href}>자세히 보기 →</a>
            </div>
          ))}
        </div>
        <FeatureData keys={["metrics", "snapshots", "spots"]} description="서버에 저장된 원본 수집 자료입니다. 원본 상태·출처·유효 기간을 함께 확인해 주세요." />
      </div>
    </article>
  );
}
