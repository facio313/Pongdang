// 개발용 화면 인덱스. 제품 화면(탭바)에서는 노출하지 않으며 `#dev` 로만 들어옵니다.
const LINKS = [
  { hash: "#home", label: "홈", note: "기본 진입 화면" },
  { hash: "#today", label: "오늘", note: "지점 비교 · 예보 · 물때" },
  { hash: "#recommend", label: "추천", note: "그룹 B 플로우" },
  { hash: "#spots", label: "명소", note: "목록 · 상세 · 지도 (예시 데이터)" },
  { hash: "#map", label: "지도", note: "지점 · 코스 경로 · 저장 목록" },
  { hash: "#data", label: "데이터 조회", note: "수집 DB 테이블 열람" },
  { hash: "#info", label: "데이터 정보", note: "데이터셋 설명 · 구조" },
  { hash: "#ai", label: "AI에게 물어보기", note: "Luna 컨시어지" },
  { hash: "#livecam", label: "웹캠 목록", note: "공개 웹캠 카탈로그" },
  {
    hash: "#desktop-kit",
    label: "데스크탑 키트",
    note: "데스크탑 레이아웃 프리미티브 미리보기 · 값은 전부 예시",
  },
];

export function DevIndexPage() {
  return (
    <section>
      <h1>화면 인덱스</h1>
      <p>
        개발·검증용 목록입니다. 제품 화면에서는 이 인덱스로 가는 링크를 두지
        않습니다.
      </p>
      <ul>
        {LINKS.map((link) => (
          <li key={link.hash}>
            <a href={link.hash}>{link.label}</a> · {link.note}
          </li>
        ))}
      </ul>
    </section>
  );
}
