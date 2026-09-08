import type { Summary } from "./data";
import { number, date, labels } from "./data";

const tasks = [
  ["weather-nowcast", "기상 실황 수집", "30분", "KMA 키 설정 시"],
  ["marine", "해양 관측·활동 정보 수집", "1시간", "KHOA 키 설정 시"],
  ["weather-short-forecast", "기상 단기예보 수집", "3시간", "KMA 키 설정 시"],
  [
    "marine-activity-forecast",
    "해양 활동 예보 수집",
    "6시간",
    "KHOA 키 설정 시",
  ],
  [
    "derive-suitability",
    "원본 근거로 파생 지표 계산",
    "5분",
    "원본 유효성 확인",
  ],
  [
    "water-index-general",
    "일반 참여자 적합도 평가",
    "5분",
    "수집·파생 작업 이후",
  ],
  [
    "water-index-family",
    "가족 참여자 적합도 평가",
    "5분",
    "수집·파생 작업 이후",
  ],
  [
    "daily-forecast",
    "날짜·활동별 예측 평가",
    "1시간",
    "예보 수집·파생 작업 이후",
  ],
  [
    "condition-retention",
    "보존 정책에 따른 이력 정리",
    "24시간",
    "최신·참조 근거 보존",
  ],
  ["route-matrix-drive", "자동차 경로 행렬 갱신", "24시간", "경로 API 설정 시"],
  [
    "route-matrix-walk",
    "도보 경로 행렬 갱신",
    "24시간",
    "자동차 경로 작업 이후",
  ],
  [
    "route-matrix-bicycle",
    "자전거 경로 행렬 갱신",
    "24시간",
    "도보 경로 작업 이후",
  ],
];
const providers = [
  [
    "KMA",
    "기상청",
    "초단기실황·단기예보",
    "기온, 강수, 바람 등 기상 지표를 수집하고 관측과 예보를 구분합니다.",
    "조건부 주기 수집",
  ],
  [
    "KHOA",
    "국립해양조사원",
    "해수욕·서핑·갯벌·이안류",
    "해양 활동 예보를 출처·대상 시각·유효 기간과 함께 보존합니다.",
    "조건부 주기 수집",
  ],
  [
    "TourAPI",
    "한국관광공사",
    "관광 장소 상세",
    "등록된 TourAPI ID가 있는 장소를 sync_tour_spots 명령으로 보강합니다.",
    "별도 실행 명령",
  ],
  [
    "Valhalla",
    "경로 API",
    "이동 시간·거리",
    "설정된 경로 서버에서 자동차·도보·자전거 이동 행렬을 갱신합니다.",
    "조건부 주기 수집",
  ],
  [
    "MOE",
    "환경부",
    "수질 연동 설정",
    "현재 키 설정 항목만 있으며, 수질 API 수집 작업은 구현되어 있지 않습니다.",
    "수집 작업 미구현",
  ],
];

export function CollectorPage({
  summary,
  openDataset,
}: {
  summary?: Summary;
  openDataset: (key: string) => void;
}) {
  const heartbeat = summary?.heartbeat;
  return (
    <article className="collector-doc">
      <h1>Multtara Collector 설명</h1>
      <p>
        외부 API를 주기적으로 호출해 관측·예보 근거를 cksDB에 저장하고, 물놀이
        적합도와 날짜별 평가를 계산하는 백그라운드 작업입니다. 이 조회 페이지가
        수집기를 실행하거나 외부 API를 새로 호출하지는 않습니다.
      </p>
      <p>
        활동 신호:{" "}
        {heartbeat
          ? (labels[heartbeat.effective_state] ?? heartbeat.effective_state)
          : "확인할 수 없음"}{" "}
        · 마지막 신호: {date(heartbeat?.last_seen_at)} KST
      </p>
      {heartbeat?.effective_state === "stale" && (
        <p>
          최근 활동 신호가 없습니다. DB에 저장된 상태는 {heartbeat.state}이지만
          15분 이상 갱신되지 않아 현재 실행 중인지 확인할 수 없습니다.
        </p>
      )}
      <section>
        <h2>처리 순서</h2>
        <ol>
          <li>설정된 외부 API를 조회합니다.</li>
          <li>관측과 예보, 단위, 원본 상태를 구분해 정규화합니다.</li>
          <li>
            제공처·관측 시각·수집 시각·유효 기간과 근거 관계를 저장합니다.
          </li>
          <li>
            유효한 근거와 위험 조건을 확인한 뒤 파생 지표와 적합도를 계산합니다.
          </li>
          <li>점수·안전 상태·제공 가능 여부와 작업 실행 이력을 저장합니다.</li>
        </ol>
        <p>
          원본이 없거나 오래되었을 때 유효 기간을 임의로 늘리지 않습니다. 적합도
          점수, 안전 상태, 근거의 신뢰도는 서로 다른 값입니다.
        </p>
      </section>
      <section>
        <h2>API 제공처와 구현 범위</h2>
        <p>연동 가능 여부와 현재 실제 저장된 데이터는 다릅니다.</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>제공처</th>
                <th>데이터</th>
                <th>수집 방식</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(([code, name, title, description, mode]) => (
                <tr key={code}>
                  <td>
                    {name} · {code}
                  </td>
                  <td>{title}</td>
                  <td>{mode}</td>
                  <td>{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>기본 실행 주기와 마지막 기록</h2>
        <p>
          소스 코드의 기본 주기이며 운영 설정에 따라 달라질 수 있습니다. 실행
          기록이 없다고 키 미설정으로 단정하지 않습니다.{" "}
          <button onClick={() => openDataset("runs")}>실행 이력 조회</button>
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>작업</th>
                <th>명령 식별자</th>
                <th>주기</th>
                <th>실행 조건</th>
                <th>마지막 결과</th>
                <th>시작 · KST</th>
                <th>종료 · KST</th>
                <th>오류 코드</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(([key, title, interval, condition]) => {
                const task = summary?.tasks.find(
                  (item) => item.task_name === key,
                );
                return (
                  <tr key={key}>
                    <td>{title}</td>
                    <td>
                      <code>{key}</code>
                    </td>
                    <td>{interval}</td>
                    <td>{condition}</td>
                    <td>
                      {task
                        ? (labels[task.status] ?? task.status) +
                          " (" +
                          task.status +
                          ")"
                        : "기록 없음"}
                    </td>
                    <td>{date(task?.started_at)}</td>
                    <td>{date(task?.finished_at)}</td>
                    <td>{task?.error_code || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>DB에 실제 기록된 제공처</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>제공처</th>
                <th>원본 상태</th>
                <th>건수</th>
                <th>최근 수집 · KST</th>
              </tr>
            </thead>
            <tbody>
              {summary?.providers.map((item) => (
                <tr key={item.provider + item.state}>
                  <td>
                    <code>{item.provider}</code>
                  </td>
                  <td>
                    {labels[item.state] ?? item.state} ({item.state})
                  </td>
                  <td className="numeric">{number(item.count)}</td>
                  <td>{date(item.latest_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!summary?.providers.length && (
          <p>제공처 기록이 없거나 DB를 조회하지 못했습니다.</p>
        )}
      </section>
      <section>
        <h2>데이터 해석 시 주의점</h2>
        <ul>
          <li>
            PONGDANG_FUSION은 내부 융합 결과로 외부 API 실측값과 다릅니다.
          </li>
          <li>
            unknown은 판단 불가, unavailable은 근거 부족 등으로 제공할 수 없는
            상태입니다.
          </li>
          <li>
            succeeded는 명령이 끝났다는 뜻입니다. 새 데이터가 생겼거나
            안전하다는 의미는 아닙니다.
          </li>
          <li>
            NULL, 관측값 0건, 제공 불가 평가 기록을 실제 관측이나 안전한 상태로
            해석하지 않습니다.
          </li>
        </ul>
      </section>
      <p className="table-note">
        설명 기준: Multtara의 run_condition_pipeline, provider_config, 수집·평가
        모델. DB 조회 시각 {date(summary?.queried_at)} KST.
      </p>
    </article>
  );
}
