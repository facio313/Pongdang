import { useState } from "react";
import { ring, CONFIDENCE_COLOR } from "./groupAGrade";
import "./waterQuality.css";

// Group A: water-quality cross-validation (A8). Compares the same indicator
// across sources. Placeholder only -- water-quality collection is not
// implemented (see AGENTS.md). Not linked from App.tsx navigation.

interface Source {
  name: string;
  method: "observed" | "derived";
  value: string;
  confidence: number;
  time: string;
}

interface Indicator {
  id: string;
  label: string;
  unit: string;
  sources: Source[];
}

const indicators: Indicator[] = [
  {
    id: "turbidity",
    label: "탁도",
    unit: "NTU",
    sources: [
      { name: "환경부 수질측정망 (예시)", method: "observed", value: "3.2", confidence: 0.82, time: "2026-09-11 06:00" },
      { name: "국립해양조사원 (예시)", method: "observed", value: "2.9", confidence: 0.71, time: "2026-09-11 06:00" },
      { name: "파생 계산 (예시)", method: "derived", value: "3.0", confidence: 0.65, time: "2026-09-11 06:05" },
    ],
  },
  {
    id: "dox",
    label: "용존 산소량",
    unit: "mg/L",
    sources: [
      { name: "환경부 수질측정망 (예시)", method: "observed", value: "7.8", confidence: 0.78, time: "2026-09-11 06:00" },
      { name: "국립해양조사원 (예시)", method: "observed", value: "8.1", confidence: 0.74, time: "2026-09-11 06:00" },
      { name: "파생 계산 (예시)", method: "derived", value: "7.9", confidence: 0.60, time: "2026-09-11 06:05" },
    ],
  },
  {
    id: "ph",
    label: "pH",
    unit: "",
    sources: [
      { name: "환경부 수질측정망 (예시)", method: "observed", value: "7.6", confidence: 0.85, time: "2026-09-11 06:00" },
      { name: "국립해양조사원 (예시)", method: "observed", value: "7.4", confidence: 0.69, time: "2026-09-11 06:00" },
      { name: "파생 계산 (예시)", method: "derived", value: "7.5", confidence: 0.58, time: "2026-09-11 06:05" },
    ],
  },
];

export function WaterQualityPage() {
  const [selectedId, setSelectedId] = useState(indicators[0].id);
  const indicator = indicators.find((i) => i.id === selectedId) ?? indicators[0];

  return (
    <article className="water-quality">
      <h1>
        수질 신뢰도 교차검증 <small>· 강릉</small>
      </h1>
      <p className="wq-lede">
        같은 지표를 서로 다른 출처가 관측했을 때 값이 얼마나 일치하는지와
        각 값의 신뢰도를 비교합니다. 새로운 판정을 만들지 않고 저장된 값만
        비교합니다.
      </p>
      <p className="wq-warning" role="note">
        수질 수집은 아직 구현되지 않았습니다. 아래 수치·신뢰도·시각은 실제
        저장된 값이 아니라 레이아웃 확인용 예시입니다.
      </p>

      <div className="wq-panel">
        <div className="wq-chips" role="group" aria-label="지표 선택">
          {indicators.map((i) => (
            <button
              key={i.id}
              className={"wq-chip-button" + (i.id === selectedId ? " is-on" : "")}
              onClick={() => setSelectedId(i.id)}
              aria-pressed={i.id === selectedId}
            >
              {i.label}
            </button>
          ))}
        </div>

        <h2>
          경포해변 · {indicator.label} · 출처별 비교 (예시 데이터)
        </h2>
        <div className="wq-grid">
          {indicator.sources.map((s) => {
            const { circumference, offset } = ring(24, s.confidence * 100);
            return (
              <div className="wq-card" key={s.name}>
                <div className="wq-card-top">
                  <span className="wq-name">{s.name}</span>
                  <span className="wq-method">{s.method}</span>
                </div>
                <div className="wq-value-row">
                  <svg className="wq-ring" viewBox="0 0 58 58" aria-hidden="true">
                    <circle cx="29" cy="29" r="24" fill="none" stroke="#dbe6ee" strokeWidth={6} />
                    <circle
                      cx="29"
                      cy="29"
                      r="24"
                      fill="none"
                      stroke={CONFIDENCE_COLOR}
                      strokeWidth={6}
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={offset}
                      transform="rotate(-90 29 29)"
                    />
                  </svg>
                  <div>
                    <div>
                      <span className="wq-value-num">{s.value}</span>
                      <span className="wq-value-unit">{indicator.unit}</span>
                    </div>
                    <div className="wq-conf-label">
                      신뢰도 <span className="wq-conf-num">{s.confidence.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="wq-meta">
                  <span>{s.time}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="wq-note">
          링·숫자는 신뢰도(confidence)이며 점수나 안전 판정이 아닙니다.
        </p>
      </div>
    </article>
  );
}
