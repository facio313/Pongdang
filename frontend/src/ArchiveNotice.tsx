import { archiveManifest, ARCHIVE_READ_ONLY } from "./archiveRuntime.ts";
import "./archive.css";

export function ArchiveNotice() {
  const archive = archiveManifest();
  if (!archive) return null;
  const captured = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(archive.captured_at));
  return <aside className="pd-archive-notice" aria-label="보관 모드 안내">
    <strong>보관 모드</strong>
    <span><time dateTime={archive.captured_at}>{captured} KST</time> 실제 수집 자료 · 실시간 갱신 중지</span>
    <small>화면의 ‘오늘’과 점수는 보관 시점 기준입니다. 현재 날씨·수질·입수 안전 정보가 아닙니다. 한국어 장소 자료만 보관하며 AI·실시간 영상·저장 기능은 중지되어 있습니다.</small>
  </aside>;
}

export function ArchiveUnavailablePage() {
  return <section className="pd-archive-unavailable">
    <h1>보관 자료 둘러보기</h1>
    <p>{ARCHIVE_READ_ONLY}</p>
    <nav aria-label="보관 화면"><a href="#home">홈</a><a href="#spots">명소</a><a href="#map">지도</a></nav>
  </section>;
}
