import { useMemo, useState } from "react";
import { AppHeader, AppShell } from "./AppShell";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { SpotDetailPage } from "./SpotDetailPage";
import { SpotsDesktop } from "./SpotsDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl } from "./mascots";
import { Icon, Skeleton, StateChip } from "./pongdangUi";
import { conditionScore, timeLabel, type Place } from "./productData";
import { useConditions } from "./useConditions";
import { mappablePlaces, useWaterPlaces } from "./useWaterPlaces";
import {
  SPOT_SORTS,
  readSpotsRoute,
  sortPlaces,
  spotLink,
  type SpotSort,
} from "./spotsRoute";
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
// 지어내지 않고 자리를 비웁니다 -- 거리 · 운영시간 · 사진 · 소개는 주는 API 가
// 없습니다.

/** 서버가 유도하는 분류는 beach · valley 둘뿐입니다(place_kind). 예전의 다섯
 *  갈래(해변 · 온천 · 카페 · 문화 · 서핑)는 서버에 대응하는 값이 없어, 고르면
 *  아무 일도 일어나지 않는 칩이었습니다. */
const MAP_FILTERS: { key: string; label: string }[] = [
  { key: "beach", label: "해변" },
  { key: "valley", label: "계곡" },
];

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
      <span className="sp-source-note">리뷰 평점은 쓰지 않습니다</span>
    </div>
  );
}

function ListHero({
  sort,
  onSort,
  total,
  loading,
  search,
  onSearch,
}: {
  sort: SpotSort;
  onSort: (sort: SpotSort) => void;
  total: number;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <header className="pd-hero">
      <AppHeader
        title="명소"
        time={timeLabel(new Date().toISOString())}
        onCobalt
      />
      <div className="sp-hero-inner">
        <div className="pd-lbl sp-hero-kick">
          <Icon name="pin" size={12} />
          강릉 · 수집된 물놀이 장소
        </div>
        <div className="sp-hero-row">
          <div>
            <h1 className="sp-hero-title">강릉 명소</h1>
            <div className="sp-hero-sub">
              {/* 예전에는 여기가 «128곳» 이었습니다. 실제 목록은 5건이었고
                  128 은 근거 없는 숫자였습니다. */}
              목록{" "}
              {loading ? (
                <Skeleton width="2em" glass label="장소 조회 중" />
              ) : (
                <b className="pd-num">{total}</b>
              )}
              곳
            </div>
          </div>
          <img
            className="sp-hero-mascot"
            src={mascotUrl("spot")}
            alt={MASCOT_ALT}
            width={66}
            height={66}
          />
        </div>
        <label className="sp-hero-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            maxLength={100}
            placeholder="장소명 · 지역 검색"
            aria-label="장소명·지역 검색"
          />
        </label>
        <div className="sp-sorts" role="group" aria-label="정렬">
          {SPOT_SORTS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                "sp-sort pd-tap" + (item.key === sort ? " is-on" : "")
              }
              aria-pressed={item.key === sort}
              onClick={() => onSort(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function SpotRow({ place }: { place: Place }) {
  return (
    <a className="sp-row pd-pressable" href={spotLink(place)}>
      {/* 사진 미확보. 목록에서 줄마다 반복되는 자리라 점선 슬롯 대신 중립
          자리표시자를 씁니다(홈의 hm-pick-photo 와 같은 판단). */}
      <span className="sp-row-photo" aria-label={`${place.name} 대표 사진 없음`}>
        <Icon name="pin" size={18} />
      </span>
      <span className="sp-row-body">
        <span className="sp-row-head">
          <b className="sp-row-name">{place.name}</b>
          <span className="sp-row-category">{kindLabel(place)}</span>
        </span>
        {/* 점수는 고른 장소만 조회합니다. 목록 전체에 붙이려면 장소마다 한
            번씩, 100건이면 100번을 부르게 됩니다. 그래서 여기서는 점수를
            약속하지 않고 무엇을 눌러야 보이는지만 밝힙니다. */}
        <span className="sp-row-where">{place.region ?? "지역 미확인"}</span>
        <span className="sp-row-address">{place.address ?? "주소 없음"}</span>
      </span>
    </a>
  );
}

function SpotsList() {
  const [sort, setSort] = useState<SpotSort>("name");
  const [search, setSearch] = useState("");
  const places = useWaterPlaces(search);
  const rows = useMemo(
    () => sortPlaces(places.rows ?? [], sort),
    [places.rows, sort],
  );
  return (
    <article className="spots-page">
      <AppShell
        tab="spots"
        hero={
          <ListHero
            sort={sort}
            onSort={setSort}
            total={places.total}
            loading={places.loading}
            search={search}
            onSearch={setSearch}
          />
        }
      >
        <SourceChips live={Boolean(places.rows)} />
        <div className="pd-card sp-list">
          {rows.map((place) => (
            <SpotRow key={place.id} place={place} />
          ))}
          {!rows.length && (
            <p className="pd-note" role={places.error ? "alert" : "status"}>
              {places.error ??
                (places.loading ? "장소를 조회하고 있습니다." : "검색 결과 없음")}
            </p>
          )}
          {/* 예전에는 「아래로 계속 불러옵니다 · 20개 단위」라고 적혀 있었지만
              무한 스크롤은 구현돼 있지 않습니다. 없는 동작을 있다고 적지
              않습니다. 서버가 100건에서 자르는 것은 사실이므로 밝힙니다. */}
          {rows.length > 0 && (
            <p className="pd-note sp-list-more">
              목록 {rows.length}곳 전체입니다 · 서버가 한 번에 최대 100곳까지
              내려줍니다
            </p>
          )}
        </div>
        <a className="pd-secondary sp-map-link" href="#spots?view=map">
          <Icon name="pin" size={15} />
          지도에서 보기 →
        </a>
        {/* 「값이 없으면 –…」 같은 전역 규칙은 화면 바닥의 AppFootNote 가 한 번
            말합니다. 여기는 이 목록에만 해당하는 것을 남깁니다. */}
        <p className="pd-note">
          장소를 고르면 그곳의 <b>퐁당 점수</b>를 조회합니다. 목록에 점수를 함께
          싣지 않는 것은 장소마다 한 번씩 조회해야 하기 때문입니다. 거리 · 운영
          시간 · 대표 사진 · 소개는 아직 내려주는 API 가 없어 비워 둡니다.
        </p>
      </AppShell>
    </article>
  );
}

function SpotsMap() {
  const [kind, setKind] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const places = useWaterPlaces("");
  const visible = useMemo(
    () =>
      (places.rows ?? []).filter((place) => !kind || place.type === kind),
    [places.rows, kind],
  );
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
          <AppHeader title="명소 지도" time={timeLabel(new Date().toISOString())} />
          <div className="sp-filters" role="group" aria-label="분류 필터">
            {MAP_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={
                  "sp-filter pd-tap" + (item.key === kind ? " is-on" : "")
                }
                aria-pressed={item.key === kind}
                onClick={() => setKind(kind === item.key ? null : item.key)}
              >
                {item.label}
              </button>
            ))}
            <a className="sp-filter is-link pd-tap" href="#spots">
              목록
            </a>
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
                  aria-label={`${place.name} 퐁당 ${score ?? "–"} ${grade.label}`}
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
          <div className="pd-card">
            {/* 드래그 핸들 모양의 막대가 있었는데 시트는 드래그되지 않습니다.
                할 수 없는 조작을 모양으로 약속하지 않습니다. */}
            <div className="sp-sheet-head">
              <b>지도에 보이는 명소 {pinned.length}곳</b>
              <span className="sp-sheet-sort">이름순</span>
            </div>
            <div className="sp-sheet-list">
              {sortPlaces(
                pinned.map(({ place }) => place),
                "name",
              ).map((place) => {
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
                        {kindLabel(place)} · {place.region ?? "지역 미확인"}
                      </span>
                    </span>
                    <span className="sp-sheet-grade">{grade.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
          <p className="pd-note" role={places.error ? "alert" : "status"}>
            <StateChip kind={places.rows ? "live" : "no_data"} /> 지도 탭과 같은
            지도 컴포넌트를 쓰고 핀 소스만 명소 목록으로 바꿨습니다. 핀을 고르면
            그 장소의 점수를 조회하며, 고르기 전에는 –입니다.
            {unmapped > 0 &&
              ` 좌표가 아직 확인되지 않은 ${unmapped}곳은 지도에 찍지 않았습니다 — 없는 위치를 임의로 만들지 않습니다.`}
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
