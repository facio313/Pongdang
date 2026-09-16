import { useEffect, useState } from "react";
import { DataOrigin } from "./DataOrigin";
import { RecommendDesktop } from "./RecommendDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { gradeOf } from "./groupAGrade";
import {
  AiSuggestion,
  GradeChip,
  GradeIcon,
  Icon,
  StateChip,
  type IconName,
} from "./pongdangUi";
import { AppHeader, AppShell } from "./AppShell";
import { useResource } from "./useResource";
import { useAction } from "./useAction";
import { useConditionDays } from "./useConditionDays";
import { ConditionScoreDetails } from "./ConditionScoreDetails";
import type { Activity } from "./aiApi";
import {
  calendarDays,
  conditionPath,
  conditionScore,
  conditionScoreText,
  conditionTargetInRange,
  dateLabel,
  kstDate,
  metricText,
  timeLabel,
  type Conditions,
} from "./productData";
import {
  planItems,
  placeRoleLabel,
  unknownConditionsText,
  recommendationPlan,
  selectedActivities,
  travelJson,
  type PlanInput,
  type Preference,
  type RecommendationResult,
  type TravelRequest,
  type TripPlan,
} from "./travelApi";
import { setTravelSession, useTravelSession } from "./travelSession";
import "./recommendPage.css";

type Step = "entry" | "taste" | "chat" | "course" | "realert";

const TODAY_LABEL = dateLabel();

interface KeywordCatalogue {
  categories: {
    id: string;
    label: string;
    options: { id: string; label: string }[];
  }[];
}
const TAG_GROUPS = [
  { label: "물놀이", tags: ["서핑", "수영", "SUP", "갯벌 체험", "래프팅"] },
  { label: "쉬기 · 구경", tags: ["온천", "카페", "일몰 보기", "캠핑"] },
  {
    label: "조건",
    tags: ["파도 적은 곳", "주차 편한 곳", "샤워장", "반려동물"],
  },
];
const SWIPE_CARDS: {
  id: string;
  name: string;
  icon: IconName;
  score: number | null;
  place: string;
}[] = [
  {
    id: "surf",
    name: "서핑 강습",
    icon: "surf",
    score: null,
    place: "활동 취향 선택",
  },
  {
    id: "sup",
    name: "SUP 체험",
    icon: "sup",
    score: null,
    place: "활동 취향 선택",
  },
  {
    id: "mudflat",
    name: "갯벌 체험",
    icon: "mudflat",
    score: null,
    place: "활동 취향 선택",
  },
  {
    id: "hotspring",
    name: "온천 마무리",
    icon: "hotspring",
    score: null,
    place: "활동 취향 선택",
  },
  {
    id: "cafe",
    name: "바다 뷰 카페",
    icon: "cafe",
    score: null,
    place: "활동 취향 선택",
  },
  {
    id: "sunset",
    name: "일몰 보기",
    icon: "sunset",
    score: null,
    place: "활동 취향 선택",
  },
];
const CHAT_TURNS: { question: string; replies: string[] }[] = [
  {
    question: "오늘 강릉에서 뭘 하고 싶으세요?",
    replies: ["물에 들어가고 싶어요", "구경만 할래요"],
  },
  {
    question: "누구와 얼마나 머무세요?",
    replies: ["친구랑 하루", "혼자 반나절"],
  },
  { question: "이동은 어떻게 하세요?", replies: ["차량", "대중교통"] },
];

// ── 공통 조각 ───────────────────────────────────────────────

function ExampleNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="pd-note">
      <StateChip kind="partial" /> {children}
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
    <AppShell
      tab="recommend"
      hero={
        <header className="pd-hero rc-hero">
        <AppHeader
          title="강릉"
          time={timeLabel(new Date().toISOString())}
          onCobalt
        />
        <div className="rc-hero-inner">
          <p className="pd-lbl">{TODAY_LABEL} · 오늘 조건 반영</p>
          <h1 className="rc-hero-title">
            취향에 맞는 일정을
            <br />
            만들어 드릴까요?
          </h1>
        </div>
        </header>
      }
    >
        <div className="pd-card">
          <div className="rc-card-top">
            <div className="pd-card-title">내 취향</div>
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
              <div className="rc-fact-value">선택 전</div>
            </div>
            <div className="rc-fact">
              <div className="rc-fact-name">기간</div>
              <div className="rc-fact-value">날짜 선택</div>
            </div>
            <div className="rc-fact">
              <div className="rc-fact-name">이동</div>
              <div className="rc-fact-value">자동차 기본</div>
            </div>
          </div>
          <p className="pd-note">
            선택한 태그는 이번 추천에 반영합니다. 취향 확정 버튼으로 저장하며,
            동행과 이동은 대화 답변으로 변경할 수 있습니다.
          </p>
        </div>

        <div className="pd-card">
          <AiSuggestion
            headline="질문 3개 · 30초"
            basis={
              "실제 장소 카탈로그와 선택한 취향·날짜를 비교하고 확인되지 않은 환경 조건을 함께 표시합니다."
            }
          />
          <div className="pd-card-title rc-sub-title">
            일정 추천받기
          </div>
          <div className="rc-stack">
            <button type="button" className="rc-primary" onClick={onChat}>
              대화로 추천받기 →
            </button>
            <button type="button" className="rc-secondary" onClick={onTags}>
              태그로 바로 받기
            </button>
          </div>
          <p className="pd-note">
            추천은 장소·활동 후보를 먼저 제시합니다. 이동 경로는 지도에서
            출발지를 고른 뒤 별도로 요청합니다.
          </p>
        </div>
    </AppShell>
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
  const catalogue = useResource<KeywordCatalogue>("travel/keywords");
  const waveLabel = catalogue.data?.categories
    .find((category) => category.id === "weather")
    ?.options.find((option) => option.id === "small_waves")?.label;
  const card = SWIPE_CARDS[Math.min(cardIndex, SWIPE_CARDS.length - 1)];
  const grade = gradeOf(card.score);

  return (
    <AppShell
      tab="recommend"
      hero={
        <header className="pd-hero rc-hero">
        <AppHeader
          title={`STEP ${tasteStep} / 3`}
          time={timeLabel(new Date().toISOString())}
          onCobalt
        />
        <div className="rc-hero-inner">
          <button type="button" className="rc-hero-back" onClick={onBack}>
            ← 추천 처음으로
          </button>
          <p className="pd-lbl rc-hero-lbl">
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
      }
    >
        {tasteStep === 1 && (
          <>
            <div className="pd-card">
              {TAG_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="pd-lbl rc-group-lbl">
                    {group.label}
                  </p>
                  <div className="rc-tags">
                    {group.tags.map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        className={
                          "rc-tag" + (tags.includes(tag) ? " is-on" : "")
                        }
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
                {catalogue.error ??
                  "태그는 여행 취향입니다. SUP·편의시설 등의 실제 지원은 별도 확인이 필요합니다."}{" "}
                파도 적은 곳: {waveLabel ?? "범위 조회 중"}. 이 범위는 안전
                기준이 아닙니다.
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
            <div className="pd-card">
              <div className="pd-slot rc-photo-slot">
                활동 사진 영역
                <br />
                (에셋 미확보 · 별도 작업)
              </div>
              <div className="rc-swipe-head">
                <div className="rc-swipe-name">{card.name}</div>
                <GradeChip score={card.score} />
              </div>
              <div className="rc-stop-place">{card.place}</div>
              <p className="pd-note">
                장소 선택 전 점수 {card.score === null ? "–" : card.score} ·{" "}
                {grade.label}
                {card.score === null &&
                  " — 실제 장소와 날짜를 고르면 조건 점수를 조회합니다."}
              </p>
              <div className="rc-swipe-actions">
                <button type="button" className="rc-secondary" onClick={onPass}>
                  패스
                </button>
                <button type="button" className="rc-primary" onClick={onLike}>
                  좋아요
                </button>
              </div>
              <p className="pd-note">
                {Math.min(cardIndex + 1, SWIPE_CARDS.length)} /{" "}
                {SWIPE_CARDS.length}
                번째 카드입니다. <StateChip kind="partial" />
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
            <div className="pd-card">
              <div className="pd-card-title">좋아요 한 활동</div>
              <div className="rc-liked-list">
                {liked.length === 0 ? (
                  <p className="pd-note rc-note-flush">
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
              <div className="pd-card-title rc-group-title">
                고른 태그
              </div>
              <div className="rc-liked-list">
                {tags.length === 0 ? (
                  <p className="pd-note rc-note-flush">
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
                선택한 태그와 좋아요를 합쳐 취향에 저장하고 실제 장소를
                추천받습니다. 파도 적은 곳: {waveLabel ?? "범위 조회 중"}.
              </ExampleNote>
            </div>
            <div className="rc-stack">
              <button type="button" className="rc-primary" onClick={onDone}>
                취향 저장하고 코스 보기 →
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
    </AppShell>
  );
}

// ── 3. B3 대화형 컨시어지 ──────────────────────────────────

function ChatStep({
  turn,
  answers,
  answer,
  onReply,
  onReset,
  onDone,
  onBack,
}: {
  turn: number;
  answer: string;
  answers: string[];
  onReply: (reply: string) => void;
  onReset: () => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const finished = turn >= CHAT_TURNS.length;
  const session = useTravelSession();
  const conditions = useResource<Conditions>(
    conditionPath(
      session.recommendation?.recommendations[0]?.spot_id,
      session.recommendation?.request.activity ?? "relax",
      session.recommendation?.request.dates[0]
        ? session.recommendation.request.dates[0] + "T12:00:00+09:00"
        : undefined,
    ),
  );
  const bars = [
    { name: "파고", value: metricText(conditions.data, "wave_height") },
    { name: "수온", value: metricText(conditions.data, "water_temperature") },
    { name: "수질", value: "–" },
  ];
  return (
    <AppShell
      tab="recommend"
      hero={
        <header className="pd-hero rc-hero">
        <AppHeader
          title="강릉"
          time={timeLabel(new Date().toISOString())}
          onCobalt
        />
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
      }
    >
        <div className="rc-chat">
          {CHAT_TURNS.slice(0, Math.min(turn + 1, CHAT_TURNS.length)).map(
            (item, index) => (
              <div key={item.question}>
                <div className="rc-bubble-row">
                  <div className="rc-bubble">{item.question}</div>
                </div>
                {answers[index] && (
                  <div className="rc-bubble-row is-user">
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
            <div className="pd-card">
              <AiSuggestion
                headline="답변을 반영한 추천"
                basis={
                  answer ||
                  "답변으로 실제 장소와 활동을 조회합니다. 환경 근거가 없으면 미확인으로 표시합니다."
                }
              />
              {bars.map((bar) => (
                <div className="rc-basis-row" key={bar.name}>
                  <span className="rc-basis-name">{bar.name}</span>
                  <span className="rc-basis-track" />
                  <span
                    className={
                      "rc-basis-value" + (bar.value === "–" ? " is-empty" : "")
                    }
                  >
                    {bar.value}
                  </span>
                </div>
              ))}
              <p className="pd-note">
                첫 후보의 선택 날짜 정오 예보입니다. {conditions.error} 추천
                순서는 취향 일치 기준이며 안전 점수가 아닙니다.
              </p>
              <ConditionScoreDetails data={conditions.data} className="pd-note" />
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
    </AppShell>
  );
}

// ── 4. B2 코스 결과 ────────────────────────────────────────

interface CourseStopData {
  spotId: number;
  at: string;
  time: string;
  name: string;
  icon: IconName;
  place: string;
  basis: string;
  basisChip: string;
}

function CourseStop({ stop, activity }: { stop: CourseStopData; activity: Activity }) {
  const targetValid = conditionTargetInRange(stop.at);
  const conditions = useResource<Conditions>(targetValid ? conditionPath(stop.spotId, activity, stop.at) : null);
  const score = conditionScore(conditions.data);
  const grade = gradeOf(score);
  return (
    <div className="rc-stop">
      <div className="rc-stop-time">{stop.time}</div>
      <div className="rc-stop-rail">
        <span className="rc-stop-dot" style={{ background: grade.color }} />
      </div>
      <div className="rc-stop-body">
        <div className="rc-stop-head">
          <span className="rc-stop-badge"><Icon name={stop.icon} size={15} /></span>
          <span className="rc-stop-name">{stop.name}</span>
          <GradeChip score={score} />
        </div>
        <div className="rc-stop-place">{stop.place}</div>
        <div className="rc-stop-basis">{stop.basis}</div>
        <div className="rc-stop-chips">
          <span className="rc-basis-chip">{stop.basisChip}</span>
          <StateChip kind={conditions.data?.condition_score?.status === "evaluated" ? "live" : "partial"} />
        </div>
        <p className="pd-note">{dateLabel(stop.at)} {timeLabel(stop.at)} KST 예보 · {targetValid ? conditions.error : "저장 날짜가 조회 범위(현재 기준 앞뒤 31일)를 벗어났습니다."}</p>
        <ConditionScoreDetails data={conditions.data} className="pd-note" />
      </div>
    </div>
  );
}

function CourseStep({
  dayIndex,
  setDayIndex,
  saved,
  onSave,
  altOpen,
  setAltOpen,
  onRealert,
  onBack,
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
  statusText: string;
}) {
  const session = useTravelSession();
  const [now] = useState(() => new Date().toISOString());
  const firstItem = planItems(session.plan)[0];
  const firstId = firstItem?.spot_id ?? session.recommendation?.recommendations[0]?.spot_id;
  const activity = session.plan?.request.activity ?? session.recommendation?.request.activity ?? "relax";
  const days = useConditionDays(firstId, now, activity, 5).map((day) => ({
    ...day,
    name: day.weekday,
  }));
  const day = days[dayIndex];
  const selectedAt = (session.plan?.days[0]?.date ?? session.plan?.request.dates[0] ?? session.recommendation?.request.dates[0] ?? day.id) + "T12:00:00+09:00";
  const firstAt = firstItem?.arrival_at ?? selectedAt;
  const firstConditions = useResource<Conditions>(conditionTargetInRange(firstAt) ? conditionPath(firstId, activity, firstAt) : null);
  const firstScore = conditionScore(firstConditions.data);
  const stops = session.plan
    ? session.plan.days.flatMap((savedDay) => savedDay.items.map((item) => ({
        spotId: item.spot_id,
        at: item.arrival_at ?? savedDay.date + "T12:00:00+09:00",
        time: timeLabel(item.arrival_at),
        name: item.name,
        icon: "pin" as IconName,
        place: placeRoleLabel(item.role),
        basis: unknownConditionsText(item.unknown_conditions) || "선택한 실제 장소",
        basisChip: "저장 일정",
      })))
    : (session.recommendation?.recommendations ?? []).map((item) => ({
        spotId: item.spot_id,
        at: selectedAt,
        time: `후보 ${item.rank}`,
        name: item.name,
        icon: "pin" as IconName,
        place: `${item.region ?? "지역 미확인"} · ${item.activities.map((activity) => activity.label).join(" · ") || "활동 미확인"}`,
        basis: `${item.reason} 미확인: ${unknownConditionsText(item.unknown_conditions) || "없음"}`,
        basisChip:
          item.matched_preferences.map((p) => p.tag).join(" · ") ||
          "카탈로그 후보",
      }));
  const hasForecast = stops.length > 0;

  return (
    <AppShell
      tab="recommend"
      hero={
        <header className="pd-hero rc-hero">
        <AppHeader
          title="강릉"
          time={timeLabel(new Date().toISOString())}
          onCobalt
        />
        <div className="rc-hero-inner">
          <button type="button" className="rc-hero-back" onClick={onBack}>
            ← 추천 처음으로
          </button>
          <div className="rc-hero-row">
            <div>
              <p className="pd-lbl">
                {session.plan?.request.dates.join(" · ") ?? day.dateLabel}
              </p>
              <h1 className="rc-hero-title">선택한 물 코스</h1>
            </div>
            <div className="rc-hero-score">
              <div className="pd-num rc-hero-score-num">
                {firstScore ?? "–"}
              </div>
              <GradeChip score={firstScore} glass bare />
            </div>
          </div>
          <div className="rc-days" role="group" aria-label="날짜 선택">
            {days.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={
                  "rc-day" + (index === dayIndex ? " is-selected" : "")
                }
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
            상단과 날짜별 점수는 첫 장소 {stops[0]?.name ?? "선택 전"}의 활동 조건 참고값입니다.
            날짜별 막대는 정오 예보이며, 장소별 점수는 각 일정 시각을 사용합니다.
            날짜를 바꾸면 해당 날짜의 장소·활동 후보를 새로 조회합니다.{" "}
            {conditionScoreText(firstConditions.data)} {firstConditions.error}
          </p>
        </div>
        </header>
      }
    >
        {!hasForecast ? (
          /* 예보가 없는 날에는 코스를 만들지 않습니다. 없는 근거로 일정을
             지어내지 않고 빈 상태만 보여주며, 공유 · 저장 · 대안 행은
             숨깁니다. */
          <>
            <div className="pd-card rc-empty">
              <span className="rc-empty-icon">
                <GradeIcon gradeKey="unscored" size={28} />
              </span>
              <div className="rc-empty-title">추천 장소가 없습니다</div>
              <p className="pd-note">
                <StateChip kind="no_data" />{" "}
                {statusText ||
                  "선택한 조건에 맞는 후보가 없습니다. 취향이나 날짜를 바꿔 다시 조회해 주세요."}
              </p>
              <button
                type="button"
                className="rc-secondary rc-empty-cta"
                onClick={() => setDayIndex(0)}
              >
                오늘 다시 조회 →
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="rc-lede">
              {(
                session.plan?.request.preferred_tags ??
                session.recommendation?.request.preferred_tags ??
                []
              ).join(" · ") || "선택 취향 없음"}{" "}
              · {stops.length}곳. 조회{" "}
              {timeLabel(
                session.plan?.queried_at ?? session.recommendation?.queried_at,
              )}{" "}
              KST. 환경 미확인 조건은 각 후보에서 확인하세요.
            </p>

            <div className="pd-card rc-timeline">
              {stops.map((stop, index) => <CourseStop key={`${stop.spotId}:${stop.at}:${index}`} stop={stop} activity={activity} />)}
            </div>

            <div className="pd-card">
              <div className="pd-card-title">조건이 바뀌면 어떻게 하나요?</div>
              <p className="pd-note">
                다시 조회할 때 최신 환경 근거와 같은 취향을 비교합니다. 장소
                추천은 안전 판정이 아니며, 새 후보는 확인 후 적용합니다.
              </p>
              {altOpen && (
                <p className="pd-note">
                  새 후보를 조회해도 기존 저장 코스는 유지됩니다. 대안 적용 시
                  서버가 최신 제한과 일정 충돌을 다시 확인합니다.
                </p>
              )}
              <div className="rc-stack">
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
                  최신 조건으로 대안 조회 →
                </button>
              </div>
            </div>

            <div className="rc-actions">
              <a
                className="rc-secondary"
                href={`#map?view=course${session.plan?.plan_id ? `&plan_id=${session.plan.plan_id}` : ""}`}
              >
                <Icon name="course" size={16} />
                지도에서 보기
              </a>
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
            <p className="pd-note rc-note-flush-top">
              <StateChip kind="live" /> {statusText} 장소 후보 순서는 이동
              경로가 아닙니다. 실제 경로는 지도에서 요청하세요.
            </p>
          </>
        )}
    </AppShell>
  );
}

// ── 5. B4 조건 변화 재추천 ────────────────────────────────

function RealertStep({
  proposal,
  onApply,
  onBack,
}: {
  proposal: RecommendationResult | null;
  onApply: () => void;
  onBack: () => void;
}) {
  const session = useTravelSession();
  const previousItem = planItems(session.plan)[0];
  const previousRequest = session.plan?.request ?? session.recommendation?.request;
  const previousConditions = useResource<Conditions>(conditionPath(
    previousItem?.spot_id ?? session.recommendation?.recommendations[0]?.spot_id,
    previousRequest?.activity ?? "relax",
    previousItem?.arrival_at ?? (previousRequest?.dates[0] ? previousRequest.dates[0] + "T12:00:00+09:00" : undefined),
  ));
  const nextConditions = useResource<Conditions>(conditionPath(
    proposal?.recommendations[0]?.spot_id, proposal?.request.activity ?? "relax",
    proposal?.request.dates[0] ? proposal.request.dates[0] + "T12:00:00+09:00" : undefined,
  ));
  const previousScore = conditionScore(previousConditions.data);
  const nextScore = conditionScore(nextConditions.data);
  const previous =
    planItems(session.plan)
      .map((item) => item.name)
      .join(" · ") ||
    session.recommendation?.recommendations
      .map((item) => item.name)
      .join(" · ") ||
    "기존 후보 없음";
  return (
    <AppShell
      tab="recommend"
      hero={
        <header className="pd-hero rc-hero">
        <AppHeader
          title="강릉"
          time={timeLabel(new Date().toISOString())}
          onCobalt
        />
        <div className="rc-hero-inner">
          <button type="button" className="rc-hero-back" onClick={onBack}>
            ← 코스로 돌아가기
          </button>
          <p className="pd-lbl rc-hero-lbl">
            최신 조건 조회 · {timeLabel(proposal?.queried_at)}
          </p>
          <h1 className="rc-hero-title">
            새 후보를
            <br />
            확인하세요
          </h1>
          <div className="rc-change">
            <span className="rc-change-metric">
              {proposal?.status ?? "조회 중"}
            </span>
            <span className="rc-change-scores">
              <span className="rc-change-from">{previousScore ?? "–"}</span>
              <span aria-hidden="true">→</span>
              <span className="pd-num rc-change-to">{nextScore ?? "–"}</span>
              <GradeChip score={nextScore} glass bare />
            </span>
          </div>
          <p className="rc-hero-note">
            각 코스 첫 장소의 활동 조건 참고값입니다. 직접 요청한 최신 추천이며,
            확보한 분야가 다르면 점수를 직접 비교할 수 없습니다.
          </p>
        </div>
        </header>
      }
    >
        <div className="pd-card rc-alert">
          <div className="rc-alert-head">
            <Icon name="warning" size={15} />
            <span>일정 대안 확인</span>
          </div>
          <div className="rc-swap">
            <div className="rc-swap-col">
              <div className="rc-swap-when">기존</div>
              <div className="rc-swap-what">{previous}</div>
              <GradeChip score={previousScore} />
              <p className="pd-note">{conditionScoreText(previousConditions.data)} {previousConditions.error}</p>
            </div>
            <span aria-hidden="true">→</span>
            <div className="rc-swap-col">
              <div className="rc-swap-when">대안</div>
              <div className="rc-swap-what">
                {proposal?.recommendations
                  .map((item) => item.name)
                  .join(" · ") || "새 후보 없음"}
              </div>
              <GradeChip score={nextScore} />
              <p className="pd-note">{conditionScoreText(nextConditions.data)} {nextConditions.error}</p>
            </div>
          </div>
          <p className="pd-note">
            {proposal?.recommendations.map((item) => item.reason).join(" ") ||
              proposal?.clarification}
          </p>
          <div className="rc-actions">
            <button type="button" className="rc-secondary" onClick={onBack}>
              그대로 두기
            </button>
            <button
              type="button"
              className="rc-primary"
              onClick={onApply}
              disabled={!proposal?.recommendations.length}
            >
              대안으로 바꾸기
            </button>
          </div>
        </div>
    </AppShell>
  );
}

// ── 화면 ───────────────────────────────────────────────────

function RecommendScreen() {
  const session = useTravelSession();
  const [step, setStep] = useState<Step>(() =>
    session.plan ||
    new URLSearchParams(window.location.hash.split("?")[1]).has("plan_id")
      ? "course"
      : "entry",
  );
  const [tags, setTags] = useState<string[] | null>(null);
  const profile = useResource<{ preference: Preference; revision: number }>(
    "travel/preferences",
  );
  const selectedTags = tags ?? profile.data?.preference.tags ?? [];
  const keywordOptions = useResource<KeywordCatalogue>("travel/keywords");
  const [tasteStep, setTasteStep] = useState<1 | 2 | 3>(1);
  const [cardIndex, setCardIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const [turn, setTurn] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [dayIndex, setDayIndex] = useState(0);
  const [altOpen, setAltOpen] = useState(false);
  const [proposal, setProposal] = useState<RecommendationResult | null>(null);
  const action = useAction();
  const days = calendarDays(new Date().toISOString(), 5);
  const planId = new URLSearchParams(window.location.hash.split("?")[1]).get(
    "plan_id",
  );
  const requestedPlan = useResource<TripPlan>(
    planId && /^(?:[a-f0-9]{32}|[a-f0-9-]{36})$/i.test(planId)
      ? `travel/plans/${planId}`
      : null,
  );
  useEffect(() => {
    if (requestedPlan.data)
      setTravelSession({
        plan: requestedPlan.data,
        planInput: {
          request: requestedPlan.data.request,
          stops: requestedPlan.data.input_stops,
        },
        recommendation: null,
        route: null,
      });
  }, [requestedPlan.data]);
  const requestFor = (index = dayIndex, replies = answers): TravelRequest => {
    const preferred_tags = [...new Set([...selectedTags, ...liked])];
    if (
      preferred_tags.includes("파도 적은 곳") &&
      !keywordOptions.data?.categories
        .find((category) => category.id === "weather")
        ?.options.some((option) => option.id === "small_waves")
    )
      throw new Error("파고 선호 범위를 읽지 못했습니다. 다시 시도해 주세요.");
    const chosen = replies[0]
      ? [
          replies[0] === "물에 들어가고 싶어요"
            ? ("swim" as const)
            : ("relax" as const),
        ]
      : selectedActivities(preferred_tags);
    return {
      dates: [days[index].id],
      region: "강릉",
      place_role: preferred_tags.some((tag) =>
        ["카페", "바다 뷰 카페", "캠핑"].includes(tag),
      )
        ? "any"
        : "visit",
      preferred_tags,
      activity:
        replies[0] === "물에 들어가고 싶어요" ? "swim" : (chosen[0] ?? "relax"),
      keyword_selection: [
        ...(chosen.length &&
        !preferred_tags.some((tag) =>
          ["카페", "바다 뷰 카페", "캠핑"].includes(tag),
        )
          ? [{ category: "activity", values: chosen }]
          : []),
        ...(preferred_tags.includes("파도 적은 곳")
          ? [{ category: "weather", values: ["small_waves"] }]
          : []),
      ],
      transport: replies[2] === "대중교통" ? "transit" : "driving",
      ...(replies[1]
        ? { companion_type: replies[1] === "혼자 반나절" ? "solo" : "friends" }
        : {}),
      ...(replies.length ? { purpose: replies.join(" · ") } : {}),
      day_trip: true,
    };
  };
  const publish = (result: RecommendationResult) =>
    setTravelSession({
      recommendation: result,
      plan: null,
      route: null,
      planInput: result.recommendations.length
        ? recommendationPlan(result, result.request.dates[0])
        : null,
    });
  const recommend = (index = dayIndex, savePreference = false) =>
    void action.run(async (signal) => {
      const baseRequest =
        step === "course"
          ? (session.plan?.request ?? session.recommendation?.request)
          : null;
      const request = baseRequest
        ? { ...baseRequest, dates: [days[index].id], day_trip: true }
        : requestFor(index);
      if (savePreference) {
        const current = await travelJson<{
          preference: Preference;
          revision: number;
        }>(
          import.meta.env.BASE_URL,
          "travel/preferences",
          "GET",
          undefined,
          signal,
        );
        await travelJson(
          import.meta.env.BASE_URL,
          "travel/preferences",
          "PUT",
          {
            preference: { ...current.preference, tags: request.preferred_tags },
            expected_revision: current.revision,
          },
          signal,
        );
      }
      const result = await travelJson<RecommendationResult>(
        import.meta.env.BASE_URL,
        "travel/recommendations",
        "POST",
        {
          request,
          preference: {
            ...(profile.data?.preference ?? {}),
            tags: request.preferred_tags,
          },
          limit: 5,
        },
        signal,
      );
      if (signal.aborted) return;
      window.history.replaceState(null, "", "#recommend");
      publish(result);
      setDayIndex(index);
      setStep("course");
    });
  const advanceCard = (like: boolean) =>
    void action.run(async (signal) => {
      const card = SWIPE_CARDS[cardIndex];
      await travelJson(
        import.meta.env.BASE_URL,
        "travel/signals",
        "POST",
        { kind: "card", action: like ? "like" : "skip", tags: [card.name] },
        signal,
      );
      if (signal.aborted) return;
      if (like) setLiked((current) => [...current, card.name]);
      if (cardIndex + 1 >= SWIPE_CARDS.length) setTasteStep(3);
      else setCardIndex(cardIndex + 1);
    });
  const save = () =>
    void action.run(async (signal) => {
      if (!session.planInput) throw new Error("저장할 코스가 없습니다.");
      const plan = await travelJson<TripPlan>(
        import.meta.env.BASE_URL,
        "travel/plans",
        "POST",
        session.planInput,
        signal,
      );
      if (!signal.aborted) {
        window.history.replaceState(
          null,
          "",
          `#recommend?plan_id=${plan.plan_id}`,
        );
        setTravelSession({ plan });
      }
    });
  const reply = (reply: string) => {
    const next = [...answers, reply];
    setAnswers(next);
    setTurn(next.length);
    if (next.length === CHAT_TURNS.length)
      void action.run(async (signal) => {
        const result = await travelJson<{
          answer: string;
          travel_results?: { recommendations?: RecommendationResult };
        }>(
          import.meta.env.BASE_URL,
          "ai/chat",
          "POST",
          {
            message:
              next.join(". ") + ". 이 조건으로 장소와 활동을 추천해 주세요.",
            history: [],
            context: { region: "강릉" },
            travel: {
              action: "recommend",
              request: requestFor(dayIndex, next),
            },
          },
          signal,
        );
        if (!signal.aborted) {
          setAnswer(result.answer);
          if (result.travel_results?.recommendations)
            publish(result.travel_results.recommendations);
        }
      });
  };
  const refresh = () =>
    void action.run(async (signal) => {
      const result = await travelJson<RecommendationResult>(
        import.meta.env.BASE_URL,
        "travel/recommendations",
        "POST",
        {
          request:
            session.plan?.request ??
            session.recommendation?.request ??
            requestFor(),
          limit: 5,
        },
        signal,
      );
      if (!signal.aborted) {
        setProposal(result);
        setStep("realert");
      }
    });
  const apply = () =>
    void action.run(async (signal) => {
      if (!proposal?.recommendations.length) return;
      const input: PlanInput = recommendationPlan(
        proposal,
        proposal.request.dates[0] ?? kstDate(),
      );
      if (session.plan?.plan_id) {
        const plan = await travelJson<TripPlan>(
          import.meta.env.BASE_URL,
          `travel/plans/${session.plan.plan_id}`,
          "PUT",
          { ...input, expected_revision: session.plan.revision },
          signal,
        );
        if (!signal.aborted)
          setTravelSession({
            plan,
            planInput: input,
            recommendation: proposal,
            route: null,
          });
      } else if (!signal.aborted) publish(proposal);
      if (!signal.aborted) setStep("course");
    });
  const goEntry = () => {
    window.history.replaceState(null, "", "#recommend");
    setStep("entry");
    setTasteStep(1);
    setCardIndex(0);
    setLiked([]);
    setTurn(0);
    setAnswers([]);
    setAnswer("");
  };
  const status =
    action.error ||
    requestedPlan.error ||
    (action.busy
      ? "서버에 요청 중입니다…"
      : session.plan
        ? `서버 저장 확인 · ${session.plan.status}`
        : (session.recommendation?.clarification ??
          session.recommendation?.status ??
          ""));
  return (
    <article className="recommend-page" aria-busy={action.busy}>
      <fieldset className="rc-fieldset" disabled={action.busy}>
          {step === "entry" && (
            <EntryStep
              tags={selectedTags}
              toggleTag={(tag) =>
                setTags(
                  selectedTags.includes(tag)
                    ? selectedTags.filter((value) => value !== tag)
                    : [...selectedTags, tag],
                )
              }
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
              tags={selectedTags}
              toggleTag={(tag) =>
                setTags(
                  selectedTags.includes(tag)
                    ? selectedTags.filter((value) => value !== tag)
                    : [...selectedTags, tag],
                )
              }
              cardIndex={cardIndex}
              liked={liked}
              onLike={() => advanceCard(true)}
              onPass={() => advanceCard(false)}
              onDone={() => recommend(dayIndex, true)}
              onBack={goEntry}
            />
          )}
          {step === "chat" && (
            <ChatStep
              turn={turn}
              answers={answers}
              answer={answer}
              onReply={reply}
              onReset={() => {
                setTurn(0);
                setAnswers([]);
                setAnswer("");
              }}
              onDone={() =>
                session.recommendation ? setStep("course") : recommend()
              }
              onBack={goEntry}
            />
          )}
          {step === "course" &&
            (!planId || (!requestedPlan.loading && !requestedPlan.error)) && (
              <CourseStep
                dayIndex={dayIndex}
                setDayIndex={(index) => recommend(index)}
                saved={Boolean(session.plan?.plan_id)}
                onSave={save}
                altOpen={altOpen}
                setAltOpen={setAltOpen}
                onRealert={refresh}
                onBack={goEntry}
                statusText={status}
              />
            )}
          {step === "realert" && (
            <RealertStep
              proposal={proposal}
              onApply={apply}
              onBack={() => setStep("course")}
            />
          )}
        </fieldset>
        {(action.error ||
          action.busy ||
          requestedPlan.loading ||
          requestedPlan.error ||
          (step === "entry" && profile.error)) && (
          <p
            className={"rc-status" + (action.error ? " is-error" : "")}
            role={action.error ? "alert" : "status"}
          >
            {status ||
              (requestedPlan.loading
                ? "저장 상세를 불러오는 중입니다."
                : profile.error)}
          </p>
        )}
    </article>
  );
}

export function RecommendPage() {
  // 같은 라우트(#recommend)에서 폭으로 레이아웃을 갈아 끼웁니다. 데스크탑은
  // 모바일의 여러 단계를 한 페이지 세로 흐름으로 접은 구성입니다.
  const isDesktop = useIsDesktop();
  // 이 화면은 실제 수집 데이터만 읽습니다. 상단 「데이터 구분」이 더미로
  // 선택돼 있어도 `/api/data` 로 고정합니다(`/api/demo` 는 은퇴해 404).
  return (
    <DataOrigin.Provider value="data">
      {isDesktop ? <RecommendDesktop /> : <RecommendScreen />}
    </DataOrigin.Provider>
  );
}
