import { useState } from "react";
import { gradeOf } from "./groupAGrade";
import { GradeChip, GradeIcon, Icon, StateChip } from "./pongdangUi";
import "./myCoursesPage.css";

// 내 코스(저장 목록). 코스 상세는 추천 탭의 코스 결과 화면과 같은 화면을
// 공유하므로, 상세 열기는 `#recommend` 로 보냅니다.
//
// 데이터 연결 상태 — 이 화면은 아직 어떤 API 에도 연결하지 않았습니다. 저장
// 목록 · 점수 · 날짜 · 알림 설정은 전부 레이아웃 확인용 화면 상수이며
// 「예시 데이터」 칩으로 표기합니다. 코스 저장 · 알림 발송 기능 자체가
// 구현되어 있지 않습니다.

interface SavedCourse {
  id: string;
  name: string;
  /** 구성 활동과 날짜. 날짜가 없으면 null 이며 0 이나 오늘로 채우지 않습니다. */
  parts: string;
  date: string | null;
  score: number | null;
  alarm: boolean;
}

const SAVED_COURSES: SavedCourse[] = [
  {
    id: "water",
    name: "오늘의 물 코스",
    parts: "서핑 · 갯벌 · 온천",
    date: "9/15",
    score: 82,
    alarm: true,
  },
  {
    id: "rainy",
    name: "비 오는 날 실내",
    parts: "온천 · 시장 · 카페",
    date: "9/18",
    score: 60,
    alarm: true,
  },
  {
    id: "family",
    name: "부모님과 반나절",
    parts: "해변 산책 · 카페",
    date: null,
    score: null,
    alarm: false,
  },
];

const TODO_SCREENS = [
  {
    title: "코스 공유",
    detail: "링크 · 이미지 카드 · 카카오 공유",
  },
  {
    title: "지난 코스 기록",
    detail: "다녀온 코스 · 첫 입수 기록과 연결",
  },
];

function TabBar() {
  return (
    <>
      <nav className="mc-tabbar" aria-label="주요 탭">
        <a className="mc-tab" href="#home">
          홈
        </a>
        <a className="mc-tab" href="#today">
          오늘
        </a>
        <a className="mc-tab" href="#recommend">
          추천
        </a>
        <a className="mc-tab" href="#map">
          지도
        </a>
        <a className="mc-tab" href="#my-courses" aria-current="page">
          내 코스
        </a>
      </nav>
      <p className="mc-tabbar-note">
        코스 상세는 추천 탭의 코스 결과 화면을 함께 씁니다.
      </p>
    </>
  );
}

export function MyCoursesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    SAVED_COURSES.find((course) => course.id === selectedId) ?? null;

  return (
    <article className="my-courses-page">
      <div className="mc-frame">
        <header className="mc-hero">
          <div className="mc-sbar">
            <span>9:41</span>
            <span className="mc-sbar-mark">MY COURSES</span>
            <span>강릉</span>
          </div>
          <div className="mc-hero-inner">
            <p className="mc-lbl">저장 {SAVED_COURSES.length}개</p>
            <h1 className="mc-hero-title">내 코스</h1>
            <p className="mc-hero-sub">알림은 저장한 코스에만 보냅니다</p>
            <p className="mc-hero-note">
              코스 저장과 알림 발송은 아직 구현되지 않았습니다. 아래 목록은
              화면 상수이며 실제로 저장된 코스가 아닙니다.
            </p>
          </div>
        </header>

        <div className="mc-body">
          <p className="mc-note" style={{ margin: 0 }}>
            <StateChip kind="example" /> <StateChip kind="uncollected" /> 아래
            저장 목록 · 점수 · 날짜 · 알림 설정은 전부 화면 상수입니다. 코스
            저장과 알림 발송 기능이 아직 없어 실제로 저장된 코스가 없습니다.
          </p>
          {SAVED_COURSES.map((course) => {
            const grade = gradeOf(course.score);
            const isSelected = course.id === selectedId;
            return (
              <button
                type="button"
                key={course.id}
                className={"mc-row" + (isSelected ? " is-selected" : "")}
                aria-pressed={isSelected}
                onClick={() =>
                  setSelectedId((current) =>
                    current === course.id ? null : course.id,
                  )
                }
              >
                <span className="mc-score-badge" data-grade={grade.key}>
                  {course.score === null ? "–" : course.score}
                </span>
                <span className="mc-row-body">
                  <span className="mc-row-name">{course.name}</span>
                  <span className="mc-row-meta">
                    <GradeIcon gradeKey={grade.key} size={12} />
                    <span>
                      {grade.label} · {course.parts} · {course.date ?? "날짜 –"}
                    </span>
                  </span>
                </span>
                <span
                  className={"mc-alarm-chip" + (course.alarm ? "" : " is-off")}
                >
                  {course.alarm ? "알림 켬" : "날짜 없음"}
                </span>
              </button>
            );
          })}

          {selected && (
            <div className="mc-detail">
              <div className="mc-detail-title">{selected.name}</div>
              <dl>
                <dt>점수</dt>
                <dd>
                  <GradeChip score={selected.score} />
                </dd>
                <dt>구성</dt>
                <dd>{selected.parts}</dd>
                <dt>날짜</dt>
                <dd>{selected.date ?? "–"}</dd>
                <dt>알림</dt>
                <dd>{selected.alarm ? "켬" : "날짜가 없어 보낼 수 없음"}</dd>
              </dl>
              <p className="mc-note">
                <StateChip kind="example" />{" "}
                {selected.score === null
                  ? "이 코스는 날짜가 없어 저장된 점수가 없습니다. –는 0점이 아니며 안전하다는 뜻도 아닙니다."
                  : "점수는 저장 시점의 예보 기준이며 지금 조건이 아닙니다."}{" "}
                서핑 · 갯벌 · 온천 · 시장은 수집 항목이 아닙니다(저장 활동:
                수영 · 래프팅 · 휴식).
              </p>
              <div className="mc-detail-actions">
                <button type="button" className="mc-secondary" disabled>
                  <Icon name="share" size={16} />
                  공유
                </button>
                <a className="mc-primary" href="#recommend">
                  <Icon name="course" size={16} />
                  코스 상세 열기
                </a>
              </div>
            </div>
          )}

          {TODO_SCREENS.map((item) => (
            <div className="mc-slot" key={item.title}>
              <div>
                <b>{item.title}</b>
                <br />
                {item.detail}
                <br />
                화면 미작성
              </div>
            </div>
          ))}

          <TabBar />
        </div>
      </div>
    </article>
  );
}
