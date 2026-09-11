import { useState } from "react";
import "./firstSwim.css";

// Group A: "first swim of the year" alert (A7). Two columns: this year's
// first-swim date, and a year-over-year comparison with a year picker.
// Placeholder only -- not wired to real observations. Not linked from App.tsx.

interface YearRecord {
  year: number;
  date: string;
  /** Day-of-year, non-leap-year simple comparison only. */
  doy: number;
}

const currentYear: YearRecord = { year: 2026, date: "5/18", doy: 138 };
const pastYears: YearRecord[] = [
  { year: 2025, date: "5/12", doy: 132 },
  { year: 2024, date: "5/20", doy: 140 },
  { year: 2023, date: "5/24", doy: 144 },
];

export function FirstSwimPage() {
  const [selectedYear, setSelectedYear] = useState(pastYears[0].year);
  const selected = pastYears.find((y) => y.year === selectedYear) ?? pastYears[0];
  const diff = currentYear.doy - selected.doy; // 양수: 올해가 더 늦음 / 음수: 올해가 더 빠름
  const compareText = diff === 0 ? "작년과 같은 날" : diff > 0 ? `${diff}일 늦음` : `${-diff}일 빠름`;
  const compareClass = diff > 0 ? "is-slower" : diff < 0 ? "is-faster" : "";

  return (
    <article className="first-swim">
      <h1>
        올해 첫 입수 가능 알림 <small>· 강릉 · 경포해변</small>
      </h1>
      <p className="fs-lede">
        수온이 기준치를 올해 처음 넘은 시점을 알려주는 화면입니다. 실제
        트리거·알림 발송 기능은 아직 구현되지 않았습니다.
      </p>

      <div className="fs-panel">
        <div className="fs-cols">
          <div className="fs-col">
            <div className="fs-col-label">첫 입수 날</div>
            <div className="fs-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
              </svg>
            </div>
            <div className="fs-big-date">5월 18일</div>
            <div className="fs-sub">
              수온 <b>18.3°C</b>로 기준(18.0°C)을 처음 넘었어요
            </div>
          </div>
          <div className="fs-col">
            <div className="fs-col-label">연도별 입수 비교</div>
            <select
              className="fs-year-select"
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              aria-label="비교 연도 선택"
            >
              {pastYears.map((y) => (
                <option key={y.year} value={y.year}>
                  {y.year}년
                </option>
              ))}
            </select>
            <div className="fs-compare">
              <div className={"fs-compare-delta " + compareClass}>{compareText}</div>
              <div className="fs-compare-dates">
                이번 해 5/18 · {selected.year}년 {selected.date}
              </div>
            </div>
          </div>
        </div>
        <p className="fs-note">
          날짜·기준(수온 임계값)은 예시이며, 실제 데이터 연동 시 재검토가
          필요합니다.
        </p>
      </div>
    </article>
  );
}
