import { t } from "./i18n.ts";
import { TRANSPORT_MODES, transportLabel, type TransportMode } from "./travelApi";
import "./routeRequestForm.css";

export function TransportSelect({ value, onChange, disabled = false }: {
  value: TransportMode;
  onChange: (mode: TransportMode) => void;
  disabled?: boolean;
}) {
  return (
    <label className="rt-row">
      <span className="rt-row-name">{t("이동 수단")}</span>
      <select className="rt-input" aria-label={t("이동 수단")} value={value}
        disabled={disabled} onChange={(event) => {
          const mode = TRANSPORT_MODES.find((item) => item === event.target.value);
          if (mode) onChange(mode);
        }}>
        {TRANSPORT_MODES.map((mode) => <option key={mode} value={mode}>{transportLabel(mode)}</option>)}
      </select>
    </label>
  );
}
