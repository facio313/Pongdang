import { t } from "./i18n.ts";
import { useResource } from "./useResource";
import { DEFAULT_PROVINCE, type RegionCatalog, type WaterPlaceKind } from "./waterPlaceApi";
import "./waterPlaceControls.css";

export function WaterPlaceFilters({ district, kind, onDistrict, onKind }: {
  district: string;
  kind?: WaterPlaceKind;
  onDistrict: (district: string) => void;
  onKind?: (kind: WaterPlaceKind) => void;
}) {
  const regions = useResource<RegionCatalog>("regions");
  const province = regions.data?.provinces.find((item) => item.code === DEFAULT_PROVINCE);
  return <div className="water-place-filters">
    <label>{t("지역")}
      <select aria-label={t("시군 선택")} value={district} onChange={(event) => onDistrict(event.target.value)} disabled={regions.loading || Boolean(regions.error)}>
        <option value="">{t("강원도 전체")}</option>
        {province?.districts.map((item) => <option key={item.code} value={item.code}>{t(item.label)}</option>)}
      </select>
    </label>
    {onKind && <label>{t("분류")}
      <select aria-label={t("장소 분류")} value={kind ?? ""} onChange={(event) => onKind(event.target.value as WaterPlaceKind)}>
        <option value="">{t("해변·계곡 전체")}</option>
        <option value="beach">{t("해변")}</option>
        <option value="valley">{t("계곡")}</option>
      </select>
    </label>}
    {regions.error && <p role="alert">{regions.error}</p>}
  </div>;
}

export function WaterPlacePagination({ page, pageSize, total, count, hasMore, loading, error, onPage }: {
  page: number;
  pageSize: number;
  total: number;
  count: number;
  hasMore: boolean;
  loading: boolean;
  error?: string;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className="water-place-pagination" aria-label={t("장소 목록 페이지")}>
    <p role="status">{loading ? t("장소 조회 중") : error ? t("목록을 불러오지 못했습니다.") : t("전체 {total}곳 · {page}/{pages}페이지 · 현재 {count}곳", { total, page, pages, count })}</p>
    <div>
      <button type="button" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>{t("이전")}</button>
      <button type="button" disabled={loading || !hasMore} onClick={() => onPage(page + 1)}>{t("다음")}</button>
    </div>
  </nav>;
}
