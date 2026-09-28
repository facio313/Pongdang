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

/** The checked list supplies the origin and complete visiting order. */
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
  const first = candidates[0];
  const originPlace = places.find((place) => place.id === first?.spot_id);

  const submit = () => {
    setProblem("");
    const catalogIds = new Set(candidates.map((item) => item.spot_id));
    if (!first) {
      setProblem("경로에 넣을 후보를 한 곳 이상 선택해 주세요.");
      return;
    }
    const origin = originPlace ? originFromPlace(originPlace, catalogIds) : null;
    if (!origin) {
      setProblem("첫 번째 장소의 좌표가 없어 경로를 계산할 수 없습니다. 순서를 바꾸거나 해당 장소를 제외해 주세요.");
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
      stop_count: candidates.length,
      candidate_ranks: candidates.map((candidate) => candidate.rank),
      preserve_order: true,
    });
  };

  return (
    <div className="rt-form">
      <div className="pd-card-title">{t("선택한 순서로 경로 계산")}</div>
      <p className="pd-note rt-note-flush">
        {first
          ? t("출발: {name} · 선택한 {count}곳을 위 순서대로 방문합니다.", { name: first.name, count: candidates.length })
          : t("위 목록에서 방문할 장소를 체크해 주세요.")}
      </p>

      <AppActions>
        <button
          type="button"
          className="rt-submit"
          disabled={disabled || !first}
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
