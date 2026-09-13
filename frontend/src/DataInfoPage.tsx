import type { Dataset, Summary } from "./data";
import { date, labels } from "./data";
import { codeName } from "./codeNames";

const stages = [
  ["제공처 요청", "서버에 설정된 API를 호출하고 응답의 상태·출처·레코드 ID를 확인합니다.", "인증 정보는 서버에서만 사용합니다. 조회 화면에서 외부 API를 직접 호출하지 않습니다."],
  ["검증·저장", "지점·관측/예보 시각·단위·유효 기간을 보존해 수집 자료와 실행 결과를 저장합니다.", "실패한 요청을 성공으로 기록하거나 기존 자료의 유효 기간을 늘리지 않습니다."],
  ["주기 갱신", "서버의 수집 일정에 따라 활성 작업을 반복하고 실행 결과를 기록합니다.", "작업별 최근 결과와 활동 신호로 실제 실행 상태를 확인합니다."],
  ["자료 조회", "공개된 테이블의 검색·필터·정렬과 페이지 이동을 제공합니다.", "읽기 전용이며 각 표는 최대 100행씩 조회합니다. 화면 조회가 수집을 실행하지 않습니다."],
  ["평가·비교", "관측 자료와 예보 자료의 시각·지점·단위를 구분해 확인합니다.", "활동 적합도·추천 순위·첫 입수일·수질 신뢰도 계산은 준비 중입니다."],
];

export function DataInfoPage({ catalog, summary, openDataset }: {
  catalog: Dataset[];
  summary?: Summary;
  openDataset: (key: string) => void;
}) {
  const heartbeat = summary?.heartbeat;
  return (
    <article className="collector-doc">
      <h1>Pongdang 데이터 정보</h1>
      <p>Pongdang 자체 PostgreSQL의 pongdang_data에 저장한 실제 수집 자료를 조회합니다. 원본 지점·대상 시각·유효 기간이 서로 다른 자료는 같은 관측으로 합치지 않습니다.</p>
      <section>
        <h2>수집 구조</h2>
        <div className="table-scroll">
          <table>
            <thead><tr><th>단계</th><th>처리 내용</th><th>확인할 점</th></tr></thead>
            <tbody>{stages.map(([name, description, note]) => <tr key={name}><th scope="row">{name}</th><td>{description}</td><td>{note}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>최근 수집 실행</h2>
        <p>
          {!summary ? "수집 현황을 확인할 수 없습니다." : !heartbeat ? "수집기의 활동 신호가 기록되지 않았습니다." :
            `활동 상태: ${labels[heartbeat.effective_state] ?? heartbeat.effective_state} · 마지막 신호 ${date(heartbeat.last_seen_at)} KST`}
        </p>
        <p>오래된 활동 신호와 과거 성공 기록은 현재 수집기가 실행 중이라는 뜻이 아닙니다. 수집 상태와 자료의 유효성은 별도로 확인합니다.</p>
        <p>일부 수집은 장소 목록의 조회 상한 등으로 범위가 제한된 결과입니다. 전국 또는 주변의 모든 장소를 수집했다는 뜻이 아닙니다. 정상 응답에 대상 자료가 없으면 자료 없음으로 기록합니다.</p>
        {summary && summary.tasks.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>작업</th><th>최근 결과</th><th>시작 · KST</th><th>종료 · KST</th><th>결과 설명 · 코드</th></tr></thead>
              <tbody>{summary.tasks.map((task) => <tr key={task.task_name}><td>{codeName("runs", "task_name", task.task_name)}<br /><code>{task.task_name}</code></td><td>{codeName("runs", "status", task.status) ?? task.status}</td><td>{date(task.started_at)}</td><td>{date(task.finished_at)}</td><td>{task.error_code ? <>{codeName("runs", "error_code", task.error_code)}<br /><code>{task.error_code}</code></> : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        ) : summary && <p>저장된 실행 기록이 없습니다.</p>}
      </section>
      <section>
        <h2>전체 데이터 구조</h2>
        <p>자료의 존재 여부와 최근 시각은 데이터 조회에서 확인할 수 있습니다. 비어 있는 자료는 판단 불가이며 안전함을 의미하지 않습니다.</p>
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
