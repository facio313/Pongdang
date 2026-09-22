import { t } from "./i18n.ts";
import { useState } from "react";
import { AppActions } from "./AppShell";
import { Icon } from "./pongdangUi";
import { kstDate, timeLabel } from "./productData";
import { originFromPlace } from "./travelApi";
import type { OriginOption, RouteCandidate, RouteRequestValue } from "./RouteRequestForm";

const DEFAULT_STAY_MINUTES = 60;

function defaultDeparture() {
  const soon = new Date(Date.now() + 600000).toISOString();
  return `${kstDate(soon)}T${timeLabel(soon)}`;
}

/** RecommendDesktop 전용 경로 계산 폼. 출발지는 좌표가 있는 등록 장소 중에서
 *  고르고, 출발 시각은 현재 시각으로 자동 채웁니다. */
export function RouteCandidatesForm({
  places,
  candidates,
  defaultDate,
  disabled = false,
  busy = false,
  submitLabel = "이 조건으로 경로 계산",
  onSubmit,
}: {
  places: readonly OriginOption[];
  candidates: readonly RouteCandidate[];
  defaultDate?: string;
  disabled?: boolean;
  /** True while the submitted request is in flight -- shown as a spinner on
   *  the submit button, same as RouteRequestForm. */
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (value: RouteRequestValue) => void;
}) {
  const [problem, setProblem] = useState("");
  const [ranks, setRanks] = useState<number[] | null>(null);
  const [stops, setStops] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const mappable = places.filter(
    (place) => place.lat !== null && place.lng !== null,
  );
  const originId = placeId ?? (mappable[0] ? String(mappable[0].id) : "");
  const selectedRanks = (
    ranks ?? candidates.slice(0, 3).map((item) => item.rank)
  ).filter((rank) => candidates.some((item) => item.rank === rank));
  // The server never trims the requested visit count to fit, so keep the
  // choice inside what the selected candidates can actually support.
  const stopChoices = selectedRanks.map((_, index) => index + 1);
  const stopCount = Math.min(
    Math.max(stops ?? Math.min(3, selectedRanks.length), 1),
    Math.max(selectedRanks.length, 1),
  );

  const submit = () => {
    setProblem("");
    const catalogIds = new Set(candidates.map((item) => item.spot_id));
    const place = mappable.find((item) => String(item.id) === originId);
    const origin = place ? originFromPlace(place, catalogIds) : null;
    if (!origin) {
      setProblem("좌표가 등록된 장소가 없어 출발지를 정할 수 없습니다.");
      return;
    }
    if (!selectedRanks.length) {
      setProblem("경로에 넣을 후보를 한 곳 이상 선택해 주세요.");
      return;
    }
    const departure = defaultDate
      ? `${defaultDate}T${defaultDeparture().slice(11)}`
      : defaultDeparture();
    onSubmit({
      origin,
      date: departure.slice(0, 10),
      departure_time: departure.slice(11),
      stay_minutes: DEFAULT_STAY_MINUTES,
      stop_count: stopCount,
      candidate_ranks: selectedRanks,
    });
  };

  return (
    <div className="rt-form">
      <div className="pd-card-title">{t("방문 순서 최적화")}</div>
      <p className="pd-note rt-note-flush">
        {t("선택한 후보 중에서 이동 시간이 가장 짧은 방문 순서를 계산합니다.")}</p>
      <fieldset className="rt-field" disabled={disabled}>
        <legend className="rt-legend">{t("출발지")}</legend>
        <label className="rt-row">
          <span className="rt-row-name">{t("장소")}</span>
          <select
            className="rt-input"
            aria-label={t("출발 장소")}
            value={originId}
            onChange={(event) => setPlaceId(event.target.value)}
          >
            {mappable.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}{place.region ? ` · ${place.region}` : ""}
              </option>
            ))}
          </select>
        </label>
        {places.length > mappable.length && (
          <p className="pd-note rt-note-flush">
            {t("좌표가 등록되지 않은 장소 {count}곳은 출발지로 사용할 수 없어 목록에 없습니다.", { count: places.length - mappable.length })}
          </p>
        )}
      </fieldset>
      <fieldset className="rt-field" disabled={disabled}>
        <legend className="rt-legend">
          {t("방문할 후보 · {count}곳", { count: selectedRanks.length })}
        </legend>
        <div className="rt-candidates">
          {candidates.map((candidate) => {
            const on = selectedRanks.includes(candidate.rank);
            return (
              <label className="rt-candidate" key={candidate.spot_id}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setRanks(
                      on
                        ? selectedRanks.filter((rank) => rank !== candidate.rank)
                        : [...selectedRanks, candidate.rank],
                    )
                  }
                />
                <span className="rt-candidate-name">
                  {candidate.rank}. {candidate.name}
                  {candidate.region ? ` · ${candidate.region}` : ""}
                </span>
              </label>
            );
          })}
        </div>
        <label className="rt-row">
          <span className="rt-row-name">{t("방문")}</span>
          <select
            className="rt-input"
            aria-label={t("방문할 장소 수")}
            value={stopCount}
            onChange={(event) => setStops(Number(event.target.value))}
          >
            {stopChoices.map((count) => (
              <option key={count} value={count}>
                {t("{count}곳", { count })}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <AppActions>
        <button
          type="button"
          className="rt-submit"
          disabled={disabled}
          aria-busy={busy}
          onClick={submit}
        >
          {busy && <Icon name="refresh" size={16} className="rt-submit-spin" />}
          {busy ? t("계산 중…") : t(submitLabel)}
        </button>
      </AppActions>
      {problem && (
        <p className="pd-note rt-problem" role="alert">
          {t(problem)}
        </p>
      )}
    </div>
  );
}
