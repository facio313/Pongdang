import { useFeatureResult } from "./useFeatureResult";
import { FeatureData } from "./FeatureData";
import "./livecamHub.css";

export function LivecamHubPage() {
  const result = useFeatureResult("livecam");
  return (
    <article className="livecam-hub">
      <h1>라이브캠 물멍 허브</h1>
      <p className="lc-lede">실시간 영상 연결은 준비 중입니다.</p>
      <div className="lc-panel">
        <div className="lc-featured is-empty"><p className="empty-state">{result.text}{result.sourceUrl && <> <a href={result.sourceUrl} target="_blank" rel="noreferrer">공개 제공 페이지</a></>}</p></div>
        <p className="lc-note">{result.detail}</p>
      </div>
      <FeatureData keys={["spots", "facilities"]} description="장소·시설의 수집 기록입니다. 영상이 제공된다는 뜻은 아닙니다." />
    </article>
  );
}
