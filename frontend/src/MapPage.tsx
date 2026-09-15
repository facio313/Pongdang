import { useState } from "react";
import { gradeOf } from "./groupAGrade";
import { GradeChip, Icon, StateChip, type IconName } from "./pongdangUi";
import { AppTabBar } from "./appTabBar";
import "./mapPage.css";

// 지도. 「지점 보기(A3·A4)」와 「코스 경로 보기」를 한 페이지 안에서 전환합니다.
// 라이브캠(A5)은 이 탭에서 제외하고 홈 최하단 모듈에서 들어갑니다.
//
// 데이터 연결 상태 — 이 화면은 아직 어떤 API 에도 연결하지 않았습니다. 아래
// 지점 · 점수 · 수온 · 기온 · 풍속 · 거리 · 이동 순서는 전부 레이아웃 확인용
// 화면 상수이며 「예시 데이터」 칩으로 표기합니다. 합성 값을 실제 관측 ·
// 예보 · 안전 판단으로 제시하지 않습니다.
//
// 카카오 지도 타일과 경로 선 렌더링은 아직 붙이지 않아 점선 슬롯으로 두고,
// 핀만 실제 버튼으로 얹어 선택 동작을 확인할 수 있게 했습니다.

type View = "spots" | "course";

interface Spot {
  id: string;
  name: string;
  address: string;
  score: number | null;
  waterTemp: string;
  airTemp: string;
  wind: string;
  /** 무대 위 상대 위치(%). 실제 좌표가 아니라 배치 확인용입니다. */
  left: number;
  top: number;
}

const SPOTS: Spot[] = [
  {
    id: "gyeongpo",
    name: "경포해변",
    address: "강원 강릉시 저동",
    score: 72,
    waterTemp: "22.1°C",
    airTemp: "26.4°C",
    wind: "3.2m/s",
    left: 33,
    top: 44,
  },
  {
    id: "anmok",
    name: "안목해변",
    address: "강원 강릉시 견소동",
    score: 68,
    waterTemp: "24.8°C",
    airTemp: "26.1°C",
    wind: "2.8m/s",
    left: 63,
    top: 66,
  },
  {
    id: "sacheonjin",
    name: "사천진해변",
    address: "강원 강릉시 사천면",
    score: 54,
    waterTemp: "19.4°C",
    airTemp: "25.2°C",
    wind: "4.1m/s",
    left: 26,
    top: 74,
  },
];

interface CourseStop {
  no: number;
  name: string;
  meta: string;
  distance: string | null;
}

const COURSE_STOPS: CourseStop[] = [
  { no: 1, name: "경포해변", meta: "09:20 서핑 · 주차 가능", distance: "4.2km" },
  { no: 2, name: "안목 항구", meta: "12:00 점심 · 카페 8", distance: "5.1km" },
  { no: 3, name: "사천진 갯벌", meta: "14:30 갯벌 · 간조 12:34", distance: "2.7km" },
  { no: 4, name: "강릉 시내", meta: "18:40 온천 마무리", distance: null },
];

const COURSE_SUMMARY = "오늘의 코스 · 4곳 · 12km";

const TODO_SCREENS = [
  {
    title: "최적경로 탐색",
    detail: "출발지 입력 · 이동수단 · 시간 제약으로 코스 재정렬",
  },
  {
    title: "편의시설 필터",
    detail: "샤워장 · 주차 · 카페 · 반려동물 가능",
  },
];

function Stage({
  view,
  selectedSpotId,
  onSelectSpot,
}: {
  view: View;
  selectedSpotId: string;
  onSelectSpot: (id: string) => void;
}) {
  return (
    <div className="mp-stage">
      <div className="mp-sbar">
        <span>9:41</span>
        <span className="mp-sbar-mark">
          {view === "spots" ? "지도" : "코스 지도"}
        </span>
        <span>강릉</span>
      </div>

      {view === "spots" ? (
        <button type="button" className="mp-searchbar" disabled>
          <Icon name="search" size={16} />
          강릉에서 물놀이 할 곳 찾기
        </button>
      ) : (
        <div className="mp-searchbar is-course">
          <Icon name="course" size={16} />
          {COURSE_SUMMARY}
        </div>
      )}

      <div className="mp-slot mp-tile-slot">
        {view === "spots" ? (
          <>
            카카오 지도 타일 영역
            <br />
            (지도 SDK 미연동 · 아래 핀은 배치 확인용)
          </>
        ) : (
          <>
            경로 선 렌더링 영역
            <br />
            (1 경포 → 2 안목 → 3 사천진 → 4 시내)
          </>
        )}
      </div>

      {view === "spots" &&
        SPOTS.map((spot) => {
          const grade = gradeOf(spot.score);
          const selected = spot.id === selectedSpotId;
          return (
            <button
              type="button"
              key={spot.id}
              className={"mp-pin" + (selected ? " is-selected" : "")}
              style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
              aria-pressed={selected}
              aria-label={`${spot.name} · ${
                spot.score === null
                  ? "평가값 없음"
                  : `${spot.score}점 ${grade.label}`
              } · 수온 ${spot.waterTemp}`}
              onClick={() => onSelectSpot(spot.id)}
            >
              <span
                className="mp-pin-ring"
                style={{
                  background:
                    spot.score === null
                      ? "conic-gradient(rgba(27,39,51,.16) 0 100%)"
                      : `conic-gradient(${grade.color} 0 ${spot.score}%, rgba(27,39,51,.16) ${spot.score}% 100%)`,
                }}
              >
                <span className="mp-pin-core" style={{ color: grade.color }}>
                  {spot.score === null ? "–" : spot.score}
                </span>
              </span>
              <span className="mp-pin-label">
                {spot.name} {spot.score === null ? "–" : spot.score}
              </span>
            </button>
          );
        })}
    </div>
  );
}

function SpotSheet({ spot }: { spot: Spot }) {
  const tiles: { name: string; value: string; icon: IconName }[] = [
    { name: "수온", value: spot.waterTemp, icon: "thermometer" },
    { name: "기온", value: spot.airTemp, icon: "sun" },
    { name: "풍속", value: spot.wind, icon: "wind" },
  ];
  return (
    <>
      <div className="mp-card">
        <div className="mp-spot-head">
          <div>
            <div className="mp-spot-name">{spot.name}</div>
            <div className="mp-spot-address">{spot.address}</div>
          </div>
          <div className="mp-spot-score">
            <div
              className="mp-num mp-spot-score-num"
              style={{ color: gradeOf(spot.score).color }}
            >
              {spot.score === null ? "–" : spot.score}
            </div>
            <GradeChip score={spot.score} bare />
          </div>
        </div>

        <div className="mp-tiles">
          {tiles.map((tile) => (
            <div className="mp-tile" key={tile.name}>
              <Icon name={tile.icon} size={15} className="mp-tile-icon" />
              <div className="mp-num mp-tile-value">{tile.value}</div>
              <div className="mp-tile-name">{tile.name}</div>
            </div>
          ))}
        </div>

        <div className="mp-chips">
          <span className="mp-unknown-chip">
            <Icon name="warning" size={11} />
            안전 상태 unknown
          </span>
          <StateChip kind="example" />
        </div>

        <p className="mp-note">
          점수 · 수온 · 안전 상태는 서로 다른 값이며 하나로 요약하지 않습니다.
          안전 상태 <code>unknown</code>은 판정이 없다는 뜻이며 안전하다는 뜻이
          아닙니다. 지점별로 저장된 값은 수영 점수와 수온뿐이고, 기온 · 풍속은
          경포해변 예보 값입니다. 위 수치는 전부 화면 상수입니다.
        </p>
      </div>

      <div className="mp-actions">
        <button type="button" className="mp-secondary" disabled>
          <Icon name="transit" size={16} />
          길찾기
        </button>
        <button type="button" className="mp-primary" disabled>
          <Icon name="course" size={16} />
          코스에 넣기
        </button>
      </div>
      <p className="mp-note" style={{ marginTop: 0 }}>
        <StateChip kind="uncollected" /> 길찾기와 코스 담기는 아직 구현되지
        않았습니다.
      </p>
    </>
  );
}

function CourseSheet() {
  return (
    <>
      <div className="mp-card">
        <div className="mp-card-top">
          <div className="mp-card-title">이동 순서</div>
          <StateChip kind="example" />
        </div>
        <div className="mp-rows">
          {COURSE_STOPS.map((stop) => (
            <div className="mp-stop" key={stop.no}>
              <span className="mp-stop-no">{stop.no}</span>
              <div className="mp-stop-body">
                <div className="mp-stop-name">{stop.name}</div>
                <div className="mp-stop-meta">{stop.meta}</div>
              </div>
              <span className="mp-stop-dist">{stop.distance ?? "–"}</span>
            </div>
          ))}
        </div>
        <p className="mp-note">
          구간 거리는 화면 상수입니다. 마지막 지점은 다음 구간이 없어 –이며
          0km 가 아닙니다. 서핑 · 갯벌 · 온천은 수집 항목이 아닙니다(저장 활동:
          수영 · 래프팅 · 휴식).
        </p>
      </div>

      <div className="mp-actions">
        <button type="button" className="mp-secondary" disabled>
          <Icon name="transit" size={16} />
          길찾기 앱으로
        </button>
        <button type="button" className="mp-primary" disabled>
          <Icon name="save" size={16} />
          내 코스에 저장
        </button>
      </div>
      <p className="mp-note" style={{ marginTop: 0 }}>
        <StateChip kind="uncollected" /> 경로 계산 · 길찾기 연동 · 코스 저장은
        아직 구현되지 않았습니다.
      </p>
    </>
  );
}

export function MapPage() {
  const [view, setView] = useState<View>("spots");
  const [selectedSpotId, setSelectedSpotId] = useState(SPOTS[0].id);
  const spot = SPOTS.find((item) => item.id === selectedSpotId) ?? SPOTS[0];

  return (
    <article className="map-page">
      <div className="mp-frame">
        <Stage
          view={view}
          selectedSpotId={selectedSpotId}
          onSelectSpot={setSelectedSpotId}
        />

        <div className="mp-sheet">
          <div className="mp-handle" aria-hidden="true" />

          <div className="mp-switch" role="group" aria-label="지도 보기 전환">
            <button
              type="button"
              className={"mp-switch-item" + (view === "spots" ? " is-on" : "")}
              aria-pressed={view === "spots"}
              onClick={() => setView("spots")}
            >
              지점 보기
            </button>
            <button
              type="button"
              className={"mp-switch-item" + (view === "course" ? " is-on" : "")}
              aria-pressed={view === "course"}
              onClick={() => setView("course")}
            >
              코스 경로
            </button>
          </div>

          {view === "spots" ? <SpotSheet spot={spot} /> : <CourseSheet />}

          {TODO_SCREENS.map((item) => (
            <div className="mp-slot mp-todo" key={item.title}>
              <div>
                <b>{item.title}</b>
                <br />
                {item.detail}
                <br />
                화면 미작성
              </div>
            </div>
          ))}

          <AppTabBar active="map" />
        </div>
      </div>
    </article>
  );
}
