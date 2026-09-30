import { t } from "./i18n.ts";
import { useState } from "react";
import { activities, type Activity } from "./aiApi";
import { gradeOf } from "./groupAGrade";
import {
  dataStatusText,
  kstDate,
  scoreCoverageText,
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
                  day.loading ? t("조회 중") : day.error ? t("조회 실패") : day.awaitingForecast ? t("예보 자료 대기") : day.score === null
                    ? t("평가값 없음") : t("{score}점 {grade}", { score: day.score, grade: t(grade.label) })
                }${dayCoverage ? ` · ${dayCoverage}` : ""}`}
                onClick={() => setForecastDayId(day.id)}
              >
                <span className="td-bar-score">
                  {day.loading ? t("조회 중") : day.error ? t("조회 실패") : day.awaitingForecast ? t("대기") : day.score === null ? "–" : day.score}
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
            : selected.awaitingForecast ? <span role="status">{t("예보 자료 대기")}</span>
            : <><GradeChip score={selected.score} />
              {selected.score === null && <StateChip kind="no_data" />}
            </>}
          {coverage && <span>{coverage}</span>}
        </div>
        {selected.error && <p className="pd-note" role="alert">{t("예보 점수 조회 실패: {error}", { error: t(selected.error) })}</p>}
        {selected.awaitingForecast && !selected.error && <p className="pd-note">{t("해당 날짜의 예보 자료를 아직 받지 못했습니다. 자료가 수집되면 점수를 표시합니다.")}</p>}

        {/* 원자료 목록(관측소 · 제공기관 · 시각 · 입력값 100건)은 내렸습니다.
            남는 것은 조회 상태와 「목록이 비어 있다」는 사실뿐입니다 -- 목록이
            없는 것과 조회에 실패한 것을 뭉뚱그리지 않기 위해 이 줄은 지우지
            않습니다. */}
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
            : null}
        </div>
      </div>
    </section>
  );
}
