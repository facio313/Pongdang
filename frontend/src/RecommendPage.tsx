import { useState } from "react";
import { DataOrigin } from "./DataOrigin";
import { gradeOf } from "./groupAGrade";
import {
  AiSuggestion,
  GradeChip,
  GradeIcon,
  Icon,
  StateChip,
  type IconName,
} from "./pongdangUi";
import { AppTabBar } from "./appTabBar";
import { useGangneungSpots } from "./gangneungSpots";
import "./recommendPage.css";

// 추천(그룹 B). 진입 → 취향 수집(3단계) → 대화형 컨시어지 → 코스 결과 →
// 조건 변화 재추천을 한 페이지 안의 단계 전환으로 구현합니다.
//
// 데이터 연결 상태
//  - 지점(장소명 · 지역 · 주소 · 검증 상태): `/api/data/datasets/spots` 실연동.
//  - 점수 · 파고 · 수온 · 물때 · 코스 · 대화 응답: 저장된 값이 없습니다.
//    추천 엔진도 구현되어 있지 않아, 아래 상수는 전부 레이아웃 확인용
//    예시이며 화면에 「예시 데이터」/「수집 미구현」 칩으로 표기합니다.
//
// 표기 규칙상 「AI 제안」 칩이 붙은 카드에는 같은 카드 안에 근거(사용 지표 ·
// 시각 · 출처)가 반드시 함께 있어야 하므로, AiSuggestion 이 headline 과
// basis 를 한 덩어리로 렌더합니다. 근거 없는 추천 카드는 만들지 않습니다.

type Step = "entry" | "taste" | "chat" | "course" | "realert";

const TODAY_LABEL = "9월 15일";

/** 저장된 활동은 수영 · 래프팅 · 휴식 3종뿐입니다. 그 밖의 태그는 수집
 *  항목이 아니므로 화면에서 예시임을 밝혀야 합니다. */
const COLLECTED_ACTIVITIES = ["수영", "래프팅", "휴식"];

const TAG_GROUPS: { label: string; tags: string[] }[] = [
  { label: "물놀이", tags: ["서핑", "수영", "SUP", "갯벌 체험", "래프팅"] },
  { label: "쉬기 · 구경", tags: ["온천", "카페", "일몰 보기", "캠핑"] },
  { label: "조건", tags: ["파도 적은 곳", "주차 편한 곳", "샤워장", "반려동물"] },
];

const SWIPE_CARDS: {
  id: string;
  name: string;
  icon: IconName;
  score: number | null;
  place: string;
}[] = [
  { id: "surf", name: "서핑 강습", icon: "surf", score: 82, place: "경포해변" },
  { id: "sup", name: "SUP 체험", icon: "sup", score: 74, place: "안목해변" },
  { id: "mudflat", name: "갯벌 체험", icon: "mudflat", score: 64, place: "사천진 갯벌" },
  { id: "hotspring", name: "온천 마무리", icon: "hotspring", score: 70, place: "강릉 시내" },
  { id: "cafe", name: "바다 뷰 카페", icon: "cafe", score: null, place: "안목 커피거리" },
  { id: "sunset", name: "일몰 보기", icon: "sunset", score: null, place: "경포대" },
];

const CHAT_TURNS: { question: string; replies: string[] }[] = [
  { question: "오늘 강릉에서 뭘 하고 싶으세요?", replies: ["물에 들어가고 싶어요", "구경만 할래요"] },
  { question: "누구와 얼마나 머무세요?", replies: ["친구랑 하루", "혼자 반나절"] },
  { question: "이동은 어떻게 하세요?", replies: ["차량", "대중교통"] },
];

interface CourseStop {
  time: string;
  name: string;
  icon: IconName;
  score: number | null;
  place: string;
  match: string | null;
  basis: string;
  basisChip: string;
}

const COURSE_STOPS: CourseStop[] = [
  {
    time: "09:20",
    name: "서핑 강습",
    icon: "surf",
    score: 82,
    place: "경포해변",
    match: "경포",
    basis: "파고 0.6m · 수온 22.1°C로 오늘 가장 좋은 조건입니다.",
    basisChip: "취향: 서핑",
  },
  {
    time: "12:00",
    name: "점심 · 회센터",
    icon: "restaurant",
    score: null,
    place: "안목 항구",
    match: "안목",
    basis: "식사 장소는 적합도를 계산하지 않습니다.",
    basisChip: "주변 카탈로그",
  },
  {
    time: "14:30",
    name: "갯벌 체험",
    icon: "mudflat",
    score: 64,
    place: "사천진 갯벌",
    match: "사천진",
    basis: "간조 12:34 이후 물이 빠져 접근이 쉬워집니다.",
    basisChip: "물때 기준",
  },
  {
    time: "18:40",
    name: "온천 마무리",
    icon: "hotspring",
    score: 70,
    place: "강릉 시내",
    match: null,
    basis: "일몰 19:02 이후 이동 부담이 적습니다.",
    basisChip: "취향: 온천",
  },
];

interface CourseDay {
  id: string;
  name: string;
  score: number | null;
}

const COURSE_DAYS: CourseDay[] = [
  { id: "d0", name: "오늘", score: 82 },
  { id: "d1", name: "내일", score: 74 },
  { id: "d2", name: "토", score: 58 },
  { id: "d3", name: "일", score: 34 },
  { id: "d4", name: "월", score: null },
];

const CHAT_BASIS_BARS: { name: string; value: string; ratio: number | null }[] = [
  { name: "파고", value: "0.6m", ratio: 0.3 },
  { name: "수온", value: "22.1°C", ratio: 0.72 },
  { name: "수질", value: "–", ratio: null },
];

// ── 공통 조각 ───────────────────────────────────────────────

function ExampleNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rc-note">
      <StateChip kind="example" /> {children}
    </p>
  );
}

// ── 1. 진입 ────────────────────────────────────────────────

function EntryStep({
  tags,
  toggleTag,
  onChat,
  onTags,
}: {
  tags: string[];
  toggleTag: (tag: string) => void;
  onChat: () => void;
  onTags: () => void;
}) {
  return (
    <>
      <header className="rc-hero">
        <div className="rc-sbar">
          <span>9:41</span>
          <span className="rc-sbar-mark">추천</span>
          <span>강릉</span>
        </div>
        <div className="rc-hero-inner">
          <p className="rc-lbl">{TODAY_LABEL} · 오늘 조건 반영</p>
          <h1 className="rc-hero-title">
            취향에 맞는 일정을
            <br />
            만들어 드릴까요?
          </h1>
        </div>
      </header>
      <div className="rc-body">
        <div className="rc-card">
          <div className="rc-card-top">
            <div className="rc-card-title">내 취향</div>
            <StateChip kind="uncollected" />
          </div>
          <div className="rc-tags">
            {["서핑", "온천", "카페"].map((tag) => (
              <button
                type="button"
                key={tag}
                className={"rc-tag" + (tags.includes(tag) ? " is-on" : "")}
                aria-pressed={tags.includes(tag)}
                onClick={() => toggleTag(tag)}
              >
                {tag}
                {tags.includes(tag) && <Icon name="check" size={11} />}
              </button>
            ))}
            <button type="button" className="rc-tag" onClick={onTags}>
              + 더 고르기
            </button>
          </div>
          <div className="rc-facts">
            <div className="rc-fact">
              <div className="rc-fact-name">동행</div>
              <div className="rc-fact-value">친구랑</div>
            </div>
            <div className="rc-fact">
              <div className="rc-fact-name">기간</div>
              <div className="rc-fact-value">하루</div>
            </div>
            <div className="rc-fact">
              <div className="rc-fact-name">이동</div>
              <div className="rc-fact-value">차량</div>
            </div>
          </div>
          <p className="rc-note">
            취향은 아직 저장되지 않습니다. 이 화면을 벗어나면 선택이
            사라집니다. 동행 · 기간 · 이동은 예시 값입니다.
          </p>
        </div>

        <div className="rc-card">
          <AiSuggestion
            headline="질문 3개 · 30초"
            basis={
              "오늘 경포해변 예보(점수 82 · 파고 0.6m · 수온 22.1°C, 예시 데이터)와 " +
              "저장된 활동 3종(수영 · 래프팅 · 휴식)만으로 후보를 고릅니다. " +
              "출처 · 기상청 · 국립해양조사원"
            }
          />
          <div className="rc-card-title" style={{ marginTop: 10 }}>
            일정 추천받기
          </div>
          <div className="rc-stack" style={{ marginTop: 12 }}>
            <button type="button" className="rc-primary" onClick={onChat}>
              대화로 추천받기 →
            </button>
            <button type="button" className="rc-secondary" onClick={onTags}>
              태그로 바로 받기
            </button>
          </div>
          <p className="rc-note">
            추천 엔진은 아직 구현되지 않았습니다. 아래 단계는 화면 흐름 확인용
            이며, 실제 예보로 계산한 결과가 아닙니다.
          </p>
        </div>
        <AppTabBar active="recommend" />
      </div>
    </>
  );
}

// ── 2. B1 취향 수집 (3단계) ────────────────────────────────

function TasteStep({
  tasteStep,
  setTasteStep,
  tags,
  toggleTag,
  cardIndex,
  liked,
  onLike,
  onPass,
  onDone,
  onBack,
}: {
  tasteStep: 1 | 2 | 3;
  setTasteStep: (step: 1 | 2 | 3) => void;
  tags: string[];
  toggleTag: (tag: string) => void;
  cardIndex: number;
  liked: string[];
  onLike: () => void;
  onPass: () => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const card = SWIPE_CARDS[Math.min(cardIndex, SWIPE_CARDS.length - 1)];
  const grade = gradeOf(card.score);

  return (
    <>
      <header className="rc-hero">
        <div className="rc-sbar">
          <span>9:41</span>
          <span className="rc-sbar-mark">MY TASTE</span>
          <span>STEP {tasteStep} / 3</span>
        </div>
        <div className="rc-hero-inner">
          <button type="button" className="rc-hero-back" onClick={onBack}>
            ← 추천 처음으로
          </button>
          <p className="rc-lbl" style={{ marginTop: 6 }}>
            STEP {tasteStep} ·{" "}
            {tasteStep === 1 ? "태그" : tasteStep === 2 ? "활동 카드" : "요약"}
          </p>
          <h1 className="rc-hero-title">
            {tasteStep === 1
              ? "뭘 하고 싶으세요?"
              : tasteStep === 2
                ? "이건 어떠세요?"
                : "이렇게 정리했어요"}
          </h1>
          <div className="rc-progress" aria-hidden="true">
            <span className={tasteStep >= 1 ? "is-on" : ""} />
            <span className={tasteStep >= 2 ? "is-on" : ""} />
            <span className={tasteStep >= 3 ? "is-on" : ""} />
          </div>
        </div>
      </header>

      <div className="rc-body">
        {tasteStep === 1 && (
          <>
            <div className="rc-card">
              {TAG_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="rc-lbl" style={{ marginTop: 14 }}>
                    {group.label}
                  </p>
                  <div className="rc-tags">
                    {group.tags.map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        className={"rc-tag" + (tags.includes(tag) ? " is-on" : "")}
                        aria-pressed={tags.includes(tag)}
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                        {tags.includes(tag) && <Icon name="check" size={11} />}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <ExampleNote>
                저장된 활동은 {COLLECTED_ACTIVITIES.join(" · ")} 3종입니다.
                서핑 · SUP · 갯벌 체험 · 온천 등 나머지 태그는 수집 항목이
                아니라 화면 구성을 위한 예시입니다.
              </ExampleNote>
            </div>
            <button
              type="button"
              className="rc-primary"
              onClick={() => setTasteStep(2)}
            >
              다음 · 카드로 확정하기
            </button>
          </>
        )}

        {tasteStep === 2 && (
          <>
            <div className="rc-card">
              <div className="rc-slot rc-photo-slot">
                활동 사진 영역
                <br />
                (에셋 미확보 · 별도 작업)
              </div>
              <div className="rc-swipe-head">
                <div className="rc-swipe-name">{card.name}</div>
                <GradeChip score={card.score} />
              </div>
              <div className="rc-stop-place">{card.place}</div>
              <p className="rc-note">
                오늘 적합도 {card.score === null ? "–" : card.score} ·{" "}
                {grade.label}
                {card.score === null &&
                  " — 이 활동은 저장된 적합도가 없습니다. 0점이 아닙니다."}
              </p>
              <div className="rc-swipe-actions">
                <button type="button" className="rc-secondary" onClick={onPass}>
                  패스
                </button>
                <button type="button" className="rc-primary" onClick={onLike}>
                  좋아요
                </button>
              </div>
              <p className="rc-note">
                {Math.min(cardIndex + 1, SWIPE_CARDS.length)} / {SWIPE_CARDS.length}
                번째 카드입니다. <StateChip kind="example" />
              </p>
            </div>
            <button
              type="button"
              className="rc-secondary"
              onClick={() => setTasteStep(1)}
            >
              다시 고르기
            </button>
          </>
        )}

        {tasteStep === 3 && (
          <>
            <div className="rc-card">
              <div className="rc-card-title">좋아요 한 활동</div>
              <div className="rc-liked-list">
                {liked.length === 0 ? (
                  <p className="rc-note" style={{ margin: 0 }}>
                    좋아요 한 활동이 없습니다. 선택 없이도 다음으로 갈 수
                    있지만, 취향 근거 없이는 추천 이유를 적을 수 없습니다.
                  </p>
                ) : (
                  liked.map((name) => (
                    <span className="rc-basis-chip" key={name}>
                      {name}
                    </span>
                  ))
                )}
              </div>
              <div className="rc-card-title" style={{ marginTop: 14 }}>
                고른 태그
              </div>
              <div className="rc-liked-list">
                {tags.length === 0 ? (
                  <p className="rc-note" style={{ margin: 0 }}>
                    고른 태그가 없습니다.
                  </p>
                ) : (
                  tags.map((tag) => (
                    <span className="rc-basis-chip" key={tag}>
                      {tag}
                    </span>
                  ))
                )}
              </div>
              <ExampleNote>
                이 요약은 저장되지 않습니다. 취향 저장 기능은 아직 구현되지
                않았습니다.
              </ExampleNote>
            </div>
            <div className="rc-stack">
              <button type="button" className="rc-primary" onClick={onDone}>
                이 취향으로 코스 보기 →
              </button>
              <button
                type="button"
                className="rc-secondary"
                onClick={() => setTasteStep(1)}
              >
                다시 고르기
              </button>
            </div>
          </>
        )}
        <AppTabBar active="recommend" />
      </div>
    </>
  );
}

// ── 3. B3 대화형 컨시어지 ──────────────────────────────────

function ChatStep({
  turn,
  answers,
  onReply,
  onReset,
  onDone,
  onBack,
}: {
  turn: number;
  answers: string[];
  onReply: (reply: string) => void;
  onReset: () => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const finished = turn >= CHAT_TURNS.length;
  return (
    <>
      <header className="rc-hero">
        <div className="rc-sbar">
          <span>9:41</span>
          <span className="rc-sbar-mark">CONCIERGE</span>
          <span>강릉</span>
        </div>
        <div className="rc-bot-head">
          <span className="rc-bot-avatar">
            <Icon name="sparkle" size={21} />
          </span>
          <div>
            <div className="rc-bot-name">퐁당 컨시어지</div>
            <div className="rc-bot-sub">
              질문 {Math.min(turn + 1, CHAT_TURNS.length)} / {CHAT_TURNS.length}
              {finished && " · 완료"}
            </div>
          </div>
        </div>
        <div className="rc-hero-inner">
          <button type="button" className="rc-hero-back" onClick={onBack}>
            ← 추천 처음으로
          </button>
        </div>
      </header>

      <div className="rc-body">
        <div className="rc-chat">
          {CHAT_TURNS.slice(0, Math.min(turn + 1, CHAT_TURNS.length)).map(
            (item, index) => (
              <div key={item.question}>
                <div className="rc-bubble-row">
                  <div className="rc-bubble">{item.question}</div>
                </div>
                {answers[index] && (
                  <div
                    className="rc-bubble-row is-user"
                    style={{ marginTop: 10 }}
                  >
                    <div className="rc-bubble is-user">{answers[index]}</div>
                  </div>
                )}
              </div>
            ),
          )}
        </div>

        {!finished ? (
          <div className="rc-replies">
            {CHAT_TURNS[turn].replies.map((reply) => (
              <button
                type="button"
                className="rc-reply"
                key={reply}
                onClick={() => onReply(reply)}
              >
                {reply}
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* 4번째 턴에서 근거 카드를 노출합니다. 추천 문장과 같은 카드
                안에 사용 지표 · 시각 · 출처가 함께 있어야 합니다. */}
            <div className="rc-card">
              <AiSuggestion
                headline="답변과 오늘 예보로 코스를 만들었어요"
                basis="09:00 발표 예보 · 출처 · 기상청 · 국립해양조사원"
              />
              {CHAT_BASIS_BARS.map((bar) => (
                <div className="rc-basis-row" key={bar.name}>
                  <span className="rc-basis-name">{bar.name}</span>
                  <span className="rc-basis-track">
                    {bar.ratio !== null && (
                      <span
                        className="rc-basis-fill"
                        style={{ width: `${bar.ratio * 100}%` }}
                      />
                    )}
                  </span>
                  <span
                    className={
                      "rc-basis-value" + (bar.ratio === null ? " is-empty" : "")
                    }
                  >
                    {bar.value}
                  </span>
                </div>
              ))}
              <p className="rc-note">
                막대는 각 지표 값의 상대 위치이며 점수 기여도가 아닙니다.
                수질은 저장된 값이 없어 막대를 그리지 않고 –로 둡니다.{" "}
                <StateChip kind="example" />
              </p>
            </div>
            <div className="rc-stack">
              <button type="button" className="rc-primary" onClick={onDone}>
                코스 보기 →
              </button>
              <button type="button" className="rc-secondary" onClick={onReset}>
                처음부터
              </button>
            </div>
          </>
        )}
        <AppTabBar active="recommend" />
      </div>
    </>
  );
}

// ── 4. B2 코스 결과 ────────────────────────────────────────

function CourseStep({
  dayIndex,
  setDayIndex,
  saved,
  onSave,
  altOpen,
  setAltOpen,
  onRealert,
  onBack,
  resolvePlace,
  statusText,
}: {
  dayIndex: number;
  setDayIndex: (index: number) => void;
  saved: boolean;
  onSave: () => void;
  altOpen: boolean;
  setAltOpen: (open: boolean) => void;
  onRealert: () => void;
  onBack: () => void;
  resolvePlace: (match: string | null, fallback: string) => string;
  statusText: string;
}) {
  const day = COURSE_DAYS[dayIndex];
  const hasForecast = day.score !== null;

  return (
    <>
      <header className="rc-hero">
        <div className="rc-sbar">
          <span>9:41</span>
          <span className="rc-sbar-mark">MY COURSE</span>
          <span>강릉</span>
        </div>
        <div className="rc-hero-inner">
          <button type="button" className="rc-hero-back" onClick={onBack}>
            ← 추천 처음으로
          </button>
          <div className="rc-hero-row" style={{ marginTop: 6 }}>
            <div>
              <p className="rc-lbl">{day.name} · 9월</p>
              <h1 className="rc-hero-title">오늘의 물 코스</h1>
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div className="rc-num rc-hero-score-num">
                {day.score === null ? "–" : day.score}
              </div>
              <GradeChip score={day.score} glass bare />
            </div>
          </div>
          <div className="rc-days" role="group" aria-label="날짜 선택">
            {COURSE_DAYS.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={"rc-day" + (index === dayIndex ? " is-selected" : "")}
                aria-pressed={index === dayIndex}
                aria-label={`${item.name} · ${
                  item.score === null
                    ? "평가값 없음"
                    : `${item.score}점 ${gradeOf(item.score).label}`
                }`}
                onClick={() => setDayIndex(index)}
              >
                <div className="rc-day-score">
                  {item.score === null ? "–" : item.score}
                </div>
                <div className="rc-day-name">{item.name}</div>
              </button>
            ))}
          </div>
          <p className="rc-hero-note">
            날짜별 점수는 경포해변 예보 기준이며 예시 데이터입니다. 값이 없는
            날은 –이며 0점이 아닙니다.
          </p>
        </div>
      </header>

      <div className="rc-body">
        {!hasForecast ? (
          /* 예보가 없는 날에는 코스를 만들지 않습니다. 없는 근거로 일정을
             지어내지 않고 빈 상태만 보여주며, 공유 · 저장 · 대안 행은
             숨깁니다. */
          <>
            <div className="rc-card rc-empty">
              <span className="rc-empty-icon">
                <GradeIcon gradeKey="unscored" size={28} />
              </span>
              <div className="rc-empty-title">저장된 예보가 없습니다</div>
              <p className="rc-note">
                <StateChip kind="no_data" /> 이 날짜는 저장된 예보가 없어 코스를
                만들지 않았습니다. 값이 없는 것은 0점 · 정상 · 안전이 아닙니다.
              </p>
              <button
                type="button"
                className="rc-secondary"
                style={{ marginTop: 14 }}
                onClick={() => setDayIndex(0)}
              >
                예보가 있는 날 보기 →
              </button>
            </div>
            <AppTabBar active="recommend" />
          </>
        ) : (
          <>
            <p className="rc-lede">
              취향 2개(서핑 · 온천)와 {day.name} 예보로 만든 코스입니다.
            </p>

            <div className="rc-card rc-timeline">
              {COURSE_STOPS.map((stop) => {
                const grade = gradeOf(stop.score);
                return (
                  <div className="rc-stop" key={stop.time}>
                    <div className="rc-stop-time">{stop.time}</div>
                    <div className="rc-stop-rail">
                      <span
                        className="rc-stop-dot"
                        style={{ background: grade.color }}
                      />
                    </div>
                    <div className="rc-stop-body">
                      <div className="rc-stop-head">
                        <span className="rc-stop-badge">
                          <Icon name={stop.icon} size={15} />
                        </span>
                        <span className="rc-stop-name">{stop.name}</span>
                        <GradeChip score={stop.score} />
                      </div>
                      <div className="rc-stop-place">
                        {resolvePlace(stop.match, stop.place)}
                      </div>
                      <div className="rc-stop-basis">{stop.basis}</div>
                      <div className="rc-stop-chips">
                        <span className="rc-basis-chip">{stop.basisChip}</span>
                        <StateChip kind="example" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rc-card">
              <div className="rc-card-title">조건이 바뀌면 어떻게 하나요?</div>
              <p className="rc-note">
                파고 · 수온이 기준을 넘으면 해당 일정만 대안으로 바꿔 제안합니다.
                취향과 다른 활동을 제안할 때는 같은 카드에 이유를 함께 적습니다.
              </p>
              {altOpen && (
                <p className="rc-note">
                  예: 「취향은 수영이지만 오늘 파고 0.6m로 서핑 강습이 더 맞아 첫
                  일정만 바꿨습니다.」 조건 변화 알림은 아직 발송되지 않으며,
                  아래 버튼으로 화면만 확인할 수 있습니다.
                </p>
              )}
              <div className="rc-stack" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="rc-secondary"
                  onClick={() => setAltOpen(!altOpen)}
                  aria-expanded={altOpen}
                >
                  {altOpen ? "대안 규칙 닫기" : "대안 규칙 보기 →"}
                </button>
                <button
                  type="button"
                  className="rc-secondary"
                  onClick={onRealert}
                >
                  조건 변화 알림 미리보기 →
                </button>
              </div>
            </div>

            <div className="rc-actions">
              <button type="button" className="rc-secondary" disabled>
                <Icon name="share" size={16} />
                공유
              </button>
              <button
                type="button"
                className={"rc-primary" + (saved ? " is-done" : "")}
                onClick={onSave}
                disabled={saved}
              >
                <Icon name="save" size={16} />
                {saved ? "저장됨" : "내 코스에 저장"}
              </button>
            </div>
            <p className="rc-note" style={{ marginTop: 0 }}>
              <StateChip kind="uncollected" /> 공유와 코스 저장은 아직 구현되지
              않았습니다. 「저장됨」은 이 화면 안에서만 유지되며 서버에
              기록되지 않습니다. 지점명은 장소 카탈로그에서 읽어옵니다 —{" "}
              {statusText}
            </p>
            <AppTabBar active="recommend" />
          </>
        )}
      </div>
    </>
  );
}

// ── 5. B4 조건 변화 재추천 ────────────────────────────────

function RealertStep({
  swapped,
  setSwapped,
  onBack,
}: {
  swapped: boolean;
  setSwapped: (value: boolean) => void;
  onBack: () => void;
}) {
  return (
    <>
      <header className="rc-hero">
        <div className="rc-sbar">
          <span>9:41</span>
          <span className="rc-sbar-mark">UPDATE</span>
          <span>강릉</span>
        </div>
        <div className="rc-hero-inner">
          <button type="button" className="rc-hero-back" onClick={onBack}>
            ← 코스로 돌아가기
          </button>
          <p className="rc-lbl" style={{ marginTop: 6 }}>
            조건 변화 · 10분 전
          </p>
          <h1 className="rc-hero-title">
            {swapped ? (
              <>
                대안으로
                <br />
                바꿨어요
              </>
            ) : (
              <>
                파도가 올라가
                <br />
                서핑 조건이 낮아졌어요
              </>
            )}
          </h1>
          <div className="rc-change">
            <span className="rc-change-metric">
              파고 0.6m → <b>1.2m</b>
            </span>
            <span className="rc-change-scores">
              <span className="rc-change-from">82</span>
              <span aria-hidden="true">→</span>
              <span className="rc-num rc-change-to">46</span>
              <GradeChip score={46} glass bare />
            </span>
          </div>
          <p className="rc-hero-note">
            점수 변화는 예시입니다. 조건 변화 감시와 알림 발송은 아직 구현되지
            않았습니다.
          </p>
        </div>
      </header>

      <div className="rc-body">
        <div className="rc-card rc-alert">
          <div className="rc-alert-head">
            <Icon name="warning" size={15} />
            <span>바뀌는 일정 1개</span>
          </div>
          <div className="rc-swap">
            <div className={"rc-swap-col" + (swapped ? " is-cancelled" : "")}>
              <div className="rc-swap-when">09:20 기존</div>
              <div className="rc-swap-what">서핑 · 경포해변</div>
              <GradeChip score={swapped ? 46 : 82} />
            </div>
            <span aria-hidden="true">→</span>
            <div className="rc-swap-col">
              <div className="rc-swap-when">09:40 대안</div>
              <div className="rc-swap-what">SUP · 안목해변</div>
              <GradeChip score={74} />
            </div>
          </div>
          <p className="rc-note">
            근거 · 파고 1.2m는 서핑 강습 기준(1.0m)을 넘고, 안목해변은 같은 시각
            파고 0.7m로 SUP 기준 안에 있습니다. 09:00 발표 예보 · 출처 · 기상청
            · 국립해양조사원. <StateChip kind="example" />
          </p>
          <div className="rc-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="rc-secondary"
              onClick={() => setSwapped(false)}
              disabled={!swapped}
            >
              {swapped ? "되돌리기" : "그대로 두기"}
            </button>
            <button
              type="button"
              className={"rc-primary" + (swapped ? " is-done" : "")}
              onClick={() => setSwapped(true)}
              disabled={swapped}
            >
              {swapped ? "바꿨습니다" : "대안으로 바꾸기"}
            </button>
          </div>
        </div>
        <AppTabBar active="recommend" />
      </div>
    </>
  );
}

// ── 화면 ───────────────────────────────────────────────────

function RecommendScreen() {
  const [step, setStep] = useState<Step>("entry");
  const [tags, setTags] = useState<string[]>(["서핑", "온천"]);
  const [tasteStep, setTasteStep] = useState<1 | 2 | 3>(1);
  const [cardIndex, setCardIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const [turn, setTurn] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [dayIndex, setDayIndex] = useState(0);
  const [altOpen, setAltOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [swapped, setSwapped] = useState(false);

  const spots = useGangneungSpots("RecommendPage");
  const resolvePlace = (match: string | null, fallback: string) =>
    match === null ? fallback : spots.resolve(match, fallback).name;

  const toggleTag = (tag: string) =>
    setTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );

  const advanceCard = (like: boolean) => {
    const card = SWIPE_CARDS[cardIndex];
    if (like) setLiked((current) => [...current, card.name]);
    if (cardIndex + 1 >= SWIPE_CARDS.length) setTasteStep(3);
    else setCardIndex(cardIndex + 1);
  };

  const resetChat = () => {
    setTurn(0);
    setAnswers([]);
  };

  const goEntry = () => {
    setStep("entry");
    setTasteStep(1);
    setCardIndex(0);
    setLiked([]);
    resetChat();
  };

  return (
    <article className="recommend-page">
      <div className="rc-frame">
        {step === "entry" && (
          <EntryStep
            tags={tags}
            toggleTag={toggleTag}
            onChat={() => setStep("chat")}
            onTags={() => {
              setTasteStep(1);
              setStep("taste");
            }}
          />
        )}
        {step === "taste" && (
          <TasteStep
            tasteStep={tasteStep}
            setTasteStep={setTasteStep}
            tags={tags}
            toggleTag={toggleTag}
            cardIndex={cardIndex}
            liked={liked}
            onLike={() => advanceCard(true)}
            onPass={() => advanceCard(false)}
            onDone={() => setStep("course")}
            onBack={goEntry}
          />
        )}
        {step === "chat" && (
          <ChatStep
            turn={turn}
            answers={answers}
            onReply={(reply) => {
              setAnswers((current) => [...current, reply]);
              setTurn((current) => current + 1);
            }}
            onReset={resetChat}
            onDone={() => setStep("course")}
            onBack={goEntry}
          />
        )}
        {step === "course" && (
          <CourseStep
            dayIndex={dayIndex}
            setDayIndex={setDayIndex}
            saved={saved}
            onSave={() => setSaved(true)}
            altOpen={altOpen}
            setAltOpen={setAltOpen}
            onRealert={() => setStep("realert")}
            onBack={goEntry}
            resolvePlace={resolvePlace}
            statusText={spots.statusText}
          />
        )}
        {step === "realert" && (
          <RealertStep
            swapped={swapped}
            setSwapped={setSwapped}
            onBack={() => setStep("course")}
          />
        )}
      </div>
    </article>
  );
}

export function RecommendPage() {
  // 이 화면은 실제 수집 데이터만 읽습니다. 상단 「데이터 구분」이 더미로
  // 선택돼 있어도 `/api/data` 로 고정합니다(`/api/demo` 는 은퇴해 404).
  return (
    <DataOrigin.Provider value="data">
      <RecommendScreen />
    </DataOrigin.Provider>
  );
}
