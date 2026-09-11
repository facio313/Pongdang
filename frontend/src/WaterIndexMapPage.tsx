import { useState } from "react";
import { ring } from "./groupAGrade";
import "./waterIndexMap.css";

// Group A: full-screen spot map + detail panel. This is a placeholder/demo
// mock of the map interaction pattern; it is not wired to real spot or score
// data yet. Not linked from App.tsx navigation -- integration happens later.

interface Activity {
  name: string;
  score: number | null;
  color: string;
  label: string;
  confidence: string;
}

interface Spot {
  id: string;
  name: string;
  addr: string;
  left: number;
  top: number;
  scoreColor: string;
  score: number;
  temp: string;
  tempShort: string;
  tempColor: string;
  airTemp: string;
  wind: string;
  activities: Activity[];
}

const spots: Spot[] = [
  {
    id: "gyeongpo",
    name: "경포해변",
    addr: "강원 강릉시 저동",
    left: 24,
    top: 34,
    scoreColor: "#0891b2",
    score: 72,
    temp: "22.1°C",
    tempShort: "22°",
    tempColor: "#22a6c9",
    airTemp: "26.4°C",
    wind: "3.2 m/s",
    activities: [
      { name: "수영", score: 72, color: "#0891b2", label: "양호", confidence: "0.81" },
      { name: "래프팅", score: 86, color: "#1d4ed8", label: "매우 좋음", confidence: "0.77" },
      { name: "휴식", score: null, color: "#5b6673", label: "평가값 없음", confidence: "0.40" },
    ],
  },
  {
    id: "anmok",
    name: "안목해변",
    addr: "강원 강릉시 견소동",
    left: 49,
    top: 62,
    scoreColor: "#0891b2",
    score: 68,
    temp: "24.8°C",
    tempShort: "25°",
    tempColor: "#e0a72a",
    airTemp: "25.1°C",
    wind: "4.0 m/s",
    activities: [
      { name: "수영", score: 68, color: "#0891b2", label: "양호", confidence: "0.75" },
      { name: "래프팅", score: 59, color: "#a16207", label: "보통", confidence: "0.70" },
      { name: "휴식", score: 74, color: "#0891b2", label: "양호", confidence: "0.66" },
    ],
  },
  {
    id: "sacheonjin",
    name: "사천진해변",
    addr: "강원 강릉시 사천면",
    left: 77,
    top: 42,
    scoreColor: "#a16207",
    score: 54,
    temp: "19.4°C",
    tempShort: "19°",
    tempColor: "#1d6fd8",
    airTemp: "23.8°C",
    wind: "5.4 m/s",
    activities: [
      { name: "수영", score: 54, color: "#a16207", label: "보통", confidence: "0.62" },
      { name: "래프팅", score: 48, color: "#a16207", label: "보통", confidence: "0.58" },
      { name: "휴식", score: 61, color: "#0891b2", label: "양호", confidence: "0.60" },
    ],
  },
];

function SpotRing({ spot, size }: { spot: Spot; size: number }) {
  const r = (size - 8) / 2;
  const c = size / 2;
  const { circumference, offset } = ring(r, spot.score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#dbe6ee" strokeWidth={5} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={spot.scoreColor}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <circle cx={c} cy={c} r={10.5} fill={spot.tempColor} stroke="#fff" strokeWidth={1.5} />
      <text x={c} y={c + 3.5} textAnchor="middle" fontSize={9.5} fill="#fff" fontWeight={700}>
        {spot.tempShort}
      </text>
    </svg>
  );
}

export function WaterIndexMapPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeActivityName, setActiveActivityName] = useState<string | null>(null);

  const selected = spots.find((s) => s.id === selectedId) ?? null;
  const activeActivity = selected
    ? selected.activities.find((a) => a.name === activeActivityName) ?? selected.activities[0]
    : null;
  const introSpots = [...spots].sort((a, b) => b.score - a.score);

  function selectSpot(id: string) {
    const spot = spots.find((s) => s.id === id);
    setSelectedId(id);
    setActiveActivityName(spot ? spot.activities[0].name : null);
  }

  return (
    <article className="water-index-map">
      <div className="wim-tile-note">실제 지도 타일 미연동 · 좌표 배치도 확장판 (자리 표시)</div>

      <div className="wim-stage">
        {spots.map((spot) => (
          <button
            key={spot.id}
            className={"wim-pin" + (spot.id === selectedId ? " is-selected" : "")}
            style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
            onClick={() => selectSpot(spot.id)}
            aria-pressed={spot.id === selectedId}
            aria-label={`${spot.name} · 수영 ${spot.score} · ${spot.temp}`}
          >
            <SpotRing spot={spot} size={44} />
            <span className="wim-pin-label">{spot.name}</span>
            <span className="wim-pin-vals">
              {spot.score} · {spot.temp}
            </span>
          </button>
        ))}

        <div className="wim-panel">
          {!selected && (
            <>
              <div className="wim-panel-title">강릉 Water Index</div>
              <div className="wim-panel-sub">오늘 가장 좋은 곳부터 보여드려요</div>
              <div className="wim-intro-list">
                {introSpots.map((spot, index) => (
                  <button
                    key={spot.id}
                    className={"wim-intro-row" + (index === 0 ? " is-top" : "")}
                    onClick={() => selectSpot(spot.id)}
                  >
                    <SpotRing spot={spot} size={34} />
                    <span className="wim-intro-info">
                      <span className="wim-intro-name">
                        {spot.name}
                        {index === 0 && <span className="wim-intro-badge">오늘의 추천</span>}
                      </span>
                      <span className="wim-intro-vals">
                        수영 {spot.score} · {spot.temp}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="wim-safety-line">
                점수 · 수온은 참고용이며 안전을 보장하지 않습니다. 지도의 핀이나 위
                목록을 눌러 자세히 보세요.
              </p>
            </>
          )}

          {selected && activeActivity && (
            <>
              <div className="wim-panel-header">
                <div>
                  <div className="wim-panel-title">{selected.name}</div>
                  <div className="wim-panel-sub">{selected.addr}</div>
                </div>
                <button
                  className="wim-close"
                  onClick={() => {
                    setSelectedId(null);
                    setActiveActivityName(null);
                  }}
                  aria-label="선택 해제"
                >
                  ×
                </button>
              </div>

              <div className="wim-tabs" role="group" aria-label="활동 선택">
                {selected.activities.map((a) => (
                  <button
                    key={a.name}
                    className={"wim-tab" + (a.name === activeActivity.name ? " is-on" : "")}
                    aria-pressed={a.name === activeActivity.name}
                    onClick={() => setActiveActivityName(a.name)}
                  >
                    {a.name}
                  </button>
                ))}
              </div>

              <div
                className="wim-grade-ring"
                style={{
                  background:
                    activeActivity.score === null
                      ? "conic-gradient(rgba(27,39,51,.12) 0 100%)"
                      : `conic-gradient(${activeActivity.color} 0 ${activeActivity.score}%, rgba(27,39,51,.12) ${activeActivity.score}% 100%)`,
                }}
              >
                <div className="wim-grade-ring-inner">
                  <div className="wim-grade-ring-num" style={{ color: activeActivity.color }}>
                    {activeActivity.score === null ? "NULL" : activeActivity.score}
                  </div>
                  <div className="wim-grade-ring-label" style={{ color: activeActivity.color }}>
                    {activeActivity.label}
                  </div>
                </div>
              </div>

              <div className="wim-fact-grid">
                <div className="wim-fact-card is-temp">
                  <span className="wim-fact-label">수온</span>
                  <span className="wim-fact-value" style={{ color: selected.tempColor }}>
                    {selected.temp}
                  </span>
                </div>
                <div className="wim-fact-card">
                  <span className="wim-fact-label">기온</span>
                  <span className="wim-fact-value">{selected.airTemp}</span>
                </div>
                <div className="wim-fact-card">
                  <span className="wim-fact-label">풍속</span>
                  <span className="wim-fact-value">{selected.wind}</span>
                </div>
              </div>

              <p className="wim-safety-line">
                안전 상태: <strong>unknown</strong> — 이 화면은 안전을 보장하지
                않습니다. 현장에서 직접 확인하세요.
              </p>

              <details className="wim-more">
                <summary>자세히 보기 (전체 활동 표)</summary>
                <table className="wim-table">
                  <thead>
                    <tr>
                      <th>활동</th>
                      <th>점수</th>
                      <th>신뢰도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.activities.map((a) => (
                      <tr key={a.name}>
                        <td>{a.name}</td>
                        <td style={{ color: a.color, fontWeight: 700 }}>
                          {a.score === null ? "NULL" : a.score} · {a.label}
                        </td>
                        <td>{a.confidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="wim-note">
                  근거 지표는 평가 시점이 아니라 최신 관측이며, 점수 계산에
                  실제로 쓰인 값과 같다는 보장은 없습니다. 점수 · 수온 · 안전
                  상태 · 신뢰도는 서로 다른 값이며 하나로 요약하지 않습니다.
                  NULL과 unknown은 0점이나 안전한 상태를 뜻하지 않습니다.
                </p>
              </details>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
