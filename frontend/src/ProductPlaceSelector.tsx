import { useState } from "react";
import { t } from "./i18n.ts";
import { useResource } from "./useResource";
import { placeRegionLabel } from "./productData";
import { WaterPlaceFilters, WaterPlacePagination } from "./WaterPlaceControls";
import { waterPlacesPath, type WaterPlacePage } from "./waterPlaceApi";
import { changeProductPlaceFilters, resetProductPlace, selectProductPlace, useProductPlaceSelection } from "./productPlaceSelection";
import "./productPlaceSelector.css";

function PlaceOptions({ placeName }: { placeName: string }) {
  const selection = useProductPlaceSelection();
  const [search, setSearch] = useState(selection.search);
  const [revision, setRevision] = useState(0);
  const catalog = useResource<WaterPlacePage>(waterPlacesPath(selection.search, selection), revision);
  const rows = catalog.data?.rows ?? [];
  const selectedOutsidePage = selection.spotId !== null && !rows.some((row) => row.id === selection.spotId);
  return <div className="product-place-options">
    <p className="product-place-description">{t("선택한 한 장소의 관측·예보를 표시합니다.")}</p>
    <WaterPlaceFilters district={selection.district} onDistrict={(district) => changeProductPlaceFilters({ district })} />
    <form className="product-place-search" onSubmit={(event) => { event.preventDefault(); changeProductPlaceFilters({ search: search.trim() }); }}>
      <label>{t("장소 검색")}<input type="search" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("장소명·주소")} /></label>
      <button type="submit">{t("검색")}</button>
    </form>
    <label className="product-place-choice">{t("기준 장소")}
      <select aria-label={t("홈·오늘 기준 장소")} value={selection.spotId ?? ""}
        disabled={catalog.loading || Boolean(catalog.error) || rows.length === 0}
        onChange={(event) => { if (event.target.value) selectProductPlace(Number(event.target.value)); else changeProductPlaceFilters({ page: selection.page }); }}>
        <option value="">{t("장소를 선택해 주세요.")}</option>
        {selectedOutsidePage && <option value={selection.spotId!}>{placeName}</option>}
        {rows.map((row) => <option key={row.id} value={row.id}>{row.name} · {placeRegionLabel(row)}</option>)}
      </select>
    </label>
    {catalog.error ? <p role="alert">{catalog.error}</p> : catalog.loading ? <p role="status">{t("장소 조회 중")}</p> : !rows.length ? <p role="status">{t("선택한 지역·검색어에 해당하는 장소가 없습니다.")}</p> : null}
    {catalog.error && <button type="button" onClick={() => setRevision((value) => value + 1)}>{t("다시 조회")}</button>}
    {(catalog.data?.total ?? 0) > 100 && <WaterPlacePagination page={selection.page} pageSize={catalog.data?.page_size ?? 100}
      total={catalog.data?.total ?? 0} count={rows.length} hasMore={catalog.data?.has_more ?? false}
      loading={catalog.loading} error={catalog.error} onPage={(page) => changeProductPlaceFilters({ page })} />}
    <button type="button" className="product-place-reset" onClick={() => { setSearch(""); resetProductPlace(); }}>{t("기본 장소로 돌아가기")}</button>
  </div>;
}

/** Compact until opened; browsing never writes to the server. */
export function ProductPlaceSelector({ placeName }: { placeName: string }) {
  const [open, setOpen] = useState(false);
  return <details className="product-place-selector" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{t("장소 바꾸기")}</summary>
    {open && <PlaceOptions placeName={placeName} />}
  </details>;
}
