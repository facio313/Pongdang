import { t } from "./i18n.ts";
import type { Dataset } from "./data";

const combinations = [
  ["기상·해양·수질", "snapshots → metrics", "장소 ID, snapshot_id, 지표 코드, 단위, 관측/예보 시각", "같은 장소·시각의 기온·습도·강수·바람 등을 나란히 비교", "시각·공간·단위가 다른 값을 같은 관측으로 합치지 않음"],
  ["장소·주변 시설", "spots → facilities / hot-springs / catch-guides", "spot_id, 장소 유형, 시설 유형", "장소별 시설·온천·체험 정보를 표로 조회", "실제 저장 필드만 제공하며 시설의 현재 운영·채취 허용 여부는 별도 근거 필요"],
  ["관측·파생 근거", "snapshots → metrics → lineage → scores", "snapshot_id, 원본/파생 metric ID, 방법론 버전", "어떤 원본 지표로 결과를 만들었는지 설명", "공개 평가·지원 범위를 조회하되 미검증 수치 점수는 NULL 유지"],
  ["날짜·활동별 예보", "spots → forecasts", "spot_id, 날짜, 활동, 대상 시각, 유효 기간", "장소·날짜·활동별 값을 비교하는 표", "저장된 공식 예보의 대상 시각·발표 시각·유효 기간을 구분"],
  ["이동 시간·경로", "route-snapshots → route-entries → spots", "snapshot_id, 출발/도착 spot_id, 이동 수단", "장소 간 이동 시간·거리 행렬", "저장된 자료가 없으면 이동 경로·시간을 새로 만들지 않음"],
  ["수집 운영", "runs / heartbeat", "작업명, 결과, 시작/종료 시각", "수집 성공·실패 이력과 활동 상태 확인", "마지막 heartbeat가 오래되면 현재 실행 중으로 표시하지 않음"],
];

export function DataInfoPage({ catalog, openDataset }: {
  catalog: Dataset[];
  openDataset: (key: string) => void;
}) {
  return (
    <article className="collector-doc">
      <h1>{t("Pongdang 데이터 정보")}</h1>
      <p>{t("Pongdang은 자체 PostgreSQL을 사용하는 독립 프로젝트입니다. 수집 데이터는 pongdang_data에서 조회합니다. 과거 pongdang_demo 합성 예시는 은퇴했습니다. 제공처별 설정·자료 존재·수집 상태는 실제 조회 결과를 확인하며, 데이터 조회가 수집을 실행하지 않습니다.")}</p>
      <section>
        <h2>{t("수집 구조와 현재 구현 상태")}</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>{t("단계")}</th><th>{t("역할")}</th><th>{t("현재 상태")}</th><th>{t("API 교체 시")}</th></tr></thead>
            <tbody>
              <tr><td>{t("제공처 어댑터")}</td><td>{t("API 요청·응답을 공통 형식으로 변환")}</td><td>{t("공식 제공처 어댑터 구현 · 실제 활성 상태는 수집 현황 참조")}</td><td>{t("이 모듈에 주소·인증·필드 매핑 구현")}</td></tr>
              <tr><td>{t("공통 수집·검증")}</td><td>{t("제공처, 레코드 ID, 시각, 단위, 지표 검증")}</td><td>{t("정규화된 근거와 원자적·멱등 저장")}</td><td>{t("공통 입력 계약 유지")}</td></tr>
              <tr><td>{t("저장")}</td><td>{t("장소 → 스냅샷 → 지표, 실행 이력")}</td><td>{t("원자적 저장·외래키·중복 방지 구현")}</td><td>{t("동일 스키마 재사용, 필요 시 별도 마이그레이션")}</td></tr>
              <tr><td>{t("조회")}</td><td>{t("검색·필터·정렬·코드명·페이지 이동")}</td><td>{t("구현 · 읽기 전용 · 페이지당 최대 100행")}</td><td>{t("공통 지표 코드·단위가 같으면 유지")}</td></tr>
              <tr><td>{t("예약 수집·평가")}</td><td>{t("독립 worker와 저장된 공개 평가 조회")}</td><td>{t("수집 상태·지원 범위는 데이터 조회에서 확인")}</td><td>{t("수집 성공은 점수·안전 판정이 아님")}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>{t("데이터를 조합해서 보여줄 수 있는 내용")}</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>{t("데이터")}</th><th>{t("연결")}</th><th>{t("조합 기준")}</th><th>{t("표현 예시")}</th><th>{t("제약")}</th></tr></thead>
            <tbody>{combinations.map(([name, path, join, display, caution]) => (
              <tr key={name}><td>{t(name)}</td><td>{path}</td><td>{t(join)}</td><td>{t(display)}</td><td>{t(caution)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>{t("AI에게 물어보기")}</h2>
        <p><a href="#ai">{t("자연어로 실제 자료 조회")}</a></p>
        <p>{t("장소 검색, 수온·기상·예보·물때·수질·라이브캠 근거와 출처를 확인할 수 있습니다. 데이터 없는 추천·점수·안전 판정은 만들지 않으며, 알림 변경과 발송은 실행하지 않습니다.")}</p>
        <p>{t("질문·최근 대화와 필요한 공개 근거는 OpenAI에 전달됩니다. AI 키는 서버에서만 설정하며 대화에 개인정보를 입력하지 마세요. AI가 준비되지 않았어도 기존 데이터 조회는 사용할 수 있습니다.")}</p>
      </section>
      <section>
        <h2>{t("현재 선택한 데이터의 전체 구조")}</h2>
        <p>{t("제공처 이름과 예시 코드가 있어도 현재 API 연동이 활성화됐다는 뜻은 아닙니다.")}</p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>{t("데이터셋")}</th><th>{t("테이블 코드")}</th><th>{t("내용")}</th><th>{t("필드명 · 코드")}</th></tr></thead>
            <tbody>{catalog.map((dataset) => (
              <tr key={dataset.key}>
                <td><button onClick={() => openDataset(dataset.key)}>{t(dataset.title)}</button></td>
                <td><code>{dataset.table}</code></td>
                <td>{t(dataset.description)}</td>
                <td>{dataset.columns.map((column) => `${t(column.label)} (${column.key})`).join(" · ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
