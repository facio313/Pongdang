import type { Dataset } from "./data";

const combinations = [
  ["기상·해양·수질", "snapshots → metrics", "장소 ID, snapshot_id, 지표 코드, 단위, 관측/예보 시각", "같은 장소·시각의 기온·습도·강수·바람 등을 나란히 비교", "시각·공간·단위가 다른 값을 같은 관측으로 합치지 않음"],
  ["장소·주변 시설", "spots → facilities / hot-springs / catch-guides", "spot_id, 장소 유형, 시설 유형", "장소별 시설·온천·체험 정보를 표로 조회", "더미 시설의 실재나 채취 허용 여부는 확인되지 않음"],
  ["관측·파생 근거", "snapshots → metrics → lineage → scores", "snapshot_id, 원본/파생 metric ID, 방법론 버전", "어떤 원본 지표로 결과를 만들었는지 설명", "평가 계산기는 미구현. 근거 없이 안전 판정·점수를 만들지 않음"],
  ["날짜·활동별 예보", "spots → forecasts", "spot_id, 날짜, 활동, 대상 시각, 유효 기간", "장소·날짜·활동별 값을 비교하는 표", "예보 연동·평가 계산기는 미설정. 더미 점수는 NULL"],
  ["이동 시간·경로", "route-snapshots → route-entries → spots", "snapshot_id, 출발/도착 spot_id, 이동 수단", "장소 간 이동 시간·거리 행렬", "경로 API 미설정. 더미 직선거리 계산은 실제 경로가 아님"],
  ["수집 운영", "runs / heartbeat", "작업명, 결과, 시작/종료 시각", "수집 성공·실패 이력과 활동 상태 확인", "현재 예약 실행 없음. 더미 이력은 수집 실행을 뜻하지 않음"],
];

export function DataInfoPage({ catalog, openDataset }: {
  catalog: Dataset[];
  openDataset: (key: string) => void;
}) {
  return (
    <article className="collector-doc">
      <h1>Pongdang 데이터 정보</h1>
      <p>
        Pongdang은 자체 PostgreSQL을 사용하는 독립 프로젝트입니다. 수집 데이터는
        pongdang_data, 합성 예시는 pongdang_demo 스키마에 분리합니다.
        현재 외부 제공처 API와 자동 수집 일정은 미설정이며, 데이터 조회가 수집을 실행하지 않습니다.
      </p>
      <section>
        <h2>수집 구조와 현재 구현 상태</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>단계</th><th>역할</th><th>현재 상태</th><th>API 교체 시</th></tr></thead>
            <tbody>
              <tr><td>제공처 어댑터</td><td>API 요청·응답을 공통 형식으로 변환</td><td>교체 인터페이스 준비, 실제 제공처 미설정</td><td>이 모듈에 주소·인증·필드 매핑 구현</td></tr>
              <tr><td>공통 수집·검증</td><td>제공처, 레코드 ID, 시각, 단위, 지표 검증</td><td>구현 · 운영자 JSON 입력 지원</td><td>공통 입력 계약 유지</td></tr>
              <tr><td>저장</td><td>장소 → 스냅샷 → 지표, 실행 이력</td><td>원자적 저장·외래키·중복 방지 구현</td><td>동일 스키마 재사용, 필요 시 별도 마이그레이션</td></tr>
              <tr><td>조회</td><td>검색·필터·정렬·코드명·페이지 이동</td><td>구현 · 읽기 전용 · 페이지당 최대 100행</td><td>공통 지표 코드·단위가 같으면 유지</td></tr>
              <tr><td>예약 수집·평가</td><td>주기 호출, 적합도·예보·경로 계산</td><td>미설정 / 미구현</td><td>API 확정 후 주기·할당량·평가 기준 결정</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>데이터를 조합해서 보여줄 수 있는 내용</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>데이터</th><th>연결</th><th>조합 기준</th><th>표현 예시</th><th>제약</th></tr></thead>
            <tbody>{combinations.map(([name, path, join, display, caution]) => (
              <tr key={name}><td>{name}</td><td>{path}</td><td>{join}</td><td>{display}</td><td>{caution}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>현재 선택한 데이터의 전체 구조</h2>
        <p>제공처 이름과 예시 코드가 있어도 현재 API 연동이 활성화됐다는 뜻은 아닙니다.</p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>데이터셋</th><th>테이블 코드</th><th>내용</th><th>필드명 · 코드</th></tr></thead>
            <tbody>{catalog.map((dataset) => (
              <tr key={dataset.key}>
                <td><button onClick={() => openDataset(dataset.key)}>{dataset.title}</button></td>
                <td><code>{dataset.table}</code></td>
                <td>{dataset.description}</td>
                <td>{dataset.columns.map((column) => `${column.label} (${column.key})`).join(" · ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
