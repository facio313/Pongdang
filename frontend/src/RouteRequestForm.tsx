import { t } from "./i18n.ts";
import { useState } from "react";
import { AppActions } from "./AppShell";
import { Icon } from "./pongdangUi";
import { kstDate, timeLabel } from "./productData";
import { originFromPlace, type Origin } from "./travelApi";
import "./routeRequestForm.css";

/** A registered place the user may start from. Places without stored
 *  coordinates are offered but cannot be used as an origin. */
export interface OriginOption {
  id: number;
  name: string;
  region?: string;
  lat: number | null;
  lng: number | null;
}

/** A server-issued recommendation candidate the user may include in the route. */
export interface RouteCandidate {
  rank: number;
  spot_id: number;
  name: string;
  region?: string;
}

export interface RouteRequestValue {
  origin: Origin;
  date: string;
  departure_time: string;
  stay_minutes: number;
  stop_count: number;
  candidate_ranks: number[];
}

const STAY_CHOICES = [30, 60, 90, 120];

function defaultDeparture() {
  const soon = new Date(Date.now() + 600000).toISOString();
  return `${kstDate(soon)}T${timeLabel(soon)}`;
}

export function RouteRequestForm({
  places,
  candidates = [],
  defaultDate,
  disabled = false,
  busy = false,
  submitLabel = "이 조건으로 경로 계산",
  onSubmit,
}: {
  places: readonly OriginOption[];
  candidates?: readonly RouteCandidate[];
  defaultDate?: string;
  disabled?: boolean;
  /** True while the submitted request is in flight. Shown as a spinner on
   *  the submit button -- `disabled` alone doesn't tell the user whether the
   *  form is waiting on a response or just missing required input. */
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (value: RouteRequestValue) => void;
}) {
  const [mode, setMode] = useState<"place" | "current">("place");
  const [placeId, setPlaceId] = useState("");
  const [current, setCurrent] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState("");
  const [departure, setDeparture] = useState(() =>
    defaultDate
      ? `${defaultDate}T${defaultDeparture().slice(11)}`
      : defaultDeparture(),
  );
  const [stay, setStay] = useState(60);
  const [ranks, setRanks] = useState<number[] | null>(null);
  const [stops, setStops] = useState<number | null>(null);
  const mappable = places.filter(
    (place) => place.lat !== null && place.lng !== null,
  );
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

  const locate = () => {
    setProblem("");
    if (!navigator.geolocation) {
      setProblem("이 브라우저에서 현재 위치를 사용할 수 없습니다.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setCurrent({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setMode("current");
      },
      // A refused or failed lookup stays a refusal. No approximate origin is
      // substituted for the location the user did not share.
      () => {
        setLocating(false);
        setCurrent(null);
        setProblem(
          "현재 위치를 확인하지 못했습니다. 위치 권한을 허용하거나 등록 장소를 선택해 주세요.",
        );
      },
      { timeout: 10000 },
    );
  };

  const submit = () => {
    setProblem("");
    const place = mappable.find((item) => item.id === Number(placeId));
    const catalogIds = new Set(candidates.map((item) => item.spot_id));
    const origin: Origin | null =
      mode === "current"
        ? current && {
            label: "현재 위치",
            latitude: current.lat,
            longitude: current.lng,
          }
        : place
          ? originFromPlace(place, catalogIds)
          : null;
    if (!origin) {
      setProblem(
        mode === "current"
          ? "현재 위치를 먼저 확인해 주세요."
          : "출발지를 등록 장소에서 선택해 주세요.",
      );
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(departure)) {
      setProblem("출발 날짜와 시각을 입력해 주세요.");
      return;
    }
    if (candidates.length && !selectedRanks.length) {
      setProblem("경로에 넣을 후보를 한 곳 이상 선택해 주세요.");
      return;
    }
    onSubmit({
      origin,
      date: departure.slice(0, 10),
      departure_time: departure.slice(11),
      stay_minutes: stay,
      stop_count: stopCount,
      candidate_ranks: selectedRanks,
    });
  };

  return (
    <div className="pd-card rt-form">
      <div className="pd-card-title">{t("경로 계산 조건")}</div>
      <p className="pd-note rt-note-flush">
        {t("출발지와 출발 시각이 있어야 방문 순서와 이동 시간을 계산합니다. 자동차 이동만 계산하며, 이 결과는 예상값이고 안전 판정이 아닙니다.")}</p>

      <fieldset className="rt-field" disabled={disabled}>
        <legend className="rt-legend">{t("출발지")}</legend>
        <div className="rt-modes" role="group" aria-label={t("출발지 방식")}>
          <button
            type="button"
            className={"rt-mode" + (mode === "place" ? " is-on" : "")}
            aria-pressed={mode === "place"}
            onClick={() => setMode("place")}
          >
            {t("등록 장소")}</button>
          <button
            type="button"
            className={"rt-mode" + (mode === "current" ? " is-on" : "")}
            aria-pressed={mode === "current"}
            onClick={locate}
          >
            {locating ? t("위치 확인 중…") : t("현재 위치")}
          </button>
        </div>
        {mode === "place" ? (
          <label className="rt-row">
            <span className="rt-row-name">{t("장소")}</span>
            <select
              className="rt-input"
              aria-label={t("출발 장소")}
              value={placeId}
              onChange={(event) => setPlaceId(event.target.value)}
            >
              <option value="">{t("등록 장소 선택")}</option>
              {mappable.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}{place.region ? ` · ${place.region}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="pd-note rt-note-flush">
            {current
              ? t("현재 위치를 출발지로 사용합니다 · {latitude}, {longitude}", { latitude: current.lat.toFixed(5), longitude: current.lng.toFixed(5) })
              : t("위치 권한을 허용하면 현재 위치를 출발지로 사용합니다.")}
          </p>
        )}
        {mode === "place" && places.length > mappable.length && (
          <p className="pd-note rt-note-flush">
            {t("좌표가 등록되지 않은 장소 {count}곳은 출발지로 사용할 수 없어 목록에 없습니다.", { count: places.length - mappable.length })}
          </p>
        )}
      </fieldset>

      <fieldset className="rt-field" disabled={disabled}>
        <legend className="rt-legend">{t("출발 시각 · KST")}</legend>
        <label className="rt-row">
          <span className="rt-row-name">{t("출발")}</span>
          <input
            className="rt-input"
            type="datetime-local"
            aria-label={t("출발 날짜와 시각")}
            value={departure}
            onChange={(event) => setDeparture(event.target.value)}
            required
          />
        </label>
        <label className="rt-row">
          <span className="rt-row-name">{t("체류")}</span>
          <select
            className="rt-input"
            aria-label={t("장소별 체류 시간")}
            value={stay}
            onChange={(event) => setStay(Number(event.target.value))}
          >
            {STAY_CHOICES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {t("{count}분", { count: minutes })}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {candidates.length > 0 && (
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
                          ? selectedRanks.filter(
                              (rank) => rank !== candidate.rank,
                            )
                          : [...selectedRanks, candidate.rank],
                      )
                    }
                  />
                  <span className="rt-candidate-name">
                    {candidate.rank}. {candidate.name}{candidate.region ? ` · ${candidate.region}` : ""}
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
          <p className="pd-note rt-note-flush">
            {t("후보는 최대 5곳까지 비교합니다. 고른 후보보다 방문 수를 적게 두면 그 안에서 순서를 비교합니다. 선택한 방문 수를 채울 수 없으면 서버가 부족 상태를 알려 주며 임의로 줄이지 않습니다.")}</p>
        </fieldset>
      )}

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
