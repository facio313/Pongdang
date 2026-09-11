// Shared display-only grade palette for Group A (Condition Data) screens.
// Mirrors the same blue-to-red, colour-blind-safe order used across A1-A8 so a
// score always reads the same way regardless of which screen shows it.
// Display-only: never rewrites or infers a stored value, and colour never
// stands in for a safety judgement -- the number and label always ride along.

export interface Grade {
  key: string;
  label: string;
  /** Inclusive lower bound on a 0-100 scale. */
  min: number;
  color: string;
}

export const grades: Grade[] = [
  { key: "excellent", label: "매우 좋음", min: 80, color: "#1d4ed8" },
  { key: "good", label: "양호", min: 60, color: "#0891b2" },
  { key: "fair", label: "보통", min: 40, color: "#a16207" },
  { key: "caution", label: "주의", min: 20, color: "#c2410c" },
  { key: "poor", label: "나쁨", min: 0, color: "#b91c1c" },
];

export const unscored: Grade = {
  key: "unscored",
  label: "평가값 없음",
  min: Number.NaN,
  color: "#5b6673",
};

/** Neutral colour for confidence/reliability values, deliberately distinct from
 * the grade palette above so a confidence ring can never be mistaken for a
 * safety or suitability judgement. */
export const CONFIDENCE_COLOR = "#4a6d8c";

/** Returns the grade for a 0-100 score, or `unscored` when there is no usable number. */
export function gradeOf(score: number | null | undefined): Grade {
  if (score === null || score === undefined) return unscored;
  if (!Number.isFinite(score) || score < 0 || score > 100) return unscored;
  return grades.find((item) => score >= item.min) ?? unscored;
}

/** SVG ring geometry for a given radius, plus the stroke-dasharray/offset for a 0-100 value. */
export function ring(radius: number, value: number | null | undefined) {
  const circumference = 2 * Math.PI * radius;
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  return {
    circumference: circumference.toFixed(1),
    offset: (circumference * (1 - pct / 100)).toFixed(1),
  };
}
