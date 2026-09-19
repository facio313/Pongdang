import { useMemo, useState } from "react";
import { AppHeader, AppShell } from "./AppShell";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { SpotDetailPage } from "./SpotDetailPage";
import { SpotsDesktop } from "./SpotsDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl } from "./mascots";
import { GradeChip, Icon, StateChip } from "./pongdangUi";
import { timeLabel } from "./productData";
import {
  MAPPABLE_SPOTS,
  SPOTS,
  SPOT_SORTS,
  SPOT_TOTAL,
  mappableSpots,
  readSpotsRoute,
  sortSpots,
  spotLink,
  type Spot,
  type SpotCategory,
  type SpotSort,
} from "./spotsCatalog";
import "./spotsPage.css";

// 명소 탭입니다. 핸드오프 모바일 20a(목록) · 20c(지도)를 그립니다. 상세(20b)는
// SpotDetailPage.tsx 에 있고 같은 `#spots` 해시의 spot_id 로 들어갑니다.
//
//   #spots              목록 20a
//   #spots?view=map     지도 20c
//   #spots?spot_id=1    상세 20b
//
// 명소 API 는 아직 연동되지 않았습니다. 목록은 spotsCatalog.ts 의 예시 값이고,
// 화면은 「예시 데이터」 · 「명소 API 미연동」 칩으로 그 사실을 계속 밝힙니다.
// 좌표만 실제 검증값(mapLocations.ts)이며, 좌표가 없는 명소는 지도에 찍지
// 않고 그 수를 함께 적습니다.

const MAP_FILTERS: { key: SpotCategory; label: string }[] = [
  { key: "해변", label: "해변" },
  { key: "온천", label: "온천" },
  { key: "카페", label: "카페" },
];

function SourceChips() {
  return (
    <div className="sp-source">
      <StateChip kind="example" />
      <span className="pd-state-chip">명소 API 미연동</span>
      <span className="sp-source-note">리뷰 평점은 쓰지 않습니다</span>
    </div>
  );
}

function ListHero({
  sort,
  onSort,
}: {
  sort: SpotSort;
  onSort: (sort: SpotSort) => void;
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
          강릉 · 현재 위치 기준
        </div>
        <div className="sp-hero-row">
          <div>
            <h1 className="sp-hero-title">강릉 명소</h1>
            <div className="sp-hero-sub">
              목록 <b className="pd-num">{SPOT_TOTAL}</b>곳 · 06:00 갱신
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

function SpotRow({ spot }: { spot: Spot }) {
  return (
    <a className="sp-row pd-pressable" href={spotLink(spot)}>
      {/* 사진 미확보. 목록에서 줄마다 반복되는 자리라 점선 슬롯 대신 중립
          자리표시자를 씁니다(홈의 hm-pick-photo 와 같은 판단). */}
      <span className="sp-row-photo" aria-label={`${spot.name} 대표 사진 준비 중`}>
        <Icon name="pin" size={18} />
      </span>
      <span className="sp-row-body">
        <span className="sp-row-head">
          <b className="sp-row-name">{spot.name}</b>
          <span className="sp-row-category">{spot.categoryLabel}</span>
        </span>
        <span className="sp-row-score">
          <GradeChip
            score={spot.score}
            prefix="퐁당"
            label={spot.score === null ? spot.unscoredLabel : undefined}
          />
          <span className="pd-num sp-row-distance">{spot.distanceKm}km</span>
        </span>
        <span className="sp-row-operating">
          <b className={spot.operatingClosed ? "is-closed" : "is-open"}>
            {spot.operating}
          </b>
          {spot.operatingNote && <span> · {spot.operatingNote}</span>}
        </span>
      </span>
    </a>
  );
}

function SpotsList() {
  const [sort, setSort] = useState<SpotSort>("popular");
  const rows = useMemo(() => sortSpots(SPOTS, sort), [sort]);
  return (
    <article className="spots-page">
      <AppShell tab="spots" hero={<ListHero sort={sort} onSort={setSort} />}>
        <SourceChips />
        <div className="pd-card sp-list">
          {rows.map((spot) => (
            <SpotRow key={spot.id} spot={spot} />
          ))}
          {/* 예전에는 「아래로 계속 불러옵니다 · 20개 단위」라고 적혀 있었지만
              무한 스크롤은 구현돼 있지 않고 SPOTS 전량이 한 번에 렌더됩니다.
              없는 동작을 있다고 적지 않습니다. */}
          <p className="pd-note sp-list-more">
            목록 {SPOT_TOTAL}곳 전체입니다
          </p>
        </div>
        <a className="pd-secondary sp-map-link" href="#spots?view=map">
          <Icon name="pin" size={15} />
          지도에서 보기 →
        </a>
        {/* 「값이 없으면 –…」 같은 전역 규칙은 화면 바닥의 AppFootNote 가 한 번
            말합니다. 여기는 이 목록에만 해당하는 것을 남깁니다. */}
        <p className="pd-note">
          퐁당 점수는 <b>물놀이 조건이 있는 명소</b>에만 산정됩니다. 거리는 현재
          위치로, 운영 여부는 API 운영시간으로 계산합니다. 지금은 전부 예시
          값이며 안전 판단에 사용할 수 없습니다.
        </p>
      </AppShell>
    </article>
  );
}

function SpotsMap() {
  const [category, setCategory] = useState<SpotCategory | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 지도는 목록 첫 장이 아니라 「좌표가 검증된 명소」에서 핀을 만듭니다.
  const visible = category
    ? MAPPABLE_SPOTS.filter((spot) => spot.category === category)
    : MAPPABLE_SPOTS;
  const pinned = useMemo(() => mappableSpots(visible), [visible]);
  const markers = useMemo(
    () =>
      pinned.map(({ spot, latitude, longitude }) => ({
        id: String(spot.id),
        latitude,
        longitude,
      })),
    [pinned],
  );
  const unmapped = visible.length - pinned.length;
  // 시트는 「지도에 보이는 명소」이므로 핀이 찍힌 것만 싣습니다. 좌표가 없어
  // 지도에 없는 명소를 여기 끼워 넣으면 머릿수와 목록이 어긋납니다.
  const nearest = pinned
    .map(({ spot }) => spot)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return (
    <article className="spots-page is-map">
      {/* 헤더는 지도 위(.sp-stage)에 얹으므로 셸이 따로 그리지 않습니다. */}
      <AppShell tab="spots" bare hero={null}>
        <div className="sp-stage">
          <AppHeader title="명소 지도" time={timeLabel(new Date().toISOString())} />
          <div className="sp-filters" role="group" aria-label="카테고리 필터">
            {MAP_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={
                  "sp-filter pd-tap" + (item.key === category ? " is-on" : "")
                }
                aria-pressed={item.key === category}
                onClick={() =>
                  setCategory(category === item.key ? null : item.key)
                }
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
              const spot = visible.find((item) => item.id === Number(id));
              if (!spot) return null;
              const grade = gradeOf(spot.score);
              return (
                <button
                  type="button"
                  className={
                    "sp-pin" + (spot.id === selectedId ? " is-selected" : "")
                  }
                  aria-pressed={spot.id === selectedId}
                  aria-label={`${spot.name} 퐁당 ${spot.score ?? "–"} ${grade.label}`}
                  onClick={() => setSelectedId(spot.id)}
                >
                  <span className="sp-pin-core" data-grade={grade.key}>
                    {spot.score ?? "–"}
                  </span>
                  <span className="sp-pin-label">{spot.name}</span>
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
              <span className="sp-sheet-sort">거리순</span>
            </div>
            <div className="sp-sheet-list">
              {nearest.map((spot) => {
                const grade = gradeOf(spot.score);
                return (
                  <a className="sp-sheet-row pd-pressable" href={spotLink(spot)} key={spot.id}>
                    <span
                      className="pd-num sp-sheet-badge"
                      data-grade={grade.key}
                    >
                      {spot.score ?? "–"}
                    </span>
                    <span className="sp-sheet-body">
                      <b>{spot.name}</b>
                      <span className="sp-sheet-meta">
                        {spot.categoryLabel} · {spot.distanceKm}km ·{" "}
                        {spot.operating}
                      </span>
                    </span>
                    <span className="sp-sheet-grade">{grade.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
          <p className="pd-note">
            <StateChip kind="example" /> 지도 탭과 같은 지도 컴포넌트를 쓰고 핀
            소스만 명소 목록으로 바꿨습니다. 좌표는 검증된 실제 값이고 핀의
            숫자는 예시 점수입니다.
            {unmapped > 0 &&
              ` 좌표가 아직 확인되지 않은 ${unmapped}곳은 지도에 찍지 않았습니다 — 없는 위치를 임의로 만들지 않습니다.`}
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
  if (isDesktop) return <SpotsDesktop spot={route.spot} />;
  if (route.spot) return <SpotDetailPage spot={route.spot} />;
  return route.view === "map" ? <SpotsMap /> : <SpotsList />;
}
