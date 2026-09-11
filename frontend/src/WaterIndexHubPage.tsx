import { useState } from "react";
import { ring } from "./groupAGrade";
import "./waterIndexHub.css";

// Group A hub: pulls a one-line summary from each Condition Data screen (Water
// Forecast, the spot map, livecam, tide timer, first-swim alert, water quality)
// onto one page. This screen renders no data of its own; every number here is
// placeholder layout content until each source screen is wired to real data.
// Not yet linked from App.tsx navigation -- integration happens separately.

interface HubSpot {
  id: string;
  name: string;
  left: number;
  top: number;
  scoreColor: string;
  score: number;
  temp: string;
  tempColor: string;
}

const spots: HubSpot[] = [
  { id: "gyeongpo", name: "경포해변", left: 24, top: 34, scoreColor: "#0891b2", score: 72, temp: "22.1°C", tempColor: "#22a6c9" },
  { id: "anmok", name: "안목해변", left: 49, top: 62, scoreColor: "#0891b2", score: 68, temp: "24.8°C", tempColor: "#e0a72a" },
  { id: "sacheonjin", name: "사천진해변", left: 77, top: 42, scoreColor: "#a16207", score: 54, temp: "19.4°C", tempColor: "#1d6fd8" },
];

const forecast = {
  score: 82,
  color: "#1d4ed8",
  label: "매우 좋음",
  sentence: "오늘은 수영하기 좋은 날입니다.",
  weather: "맑음",
  wave: "0.6m",
  waterTemp: "22.1°C",
  rain: "10%",
  activities: [
    { name: "수영", score: 82, color: "#1d4ed8" },
    { name: "래프팅", score: 86, color: "#1d4ed8" },
    { name: "온천", score: 70, color: "#0891b2" },
  ],
};

function SpotRing({ spot, size, hole }: { spot: HubSpot; size: number; hole: number }) {
  const r = (size - 6) / 2;
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
      <circle cx={c} cy={c} r={hole} fill={spot.tempColor} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}

function ForecastCard() {
  return (
    <div className="hub-card hub-card-forecast">
      <div className="hub-card-top">
        <div className="hub-card-title">Water Forecast · 경포해변</div>
        <span className="hub-link-chip">예보 더보기 →</span>
      </div>
      <div className="hub-forecast-body">
        <div
          className="hub-forecast-ring"
          style={{
            background: `conic-gradient(${forecast.color} 0 ${forecast.score}%, rgba(27,39,51,.12) ${forecast.score}% 100%)`,
          }}
        >
          <div className="hub-forecast-ring-inner">
            <div className="hub-forecast-ring-num" style={{ color: forecast.color }}>
              {forecast.score}
            </div>
            <div className="hub-forecast-ring-label" style={{ color: forecast.color }}>
              {forecast.label}
            </div>
          </div>
        </div>
        <div>
          <div className="hub-forecast-sentence">{forecast.sentence}</div>
          <div className="hub-forecast-chips">
            <span className="hub-mini-chip">날씨 {forecast.weather}</span>
            <span className="hub-mini-chip">파고 {forecast.wave}</span>
            <span className="hub-mini-chip">수온 {forecast.waterTemp}</span>
            <span className="hub-mini-chip">강수 {forecast.rain}</span>
          </div>
        </div>
      </div>
      <div className="hub-forecast-acts">
        {forecast.activities.map((a) => (
          <div className="hub-forecast-act" key={a.name}>
            <div className="hub-forecast-act-name">{a.name}</div>
            <div className="hub-forecast-act-score" style={{ color: a.color }}>
              {a.score}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniCards() {
  return (
    <>
      <div className="hub-card">
        <div className="hub-card-top">
          <div className="hub-card-title">라이브캠</div>
        </div>
        <div className="hub-cam-thumb">경포해변</div>
        <div className="hub-cam-caption">맑음 · 수온 22.1°C</div>
        <span className="hub-link-chip">
          라이브캠 보기 →<span className="hub-demo-tag">예시</span>
        </span>
      </div>

      <div className="hub-card">
        <div className="hub-card-top">
          <div className="hub-card-title">물때 타이머</div>
        </div>
        <div className="hub-tide-note">지금 적합한 활동</div>
        <div className="hub-tide-badges">
          <span className="hub-tide-badge">래프팅</span>
          <span className="hub-tide-badge">갯벌 체험</span>
        </div>
        <div className="hub-tide-note">썰물 (지금) · 12:34 간조부터 밀물</div>
        <span className="hub-link-chip">
          물때 타이머 →<span className="hub-demo-tag">예시</span>
        </span>
      </div>

      <div className="hub-card">
        <div className="hub-card-top">
          <div className="hub-card-title">첫 입수 알림</div>
        </div>
        <div className="hub-swim-date">5월 18일</div>
        <div className="hub-swim-sub">수온 18.3°C로 기준을 처음 넘었어요</div>
        <span className="hub-link-chip">
          연도별 비교 →<span className="hub-demo-tag">예시</span>
        </span>
      </div>

      <div className="hub-card">
        <div className="hub-card-top">
          <div className="hub-card-title">수질 신뢰도</div>
        </div>
        <div className="hub-quality-row">
          <span>탁도</span>
          <span className="hub-quality-conf">신뢰도 0.82</span>
        </div>
        <div className="hub-quality-row">
          <span>용존산소</span>
          <span className="hub-quality-conf">신뢰도 0.78</span>
        </div>
        <div className="hub-quality-row">
          <span>pH</span>
          <span className="hub-quality-conf">신뢰도 0.85</span>
        </div>
        <span className="hub-link-chip">
          교차검증 보기 →<span className="hub-demo-tag">예시</span>
        </span>
      </div>
    </>
  );
}

function SpotListRow({
  spot,
  isTop,
  isActive,
  onSelect,
}: {
  spot: HubSpot;
  isTop: boolean;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={"hub-intro-row" + (isActive ? " is-selected" : "")}
      onClick={onSelect}
      aria-pressed={isActive}
    >
      <SpotRing spot={spot} size={32} hole={10.5} />
      <span className="hub-intro-row-info">
        <span className="hub-intro-row-name">
          {spot.name}
          {isTop && <span className="hub-intro-badge">오늘의 추천</span>}
        </span>
        <span className="hub-intro-row-vals">
          수영 {spot.score} · {spot.temp}
        </span>
      </span>
    </button>
  );
}

export function WaterIndexHubPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const top = [...spots].sort((a, b) => b.score - a.score)[0];
  const active = spots.find((s) => s.id === selectedId) ?? top;
  const sortedSpots = [...spots].sort((a, b) => b.score - a.score);

  function toggle(id: string) {
    setSelectedId((current) => (current === id ? null : id));
  }

  return (
    <article className="water-index-hub">
      <div className="hub-backdrop" aria-hidden="true" />
      <div className="hub-content">
        <h1>
          강릉 Water Index <small>· 오늘의 물 상태를 한눈에</small>
        </h1>
        <p className="hub-lede">
          지도, 예보, 라이브캠, 물때, 수질까지 오늘 확인하면 좋은 정보를 한
          화면에 모았습니다. 각 카드는 해당 화면의 요약이며, 자세한 내용은
          상단 메뉴에서 볼 수 있습니다.
        </p>

        {/* Desktop: forecast + map hero row, then 4 mini cards */}
        <div className="hub-grid hub-desktop-layout">
          <ForecastCard />
          <div className="hub-card hub-card-map">
            <div className="hub-card-top">
              <div className="hub-card-title">지점 지도</div>
              <span className="hub-link-chip">전체 지도 보기 →</span>
            </div>
            <div className="hub-map-stage">
              {spots.map((spot) => (
                <button
                  key={spot.id}
                  className={"hub-map-pin" + (spot.id === active.id ? " is-selected" : "")}
                  style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
                  onClick={() => toggle(spot.id)}
                  aria-pressed={spot.id === active.id}
                  aria-label={`${spot.name} · 수영 ${spot.score} · ${spot.temp}`}
                >
                  <SpotRing spot={spot} size={34} hole={10} />
                  <span className="hub-map-pin-label">{spot.name}</span>
                </button>
              ))}
            </div>
            <div className="hub-map-info">
              <SpotRing spot={active} size={30} hole={10} />
              <div>
                <div className="hub-map-info-name">
                  {active.name}
                  {active.id === top.id && !selectedId ? " · 오늘의 추천" : ""}
                </div>
                <div className="hub-map-info-vals">
                  수영 {active.score} · {active.temp}
                </div>
              </div>
            </div>
            <div className="hub-map-hint">
              핀을 눌러 다른 지점을 확인하세요. 점수 · 수온은 참고용이며
              안전을 보장하지 않습니다.
            </div>
          </div>
          <MiniCards />
        </div>

        {/* Mobile: forecast, tide|first-swim row, spot list (was a drawer), then map */}
        <div className="hub-stack hub-mobile-layout">
          <ForecastCard />
          <div className="hub-row">
            <div className="hub-card">
              <div className="hub-card-top">
                <div className="hub-card-title">물때 타이머</div>
              </div>
              <div className="hub-tide-note">지금 적합한 활동</div>
              <div className="hub-tide-badges">
                <span className="hub-tide-badge">래프팅</span>
                <span className="hub-tide-badge">갯벌 체험</span>
              </div>
              <div className="hub-tide-note">
                썰물 (지금)
                <br />
                12:34 간조부터 밀물
              </div>
              <span className="hub-link-chip">
                자세히 →<span className="hub-demo-tag">예시</span>
              </span>
            </div>
            <div className="hub-card">
              <div className="hub-card-top">
                <div className="hub-card-title">첫 입수 알림</div>
              </div>
              <div className="hub-swim-date">5월 18일</div>
              <div className="hub-swim-sub">수온 18.3°C로 기준을 처음 넘었어요</div>
              <span className="hub-link-chip">
                비교 보기 →<span className="hub-demo-tag">예시</span>
              </span>
            </div>
          </div>

          <div className="hub-card">
            <div className="hub-card-top">
              <div className="hub-card-title">강릉 Water Index</div>
            </div>
            <div className="hub-intro-sub">오늘 가장 좋은 곳부터 보여드려요</div>
            {sortedSpots.map((spot) => (
              <SpotListRow
                key={spot.id}
                spot={spot}
                isTop={spot.id === top.id}
                isActive={spot.id === active.id}
                onSelect={() => toggle(spot.id)}
              />
            ))}
          </div>

          <div className="hub-card">
            <div className="hub-card-top">
              <div className="hub-card-title">지도</div>
              <span className="hub-link-chip">전체 지도 →</span>
            </div>
            <div className="hub-map-stage hub-map-stage-mobile">
              {spots.map((spot) => (
                <div
                  key={spot.id}
                  className={"hub-map-pin" + (spot.id === active.id ? " is-selected" : "")}
                  style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
                >
                  <SpotRing spot={spot} size={28} hole={9} />
                  <span className="hub-map-pin-label">{spot.name}</span>
                </div>
              ))}
            </div>
            <div className="hub-map-hint">
              위 목록에서 지점을 누르면 지도에서 표시돼요. 점수 · 수온은
              참고용이며 안전을 보장하지 않습니다.
            </div>
          </div>
        </div>

        <p className="hub-note">
          이 화면은 각 세부 화면의 요약을 모은 허브입니다. 라이브캠 · 물때 ·
          첫 입수 · 수질은 아직 데이터 수집이 연동되지 않아 예시 데이터로
          표시됩니다. 점수 · 신뢰도 · 안전 상태는 서로 다른 값이며 하나로
          요약하지 않습니다.
        </p>
      </div>
    </article>
  );
}
