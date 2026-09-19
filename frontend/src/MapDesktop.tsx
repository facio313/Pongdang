import { useMemo, useState } from "react";
import { KakaoMapCanvas, type MapControlApi } from "./KakaoMapCanvas";
import { gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl } from "./mascots";
import {
  DesktopHero,
  DesktopNav,
  DesktopShell,
  FootNote,
  LabelRow,
} from "./pongdangDesktop";
import {
  ComponentBars,
  GradeIcon,
  Icon,
  ScoreExplainer,
  ScoreReason,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { EvidenceNote } from "./EvidenceNote";
import { activities, type Activity } from "./aiApi";
import { componentBars, scoreReason, scoreTitle } from "./scoreMeaning";
import {
  conditionScore,
  dateLabel,
  metricText,
  type Place,
} from "./productData";
import { isInitialLoad } from "./useResource";
import { useConditions } from "./useConditions";
import { mappablePlaces, useWaterPlaces } from "./useWaterPlaces";
import { spotLink } from "./spotsRoute";
import "./mapDesktop.css";

// 데스크탑 지도(핸드오프 18c)입니다. 지도가 화면의 지배 요소이므로 히어로를
// 얇은 띠로 줄이고 지도 면을 크게 뒀습니다.
//
// 예전에는 이 화면에 훅이 하나도 없었습니다. 지점 목록 · 수온 · 근거 막대 ·
// 편의 시설이 전부 파일 안 상수였고, 같은 라우트의 모바일 지도는 그동안 실제
// 장소와 조건을 읽고 있었습니다. 이제 모바일과 **같은 훅**을 씁니다.
//
// 지도 컴포넌트는 모바일과 같은 KakaoMapCanvas 를 그대로 씁니다 -- 데스크탑
// 비율로 커졌을 뿐입니다.

/** 점수를 매길 활동. 모바일 지도는 수영 기준이므로 같은 기준을 씁니다. */
const ACTIVITY: Activity = "swim";

/** 지점 한 줄. 모바일 지도와 달리 목록이 왼쪽에 상주하므로, 줄마다 자기
 *  조건을 조회합니다. 서버가 100건에서 자르고 화면은 그 사실을 밝힙니다. */
function SpotRow({
  place,
  selected,
  onSelect,
}: {
  place: Place;
  selected: boolean;
  onSelect: () => void;
}) {
  const conditions = useConditions(place.id, ACTIVITY);
  const score = conditionScore(conditions.data);
  const grade = gradeOf(score);
  return (
    <button
      type="button"
      className={"mk-spot" + (selected ? " is-selected" : "")}
      data-grade={grade.key}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="pd-dk-num mk-spot-score">
        {isInitialLoad(conditions) ? (
          <Skeleton width="1.6em" label="점수 조회 중" />
        ) : (
          (score ?? "–")
        )}
      </span>
      <span className="mk-spot-body">
        <span className="mk-spot-name">{place.name}</span>
        <span className="mk-spot-grade">
          <GradeIcon gradeKey={grade.key} size={12} />
          {grade.label}
        </span>
      </span>
      <span className="pd-dk-num mk-spot-temp">
        {metricText(conditions.data, "water_temperature")}
      </span>
    </button>
  );
}

export function MapDesktop() {
  // 지도 조작 API 는 지도가 준비된 뒤 effect 에서 넘어옵니다.
  const [mapApi, setMapApi] = useState<MapControlApi | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const places = useWaterPlaces(search);
  const pinned = useMemo(() => mappablePlaces(places.rows ?? []), [places.rows]);
  const markers = useMemo(
    () =>
      pinned.map(({ place, latitude, longitude }) => ({
        id: String(place.id),
        latitude,
        longitude,
      })),
    [pinned],
  );
  const rows = pinned.map(({ place }) => place);
  const selected =
    rows.find((place) => place.id === selectedId) ??
    rows.find((place) => place.id === places.defaultPlaceId) ??
    rows[0];
  // 오른쪽 패널과 아래 근거는 고른 지점 하나만 조회합니다.
  const conditions = useConditions(selected?.id, ACTIVITY);
  const selectedScore = conditionScore(conditions.data);
  const selectedGrade = gradeOf(selectedScore);
  const unmapped = (places.rows?.length ?? 0) - pinned.length;

  return (
    <DesktopShell>
      <DesktopHero
        nav={
          <DesktopNav
            active="map"
            context={`강릉 · ${dateLabel()} · 지점 ${pinned.length}곳`}
          />
        }
        band
        wave="static"
      >
        <div className="mk-hero">
          <div className="mk-hero-lead">
            <div className="pd-dk-kick mk-hero-kick">지도</div>
            <h1 className="mk-hero-title">어디로 갈지 지도에서 고르기</h1>
          </div>
          <img
            className="mk-hero-mascot"
            src={mascotUrl("map")}
            alt={MASCOT_ALT}
            width={86}
            height={86}
          />
          {/* 예전에는 여기 「수영 · 서핑 · 온천 · 주차 · 샤워장」 필터가 있었고
              눌러도 목록이 바뀌지 않았습니다. 동작하지 않는 컨트롤은 두지
              않습니다. 대신 실제로 목록을 바꾸는 검색을 둡니다. */}
          <label className="mk-search mk-hero-search">
            <Icon name="search" size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              maxLength={100}
              placeholder="장소명 · 지역 검색"
              aria-label="장소명·지역 검색"
            />
          </label>
        </div>
      </DesktopHero>

      <div className="mk-stage">
        <div className="mk-side">
          <div className="pd-dk-kick mk-side-kick">
            지점 {pinned.length}곳 · {activities[ACTIVITY]} 점수
          </div>
          {rows.map((place) => (
            <SpotRow
              key={place.id}
              place={place}
              selected={place.id === selected?.id}
              onSelect={() => setSelectedId(place.id)}
            />
          ))}
          {!rows.length && (
            <p className="mk-note" role={places.error ? "alert" : "status"}>
              {places.error ??
                (places.loading ? "장소를 조회하고 있습니다." : "검색 결과 없음")}
            </p>
          )}
          <p className="mk-note">
            좌표가 있는 장소만 싣습니다 · 서버가 한 번에 최대 100곳까지
            내려줍니다.
            {unmapped > 0 &&
              ` 좌표가 아직 확인되지 않은 ${unmapped}곳은 지도에 찍지 않았습니다 — 없는 위치를 임의로 만들지 않습니다.`}
          </p>
          <div className="mk-alert">
            <Icon name="warning" size={15} />
            값이 없는 상태가 안전을 뜻하지 않습니다
          </div>
        </div>

        <div className="mk-map">
          <KakaoMapCanvas
            markers={markers}
            selectedId={selected ? String(selected.id) : null}
            renderMarker={(id) => {
              const place = rows.find((item) => item.id === Number(id));
              if (!place) return null;
              // 점수는 고른 지점만 조회합니다. 핀마다 부르면 100번이 됩니다.
              const isSelected = place.id === selected?.id;
              const score = isSelected ? selectedScore : null;
              const grade = gradeOf(score);
              return (
                <button
                  type="button"
                  className={"mk-pin" + (isSelected ? " is-selected" : "")}
                  data-grade={grade.key}
                  aria-pressed={isSelected}
                  aria-label={`${place.name} 퐁당 ${score ?? "–"} ${grade.label}`}
                  onClick={() => setSelectedId(place.id)}
                >
                  <span className="pd-dk-num mk-pin-core">{score ?? "–"}</span>
                  <span className="mk-pin-label">{place.name}</span>
                </button>
              );
            }}
            onReady={setMapApi}
            overlay={
              <>
                <span className="mk-map-badge">
                  카카오 지도 · 고른 지점만 점수를 조회합니다
                </span>
                <div className="mk-map-controls">
                  <button
                    type="button"
                    aria-label="확대"
                    onClick={() => mapApi?.zoomIn()}
                  >
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="축소"
                    onClick={() => mapApi?.zoomOut()}
                  >
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="is-accent"
                    aria-label="현재 위치로 이동"
                    onClick={() => void mapApi?.locate()}
                  >
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                    </svg>
                  </button>
                </div>
              </>
            }
          />
          {selected && (
            <div className="mk-panel">
              <img
                src={mascotUrl("swim")}
                alt={MASCOT_ALT}
                width={52}
                height={52}
              />
              <div className="mk-panel-body">
                <div className="mk-panel-name">{selected.name}</div>
                <div className="mk-panel-meta">
                  {selected.address ?? "주소 없음"} · 수온{" "}
                  {metricText(conditions.data, "water_temperature")}
                </div>
              </div>
              <div className="mk-panel-score" data-grade={selectedGrade.key}>
                <div className="pd-dk-num mk-panel-score-num">
                  {isInitialLoad(conditions) ? (
                    <Skeleton width="1.4em" label="점수 조회 중" />
                  ) : (
                    (selectedScore ?? "–")
                  )}
                </div>
                <div className="mk-panel-score-grade">
                  {selectedGrade.label}
                </div>
              </div>
              <a className="pd-dk-button mk-panel-add" href="#my-courses">
                코스에 추가
              </a>
            </div>
          )}
        </div>
      </div>

      {/* 예전에는 근거 막대가 「파고 0.6m 적정 72%」처럼 지어낸 비율이었고,
          편의 시설은 주차 · 샤워장이 늘 「있음」이었습니다. 이제 점수를 이루는
          실제 항목을 그립니다. 편의 시설을 내려주는 API 는 없으므로 그 칸은
          없앴습니다 -- 「정보 없음」 아이콘만 남기면 있는 기능처럼 보입니다. */}
      <LabelRow
        kick="선택 지점"
        title={`${selected?.name ?? "지점"} · ${activities[ACTIVITY]} 점수 근거`}
        chip={<StateChip kind={conditions.data ? "live" : "no_data"} />}
        desc={
          selected
            ? `${scoreTitle(ACTIVITY)}를 이루는 항목입니다. 각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다.`
            : "지점을 고르면 그 지점의 점수 근거를 조회합니다."
        }
      >
        <ComponentBars
          bars={componentBars(conditions.data)}
          loading={isInitialLoad(conditions)}
        />
        <ScoreReason
          text={scoreReason(conditions.data).text}
          loading={isInitialLoad(conditions)}
        />
        <EvidenceNote data={conditions.data} className="mk-note" chip={false} />
        <ScoreExplainer data={conditions.data} />
        {selected && (
          <a className="mk-detail-link" href={spotLink(selected)}>
            {selected.name} 상세 →
          </a>
        )}
      </LabelRow>

      <FootNote
        missing="편의 시설 · 안전요원 정보 · 조위 시계열"
        note="마커 좌표는 서버가 준 실제 값입니다. 고른 지점만 점수를 조회하며, 고르기 전에는 «–» 입니다. NULL · unknown 은 안전한 상태를 뜻하지 않습니다."
      />
    </DesktopShell>
  );
}
