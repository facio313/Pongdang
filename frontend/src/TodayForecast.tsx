import { t } from "./i18n.ts";
import { useState } from "react";
import { activities, type Activity } from "./aiApi";
import { ConditionScoreDetails } from "./ConditionScoreDetails";
import { gradeOf } from "./groupAGrade";
import {
  dataStatusText,
  forecastInputText,
  metricNameLabel,
  kstDate,
  scoreCoverageText,
  timeLabel,
  type Forecast,
  type RowPage,
} from "./productData";
import { GradeChip, StateChip } from "./pongdangUi";
import { useConditionDays } from "./useConditionDays";
import { useResource } from "./useResource";

export function TodayForecast({ id, now, activity, placeSettled = false }: {
  id?: number;
  now: string;
  activity: Activity;
  placeSettled?: boolean;
}) {
  const queriedDays = useConditionDays(id, now, activity);
  const days = queriedDays.map((day) => placeSettled ? { ...day, loading: false } : day);
  const [forecastDayId, setForecastDayId] = useState(days[0].id);
  const selected = days.find((day) => day.id === forecastDayId) ?? days[0];
  const from = `${selected.id}T00:00:00+09:00`;
  const nextDate = kstDate(new Date(Date.parse(from) + 86400000));
  const until = `${nextDate}T00:00:00+09:00`;
  const forecasts = useResource<RowPage<Forecast>>(id
    ? "water-forecast/forecasts?" + new URLSearchParams({
      spot_id: String(id), activity, mode: "forecast", from, until,
      page: "1", page_size: "100",
    })
    : placeSettled ? null : undefined);
  const maxScore = Math.max(...days.map((day) => day.score ?? 0), 1);
  const rows = forecasts.data?.rows ?? [];
  const coverage = selected.data ? scoreCoverageText(selected.data) : "";

  return (
    <section aria-label={t("7일 예보")}>
      <div className="td-section-head">
        <h2 className="pd-lbl">
          {t("7일 예보 · {activity}", { activity: t(activities[activity]) })}<span className="td-lbl-plain"> · A2</span>
        </h2>
      </div>
      <div className="pd-card">
        <div className="td-bars" role="group" aria-label={t("날짜 선택")}>
          {days.map((day) => {
            const grade = gradeOf(day.score);
            const dayCoverage = day.data ? scoreCoverageText(day.data) : "";
            return (
              <button
                type="button"
                key={day.id}
                className={"td-bar" + (day.id === selected.id ? " is-selected" : "")}
                data-grade={grade.key}
                aria-pressed={day.id === selected.id}
                aria-label={`${day.weekday} ${day.dateLabel} · ${
                  day.loading ? t("조회 중") : day.error ? t("조회 실패") : day.score === null
                    ? t("평가값 없음") : t("{score}점 {grade}", { score: day.score, grade: t(grade.label) })
                }${dayCoverage ? ` · ${dayCoverage}` : ""}`}
                onClick={() => setForecastDayId(day.id)}
              >
                <span className="td-bar-score">
                  {day.loading ? t("조회 중") : day.error ? t("조회 실패") : day.score === null ? "–" : day.score}
                </span>
                <span className="td-bar-fill" style={{
                  height: day.score === null ? "4px" : `${Math.max(8, (day.score / maxScore) * 46)}px`,
                  background: grade.color,
                }} />
                <span className="td-bar-day">{day.weekday}</span>
              </button>
            );
          })}
        </div>

        <div className="td-bar-detail">
          <span>{selected.weekday} · {selected.dateLabel}</span>
          {selected.loading ? <span role="status">{t("예보 점수 조회 중")}</span>
            : selected.error ? <span>{t("예보 점수 조회 실패")}</span>
            : <><GradeChip score={selected.score} />
              {selected.score === null && <StateChip kind="no_data" />}
            </>}
          {coverage && <span>{coverage}</span>}
        </div>
        {selected.error && <p className="pd-note" role="alert">{t("예보 점수 조회 실패: {error}", { error: t(selected.error) })}</p>}
        {selected.data && <ConditionScoreDetails data={selected.data} className="pd-note" />}

        <div aria-label={t("선택 날짜 예보 목록")}>
          {forecasts.loading ? <p className="pd-note" role="status">{t("선택 날짜의 예보 목록을 조회하고 있습니다.")}</p>
            : forecasts.error ? <p className="pd-note" role="alert">{t("예보 목록 조회 실패: {error}", { error: t(forecasts.error) })}</p>
            : !id ? <p className="pd-note">{t("예보를 조회할 장소가 없습니다.")}</p>
            : forecasts.data && rows.length === 0 ? <p className="pd-note">
              {forecasts.data.total === 0
                ? t("선택 날짜로 조회한 예보 목록이 비어 있습니다.")
                : t("선택 날짜의 예보 목록을 표시할 수 없습니다.")}
              {selected.score !== null
                ? t(" 위 점수의 산정 근거는 점수 상세에서 확인할 수 있습니다.")
                : ` ${dataStatusText(forecasts.data.status ?? "no_data")}`}
            </p>
            : <>
              <p className="pd-note">{t("{date} KST 날짜에 걸친 예보 {total}건 중 {shown}건을 표시합니다.", { date: selected.id, total: forecasts.data?.total ?? rows.length, shown: rows.length })}</p>
              <ul className="pd-note">
                {rows.map((row) => <li key={row.source_key}>
                  {row.station_name} · {row.provider} · {kstDate(row.target_start_at)} {timeLabel(row.target_start_at)}–{kstDate(row.target_end_at)} {timeLabel(row.target_end_at)} KST · {dataStatusText(row.state)} · {row.inputs.map((input) => `${metricNameLabel(input.name)}: ${forecastInputText(input, row.state)}`).join(" / ")}
                </li>)}
              </ul>
            </>}
        </div>
        <p className="pd-note">
          {t("원자료 목록은 선택한 KST 날짜에 걸친 예보를 최대 100건까지 표시합니다. 날짜별 점수는 해당 날짜 12:00 KST에 유효한 수집 예보로 계산합니다. 목록 조회와 점수 조회는 별개이며, 해당 시각의 점수 근거가 없으면 –입니다.")}</p>
      </div>
    </section>
  );
}
