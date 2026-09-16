import { useMemo } from "react";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl, type MascotRole } from "./mascots";
import {
  DesktopHero,
  DesktopNav,
  DesktopShell,
  FootNote,
  LabelRow,
} from "./pongdangDesktop";
import { GradeIcon } from "./pongdangUi";
import { MAPPABLE_SPOTS, mappableSpots } from "./spotsCatalog";
import "./coursesDesktop.css";

// 데스크탑 내 코스(핸드오프 18d)입니다. 왼쪽 지도(고정) + 오른쪽 시간축 일정,
// 아래 괘선 행에 저장한 코스 목록을 둡니다.
//
// 코스 저장 · 경로 계산 · 이동 시간 · 공유는 전부 미연동입니다. 값이 없는 코스는
// «–» 로 두며 0 이 아닙니다.

const CONTEXT = "저장한 코스 3개 · 9월 15일";

const SUMMARY: { name: string; value: string }[] = [
  { name: "장소", value: "3곳" },
  { name: "이동", value: "12.0km" },
  { name: "소요", value: "4h 30m" },
];

/** 오늘 일정. 점수는 활동별 점수이며 안목 카페거리는 산정 대상이 아닙니다. */
const SCHEDULE: {
  time: string;
  duration: string;
  name: string;
  mascot: MascotRole;
  detail: string;
  scoreLabel: string;
  score: number | null;
}[] = [
  {
    time: "09:20",
    duration: "2시간",
    name: "경포해변 서핑",
    mascot: "surf",
    detail: "파고 0.6m · 수온 22.1°C · 주차 · 샤워장",
    scoreLabel: "수영 점수",
    score: 82,
  },
  {
    time: "12:00",
    duration: "1시간",
    name: "안목 카페거리",
    mascot: "cafe",
    detail: "이동 5.1km · 점심 · 휴식",
    scoreLabel: "점수",
    score: null,
  },
  {
    time: "14:30",
    duration: "1시간 30분",
    name: "사천진 온천",
    mascot: "hotspring",
    detail: "이동 2.7km · 실내 · 몸 녹이기",
    scoreLabel: "휴식 점수",
    score: 70,
  },
];

/** 저장한 코스. 날짜 · 소요가 없는 코스는 «–» 입니다. */
const SAVED: {
  name: string;
  mascot: MascotRole;
  meta: string;
  state: string;
  stateKind: "today" | "past" | "draft";
  duration: string;
}[] = [
  {
    name: "서핑 → 카페 → 온천",
    mascot: "surf",
    meta: "9월 15일 · 3곳 · 12.0km",
    state: "오늘 일정",
    stateKind: "today",
    duration: "4h 30m",
  },
  {
    name: "갯벌 체험 반나절",
    mascot: "spot",
    meta: "8월 30일 · 2곳 · 6.4km",
    state: "지난 코스",
    stateKind: "past",
    duration: "3h 00m",
  },
  {
    name: "사천진 스노클링",
    mascot: "snorkel",
    meta: "날짜 미정 · 1곳 · –",
    state: "임시 저장",
    stateKind: "draft",
    duration: "–",
  },
];

export function CoursesDesktop() {
  // 코스 경로는 아직 계산되지 않습니다. 지도에는 저장된 지점만 찍고, 없는
  // 경로선을 그리지 않습니다.
  const pinned = useMemo(() => mappableSpots(MAPPABLE_SPOTS), []);
  const markers = useMemo(
    () =>
      pinned.map(({ spot, latitude, longitude }, index) => ({
        id: String(spot.id),
        latitude,
        longitude,
        order: index + 1,
      })),
    [pinned],
  );

  return (
    <DesktopShell>
      <DesktopHero
        nav={<DesktopNav active="my-courses" context={CONTEXT} />}
        band
        wave="static"
      >
        <div className="cd-hero">
          <div className="cd-hero-lead">
            <div className="pd-dk-kick cd-hero-kick">내 코스</div>
            <h1 className="cd-hero-title">9월 15일 · 서핑과 온천</h1>
          </div>
          <img
            className="cd-hero-mascot"
            src={mascotUrl("course")}
            alt={MASCOT_ALT}
            width={86}
            height={86}
          />
          <div className="cd-hero-summary">
            {SUMMARY.map((item) => (
              <div key={item.name}>
                <div className="cd-summary-name">{item.name}</div>
                <div className="pd-dk-num cd-summary-value">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </DesktopHero>

      <div className="cd-stage">
        <div className="cd-map">
          <KakaoMapCanvas
            markers={markers}
            selectedId={null}
            renderMarker={(id) => {
              const marker = markers.find((item) => item.id === id);
              if (!marker) return null;
              const spot = MAPPABLE_SPOTS.find(
                (item) => item.id === Number(id),
              );
              return (
                <span className="cd-pin">
                  <span className="pd-dk-num cd-pin-core">{marker.order}</span>
                  <span className="cd-pin-label">{spot?.name}</span>
                </span>
              );
            }}
            overlay={
              <span className="cd-map-badge">
                저장된 코스 · 경로선은 아직 계산되지 않습니다
              </span>
            }
          />
        </div>

        <div className="cd-schedule">
          <div className="cd-schedule-head">
            <span className="pd-dk-kick">오늘 일정</span>
            <span className="pd-state-chip">예시 · 코스 데이터 미연동</span>
          </div>
          {SCHEDULE.map((item) => {
            const grade = gradeOf(item.score);
            return (
              <div className="cd-item" key={item.name}>
                <div className="cd-item-time">
                  <div className="pd-dk-num cd-item-clock">{item.time}</div>
                  <div className="cd-item-duration">{item.duration}</div>
                </div>
                <img
                  src={mascotUrl(item.mascot)}
                  alt=""
                  width={54}
                  height={54}
                />
                <div className="cd-item-body">
                  <div className="cd-item-name">{item.name}</div>
                  <div className="cd-item-detail">{item.detail}</div>
                  <div className="cd-item-score" data-grade={grade.key}>
                    <GradeIcon gradeKey={grade.key} size={12} />
                    {item.scoreLabel} {item.score ?? "–"} · {grade.label}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="cd-actions">
            <button type="button" className="pd-dk-button">
              순서 바꾸기
            </button>
            <button type="button" className="pd-dk-button is-quiet">
              공유
            </button>
            <span className="cd-note">
              이동 시간은 자동차 기준 추정값입니다.
            </span>
          </div>
        </div>
      </div>

      <LabelRow
        kick="저장한 코스"
        title="3개"
        desc="추천 탭에서 저장한 코스가 그대로 쌓입니다."
      >
        {SAVED.map((course) => (
          <div className="cd-saved" key={course.name}>
            <img src={mascotUrl(course.mascot)} alt="" width={40} height={40} />
            <div className="cd-saved-body">
              <div className="cd-saved-name">{course.name}</div>
              <div className="cd-saved-meta">{course.meta}</div>
            </div>
            <span className={"cd-saved-state is-" + course.stateKind}>
              {course.state}
            </span>
            <span
              className={
                "pd-dk-num cd-saved-duration" +
                (course.duration === "–" ? " is-empty" : "")
              }
            >
              {course.duration}
            </span>
          </div>
        ))}
      </LabelRow>

      <FootNote
        missing="코스 저장 · 경로 계산 · 이동 시간 · 공유"
        note="날짜 · 소요 시간이 없는 코스는 «–»로 둡니다 — 0이 아닙니다. 위 수치는 레이아웃 확인용 예시입니다."
      />
    </DesktopShell>
  );
}
