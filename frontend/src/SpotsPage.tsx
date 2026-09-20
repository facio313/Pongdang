import { t } from "./i18n.ts";
import { useMemo, useState } from "react";
import { AppHeader, AppShell } from "./AppShell";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { SpotDetailPage } from "./SpotDetailPage";
import { SpotsDesktop } from "./SpotsDesktop";
import { PlacePhoto, PlacePhotoCredit } from "./PlacePhoto";
import { useIsDesktop } from "./useIsDesktop";
import { gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl } from "./mascots";
import { Icon, Skeleton, StateChip } from "./pongdangUi";
import { conditionScore, placeRegionLabel, timeLabel, type Place } from "./productData";
import { useConditions } from "./useConditions";
import { mappablePlaces } from "./useWaterPlaces";
import { useWaterPlaceBrowser } from "./useWaterPlaceBrowser";
import { WaterPlaceFilters, WaterPlacePagination } from "./WaterPlaceControls";
import { readSpotsRoute, sortPlaces, spotLink } from "./spotsRoute";
import "./spotsPage.css";

// 명소 탭입니다. 핸드오프 모바일 20a(목록) · 20c(지도)를 그립니다. 상세(20b)는
// SpotDetailPage.tsx 에 있고 같은 `#spots` 해시의 spot_id 로 들어갑니다.
//
//   #spots              목록 20a
//   #spots?view=map     지도 20c
//   #spots?spot_id=1    상세 20b
//
// 예전에는 이 화면이 spotsCatalog.ts 의 예시 목록을 그렸습니다. 명소 10곳의
// 점수 · 거리 · 운영시간이 전부 지어낸 값이었고, 「예시 데이터」 칩을 달아도
// 화면에 적힌 「72점 · 1.2km · 10:00–21:00」은 읽는 사람에게 사실로 남았습니다.
//
// 이제 목록은 서버가 분류한 실제 장소입니다(useWaterPlaces). 서버에 없는 것은
// 지어내지 않고 자리를 비웁니다 -- 거리 · 운영시간 · 소개는 주는 API 가
// 없습니다.

/** 서버가 유도하는 분류는 beach · valley 둘뿐입니다(place_kind). 예전의 다섯
 *  갈래(해변 · 온천 · 카페 · 문화 · 서핑)는 서버에 대응하는 값이 없어, 고르면
 *  아무 일도 일어나지 않는 칩이었습니다. */
const MAP_FILTERS = [
  { key: "beach", label: "해변" },
  { key: "valley", label: "계곡" },
] as const;

const KIND_LABEL: Record<string, string> = {
  beach: "해변",
  valley: "계곡",
};
const kindLabel = (place: Place) =>
  (place.type && KIND_LABEL[place.type]) ?? "분류 미확인";

function SourceChips({ live }: { live: boolean }) {
  return (
    <div className="sp-source">
      <StateChip kind={live ? "live" : "no_data"} />
      <span className="sp-source-note">{t("리뷰 평점은 쓰지 않습니다")}</span>
    </div>
  );
}

function ListHero({
  total,
  loading,
  regionLabel,
}: {
  total: number;
  loading: boolean;
  regionLabel: string;
}) {
  return (
    <header className="pd-hero">
      <AppHeader
        title={t("명소")}
        time={timeLabel(new Date().toISOString())}
        onCobalt
      />
      <div className="sp-hero-inner">
        <div className="pd-lbl sp-hero-kick">
          <Icon name="pin" size={12} />{t("{region} · 수집된 물놀이 장소", { region: regionLabel })}</div>
        <div className="sp-hero-row">
          <div>
            <h1 className="sp-hero-title">{t("강원도 명소")}</h1>
            <div className="sp-hero-sub">
              {/* 예전에는 여기가 «128곳» 이었습니다. 실제 목록은 5건이었고
                  128 은 근거 없는 숫자였습니다. */}
              {loading ? (
                <Skeleton width="2em" glass label={t("장소 조회 중")} />
              ) : (
                <b className="pd-num">{t("목록 {count}곳", { count: total })}</b>
              )}
            </div>
          </div>
          <img
            className="pd-hero-mascot"
            src={mascotUrl("spot")}
            alt={t(MASCOT_ALT)}
            width={66}
            height={66}
          />
        </div>
      </div>
    </header>
  );
}

/** 검색은 히어로(코발트 면)가 아니라 그 아래, 걸러낼 목록 바로 위에 둡니다. */
function ListSearch({
  search,
  onSearch,
}: {
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="sp-searchbar">
      <label className="sp-search">
        <Icon name="search" size={15} />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          maxLength={100}
          placeholder={t("장소명 · 지역 검색")}
          aria-label={t("장소명·지역 검색")}
        />
      </label>
      {/* 정렬 버튼이 있었습니다. 「퐁당 점수순」은 목록의 점수를 모르는 채
          비교해 눌러도 순서가 바뀌지 않았고, 남은 「이름순」 하나로는 고를
          것이 없습니다. 순서를 말로 적습니다(spotsRoute.sortPlaces). */}
      <span className="sp-search-order">{t("이름순")}</span>
    </div>
  );
}

function SpotRow({ place }: { place: Place }) {
  return (
    <div className="sp-row">
      <a className="place-photo-link" href={spotLink(place)} aria-label={t("{name} 상세", { name: place.name })}>
        <PlacePhoto className="sp-row-photo" name={place.name} photo={place.photo} />
      </a>
      <span className="sp-row-body">
        <span className="sp-row-head">
          <a className="sp-row-name place-photo-link" href={spotLink(place)}>{place.name}</a>
          <span className="sp-row-category">{t(kindLabel(place))}</span>
        </span>
        {/* 점수는 고른 장소만 조회합니다. 목록 전체에 붙이려면 장소마다 한
            번씩, 100건이면 100번을 부르게 됩니다. 그래서 여기서는 점수를
            약속하지 않고 무엇을 눌러야 보이는지만 밝힙니다. */}
        <span className="sp-row-where">{placeRegionLabel(place)}</span>
        <span className="sp-row-address">{place.address ?? t("주소 없음")}</span>
        <PlacePhotoCredit photo={place.photo} />
      </span>
    </div>
  );
}

function SpotsList() {
  const browser = useWaterPlaceBrowser();
  const { search, setSearch, places } = browser;
  const rows = useMemo(() => sortPlaces(places.rows ?? []), [places.rows]);
  return (
    <article className="spots-page">
      <AppShell
        tab="spots"
        hero={<ListHero total={places.total} loading={places.loading} regionLabel={browser.regionLabel} />}
      >
        <ListSearch search={search} onSearch={setSearch} />
        <WaterPlaceFilters district={browser.district} kind={browser.kind} onDistrict={browser.setDistrict} onKind={browser.setKind} />
        <SourceChips live={Boolean(places.rows)} />
        <div className="pd-card sp-list">
          {rows.map((place) => (
            <SpotRow key={place.id} place={place} />
          ))}
          {!rows.length && (
            <p className="pd-note" role={places.error ? "alert" : "status"}>
              {places.error ??
                (places.loading ? t("장소를 조회하고 있습니다.") : t("검색 결과 없음"))}
            </p>
          )}
          <WaterPlacePagination {...places} count={rows.length} onPage={browser.setPage} />
        </div>
        <a className="pd-secondary sp-map-link" href="#spots?view=map">
          <Icon name="pin" size={15} />{t("지도에서 보기 →")}</a>
        {/* 「값이 없으면 –…」 같은 전역 규칙은 화면 바닥의 AppFootNote 가 한 번
            말합니다. 여기는 이 목록에만 해당하는 것을 남깁니다. */}
        <p className="pd-note">
          {t("장소를 고르면 그곳의 퐁당 점수를 조회합니다. 목록에 점수를 함께 싣지 않는 것은 장소마다 한 번씩 조회해야 하기 때문입니다. 거리 · 운영 시간 · 소개는 아직 내려주는 API 가 없어 비워 둡니다. 대표 사진은 수집된 사진이 있는 장소에 표시합니다.")}
        </p>
      </AppShell>
    </article>
  );
}

function SpotsMap() {
  const browser = useWaterPlaceBrowser();
  const { kind, places } = browser;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const visible = useMemo(() => places.rows ?? [], [places.rows]);
  const pinned = useMemo(() => mappablePlaces(visible), [visible]);
  const markers = useMemo(
    () =>
      pinned.map(({ place, latitude, longitude }) => ({
        id: String(place.id),
        latitude,
        longitude,
      })),
    [pinned],
  );
  const unmapped = visible.length - pinned.length;
  // 점수는 고른 핀 하나만 조회합니다. 지도 탭(MapPage)이 쓰는 규칙과 같습니다.
  const conditions = useConditions(selectedId ?? undefined);
  const selectedScore = conditionScore(conditions.data);

  return (
    <article className="spots-page is-map">
      {/* 헤더는 지도 위(.sp-stage)에 얹으므로 셸이 따로 그리지 않습니다. */}
      <AppShell tab="spots" bare hero={null}>
        <div className="sp-stage">
          <AppHeader title={t("명소 지도")} time={timeLabel(new Date().toISOString())} />
          <div className="sp-filters" role="group" aria-label={t("분류 필터")}>
            {MAP_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={
                  "sp-filter pd-tap" + (item.key === kind ? " is-on" : "")
                }
                aria-pressed={item.key === kind}
                onClick={() => {
                  browser.setKind(kind === item.key ? "" : item.key);
                  setSelectedId(null);
                }}
              >
                {t(item.label)}
              </button>
            ))}
            <a className="sp-filter is-link pd-tap" href="#spots">{t("목록")}</a>
          </div>
          <KakaoMapCanvas
            markers={markers}
            selectedId={selectedId === null ? null : String(selectedId)}
            renderMarker={(id) => {
              const place = visible.find((item) => item.id === Number(id));
              if (!place) return null;
              const selected = place.id === selectedId;
              const score = selected ? selectedScore : null;
              const grade = gradeOf(score);
              return (
                <button
                  type="button"
                  className={"sp-pin" + (selected ? " is-selected" : "")}
                  aria-pressed={selected}
                  aria-label={t("{name} 퐁당 {score} {grade}", { name: place.name, score: score ?? "–", grade: t(grade.label) })}
                  onClick={() => setSelectedId(place.id)}
                >
                  <span className="sp-pin-core" data-grade={grade.key}>
                    {selected && conditions.loading ? "…" : (score ?? "–")}
                  </span>
                  <span className="sp-pin-label">{place.name}</span>
                </button>
              );
            }}
          />
        </div>
        <div className="pd-body sp-sheet">
          <ListSearch search={browser.search} onSearch={(search) => { browser.setSearch(search); setSelectedId(null); }} />
          <WaterPlaceFilters district={browser.district} onDistrict={(district) => { browser.setDistrict(district); setSelectedId(null); }} />
          <div className="pd-card">
            {/* 드래그 핸들 모양의 막대가 있었는데 시트는 드래그되지 않습니다.
                할 수 없는 조작을 모양으로 약속하지 않습니다. */}
            <div className="sp-sheet-head">
              <b>{t("지도에 보이는 명소 {count}곳", { count: pinned.length })}</b>
              <span className="sp-sheet-sort">{t("이름순")}</span>
            </div>
            <div className="sp-sheet-list">
              {sortPlaces(pinned.map(({ place }) => place)).map((place) => {
                const score = place.id === selectedId ? selectedScore : null;
                const grade = gradeOf(score);
                return (
                  <a
                    className="sp-sheet-row pd-pressable"
                    href={spotLink(place)}
                    key={place.id}
                  >
                    <span
                      className="pd-num sp-sheet-badge"
                      data-grade={grade.key}
                    >
                      {score ?? "–"}
                    </span>
                    <span className="sp-sheet-body">
                      <b>{place.name}</b>
                      <span className="sp-sheet-meta">
                        {t(kindLabel(place))} · {placeRegionLabel(place)}
                      </span>
                    </span>
                    <span className="sp-sheet-grade">{t(grade.label)}</span>
                  </a>
                );
              })}
            </div>
            <WaterPlacePagination {...places} count={visible.length} onPage={(page) => { browser.setPage(page); setSelectedId(null); }} />
          </div>
          <p className="pd-note" role={places.error ? "alert" : "status"}>
            <StateChip kind={places.rows ? "live" : "no_data"} /> {t("지도 탭과 같은 지도 컴포넌트를 쓰고 핀 소스만 명소 목록으로 바꿨습니다. 핀을 고르면 그 장소의 점수를 조회하며, 고르기 전에는 –입니다.")}{unmapped > 0 &&
              t(" 좌표가 아직 확인되지 않은 {count}곳은 지도에 찍지 않았습니다 — 없는 위치를 임의로 만들지 않습니다.", { count: unmapped })}
            {places.error && ` ${places.error}`}
          </p>
        </div>
      </AppShell>
    </article>
  );
}

export function SpotsPage() {
  // App.tsx 가 해시마다 이 화면을 새로 마운트하므로(Fragment key), 해시는 여기서
  // 한 번만 읽으면 됩니다.
  const route = readSpotsRoute(window.location.hash);
  const isDesktop = useIsDesktop();
  // 데스크탑에는 별도 지도 뷰가 없습니다 -- 목록과 상세 안에 지도가 들어 있고,
  // 전체 지도는 지도 탭이 맡습니다.
  if (isDesktop) return <SpotsDesktop spotId={route.spotId} />;
  if (route.spotId) return <SpotDetailPage spotId={route.spotId} />;
  return route.view === "map" ? <SpotsMap /> : <SpotsList />;
}
