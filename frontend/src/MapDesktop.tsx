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
  SplitBody,
} from "./pongdangDesktop";
import { GradeIcon, Icon, type IconName } from "./pongdangUi";
import {
  MAPPABLE_SPOTS,
  SPOT_WATER_TEMP,
  mappableSpots,
  spotLink,
  type Spot,
} from "./spotsCatalog";
import "./mapDesktop.css";

// 데스크탑 지도(핸드오프 18c)입니다. 지도가 화면의 지배 요소이므로 히어로를
// 얇은 띠로 줄이고 지도 면을 크게 뒀습니다.
//
// 좌표만 실제 검증값(mapLocations.ts)이고 점수 · 수온 · 편의 시설은 예시입니다.
// 지도 컴포넌트는 모바일과 같은 KakaoMapCanvas 를 그대로 씁니다 -- 데스크탑
// 비율로 커졌을 뿐입니다.

const CONTEXT = `강릉 · 9월 15일 · 지점 ${MAPPABLE_SPOTS.length}곳`;

const ACTIVITY_FILTERS = ["수영", "서핑", "온천", "주차 · 샤워장"];

/** 선택 지점의 근거 막대. 막대는 **지표 값의 위치**이며 점수 기여도가 아닙니다. */
const EVIDENCE: { name: string; verdict: string; ratio: number | null }[] = [
  { name: "파고 0.6m", verdict: "적정", ratio: 0.72 },
  { name: "수온 22.1°C", verdict: "적정", ratio: 0.64 },
  // 수집이 없으면 막대를 채우지 않습니다. 빈 막대가 0 이나 안전을 뜻하지
  // 않는다는 것은 옆 문구와 하단 경고가 말합니다.
  { name: "수질", verdict: "수집 미구현", ratio: null },
];

const FACILITIES: { name: string; icon: IconName; known: boolean }[] = [
  { name: "주차", icon: "parking", known: true },
  { name: "샤워장", icon: "quality", known: true },
  { name: "안전요원 · 정보 없음", icon: "warning", known: false },
];

function SpotRow({
  spot,
  selected,
  onSelect,
}: {
  spot: Spot;
  selected: boolean;
  onSelect: () => void;
}) {
  const grade = gradeOf(spot.score);
  return (
    <button
      type="button"
      className={"mk-spot" + (selected ? " is-selected" : "")}
      data-grade={grade.key}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="pd-dk-num mk-spot-score">{spot.score ?? "–"}</span>
      <span className="mk-spot-body">
        <span className="mk-spot-name">{spot.name}</span>
        <span className="mk-spot-grade">
          <GradeIcon gradeKey={grade.key} size={12} />
          {grade.label}
        </span>
      </span>
      <span className="pd-dk-num mk-spot-temp">
        {SPOT_WATER_TEMP[spot.id] ?? "–"}
      </span>
    </button>
  );
}

export function MapDesktop() {
  const [activity, setActivity] = useState(ACTIVITY_FILTERS[0]);
  // 지도 조작 API 는 지도가 준비된 뒤 effect 에서 넘어옵니다.
  const [mapApi, setMapApi] = useState<MapControlApi | null>(null);
  const [selectedId, setSelectedId] = useState(MAPPABLE_SPOTS[0]?.id ?? null);
  const selected =
    MAPPABLE_SPOTS.find((spot) => spot.id === selectedId) ?? MAPPABLE_SPOTS[0];
  const pinned = useMemo(() => mappableSpots(MAPPABLE_SPOTS), []);
  const markers = useMemo(
    () =>
      pinned.map(({ spot, latitude, longitude }) => ({
        id: String(spot.id),
        latitude,
        longitude,
      })),
    [pinned],
  );
  const ranked = [...MAPPABLE_SPOTS].sort(
    (a, b) => (b.score ?? -1) - (a.score ?? -1),
  );
  const selectedGrade = gradeOf(selected?.score ?? null);

  return (
    <DesktopShell>
      <DesktopHero
        nav={<DesktopNav active="map" context={CONTEXT} />}
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
          <div className="mk-filters" role="group" aria-label="활동 필터">
            {ACTIVITY_FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                className={"mk-filter" + (item === activity ? " is-on" : "")}
                aria-pressed={item === activity}
                onClick={() => setActivity(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </DesktopHero>

      <div className="mk-stage">
        <div className="mk-side">
          <div className="mk-search">
            <Icon name="search" size={17} />
            <span>해변 · 활동 검색</span>
          </div>
          <div className="pd-dk-kick mk-side-kick">
            지점 {MAPPABLE_SPOTS.length}곳 · {activity} 점수순
          </div>
          {ranked.map((spot) => (
            <SpotRow
              key={spot.id}
              spot={spot}
              selected={spot.id === selected?.id}
              onSelect={() => setSelectedId(spot.id)}
            />
          ))}
          <p className="mk-note">
            목록 순서는 {activity} 점수 기준입니다. 점수는 예시이며 좌표만 실제
            값입니다.
          </p>
          <div className="mk-alert">
            <Icon name="warning" size={15} />
            수질 · 조위는 미연동 — 값이 없는 상태가 안전을 뜻하지 않습니다
          </div>
        </div>

        <div className="mk-map">
          <KakaoMapCanvas
            markers={markers}
            selectedId={selected ? String(selected.id) : null}
            renderMarker={(id) => {
              const spot = MAPPABLE_SPOTS.find((item) => item.id === Number(id));
              if (!spot) return null;
              const grade = gradeOf(spot.score);
              return (
                <button
                  type="button"
                  className={
                    "mk-pin" + (spot.id === selected?.id ? " is-selected" : "")
                  }
                  data-grade={grade.key}
                  aria-pressed={spot.id === selected?.id}
                  aria-label={`${spot.name} 퐁당 ${spot.score ?? "–"} ${grade.label}`}
                  onClick={() => setSelectedId(spot.id)}
                >
                  <span className="pd-dk-num mk-pin-core">
                    {spot.score ?? "–"}
                  </span>
                  <span className="mk-pin-label">{spot.name}</span>
                </button>
              );
            }}
            onReady={setMapApi}
            overlay={
              <>
                <span className="mk-map-badge">
                  카카오 지도 · 마커 점수는 예시
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
                  {selected.address} · 수온{" "}
                  {SPOT_WATER_TEMP[selected.id] ?? "–"} ·{" "}
                  {selected.detail.parking ?? "주차 정보 –"}
                </div>
              </div>
              <div className="mk-panel-score" data-grade={selectedGrade.key}>
                <div className="pd-dk-num mk-panel-score-num">
                  {selected.score ?? "–"}
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

      <LabelRow
        kick="선택 지점"
        title={`${selected?.name ?? "지점"} · 근거`}
        desc="막대는 지표 값의 위치이며 점수 기여도가 아닙니다."
      >
        <SplitBody columns="1.2fr 1fr">
        <div className="mk-evidence">
          {EVIDENCE.map((row) => (
            <div className="mk-evidence-row" key={row.name}>
              <div
                className={
                  "mk-evidence-head" + (row.ratio === null ? " is-empty" : "")
                }
              >
                <span>{row.name}</span>
                <b>{row.verdict}</b>
              </div>
              <div className="mk-evidence-track">
                {row.ratio !== null && (
                  <span
                    className="mk-evidence-fill"
                    style={{ width: `${row.ratio * 100}%` }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mk-facilities">
          <div className="pd-dk-kick">편의 시설</div>
          <div className="mk-facility-row">
            {FACILITIES.map((facility) => (
              <span
                className={
                  "mk-facility" + (facility.known ? "" : " is-unknown")
                }
                key={facility.name}
              >
                <span className="mk-facility-icon">
                  {facility.known ? (
                    <Icon name={facility.icon} size={19} />
                  ) : (
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeDasharray="3 3"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="8.6" />
                    </svg>
                  )}
                </span>
                {facility.name}
              </span>
            ))}
          </div>
          <p className="mk-note">
            편의 시설 정보는 예시이며, 「정보 없음」은 없음을 뜻하지 않습니다.
          </p>
          {selected && (
            <a className="mk-detail-link" href={spotLink(selected)}>
              {selected.name} 상세 →
            </a>
          )}
        </div>
        </SplitBody>
      </LabelRow>

      <FootNote
        missing="수질 수집 · 조위 · 편의 시설 · 안전요원 정보"
        note="마커 좌표는 실제 값이고 점수는 예시입니다. NULL · unknown은 안전한 상태를 뜻하지 않습니다."
      />
    </DesktopShell>
  );
}
