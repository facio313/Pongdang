// Group A: tide activity timer (A6). Emphasises which activity fits the
// current tide phase; ebb/flood direction is a small secondary indicator.
// Placeholder only -- tide data is not wired yet. Not linked from App.tsx.
import "./tideTimer.css";

interface TideEvent {
  time: string;
  label: string;
  cm: number;
  kind: "high" | "low";
  isNext?: boolean;
}

interface Activity {
  name: string;
  fit: boolean;
  reason: string;
}

const events: TideEvent[] = [
  { time: "06:12", label: "만조", cm: 162, kind: "high" },
  { time: "12:34", label: "간조", cm: 48, kind: "low", isNext: true },
  { time: "18:47", label: "만조", cm: 158, kind: "high" },
  { time: "00:58", label: "간조 (내일)", cm: 52, kind: "low" },
];

const activities: Activity[] = [
  { name: "갯벌 체험", fit: true, reason: "간조 전후 2시간이 체험하기 좋아요." },
  { name: "래프팅", fit: true, reason: "밀물이 시작될 때 물살이 좋아요." },
  { name: "튜브 물놀이", fit: false, reason: "만조 무렵에 다시 추천드려요." },
];

export function TideTimerPage() {
  const next = events.find((e) => e.isNext) ?? events[0];
  // next가 간조(low)면 지금은 물이 빠지는 중(썰물), 만조(high)면 지금은 밀물.
  // 방향이 바뀌는 시점은 항상 next의 시각이므로 그 값을 그대로 재사용한다.
  const isEbbNow = next.kind === "low";
  const isFloodNow = !isEbbNow;
  const transitionSuffix = ` · ${next.time}부터`;
  const ebbSuffix = isEbbNow ? " (지금)" : transitionSuffix;
  const floodSuffix = isFloodNow ? " (지금)" : transitionSuffix;
  const now = { cm: 96 };

  return (
    <article className="tide-timer">
      <h1>
        물때 액티비티 타이머 <small>· 강릉 · 경포해변</small>
      </h1>
      <p className="tt-lede">
        조위(물때)에 따라 적합한 활동 시간대가 달라지는 것을 한눈에
        보여줍니다. 예보와 마찬가지로 실시간 관측이 아니며, 새로운 안전
        판정을 만들지 않습니다.
      </p>
      <p className="tt-warning" role="note">
        조위 데이터는 아직 실연동되지 않았습니다. 아래 시각·수치는 레이아웃
        확인용 예시입니다.
      </p>

      <div className="tt-panel">
        <h2>지금 이 시간, 어떤 활동이 좋을까요?</h2>
        <div className="tt-act-grid">
          {activities.map((a) => (
            <div className={"tt-act-card" + (a.fit ? " is-fit" : " is-off")} key={a.name}>
              <div className="tt-act-top">
                <div className="tt-act-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                    <path d="M2 17c2 0 2-3 4-3s2 3 4 3 2-3 4-3 2 3 4 3 2-3 4-3" />
                  </svg>
                </div>
                <div>
                  <div className="tt-act-name">{a.name}</div>
                  <span className={"tt-act-badge" + (a.fit ? " is-fit" : " is-off")}>
                    {a.fit ? "적합" : "부적합"}
                  </span>
                </div>
              </div>
              <div className="tt-act-reason">{a.reason}</div>
            </div>
          ))}
        </div>
        <p className="tt-note">
          적합도는 물때 조건만을 기준으로 하며, 수온·기상 등 다른 조건은
          Water Index에서 별도로 확인하세요.
        </p>

        <div className="tt-tide-compact">
          <span className={"tt-tide-pill" + (isEbbNow ? " is-now" : "")}>썰물{ebbSuffix}</span>
          <span className="tt-tide-arrow">→</span>
          <span className={"tt-tide-pill" + (isFloodNow ? " is-now" : "")}>밀물{floodSuffix}</span>
          <span className="tt-tide-cm">
            현재 조위 <b>{now.cm}cm</b>
          </span>
        </div>
        <div className="tt-tide-strip">
          {events.map((e) => (
            <div className={"tt-tide-item" + (e.isNext ? " is-next" : "")} key={e.time}>
              <div className="tt-tide-time">{e.time}</div>
              <div className="tt-tide-label">{e.label}</div>
              <div className="tt-tide-cm-val">{e.cm}cm</div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
