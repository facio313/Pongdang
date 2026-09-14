import { useState } from "react";
import "./waterForecast.css";

// Group A: Water Forecast (A2). A bar-chart date selector with a ring-gauge +
// conversational-sentence hero for the selected day, evidence chips, and a
// brief per-activity summary row. Placeholder/demo data only -- not wired to
// a forecast API yet, and not linked from App.tsx navigation.

type WeatherIcon = "sunny" | "cloudy" | "overcast" | "rain" | "none";

interface DayActivity {
  name: string;
  score: number | null;
  color: string;
  label: string;
}

interface Day {
  id: string;
  dateLabel: string;
  weekday: string;
  score: number | null;
  color: string;
  label: string;
  weather: string;
  icon: WeatherIcon;
  waveHeight: string;
  rainChance: string;
  waterTemp: string;
  tempColor: string;
  activities: DayActivity[];
}

const days: Day[] = [
  { id: "d0", dateLabel: "9/11", weekday: "오늘", score: 82, color: "#1d4ed8", label: "매우 좋음", weather: "맑음", icon: "sunny", waveHeight: "0.6m", rainChance: "10%", waterTemp: "22.1°C", tempColor: "#22a6c9",
    activities: [ { name: "수영", score: 82, color: "#1d4ed8", label: "매우 좋음" }, { name: "래프팅", score: 86, color: "#1d4ed8", label: "매우 좋음" }, { name: "온천", score: 70, color: "#0891b2", label: "양호" } ] },
  { id: "d1", dateLabel: "9/12", weekday: "내일", score: 74, color: "#0891b2", label: "양호", weather: "구름 조금", icon: "cloudy", waveHeight: "0.8m", rainChance: "20%", waterTemp: "21.8°C", tempColor: "#22a6c9",
    activities: [ { name: "수영", score: 74, color: "#0891b2", label: "양호" }, { name: "래프팅", score: 78, color: "#0891b2", label: "양호" }, { name: "온천", score: 68, color: "#0891b2", label: "양호" } ] },
  { id: "d2", dateLabel: "9/13", weekday: "토", score: 58, color: "#a16207", label: "보통", weather: "흐림", icon: "overcast", waveHeight: "1.1m", rainChance: "40%", waterTemp: "21.0°C", tempColor: "#e0a72a",
    activities: [ { name: "수영", score: 58, color: "#a16207", label: "보통" }, { name: "래프팅", score: 52, color: "#a16207", label: "보통" }, { name: "온천", score: 65, color: "#0891b2", label: "양호" } ] },
  { id: "d3", dateLabel: "9/14", weekday: "일", score: 34, color: "#c2410c", label: "주의", weather: "비", icon: "rain", waveHeight: "1.6m", rainChance: "80%", waterTemp: "20.6°C", tempColor: "#e0a72a",
    activities: [ { name: "수영", score: 34, color: "#c2410c", label: "주의" }, { name: "래프팅", score: 28, color: "#c2410c", label: "주의" }, { name: "온천", score: 60, color: "#0891b2", label: "양호" } ] },
  { id: "d4", dateLabel: "9/15", weekday: "월", score: 66, color: "#0891b2", label: "양호", weather: "맑음", icon: "sunny", waveHeight: "0.7m", rainChance: "15%", waterTemp: "21.2°C", tempColor: "#22a6c9",
    activities: [ { name: "수영", score: 66, color: "#0891b2", label: "양호" }, { name: "래프팅", score: 70, color: "#0891b2", label: "양호" }, { name: "온천", score: 64, color: "#0891b2", label: "양호" } ] },
  { id: "d5", dateLabel: "9/16", weekday: "화", score: null, color: "#5b6673", label: "평가값 없음", weather: "미제공", icon: "none", waveHeight: "–", rainChance: "–", waterTemp: "–", tempColor: "#5b6673",
    activities: [ { name: "수영", score: null, color: "#5b6673", label: "평가값 없음" }, { name: "래프팅", score: null, color: "#5b6673", label: "평가값 없음" }, { name: "온천", score: null, color: "#5b6673", label: "평가값 없음" } ] },
  { id: "d6", dateLabel: "9/17", weekday: "수", score: 71, color: "#0891b2", label: "양호", weather: "구름 조금", icon: "cloudy", waveHeight: "0.9m", rainChance: "25%", waterTemp: "21.4°C", tempColor: "#22a6c9",
    activities: [ { name: "수영", score: 71, color: "#0891b2", label: "양호" }, { name: "래프팅", score: 75, color: "#0891b2", label: "양호" }, { name: "온천", score: 67, color: "#0891b2", label: "양호" } ] },
];

function heroSentence(day: Day): string {
  if (day.score === null) return "이 날짜는 저장된 예보가 없습니다.";
  if (day.score >= 80) return "오늘은 수영하기 아주 좋은 날입니다.";
  if (day.score >= 60) return "물놀이하기 무난한 날입니다.";
  if (day.score >= 40) return "가볍게 즐기기엔 괜찮지만 파고를 확인하세요.";
  if (day.score >= 20) return "오늘은 주의가 필요한 조건입니다.";
  return "오늘은 물놀이를 권하지 않는 조건입니다.";
}

function WeatherGlyph({ icon }: { icon: WeatherIcon }) {
  if (icon === "none") return <span className="wf-icon wf-icon-none">–</span>;
  return (
    <svg className="wf-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      {icon === "sunny" && (
        <>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 3v2.4M12 18.6V21M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M3 12h2.4M18.6 12H21M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
        </>
      )}
      {icon === "cloudy" && (
        <>
          <circle cx="8.5" cy="9.5" r="3.3" />
          <path d="M6 17h11a3.5 3.5 0 0 0 .4-6.98A5.2 5.2 0 0 0 8 9.1" />
        </>
      )}
      {icon === "overcast" && <path d="M6 16h11a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 7 8.2 3.8 3.8 0 0 0 6 16Z" />}
      {icon === "rain" && (
        <>
          <path d="M6 13h11a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 7 5.2 3.8 3.8 0 0 0 6 13Z" />
          <path d="M8 17v2M12 17v2M16 17v2" />
        </>
      )}
    </svg>
  );
}

export function WaterForecastPage() {
  const [selectedId, setSelectedId] = useState(days[0].id);
  const day = days.find((d) => d.id === selectedId) ?? days[0];
  const maxScore = Math.max(...days.map((d) => d.score ?? 0), 1);

  return (
    <article className="water-forecast">
      <h1>
        Water Forecast <small>· 경포해변</small>
      </h1>
      <p className="wf-lede">
        7일간의 물놀이 적합도 예보입니다. 날짜를 누르면 아래 상세가 바뀝니다.
        예보는 관측이 아니며 실제 조건과 다를 수 있습니다.
      </p>

      <div className="wf-panel">
        <div className="wf-datebar" role="group" aria-label="날짜 선택">
          {days.map((d) => (
            <button
              key={d.id}
              className={"wf-daycol" + (d.id === selectedId ? " is-selected" : "")}
              onClick={() => setSelectedId(d.id)}
              aria-pressed={d.id === selectedId}
            >
              <WeatherGlyph icon={d.icon} />
              <span className="wf-day-bar-track">
                <span
                  className="wf-day-bar-fill"
                  style={{
                    height: `${d.score === null ? 4 : Math.max(6, (d.score / maxScore) * 100)}%`,
                    background: d.color,
                  }}
                />
              </span>
              <span className="wf-day-score">{d.score === null ? "–" : d.score}</span>
              <span className="wf-day-label">{d.weekday}</span>
              <span className="wf-day-date">{d.dateLabel}</span>
            </button>
          ))}
        </div>

        <div className="wf-hero">
          <div
            className="wf-hero-ring"
            style={{
              background:
                day.score === null
                  ? "conic-gradient(rgba(27,39,51,.12) 0 100%)"
                  : `conic-gradient(${day.color} 0 ${day.score}%, rgba(27,39,51,.12) ${day.score}% 100%)`,
            }}
          >
            <div className="wf-hero-ring-inner">
              <div className="wf-hero-ring-num" style={{ color: day.color }}>
                {day.score === null ? "–" : day.score}
              </div>
              <div className="wf-hero-ring-label" style={{ color: day.color }}>
                {day.label}
              </div>
            </div>
          </div>
          <div className="wf-hero-body">
            <div className="wf-hero-sentence">{heroSentence(day)}</div>
            <div className="wf-hero-chips">
              <span className="wf-chip">날씨 {day.weather}</span>
              <span className="wf-chip">파고 {day.waveHeight}</span>
              <span className="wf-chip" style={{ color: day.tempColor }}>
                수온 {day.waterTemp}
              </span>
              <span className="wf-chip">강수 확률 {day.rainChance}</span>
            </div>
            <div className="wf-hero-acts">
              {day.activities.map((a) => (
                <div className="wf-hero-act" key={a.name}>
                  <span className="wf-hero-act-name">{a.name}</span>
                  <span className="wf-hero-act-score" style={{ color: a.color }}>
                    {a.score === null ? "–" : a.score}
                  </span>
                  <span className="wf-hero-act-label">{a.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="wf-note">
          점수 · 수온 · 강수 확률은 서로 다른 예보 값이며 하나로 요약하지
          않습니다. 저장된 값이 없으면 "–"로 표시하며 0점이 아닙니다.
        </p>
      </div>
    </article>
  );
}
