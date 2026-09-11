import { useState } from "react";
import "./livecamHub.css";

// Group A: livecam hub (A5). Featured player + thumbnail strip. Placeholder
// only -- no livecam integration exists yet. Not linked from App.tsx navigation.

interface Cam {
  id: string;
  name: string;
  weather: string;
  waterTemp: string;
  gradFrom: string;
  gradTo: string;
  caption: string;
}

const cams: Cam[] = [
  { id: "gyeongpo", name: "경포해변", weather: "맑음", waterTemp: "22.1°C", gradFrom: "#4fb3d9", gradTo: "#1d6fd8", caption: "정면 · 해변 중앙" },
  { id: "anmok", name: "안목해변", weather: "구름 조금", waterTemp: "24.8°C", gradFrom: "#e0a72a", gradTo: "#b97a1d", caption: "카페거리 방향" },
  { id: "sacheonjin", name: "사천진해변", weather: "흐림", waterTemp: "19.4°C", gradFrom: "#6b8fae", gradTo: "#33475a", caption: "방파제 방향" },
];

export function LivecamHubPage() {
  const [selectedId, setSelectedId] = useState(cams[0].id);
  const cam = cams.find((c) => c.id === selectedId) ?? cams[0];

  return (
    <article className="livecam-hub">
      <h1>
        라이브캠 물멍 허브 <small>· 강릉</small>
      </h1>
      <p className="lc-lede">
        해변 라이브캠을 한 곳에서 확인합니다. 실시간 영상 연동은 아직
        구현되지 않았으며, 아래 화면 구성은 레이아웃 확인용 예시입니다.
      </p>
      <p className="lc-warning" role="note">
        라이브캠 연동이 아직 구현되지 않았습니다. 아래 화면·수치는 예시입니다.
      </p>

      <div className="lc-panel">
        <div
          className="lc-featured"
          style={{ background: `linear-gradient(160deg, ${cam.gradFrom}, ${cam.gradTo})` }}
        >
          <div className="lc-featured-label">
            {cam.name} <span className="lc-demo-tag">예시</span>
          </div>
          <div className="lc-featured-caption">{cam.caption}</div>
        </div>
        <div className="lc-meta-row">
          <span className="lc-chip">날씨 {cam.weather}</span>
          <span className="lc-chip">수온 {cam.waterTemp}</span>
        </div>

        <div className="lc-thumb-strip" role="group" aria-label="캠 선택">
          {cams.map((c) => (
            <button
              key={c.id}
              className={"lc-thumb" + (c.id === selectedId ? " is-selected" : "")}
              style={{ background: `linear-gradient(160deg, ${c.gradFrom}, ${c.gradTo})` }}
              onClick={() => setSelectedId(c.id)}
              aria-pressed={c.id === selectedId}
            >
              <span className="lc-thumb-label">{c.name}</span>
            </button>
          ))}
        </div>
        <p className="lc-note">
          영상은 실시간 관측이 아니며 안전 판단에 사용할 수 없습니다.
        </p>
      </div>
    </article>
  );
}
