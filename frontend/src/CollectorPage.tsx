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
  const count = (key: string) =>
    summary?.datasets.find((item) => item.key === key)?.count;
  const heartbeat = summary?.heartbeat;
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">COLLECTOR OVERVIEW</p>
          <h1>Multtara Collector</h1>
          <p className="lead">
            외부 데이터를 수집하고, 근거를 보존하고, 물놀이 적합도를 계산하는
            백그라운드 작업입니다.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => openDataset("snapshots")}
        >
          저장 데이터 둘러보기 ↗
        </button>
      </section>
      <div className="stats-grid">
        <article className="stat">
          <span>Collector 활동</span>
          <strong className="status-value">
            {heartbeat
              ? (labels[heartbeat.effective_state] ?? heartbeat.effective_state)
              : "확인할 수 없음"}
          </strong>
          <small>마지막 신호 {date(heartbeat?.last_seen_at)}</small>
        </article>
        {[
          ["spots", "수집 대상 장소", "곳", "공식 자료 기반 장소 카탈로그"],
          ["metrics", "저장된 관측 측정값", "건", "실제 수치·문자·논리 지표"],
          [
            "forecasts",
            "일별 예측 평가 기록",
            "건",
            "제공 불가 평가를 포함한 건수",
          ],
        ].map(([key, title, unit, note]) => (
          <button className="stat" key={key} onClick={() => openDataset(key)}>
            <span>{title}</span>
            <strong>
              {number(count(key))}
              <em>{unit}</em>
            </strong>
            <small>{note}</small>
          </button>
        ))}
      </div>
      {heartbeat?.effective_state === "stale" && (
        <div className="notice">
          <span className="notice-icon">!</span>
          <div>
            <strong>최근 활동 신호가 없습니다.</strong>
            <p>
              DB의 마지막 상태는 {heartbeat.state}이지만 활동 신호가 15분보다
              오래되었습니다. 현재 실행 중인지 확인할 수 없으며, 아래 수치는
              저장된 이력입니다.
            </p>
          </div>
        </div>
      )}
      <section className="panel flow-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">HOW IT WORKS</p>
            <h2>수집에서 평가까지</h2>
          </div>
          <span className="tag">웹 요청과 별도로 실행</span>
        </div>
        <ol className="pipeline">
          {[
            ["외부 API 조회", "설정된 제공처를 주기에 맞춰 호출"],
            ["지표 정규화", "관측·예보와 단위, 상태를 구분"],
            ["수집 근거 보존", "출처·시각·유효 기간을 DB에 기록"],
            ["적합도 평가", "필수 근거와 위험 조건을 먼저 확인"],
            ["결과·이력 저장", "점수와 안전 상태, 실행 결과 보존"],
          ].map(([title, desc], i) => (
            <li key={title}>
              <span className="step-number">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </li>
          ))}
        </ol>
        <div className="flow-note">
          원본이 없거나 오래되었으면 유효 기간을 임의로 늘리지 않습니다. 적합도
          점수, 안전 상태, 근거의 신뢰도는 서로 다른 값입니다.
        </div>
      </section>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DATA SOURCES</p>
            <h2>연결 가능한 데이터 제공처</h2>
          </div>
          <span className="muted">구현 범위와 현재 저장 여부는 다릅니다</span>
        </div>
        <div className="provider-grid">
          {providers.map(([code, name, title, desc, mode]) => (
            <article className="panel provider-card" key={code}>
              <div className="provider-top">
                <span className="provider-code">{code}</span>
                <span className="tag">{mode}</span>
              </div>
              <h3>{name}</h3>
              <strong className="provider-subtitle">{title}</strong>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="panel section-block">
        <div className="section-heading padded">
          <div>
            <p className="eyebrow">SCHEDULE & HISTORY</p>
            <h2>주기별 작업과 실행 이력</h2>
          </div>
          <button className="text-button" onClick={() => openDataset("runs")}>
            전체 이력 보기 ↗
          </button>
        </div>
        <p className="table-note">
          소스 코드의 기본 주기이며 운영 설정으로 변경할 수 있습니다. 실행
          기록이 없다는 사실만으로 키 미설정을 단정하지 않습니다.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>작업</th>
                <th>기본 주기</th>
                <th>실행 조건</th>
                <th>마지막 결과</th>
                <th>마지막 시작 · KST</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(([key, title, interval, condition]) => {
                const latest = summary?.tasks.find(
                  (task) => task.task_name === key,
                );
                return (
                  <tr key={key}>
                    <td>
                      <strong>{title}</strong>
                      <code className="block-code">{key}</code>
                    </td>
                    <td>{interval}</td>
                    <td>{condition}</td>
                    <td>
                      <span className="pill">
                        {latest
                          ? (labels[latest.status] ?? latest.status)
                          : "기록 없음"}
                      </span>
                    </td>
                    <td>{date(latest?.started_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="two-column section-block">
        <article className="panel padded">
          <h2>지금 DB에 기록된 제공처</h2>
          <p className="muted">스냅샷의 실제 제공처와 원본 상태 집계입니다.</p>
          <div className="source-list">
            {summary?.providers.length ? (
              summary.providers.map((source) => (
                <div key={`${source.provider}-${source.state}`}>
                  <div>
                    <code>{source.provider}</code>
                    <small>
                      {labels[source.state] ?? source.state} ·{" "}
                      {date(source.latest_at)}
                    </small>
                  </div>
                  <strong>{number(source.count)}건</strong>
                </div>
              ))
            ) : (
              <p className="muted">
                제공처 기록이 없거나 DB를 조회하지 못했습니다.
              </p>
            )}
          </div>
        </article>
        <article className="panel padded">
          <h2>기록을 읽을 때</h2>
          <ul className="reading-notes">
            <li>
              <code>PONGDANG_FUSION</code>은 내부 융합 결과이며 외부 API
              실측값과 다릅니다.
            </li>
            <li>
              <code>unknown</code>은 판단 불가, <code>unavailable</code>은 근거
              부족 등으로 제공할 수 없는 상태입니다.
            </li>
            <li>
              <code>succeeded</code>는 명령이 끝났다는 뜻입니다. 새 데이터가
              생겼거나 안전하다는 의미는 아닙니다.
            </li>
          </ul>
        </article>
      </section>
      <p className="footnote">
        설명 기준: Multtara의 run_condition_pipeline, provider_config, 수집·평가
        모델. DB 조회 시각 {date(summary?.queried_at)} · 모든 시각은 KST.
      </p>
    </>
  );
}
