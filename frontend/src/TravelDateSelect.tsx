import { t } from "./i18n";
import { travelDates } from "./travelDates";
import "./travelDateSelect.css";

export function TravelDateSelect({ value, onChange, disabled = false }: {
  value: string;
  onChange: (date: string) => void;
  disabled?: boolean;
}) {
  const days = travelDates();
  return (
    <div className="travel-date-select">
      <label>
        <span>{t("여행 날짜")}</span>
        <select value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>
          {days.map(day => <option key={day.id} value={day.id}>{day.dateLabel} · {day.weekday}</option>)}
        </select>
      </label>
      <p>{t("오늘부터 7일 중 선택할 수 있습니다. 날짜·항목별 예보가 없으면 미확인으로 표시합니다.")}</p>
    </div>
  );
}
