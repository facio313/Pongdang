import { t } from "./i18n";
import { useResource } from "./useResource";
import { travelRegionLabel, travelRegionOptions } from "./travelRegion";
import type { RegionCatalog } from "./waterPlaceApi";
import "./travelRegion.css";

export function TravelRegionSelector({ region, onChange, disabled = false }: {
  region: string;
  onChange: (region: string) => void;
  disabled?: boolean;
}) {
  const regions = useResource<RegionCatalog>("regions");
  const options = travelRegionOptions(regions.data);
  const label = travelRegionLabel(region, regions.data);
  // A conversation or saved plan can contain a human-readable region instead
  // of our canonical option. Display it without changing that request value.
  const selected = options.find((option) => option.value === region || option.label === label)?.value ?? region;
  return <div className="travel-region">
    <label>{t("추천 지역")}
      <select aria-label={t("추천 지역")} value={selected} onChange={(event) => onChange(event.target.value)} disabled={disabled || regions.loading || Boolean(regions.error)}>
        {!options.some((option) => option.value === selected) && <option value={selected}>{label}</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    {regions.error && <p className="pd-note" role="alert">{regions.error}</p>}
  </div>;
}
