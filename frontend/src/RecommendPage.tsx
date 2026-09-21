import { t } from "./i18n.ts";
import { useEffect, useRef, useState } from "react";
import { DataOrigin } from "./DataOrigin";
import { RecommendDesktop } from "./RecommendDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { gradeOf } from "./groupAGrade";
import {
  AiSuggestion,
  GradeChip,
  GradeIcon,
  Icon,
  ScoreGauge,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { AppHeader, AppShell } from "./AppShell";
import { PlacePhoto, PlacePhotoCredit } from "./PlacePhoto";
import type { PlacePhoto as Photo } from "./placePhotos";
import { usePlacePhotos } from "./usePlacePhotos";
import { isInitialLoad, useResource } from "./useResource";
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
  dataStatusText,
  dateLabel,
  placeRegionLabel,
  kstDate,
  metricText,
  timeLabel,
  type Conditions,
} from "./productData";
import {
  kakaoRouteLink,
  planItems,
  placeRoleLabel,
  unknownConditionsText,
  keywordSelection,
  recommendationPlan,
  routeReasonsText,
  travelJson,
  travelActivityLabel,
  type PlanInput,
  type RecommendationResult,
  type RouteResult,
  type TravelRequest,
  type TripPlan,
} from "./travelApi";
import { RouteRequestForm, type RouteRequestValue } from "./RouteRequestForm";
import {
  useRouteFormSources,
  useTravelConcierge,
  type Bubble,
} from "./useTravelConcierge";
import {
  CARD_CATEGORY,
  useTastePreference,
  type KeywordCatalogue,
} from "./useTastePreference";
import { ModelTraceButton, ModelTraceDialog } from "./ModelTraceDialog";
import type { ModelTraceTurn } from "./aiApi";
import { setTravelSession, useTravelSession } from "./travelSession";
import { requestInLanguage, useTravelLanguage } from "./travelLanguage";
import { TravelRegionSelector } from "./TravelRegionSelector";
import { travelRegionLabel, useTravelRegionSelection } from "./travelRegion";
import { DEFAULT_PROVINCE, type RegionCatalog } from "./waterPlaceApi";
import "./recommendPage.css";

/** 화면이 통째로 바뀌는 자리는 셋뿐입니다.
 *
 *  `flow` 는 시작 · 취향 · 후보가 **한 화면에 쌓이는** 기본 흐름입니다.
 *  대화(`chat`)와 재추천(`realert`)만 그 흐름을 대신 차지합니다 -- 취향을 고르는
 *  자리가 아니라 다른 일이고, 각자 자기 히어로를 씁니다. */
type Mode = "flow" | "chat" | "realert";

/** 고를 수 있는 항목 · 저장된 취향은 useTastePreference 가 읽습니다. 데스크탑
 *  추천과 같은 카테고리 · 같은 저장 계약입니다.
 *
 *  예전에는 태그 열두 개가 파일 안 상수였습니다 -- 「SUP」 · 「갯벌 체험」 ·
 *  「바다 뷰 카페」 · 「주차 편한 곳」 · 「샤워장」 · 「반려동물」. 서버 카탈로그에
 *  없는 이름이라 고르면 서버가 할 수 있는 일이 없었고, 같은 함수가 바로 옆에서
 *  travel/keywords 를 이미 조회하고 있었습니다. 프런트가 키워드를 만들지
 *  않습니다. */

/** 대화를 여는 한 줄. 예전에는 고정 3턴 대본의 첫 질문이었고, 서버가 무엇을
 *  되묻든 화면이 다음 질문을 미리 정해 두고 그 순서대로 진행했습니다 -- 대화가
 *  아니라 설문이었습니다. 데스크탑 추천과 같은 한 줄만 둡니다. */
const OPENER = "어떤 물놀이를 찾으세요? 조건을 말로 적어도 됩니다.";

// Real sentences the server can act on: a changed wish, or the separate route
// request that the contract requires the user to ask for.
const FOLLOWUPS = [
  "이 후보들로 경로 짜줘",
  "아이랑 갈 만한 곳으로",
  "더 가까운 곳으로",
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

function EntryHero({
  regionTitle,
  savedTastes,
  onChat,
}: {
  regionTitle: string;
  /** 서버에 **저장돼 있는** 취향 라벨. 화면에서 지금 고르는 중인 것(picked)과
   *  다른 사실이므로 따로 받습니다. */
  savedTastes: string[];
  onChat: () => void;
}) {
  const saved = savedTastes.length > 0;
  return (
        <header className="pd-hero rc-hero">
        <AppHeader
          title={regionTitle}
          time={timeLabel(new Date().toISOString())}
          onCobalt
        />
        <div className="rc-hero-inner">
          {/* 이미 취향을 고른 사람에게 「고르시겠어요?」를 다시 묻지 않습니다.
              저장된 것을 그대로 말하고, 거기서 대화로 바로 이어 갑니다. */}
          <p className="pd-lbl">
            {saved
              ? t("{date} · 저장한 취향 {count}개", { date: dateLabel(), count: savedTastes.length })
              : t("{date} · 오늘 조건 반영", { date: dateLabel() })}
          </p>
          <h1 className="rc-hero-title">
            {saved ? (
              <>
                {t("저장한 취향으로")}<br />
                {t("바로 찾아 드릴까요?")}</>
            ) : (
              <>
                {t("취향에 맞는 일정을")}<br />
                {t("만들어 드릴까요?")}</>
            )}
          </h1>
          {saved && (
            <>
              <div className="rc-hero-tastes">
                {savedTastes.map((label) => (
                  <span className="rc-hero-taste" key={label}>
                    {t(label)}
                  </span>
                ))}
              </div>
              <button type="button" className="rc-hero-ai" onClick={onChat}>
                {t("AI에게 이어서 물어보기 →")}</button>
            </>
          )}
        </div>
        </header>
  );
}

function EntryBody({
  region,
  onRegion,
  shortcuts,
  picked,
  canPick,
  togglePick,
  onChat,
  onTags,
  tasteOpen,
}: {
  region: string;
  onRegion: (region: string) => void;
  /** 서버 활동 카테고리의 앞 세 가지. 예전에는 「서핑 · 온천 · 카페」가 파일
   *  안에 박혀 있었고, 그 중 「카페」는 서버에 없는 이름이었습니다. */
  shortcuts: { id: string; label: string }[];
  picked: string[];
  canPick: (id: string) => boolean;
  togglePick: (id: string) => void;
  onChat: () => void;
  onTags: () => void;
  /** 아래에 취향 수집 블록이 이미 열려 있는가. 열려 있으면 「더 고르기」로
   *  다시 보낼 것이 없습니다 -- 고를 자리는 이미 이 카드 아래에 있습니다. */
  tasteOpen: boolean;
}) {
  return (
    <>
        <div className="pd-card">
          <div className="rc-card-top">
            <div className="pd-card-title">{t("내 취향")}</div>
            <span className="pd-state-chip">{t("선택 후 저장")}</span>
          </div>
          <TravelRegionSelector region={region} onChange={onRegion} />
          <div className="rc-tags">
            {shortcuts.map((option) => (
              <button
                type="button"
                key={option.id}
                className={
                  "rc-tag pd-pressable" +
                  (picked.includes(option.id) ? " is-on" : "")
                }
                aria-pressed={picked.includes(option.id)}
                disabled={!canPick(option.id)}
                onClick={() => togglePick(option.id)}
              >
                {t(option.label)}
                {picked.includes(option.id) && <Icon name="check" size={11} />}
              </button>
            ))}
            {!tasteOpen && (
              <button type="button" className="rc-tag" onClick={onTags}>
                {t("+ 더 고르기")}</button>
            )}
          </div>
          <div className="rc-facts">
            <div className="rc-fact">
              <div className="rc-fact-name">{t("동행")}</div>
              <div className="rc-fact-value">{t("선택 전")}</div>
            </div>
            <div className="rc-fact">
              <div className="rc-fact-name">{t("기간")}</div>
              <div className="rc-fact-value">{t("날짜 선택")}</div>
            </div>
            <div className="rc-fact">
              <div className="rc-fact-name">{t("이동")}</div>
              <div className="rc-fact-value">{t("자동차 기본")}</div>
            </div>
          </div>
          <p className="pd-note">
            {t("선택한 태그는 이번 추천에 반영합니다. 「취향 저장하고 코스 보기」를 누르면 저장합니다. 동행과 이동은 대화 답변으로 변경할 수 있습니다.")}</p>
        </div>

        {!tasteOpen && (
          <div className="pd-card">
            <AiSuggestion
              headline={t("질문 3개 · 30초")}
              basis={
                t("실제 장소 카탈로그와 선택한 취향·날짜를 비교하고 확인되지 않은 환경 조건을 함께 표시합니다.")
              }
            />
            <div className="pd-card-title rc-sub-title">
              {t("일정 추천받기")}</div>
            <div className="rc-stack">
              <button type="button" className="pd-primary" onClick={onChat}>
                {t("대화로 추천받기 →")}</button>
              <button type="button" className="pd-secondary" onClick={onTags}>
                {t("태그로 바로 받기")}</button>
            </div>
            <p className="pd-note">
              {t("추천은 장소·활동 후보를 먼저 제시합니다. 이동 경로는 같은 화면에서 출발지와 시각을 넣은 뒤 별도로 요청합니다.")}</p>
          </div>
        )}
    </>
  );
}

// ── 2. B1 취향 수집 (카테고리별 → 카드 → 요약) ─────────────
//
// 예전에는 첫 단계가 서버 카테고리 **전부**를 한 화면에 펼쳤습니다. 고를 것이
// 한 화면에 다 쌓여 있어 어디까지 답했는지 알 수 없었습니다. 그래서 카테고리
// 하나를 한 화면으로 갈라 놓았는데, 이번에는 반대 문제가 생겼습니다 -- 다음을
// 누르는 순간 **앞에서 고른 것이 화면에서 사라졌습니다**. 고른 것을 되짚으려면
// 뒤로 가는 수밖에 없었고, 마지막 요약에 가서야 전체가 다시 보였습니다.
//
// 이제 카테고리는 **아래로 쌓입니다**. 한 번에 한 덩어리만 새로 열리지만 앞의
// 덩어리는 그 자리에 남아 계속 고칠 수 있고, 활동 카드 · 요약 · 후보 결과까지
// 같은 세로 흐름에 이어 붙습니다. 진행 점은 몇 개 중 몇 번째가 열렸는지를
// 그대로 말합니다.

/** 취향 수집에서 열린 데까지의 자리.
 *
 *  `0 … groups.length-1` 은 카테고리, `groups.length` 는 활동 카드,
 *  `groups.length+1` 은 요약입니다. `null` 은 아직 시작하지 않았다는 뜻입니다
 *  -- 0 과 다른 사실이라 한 값으로 합치지 않습니다. */
export type TasteReveal = number | null;

/** 취향 수집 중의 히어로. 지금 열린 덩어리가 무엇인지만 말합니다. */
function TasteHero({
  stepNo,
  stepTotal,
  label,
  title,
  onBack,
  busy,
}: {
  stepNo: number;
  stepTotal: number;
  label: string;
  title: string;
  onBack: () => void;
  busy: boolean;
}) {
  return (
    <header className="pd-hero rc-hero">
      <AppHeader
        title={t("STEP {current} / {total}", { current: stepNo, total: stepTotal })}
        time={timeLabel(new Date().toISOString())}
        onCobalt
      />
      <div className="rc-hero-inner">
        <button type="button" className="rc-hero-back" onClick={onBack} disabled={busy}>
          {t("← 추천 처음으로")}</button>
        <p className="pd-lbl rc-hero-lbl">
          {t("STEP {current}", { current: stepNo })} · {label}
        </p>
        <h1 className="rc-hero-title">{title}</h1>
        <div className="rc-progress" aria-hidden="true">
          {Array.from({ length: stepTotal }, (_, index) => (
            <span key={index} className={index < stepNo ? "is-on" : ""} />
          ))}
        </div>
      </div>
    </header>
  );
}

/** 카탈로그를 조회하는 동안의 자리. 문구 한 줄만 두면 빈 화면으로 보여서,
 *  고를 것이 몇 개쯤 올 자리인지 스켈레톤으로 잡아 둡니다. 스켈레톤은 **아직
 *  아무것도 보여준 적 없는 첫 조회에만** 씁니다(useResource.isInitialLoad). */
function TagSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="rc-tags" role="status" aria-label={t("선택 항목을 조회하고 있습니다.")}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} width={index % 3 === 0 ? "5.5em" : "4em"} label={t("선택 항목 조회 중")} />
      ))}
    </div>
  );
}

/** 열린 취향 덩어리 전부. 대체가 아니라 누적이므로 `revealed` 까지를 모두
 *  그립니다. 지나온 덩어리도 그대로 눌러서 고칠 수 있습니다. */
function TasteBlocks({
  region,
  onRegion,
  revealed,
  catalogue,
  groups,
  cards,
  picked,
  selectedIds,
  canPick,
  selectionIssue,
  labelOf,
  togglePick,
  removePick,
  cardIndex,
  liked,
  onNext,
  onRestart,
  onLike,
  onPass,
  onDone,
  preferenceSaved,
  busy,
  signalError,
}: {
  region: string;
  onRegion: (region: string) => void;
  revealed: number;
  catalogue: { loading: boolean; error?: string };
  /** 서버가 발행한 선택 항목. 프런트가 만든 목록이 아닙니다. */
  groups: KeywordCatalogue["categories"];
  cards: { id: string; label: string }[];
  picked: string[];
  selectedIds: string[];
  canPick: (id: string) => boolean;
  selectionIssue: string;
  labelOf: (id: string) => string;
  togglePick: (id: string) => void;
  removePick: (id: string) => void;
  cardIndex: number;
  liked: string[];
  onNext: () => void;
  onRestart: () => void;
  onLike: () => void;
  onPass: () => void;
  onDone: () => void;
  preferenceSaved: boolean;
  busy: boolean;
  signalError: string;
}) {
  const card = cards[Math.min(cardIndex, Math.max(cards.length - 1, 0))];
  const activityGroup = groups.find((group) => group.id === CARD_CATEGORY);
  const activityCount = activityGroup?.options.filter((option) =>
    selectedIds.includes(option.id),
  ).length ?? 0;
  // 활동 카드에는 점수가 없습니다. 장소와 날짜를 고르기 전이라 조건을 조회할
  // 대상이 없고, 0 이나 「보통」으로 채우지 않습니다.
  const grade = gradeOf(null);
  const openGroups = groups.slice(0, revealed + 1);
  const cardsOpen = groups.length > 0 && revealed >= groups.length;
  const summaryOpen = groups.length > 0 && revealed >= groups.length + 1;
  // 새로 열린 덩어리로 데려다줍니다. 쌓이는 화면에서는 새 내용이 접힌 화면
  // **아래**에 붙으므로, 데려다주지 않으면 눌러도 아무 일이 없어 보입니다.
  const openedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    openedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [revealed]);

  if (groups.length === 0)
    return (
      <div className="pd-card rc-taste-tags rc-block">
        <div className="pd-card-title">{t("취향 고르기")}</div>
        {catalogue.loading ? (
          <TagSkeletons />
        ) : (
          <p className="pd-note" role={catalogue.error ? "alert" : "status"}>
            {catalogue.error ?? t("서버가 발행한 선택 항목이 없습니다.")}
          </p>
        )}
      </div>
    );

  return (
    <>
      {openGroups.map((group, index) => {
        const current = index === revealed;
        const overGroupLimit =
          selectedIds.filter((id) => group.options.some((option) => option.id === id)).length >
          group.max_selections;
        return (
          <div
            className={"pd-card rc-taste-tags rc-block" + (current ? "" : " is-past")}
            key={group.id}
            ref={current ? openedRef : undefined}
            // 카테고리가 한 화면에 여러 개 열려 있습니다. 같은 이름의 항목이
            // 다른 카테고리에 있을 수 있으므로(장소의 「온천」과 활동의
            // 「온천」), 덩어리마다 어느 카테고리인지 밝힙니다.
            role="group"
            aria-label={t(group.label)}
          >
            <p className="pd-lbl rc-group-lbl">
              {t("{label} · 최대 {count}개", { label: t(group.label), count: group.max_selections })}
            </p>
            <div className="rc-tags">
              {group.options.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={"rc-tag" + (selectedIds.includes(option.id) ? " is-on" : "")}
                  aria-pressed={selectedIds.includes(option.id)}
                  disabled={!canPick(option.id)}
                  onClick={() => togglePick(option.id)}
                >
                  {t(option.label)}
                  {selectedIds.includes(option.id) && <Icon name="check" size={11} />}
                </button>
              ))}
            </div>
            {current && (
              <>
                <ExampleNote>
                  {t("선택 항목은 서버 키워드 카탈로그(travel-keywords.v1)에서 읽습니다. 고른 것은 여행 취향이며, 편의시설의 실제 지원과 안전 판정은 별도로 확인해야 합니다.")}</ExampleNote>
                {selectionIssue && <p className="pd-note" role="alert">{selectionIssue}</p>}
                <div className="rc-stack rc-block-actions">
                  <button
                    type="button"
                    className="pd-primary"
                    onClick={onNext}
                    disabled={overGroupLimit}
                  >
                    {index + 1 >= groups.length ? t("다음 · 카드로 확정하기") : t("다음")}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {cardsOpen && (
        <div
          className={"pd-card rc-block" + (summaryOpen ? " is-past" : "")}
          ref={revealed === groups.length ? openedRef : undefined}
        >
          <div className="pd-card-title">{t("이건 어떠세요?")}</div>
          {signalError && <p className="pd-note" role="alert">{t(signalError)}</p>}
          {card ? (
            <>
              <div className="pd-slot rc-photo-slot">
                {t("활동 사진 영역")}<br />
                {t("(에셋 미확보 · 별도 작업)")}</div>
              <div className="rc-swipe-head">
                <div className="rc-swipe-name">{t(card.label)}</div>
                <GradeChip score={null} />
              </div>
              <div className="rc-stop-place">{t("활동 취향 선택")}</div>
              <p className="pd-note" role="status">
                {t("태그와 좋아요를 합쳐 활동 {count} / {limit}개 선택", { count: activityCount, limit: activityGroup?.max_selections ?? "–" })}
                {!canPick(card.id) &&
                  t(" · 최대 개수를 골랐습니다. 패스하거나 위에서 선택을 줄여 주세요.")}
              </p>
              <p className="pd-note">
                {t("장소 선택 전 점수 – · {grade}. 실제 장소와 날짜를 고르면 조건 점수를 조회합니다.", { grade: t(grade.label) })}
              </p>
              <div className="rc-swipe-actions">
                <button type="button" className="pd-secondary" onClick={onPass}>
                  {t("패스")}</button>
                <button
                  type="button"
                  className="pd-primary"
                  onClick={onLike}
                  disabled={!canPick(card.id)}
                >
                  {t("좋아요")}</button>
              </div>
              <p className="pd-note">
                {t("{current} / {total}번째 카드입니다.", { current: Math.min(cardIndex + 1, cards.length), total: cards.length })} <StateChip kind="partial" />
              </p>
            </>
          ) : catalogue.loading ? (
            <TagSkeletons count={3} />
          ) : (
            <p className="pd-note" role={catalogue.error ? "alert" : "status"}>
              {catalogue.error ?? t("서버가 발행한 활동 목록이 없습니다.")}
            </p>
          )}
        </div>
      )}

      {summaryOpen && (
        <div className="pd-card rc-block" ref={openedRef}>
          <div className="pd-card-title">{t("이렇게 정리했어요")}</div>
          <div className="pd-card-title rc-group-title">{t("좋아요 한 활동")}</div>
          <div className="rc-liked-list">
            {liked.length === 0 ? (
              <p className="pd-note rc-note-flush">
                {t("좋아요 한 활동이 없습니다. 선택 없이도 다음으로 갈 수 있지만, 취향 근거 없이는 추천 이유를 적을 수 없습니다.")}</p>
            ) : (
              liked.map((id) => (
                <button
                  type="button"
                  className="rc-tag is-on"
                  key={id}
                  onClick={() => removePick(id)}
                  disabled={busy}
                  aria-label={t("{label} 좋아요 선택 해제", { label: t(labelOf(id)) })}
                >
                  {t(labelOf(id))} ×
                </button>
              ))
            )}
          </div>
          <div className="pd-card-title rc-group-title">{t("고른 항목")}</div>
          <div className="rc-liked-list">
            {picked.length === 0 ? (
              <p className="pd-note rc-note-flush">{t("고른 항목이 없습니다.")}</p>
            ) : (
              picked.map((id) => (
                <button
                  type="button"
                  className="rc-tag is-on"
                  key={id}
                  onClick={() => removePick(id)}
                  disabled={busy}
                  aria-label={t("{label} 태그 선택 해제", { label: t(labelOf(id)) })}
                >
                  {t(labelOf(id))} ×
                </button>
              ))
            )}
          </div>
          <TravelRegionSelector region={region} onChange={onRegion} disabled={busy} />
          <ExampleNote>
            {t("고른 항목과 좋아요를 합쳐 취향에 저장하고 실제 장소를 추천받습니다. 선택은 서버 키워드로 그대로 전달되며, 프런트가 조건을 만들어 붙이지 않습니다.")}</ExampleNote>
          {selectionIssue && <p className="pd-note" role="alert">{selectionIssue}</p>}
          {preferenceSaved && <p className="pd-note" role="status">{t("취향을 저장했습니다.")}</p>}
          {signalError && <p className="pd-note" role="alert">{t(signalError)}</p>}
          <div className="rc-stack rc-block-actions">
            <button
              type="button"
              className="pd-primary"
              onClick={onDone}
              disabled={busy || Boolean(selectionIssue)}
            >
              {t("취향 저장하고 코스 보기 →")}</button>
            <button type="button" className="pd-secondary" onClick={onRestart} disabled={busy}>
              {t("다시 고르기")}</button>
          </div>
        </div>
      )}
    </>
  );
}

// ── 3. B3 대화형 컨시어지 ──────────────────────────────────

function ChatHero({
  regionTitle,
  asked,
  onBack,
  busy,
}: {
  regionTitle: string;
  asked: number;
  onBack: () => void;
  busy: boolean;
}) {
  const session = useTravelSession();
  return (
        <header className="pd-hero rc-hero">
        <AppHeader
          title={regionTitle}
          time={timeLabel(new Date().toISOString())}
          onCobalt
        />
        <div className="rc-bot-head">
          <span className="rc-bot-avatar">
            <Icon name="sparkle" size={21} />
          </span>
          <div>
            <div className="rc-bot-name">{t("퐁당 컨시어지")}</div>
            <div className="rc-bot-sub">
              {t("대화 {count}턴", { count: asked })}
              {session.recommendation?.recommendations.length
                ? t(" · 후보 {count}곳", { count: session.recommendation.recommendations.length })
                : ""}
            </div>
          </div>
        </div>
        <div className="rc-hero-inner">
          <button type="button" className="rc-hero-back" onClick={onBack} disabled={busy}>
            {t("← 추천 처음으로")}</button>
        </div>
        </header>
  );
}

function ChatBody({
  region,
  onRegion,
  bubbles,
  draft,
  setDraft,
  busy,
  lastTrace,
  onSend,
  onRoute,
  onReset,
}: {
  region: string;
  onRegion: (region: string) => void;
  bubbles: Bubble[];
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  lastTrace: ModelTraceTurn[] | null;
  onSend: (text: string) => void;
  onRoute: (value: RouteRequestValue) => void;
  onReset: () => void;
}) {
  // 예전에는 여기에 고정 3턴 대본(질문과 답 후보)이 있었습니다. 서버가 무엇을
  // 되묻든 화면이 다음 질문을 미리 정해 두고 그 순서대로 진행한 것이라, 대화가
  // 아니라 설문이었습니다. 이제 여는 말 한 줄만 두고 나머지는 서버에 맡깁니다
  // (데스크탑 추천과 같은 방식). 빠른 답 칩은 실제로 서버가 실행할 수 있는
  // 문장들입니다.
  const quick = FOLLOWUPS.map((reply) => t(reply));
  const pickReply = (reply: string) => setDraft(reply);
  const session = useTravelSession();
  const [traceOpen, setTraceOpen] = useState(false);
  const { candidates, originOptions } = useRouteFormSources();
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
    { name: t("파고"), value: metricText(conditions.data, "wave_height") },
    { name: t("수온"), value: metricText(conditions.data, "water_temperature") },
    { name: t("수질"), value: "–" },
  ];
  return (
    <>
        <div className="rc-chat">
          {bubbles.map((bubble, index) => (
            <div
              className={
                "rc-bubble-row" + (bubble.role === "user" ? " is-user" : "")
              }
              key={`${index}:${bubble.content.slice(0, 12)}`}
            >
              <div
                className={
                  "rc-bubble" + (bubble.role === "user" ? " is-user" : "")
                }
              >
                {bubble.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="rc-bubble-row">
              <div className="rc-bubble">{t("답변을 조회하고 있습니다…")}</div>
            </div>
          )}
        </div>
        <ModelTraceButton
          trace={lastTrace}
          onOpen={() => setTraceOpen(true)}
        />
        {traceOpen && (
          <ModelTraceDialog
            trace={lastTrace}
            onClose={() => setTraceOpen(false)}
          />
        )}

        <div className="rc-replies">
          {quick.map((reply) => (
            <button
              type="button"
              className={"rc-reply" + (draft === reply ? " is-on" : "")}
              key={reply}
              disabled={busy}
              aria-pressed={draft === reply}
              onClick={() => pickReply(reply)}
            >
              {reply}
            </button>
          ))}
        </div>

        <TravelRegionSelector region={region} onChange={onRegion} disabled={busy} />
        <form
          className="rc-compose"
          onSubmit={(event) => {
            event.preventDefault();
            onSend(draft);
          }}
        >
          <input
            className="rc-compose-input"
            type="text"
            value={draft}
            maxLength={2000}
            aria-label={t("컨시어지에게 보낼 내용")}
            placeholder={t("원하는 조건을 적어 주세요")}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            className="rc-compose-send"
            disabled={busy || !draft.trim()}
          >
            {t("보내기")}</button>
        </form>

        {session.recommendation?.recommendations.length ? (
          /* 「AI 제안」 칩이 붙은 카드에는 같은 카드 안에 근거가 있어야
             합니다. 문장은 서버가 구조화 결과로 만든 것입니다. */
          <div className="pd-card">
            <AiSuggestion
              headline={t("답변에 사용한 근거")}
              basis={t("후보 {count}곳 · 조회 {time} KST · {preferences}", { count: session.recommendation.recommendations.length, time: timeLabel(session.recommendation.queried_at), preferences: session.recommendation.request.preferred_tags.map((tag) => t(tag)).join(" · ") || t("선택 취향 없음") })}
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
              {t("첫 후보의 선택 날짜 정오 예보입니다. ")}{conditions.error} {t(" 추천 순서는 취향 일치 기준이며 안전 점수가 아닙니다. 답변 문장은 서버가 조회한 장소·시각으로 구성하며 모델이 장소를 만들지 않습니다.")}</p>
            <ConditionScoreDetails data={conditions.data} className="pd-note" />
          </div>
        ) : (
          <ExampleNote>
            {t("대화 답변으로 실제 장소와 활동을 조회합니다. 환경 근거가 없으면 미확인으로 표시합니다.")}</ExampleNote>
        )}

        {session.route && <RoutePanel route={session.route} />}

        {/* 대화로는 출발 좌표와 시각을 말할 수 없으므로, 경로를 요청한 자리에
            바로 그 조건을 넣는 폼을 둡니다. */}
        {candidates.length > 0 && session.recommendation?.selection_token && (
          <RouteRequestForm
            places={originOptions}
            candidates={candidates}
            defaultDate={session.recommendation.request.dates[0]}
            disabled={busy}
            submitLabel={
              session.route?.route_calculated
                ? t("조건을 바꿔 다시 계산")
                : t("이 후보로 경로 계산")
            }
            onSubmit={onRoute}
          />
        )}
        <div className="rc-stack">
          <button
            type="button"
            className="pd-secondary"
            onClick={onReset}
            disabled={busy}
          >
            {t("처음부터")}</button>
        </div>
    </>
  );
}

// ── 4. B2 코스 결과 ────────────────────────────────────────

interface CourseStopData {
  spotId: number;
  at: string;
  time: string;
  name: string;
  place: string;
  basis: string;
  /** 이 후보가 걸린 취향들. 예전에는 ` · ` 로 이은 문자열 하나라 어디까지가
   *  한 취향인지 보이지 않았습니다. */
  chips: string[];
  photo?: Photo;
}

function CourseStop({ stop, activity }: { stop: CourseStopData; activity: Activity }) {
  const targetValid = conditionTargetInRange(stop.at);
  const conditions = useResource<Conditions>(targetValid ? conditionPath(stop.spotId, activity, stop.at) : null);
  const score = conditionScore(conditions.data);
  const grade = gradeOf(score);
  // 점수를 아직 모르는 동안(첫 조회)과 값이 없는 것은 다른 사실입니다. 앞은
  // 스켈레톤, 뒤는 «–» 입니다(useResource.isInitialLoad 주석).
  const scoring = targetValid && isInitialLoad(conditions);
  return (
    <div className="rc-stop">
      <div className="rc-stop-time">{stop.time}</div>
      <div className="rc-stop-rail">
        <span className="rc-stop-dot" style={{ background: grade.color }} />
      </div>
      <div className="rc-stop-body">
        <div className="rc-stop-head">
          {/* 사진은 목록 하나로 한 번에 읽어 내려옵니다(usePlacePhotos). 없는
              장소는 자리표시자가 대신하며, 없는 사진을 지어내지 않습니다.
              자리표시자가 이미 핀을 그리므로 이름 옆 핀 배지는 두지 않습니다. */}
          <PlacePhoto className="rc-stop-photo" name={stop.name} photo={stop.photo} />
          <div className="rc-stop-headline">
            <div className="rc-stop-name">{stop.name}</div>
            <div className="rc-stop-place">{stop.place}</div>
          </div>
        </div>
        {/* 점수는 이름 옆이 아니라 아래 한 줄입니다 -- 390px 에서 이름과 등급
            칩이 같은 줄을 다투면 장소 이름이 두 글자씩 끊깁니다. */}
        <div className="rc-stop-score">
          <GradeChip score={score} loading={scoring} />
          <ScoreGauge score={score} loading={scoring} compact />
        </div>
        <div className="rc-stop-basis">{stop.basis}</div>
        <div className="rc-stop-chips">
          {stop.chips.map((chip) => (
            <span className="rc-basis-chip" key={chip}>{chip}</span>
          ))}
          <StateChip kind={conditions.data?.condition_score?.status === "evaluated" ? "live" : "partial"} />
        </div>
        <p className="pd-note">{dateLabel(stop.at)} {timeLabel(stop.at)} {t(" KST 예보 · ")}{targetValid ? conditions.error : t("저장 날짜가 조회 범위(현재 기준 앞뒤 31일)를 벗어났습니다.")}</p>
        <ConditionScoreDetails data={conditions.data} className="pd-note" />
        <PlacePhotoCredit photo={stop.photo} />
      </div>
    </div>
  );
}

/** 후보를 조회하는 동안의 자리. 목록을 **한 번도 보여준 적 없을 때만**
 *  씁니다 -- 이미 보여준 목록 위에 덮으면 아는 것을 모르는 것처럼 그립니다. */
function CourseStopSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="pd-card rc-timeline" role="status" aria-label={t("후보를 조회하고 있습니다.")}>
      {Array.from({ length: count }, (_, index) => (
        <div className="rc-stop is-skeleton" key={index}>
          <div className="rc-stop-time">
            <Skeleton width="3em" label={t("후보 조회 중")} />
          </div>
          <div className="rc-stop-rail">
            <span className="rc-stop-dot" />
          </div>
          <div className="rc-stop-body">
            <div className="rc-stop-head">
              <span className="rc-stop-photo rc-stop-photo-empty" aria-hidden="true" />
              <div className="rc-stop-headline">
                <Skeleton width="7em" label={t("후보 조회 중")} />
                <Skeleton width="5em" label={t("후보 조회 중")} />
              </div>
            </div>
            <Skeleton width="100%" label={t("후보 조회 중")} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The calculated visiting order. Times are provider estimates, so every row
 *  says so rather than reading like a confirmed schedule. */
function RoutePanel({ route }: { route: RouteResult }) {
  if (!route.route_calculated || !route.route)
    return (
      <div className="pd-card">
        <div className="pd-card-title">{t("경로를 계산하지 못했습니다")}</div>
        <p className="pd-note rc-note-flush">
          <StateChip kind="no_data" />{" "}
          {routeReasonsText(route.reason_codes) ||
            t("경로 계산 조건을 확인해 주세요.")}
        </p>
      </div>
    );
  const { items, legs, travel_minutes, return_at, origin } = route.route;
  const wholeTrip = kakaoRouteLink(origin, items);
  return (
    <div className="pd-card">
      <div className="rc-card-top">
        <div className="pd-card-title">{t("계산한 방문 순서")}</div>
        <StateChip kind="live" />
      </div>
      <div className="rc-route-rows">
        {items.map((item, index) => {
          // Each leg starts at the origin or the place visited before it.
          const leg = kakaoRouteLink(index === 0 ? origin : items[index - 1], [
            item,
          ]);
          return (
            <div className="rc-route-row" key={`${item.spot_id}:${index}`}>
              <span className="rc-route-no">{index + 1}</span>
              <div className="rc-route-body">
                <div className="rc-route-name">{item.name}</div>
                <div className="rc-route-when">
                  {t("{arrival} 도착 · {departure} 출발", { arrival: timeLabel(item.arrival_at), departure: timeLabel(item.departure_at) })} ·{" "}
                  {legs[index]
                    ? t("{minutes}분 이동", { minutes: legs[index].duration_minutes })
                    : t("이동시간 –")}
                </div>
              </div>
              {leg ? (
                <a
                  className="rc-route-leg"
                  href={leg}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("이 구간 길찾기")}</a>
              ) : (
                <span className="rc-route-leg">{t("좌표 –")}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="rc-facts">
        <div className="rc-fact">
          <div className="rc-fact-name">{t("이동 합")}</div>
          <div className="rc-fact-value">{t("{count}분", { count: travel_minutes })}</div>
        </div>
        <div className="rc-fact">
          <div className="rc-fact-name">{t("예상 귀가")}</div>
          <div className="rc-fact-value">{timeLabel(return_at)}</div>
        </div>
        <div className="rc-fact">
          <div className="rc-fact-name">{t("출발")}</div>
          <div className="rc-fact-value">
            {route.route.origin?.label ?? t("출발지")}
          </div>
        </div>
      </div>
      <p className="pd-note">
        {t("출발 기준 교통 자료로 계산한 예상 시각입니다.")}{" "}
        {route.optimality === "provisional_missing_comparison_evidence"
          ? t("일부 환경·경로 비교 자료가 없어 최적 경로로 확정하지 않은 잠정 순서입니다.")
          : t("선택한 후보 안에서 비교한 순서이며 전체 지역의 최적 경로가 아닙니다.")}{" "}
        {routeReasonsText(route.reason_codes)}
      </p>
      <div className="rc-stack">
        <a className="pd-secondary" href="#map?view=course">
          <Icon name="course" size={16} />
          {t("지도에서 경로 보기 →")}</a>
        {wholeTrip ? (
          <a
            className="pd-secondary"
            href={wholeTrip}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="transit" size={16} />
            {t("카카오맵에서 순서대로 길찾기 →")}</a>
        ) : (
          <p className="pd-note rc-note-flush">
            {t("출발지나 일부 장소의 좌표가 없어 카카오맵 순차 길찾기를 만들지 못했습니다. 구간별 링크를 확인해 주세요.")}</p>
        )}
      </div>
    </div>
  );
}

/** 코스 화면이 읽는 사실 한 벌. 히어로와 본문이 같은 값을 말해야 하고,
 *  히어로가 본문 위에 따로 그려지므로 두 곳에서 같은 것을 읽습니다 -- 조회는
 *  useResource 의 기억이 하나로 합쳐 주므로 요청이 두 번 나가지 않습니다. */
function useCourseView(dayIndex: number) {
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
  const rows: CourseStopData[] = session.plan
    ? session.plan.days.flatMap((savedDay) => savedDay.items.map((item) => ({
        spotId: item.spot_id,
        at: item.arrival_at ?? savedDay.date + "T12:00:00+09:00",
        time: timeLabel(item.arrival_at),
        name: item.name,
        place: placeRoleLabel(item.role),
        basis: unknownConditionsText(item.unknown_conditions) || t("선택한 실제 장소"),
        chips: [t("저장 일정")],
      })))
    : (session.recommendation?.recommendations ?? []).map((item) => ({
        spotId: item.spot_id,
        at: selectedAt,
        time: t("후보 {count}", { count: item.rank }),
        name: item.name,
        place: t("{region} · {activities}", { region: placeRegionLabel(item), activities: item.activities.map((activity) => travelActivityLabel(activity.activity, activity.label)).join(" · ") || t("활동 미확인") }),
        basis: t("{reason} 미확인: {conditions}", { reason: item.reason, conditions: unknownConditionsText(item.unknown_conditions) || t("없음") }),
        chips: item.matched_preferences.map((preference) => t(preference.tag)).length
          ? item.matched_preferences.map((preference) => t(preference.tag))
          : [t("카탈로그 후보")],
      }));
  // 사진은 목록 하나로 한 번에 읽습니다 -- 행마다 조회하면 후보 수만큼
  // 요청이 나갑니다(usePlacePhotos 주석).
  const photos = usePlacePhotos(rows.map((row) => ({ ...row, id: row.spotId })));
  const stops: CourseStopData[] = photos.rows ?? rows;
  return {
    session,
    days,
    day,
    activity,
    firstConditions,
    firstScore,
    stops,
    hasForecast: stops.length > 0,
  };
}

function CourseHero({
  regionTitle,
  dayIndex,
  setDayIndex,
  onBack,
  busy,
}: {
  regionTitle: string;
  dayIndex: number;
  setDayIndex: (index: number) => void;
  onBack: () => void;
  busy: boolean;
}) {
  const { session, days, stops, firstConditions, firstScore } = useCourseView(dayIndex);
  const day = days[dayIndex];
  return (
        <header className="pd-hero rc-hero">
        <AppHeader
          title={regionTitle}
          time={timeLabel(new Date().toISOString())}
          onCobalt
        />
        <div className="rc-hero-inner">
          <button type="button" className="rc-hero-back" onClick={onBack} disabled={busy}>
            {t("← 추천 처음으로")}</button>
          <div className="rc-hero-row">
            <div>
              <p className="pd-lbl">
                {session.plan?.request.dates.join(" · ") ?? day.dateLabel}
              </p>
              <h1 className="rc-hero-title">{t("선택한 물 코스")}</h1>
            </div>
            <div className="rc-hero-score">
              <div className="pd-num rc-hero-score-num">
                {firstScore ?? "–"}
              </div>
              <GradeChip score={firstScore} glass bare />
            </div>
          </div>
          <div className="rc-days" role="group" aria-label={t("날짜 선택")}>
            {days.map((item, index) => (
              <button
                type="button"
                key={item.id}
                className={
                  "rc-day" + (index === dayIndex ? " is-selected" : "")
                }
                aria-pressed={index === dayIndex}
                aria-label={t("{day} · {score}", { day: item.name, score: item.score === null
                    ? t("평가값 없음")
                    : t("{count}점 {label}", { count: item.score, label: t(gradeOf(item.score).label) }) })}
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
            {t("상단과 날짜별 점수는 첫 장소 {name}의 활동 조건 참고값입니다. 날짜별 막대는 정오 예보이며, 장소별 점수는 각 일정 시각을 사용합니다. 날짜를 바꾸면 해당 날짜의 장소·활동 후보를 새로 조회합니다.", { name: stops[0]?.name ?? t("선택 전") })}{" "}
            {conditionScoreText(firstConditions.data)} {firstConditions.error}
          </p>
        </div>
        </header>
  );
}

function CourseBody({
  dayIndex,
  setDayIndex,
  saved,
  onSave,
  altOpen,
  setAltOpen,
  onRealert,
  onRoute,
  busy,
  statusText,
  loadingCandidates,
}: {
  dayIndex: number;
  setDayIndex: (index: number) => void;
  saved: boolean;
  onSave: () => void;
  altOpen: boolean;
  setAltOpen: (open: boolean) => void;
  onRealert: () => void;
  onRoute: (value: RouteRequestValue) => void;
  busy: boolean;
  statusText: string;
  /** 후보를 조회하는 중인가. 목록이 아직 없을 때만 스켈레톤을 그립니다. */
  loadingCandidates: boolean;
}) {
  const { session, days, activity, stops, hasForecast } = useCourseView(dayIndex);
  const day = days[dayIndex];
  const { candidates, originOptions } = useRouteFormSources();
  return (
    <>
        {/* 「취향을 저장했습니다」는 저장을 누른 자리(취향 요약)에서 한 번만
            말합니다. 두 덩어리가 한 화면에 함께 있으므로 여기서 또 적으면 같은
            문장이 두 번 보입니다. */}
        {loadingCandidates && !hasForecast ? (
          <CourseStopSkeletons />
        ) : !hasForecast ? (
          /* 예보가 없는 날에는 코스를 만들지 않습니다. 없는 근거로 일정을
             지어내지 않고 빈 상태만 보여주며, 공유 · 저장 · 대안 행은
             숨깁니다. */
          <>
            <div className="pd-card rc-empty">
              <span className="rc-empty-icon">
                <GradeIcon gradeKey="unscored" size={28} />
              </span>
              <div className="rc-empty-title">{t("추천 장소가 없습니다")}</div>
              <p className="pd-note" role="status">
                <StateChip kind="no_data" />{" "}
                {statusText ||
                  t("선택한 조건에 맞는 후보가 없습니다. 취향이나 날짜를 바꿔 다시 조회해 주세요.")}
              </p>
              <button
                type="button"
                className="pd-secondary rc-empty-cta"
                onClick={() => setDayIndex(0)}
              >
                {t("오늘 다시 조회 →")}</button>
            </div>
          </>
        ) : (
          <>
            <p className="rc-lede">
              {(
                session.plan?.request.preferred_tags ??
                session.recommendation?.request.preferred_tags ??
                []
              ).map((tag) => t(tag)).join(" · ") || t("선택 취향 없음")}{" "}
              {t("· {count}곳. 조회 {time} KST. 환경 미확인 조건은 각 후보에서 확인하세요.", { count: stops.length, time: timeLabel(session.plan?.queried_at ?? session.recommendation?.queried_at) })}
            </p>

            {/* 목록이 이미 있는 채로 다시 조회하는 중이면 그 자리를 스켈레톤으로
                덮지 않습니다 -- 이미 보여준 값을 모르는 것처럼 그리게 됩니다.
                조회 중이라는 사실은 aria-busy 와 아래 rc-status 가 말합니다. */}
            <div className="pd-card rc-timeline" aria-busy={loadingCandidates}>
              {stops.map((stop, index) => <CourseStop key={`${stop.spotId}:${stop.at}:${index}`} stop={stop} activity={activity} />)}
            </div>

            {session.route && <RoutePanel route={session.route} />}

            {candidates.length > 0 && session.recommendation?.selection_token && (
              <RouteRequestForm
                places={originOptions}
                candidates={candidates}
                defaultDate={day.id}
                disabled={busy}
                submitLabel={
                  session.route ? t("조건을 바꿔 다시 계산") : t("이 후보로 경로 계산")
                }
                onSubmit={onRoute}
              />
            )}

            <div className="pd-card">
              <div className="pd-card-title">{t("조건이 바뀌면 어떻게 하나요?")}</div>
              <p className="pd-note">
                {t("다시 조회할 때 최신 환경 근거와 같은 취향을 비교합니다. 장소 추천은 안전 판정이 아니며, 새 후보는 확인 후 적용합니다.")}</p>
              {altOpen && (
                <p className="pd-note">
                  {t("새 후보를 조회해도 기존 저장 코스는 유지됩니다. 대안 적용 시 서버가 최신 제한과 일정 충돌을 다시 확인합니다.")}</p>
              )}
              <div className="rc-stack">
                <button
                  type="button"
                  className="pd-secondary"
                  onClick={() => setAltOpen(!altOpen)}
                  aria-expanded={altOpen}
                >
                  {altOpen ? t("대안 규칙 닫기") : t("대안 규칙 보기 →")}
                </button>
                <button
                  type="button"
                  className="pd-secondary"
                  onClick={onRealert}
                  disabled={busy}
                >
                  {t("최신 조건으로 대안 조회 →")}</button>
              </div>
            </div>

            <div className="rc-actions">
              <a
                className="pd-secondary"
                href={`#map?view=course${session.plan?.plan_id ? `&plan_id=${session.plan.plan_id}` : ""}`}
              >
                <Icon name="course" size={16} />
                {t("지도에서 보기")}</a>
              <button
                type="button"
                className={"pd-primary" + (saved ? " is-done" : "")}
                onClick={onSave}
                disabled={busy || saved}
              >
                <Icon name="save" size={16} />
                {saved ? t("저장됨") : t("내 코스에 저장")}
              </button>
            </div>
            <p className="pd-note rc-note-flush-top" role="status">
              <StateChip kind="live" /> {statusText}{" "}
              {session.route?.route_calculated
                ? t("위 방문 순서는 아래 경로 계산 결과입니다.")
                : t("장소 후보 순서는 이동 경로가 아닙니다. 아래에서 출발지와 시각을 넣어 경로를 계산하세요.")}
            </p>
          </>
        )}
    </>
  );
}

// ── 5. B4 조건 변화 재추천 ────────────────────────────────

/** 재추천이 비교하는 두 코스. 히어로와 본문이 같은 값을 말합니다. */
function useRealertView(proposal: RecommendationResult | null) {
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
    t("기존 후보 없음");
  return { previous, previousConditions, previousScore, nextConditions, nextScore };
}

function RealertHero({
  regionTitle,
  proposal,
  onBack,
  busy,
}: {
  regionTitle: string;
  proposal: RecommendationResult | null;
  onBack: () => void;
  busy: boolean;
}) {
  const { previousScore, nextScore } = useRealertView(proposal);
  return (
        <header className="pd-hero rc-hero">
        <AppHeader
          title={regionTitle}
          time={timeLabel(new Date().toISOString())}
          onCobalt
        />
        <div className="rc-hero-inner">
          <button type="button" className="rc-hero-back" onClick={onBack} disabled={busy}>
            {t("← 코스로 돌아가기")}</button>
          <p className="pd-lbl rc-hero-lbl">
            {t("최신 조건 조회 · ")}{timeLabel(proposal?.queried_at)}
          </p>
          <h1 className="rc-hero-title">
            {t("새 후보를")}<br />
            {t("확인하세요")}</h1>
          <div className="rc-change">
            <span className="rc-change-metric">
              {proposal ? dataStatusText(proposal.status) : t("조회 중")}
            </span>
            <span className="rc-change-scores">
              <span className="rc-change-from">{previousScore ?? "–"}</span>
              <span aria-hidden="true">→</span>
              <span className="pd-num rc-change-to">{nextScore ?? "–"}</span>
              <GradeChip score={nextScore} glass bare />
            </span>
          </div>
          <p className="rc-hero-note">
            {t("각 코스 첫 장소의 활동 조건 참고값입니다. 직접 요청한 최신 추천이며, 확보한 분야가 다르면 점수를 직접 비교할 수 없습니다.")}</p>
        </div>
        </header>
  );
}

function RealertBody({
  proposal,
  onApply,
  onBack,
  busy,
}: {
  proposal: RecommendationResult | null;
  onApply: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  const { previous, previousConditions, previousScore, nextConditions, nextScore } =
    useRealertView(proposal);
  return (
        <div className="pd-card rc-alert">
          <div className="rc-alert-head">
            <Icon name="warning" size={15} />
            <span>{t("일정 대안 확인")}</span>
          </div>
          <div className="rc-swap">
            <div className="rc-swap-col">
              <div className="rc-swap-when">{t("기존")}</div>
              <div className="rc-swap-what">{previous}</div>
              <GradeChip score={previousScore} />
              <p className="pd-note">{conditionScoreText(previousConditions.data)} {previousConditions.error}</p>
            </div>
            <span aria-hidden="true">→</span>
            <div className="rc-swap-col">
              <div className="rc-swap-when">{t("대안")}</div>
              <div className="rc-swap-what">
                {proposal?.recommendations
                  .map((item) => item.name)
                  .join(" · ") || t("새 후보 없음")}
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
            <button type="button" className="pd-secondary" onClick={onBack} disabled={busy}>
              {t("그대로 두기")}</button>
            <button
              type="button"
              className="pd-primary"
              onClick={onApply}
              disabled={busy || !proposal?.recommendations.length}
            >
              {t("대안으로 바꾸기")}</button>
          </div>
        </div>
  );
}

// ── 화면 ───────────────────────────────────────────────────

function RecommendScreen() {
  const { locale } = useTravelLanguage();
  const session = useTravelSession();
  const regions = useResource<RegionCatalog>("regions");
  const [selectedRegion, setSelectedRegion] = useTravelRegionSelection();
  const region = selectedRegion ?? session.plan?.request.region ?? session.recommendation?.request.region ?? DEFAULT_PROVINCE;
  // 취향 흐름(시작 → 취향 → 후보)은 **한 화면에 쌓입니다**. 대화와 재추천만
  // 화면을 갈아 끼웁니다 -- 그 둘은 취향을 고르는 자리가 아니라 다른 일입니다.
  const [mode, setMode] = useState<Mode>("flow");
  const [courseOpen, setCourseOpen] = useState(() =>
    Boolean(
      session.plan ||
        new URLSearchParams(window.location.hash.split("?")[1]).has("plan_id"),
    ),
  );
  const [tags, setTags] = useState<string[] | null>(null);
  // 고를 수 있는 것은 서버가 정합니다. 프런트는 그 id 를 그대로 들고 다니고,
  // 라벨은 표시할 때만 씁니다 -- 예전에는 라벨이 곧 값이라, 서버에 없는
  // 이름(「SUP」·「바다 뷰 카페」)을 골라도 서버가 할 수 있는 일이 없었습니다.
  const {
    catalogue: keywordOptions,
    groups,
    optionIndex,
    labelOf,
    savedIds,
    preference,
    profileError,
    savePreference: saveTaste,
  } = useTastePreference();
  const cards = groups.find((group) => group.id === CARD_CATEGORY)?.options ?? [];
  const picked = tags ?? savedIds;
  // 저장된 취향 그대로입니다. 저장이 끝나면 useTastePreference 가 조회 기억을
  // 버리고 다시 읽으므로(forgetResource), 방금 저장한 것을 따로 들고 있을
  // 필요가 없습니다 -- 예전에는 여기 `justSaved` 그림자 상태가 있었습니다.
  const savedTastes = savedIds.map(labelOf);
  // 취향 수집에서 열린 데까지. null 은 아직 시작 전입니다.
  const [revealed, setRevealed] = useState<TasteReveal>(null);
  // 카테고리 수 + 활동 카드 + 요약.
  const tasteTotal = groups.length + 2;
  const tasteStepNo = Math.min((revealed ?? 0) + 1, tasteTotal);
  const [cardIndex, setCardIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const lastSignalledCard = useRef<string | null>(null);
  const [signalError, setSignalError] = useState("");
  useEffect(() => {
    lastSignalledCard.current = null;
  }, [cardIndex, revealed]);
  const [preferenceSaved, setPreferenceSaved] = useState(false);
  const selectedIds = [...new Set([...picked, ...liked])];
  const selectionCount = (categoryId: string) => selectedIds.filter((id) =>
    optionIndex.get(id)?.category === categoryId,
  ).length;
  const canPick = (id: string) => {
    if (selectedIds.includes(id)) return true;
    const group = groups.find((group) => group.id === optionIndex.get(id)?.category);
    return Boolean(group && selectionCount(group.id) < group.max_selections);
  };
  const overLimit = groups.find((group) =>
    selectionCount(group.id) > group.max_selections,
  );
  const selectionIssue = overLimit
    ? t("{label}은 최대 {count}개까지 고를 수 있습니다. 선택한 항목을 눌러 줄여 주세요.", { label: t(overLimit.label), count: overLimit.max_selections })
    : "";
  const removePick = (id: string) => {
    setTags(picked.filter((value) => value !== id));
    setLiked((current) => current.filter((value) => value !== id));
    setPreferenceSaved(false);
  };
  const togglePick = (id: string) => {
    if (selectedIds.includes(id)) removePick(id);
    else if (canPick(id)) {
      setTags([...picked, id]);
      setPreferenceSaved(false);
    }
  };
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
  // The form's own state only. Wishes the user speaks (companion, transport,
  // activity, dates) are extracted from the actual message by the server, not
  // guessed here from a fixed button label.
  const requestFor = (index = dayIndex): TravelRequest => {
    // 고른 것은 서버가 발행한 키워드 id 입니다. 카테고리별로 묶어 그대로
    // 보냅니다 -- 프런트가 라벨을 조건으로 번역하지 않습니다. 예전에는 「파도
    // 적은 곳」이라는 라벨을 보고 화면이 weather/small_waves 를 끼워 넣고,
    // 「카페」·「캠핑」이라는 라벨을 보고 place_role 을 바꿨습니다. 그 라벨들은
    // 서버 카탈로그에 없는 이름이었습니다.
    const chosenIds = selectedIds;
    // 상한도 서버 카탈로그의 max_selections 입니다. 숫자를 여기서 만들지
    // 않고, 넘치면 말없이 버리지 않고 던집니다(travelApi.keywordSelection).
    const keyword_selection = keywordSelection(
      chosenIds,
      (id) => optionIndex.get(id)?.category,
      groups,
    );
    const chosen = keyword_selection.find(
      (selection) => selection.category === CARD_CATEGORY,
    )?.values as Activity[] | undefined;
    return requestInLanguage({
      dates: [days[index].id],
      region,
      place_role: "visit",
      // 저장된 취향과 화면 표기가 같은 이름을 쓰도록 라벨로 싣습니다. 조건은
      // keyword_selection 이 전합니다(서버가 옵션의 tag 를 스스로 붙입니다).
      preferred_tags: [...new Set(chosenIds.map(labelOf))],
      activity: chosen?.[0] ?? "relax",
      keyword_selection,
      transport: "driving",
      day_trip: true,
    }, locale);
  };
  const { bubbles, draft, setDraft, publish, send, requestRoute, reset, lastTrace, chatRequest, changeRegion } =
    useTravelConcierge({
      opener: OPENER,
      baseRequest: () => requestFor(dayIndex),
      action,
    });
  const currentRegion = (mode === "realert" ? proposal?.request.region
    : mode === "chat" ? chatRequest?.region
    : courseOpen ? session.plan?.request.region ?? session.recommendation?.request.region
    : undefined) ?? region;
  const regionTitle = travelRegionLabel(
    mode === "flow" && !courseOpen ? region : currentRegion,
    regions.data,
  );
  const onRegion = (next: string) => {
    setSelectedRegion(next);
    changeRegion(next);
  };
  const recommend = (index = dayIndex, savePreference = false) => {
    const reading = courseOpen;
    // 후보 자리는 **조회를 시작할 때** 엽니다. 취향 블록을 밀어내지 않고 그
    // 아래에 붙으므로, 조회 중에는 그 자리에 스켈레톤이 섭니다 -- 응답이 온
    // 뒤에 열면 누른 다음 한참 아무 일도 없는 것처럼 보입니다.
    setMode("flow");
    setCourseOpen(true);
    return void action.run(async (signal) => {
      const baseRequest =
        reading
          ? (session.plan?.request ?? session.recommendation?.request)
          : null;
      const request = requestInLanguage(baseRequest
        ? { ...baseRequest, dates: [days[index].id], day_trip: true }
        : requestFor(index), locale);
      if (savePreference) {
        await saveTaste(request.preferred_tags, signal);
        if (signal.aborted) return;
        setPreferenceSaved(true);
      }
      const result = await travelJson<RecommendationResult>(
        import.meta.env.BASE_URL,
        "travel/recommendations",
        "POST",
        {
          request,
          preference: {
            ...(preference ?? {}),
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
    });
  };
  const advanceCard = (like: boolean) => {
    const card = cards[cardIndex];
    if (!card || lastSignalledCard.current === card.id || (like && !canPick(card.id))) return;
    lastSignalledCard.current = card.id;
    // Local choices advance immediately. Recording a card reaction must not lock
    // navigation or the separate preference / recommendation / route actions.
    if (like) {
      setLiked((current) => [...new Set([...current, card.id])]);
      if (!selectedIds.includes(card.id)) setPreferenceSaved(false);
    }
    // 마지막 카드까지 보면 요약 덩어리가 아래에 열립니다.
    if (cardIndex + 1 >= cards.length) setRevealed(groups.length + 1);
    else setCardIndex(cardIndex + 1);
    void travelJson(
      import.meta.env.BASE_URL,
      "travel/signals",
      "POST",
      { kind: "card", action: like ? "like" : "skip", tags: [card.label] },
    ).catch(() => {
      setSignalError("카드 반응을 서버에 기록하지 못했습니다. 선택은 유지되며 계속 고를 수 있습니다.");
    });
  };
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
  const refresh = () =>
    void action.run(async (signal) => {
      const result = await travelJson<RecommendationResult>(
        import.meta.env.BASE_URL,
        "travel/recommendations",
        "POST",
        {
          request: requestInLanguage(
            session.plan?.request ??
            session.recommendation?.request ??
            requestFor(), locale),
          limit: 5,
        },
        signal,
      );
      if (!signal.aborted) {
        setProposal(result);
        setMode("realert");
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
      if (!signal.aborted) {
        setMode("flow");
        setCourseOpen(true);
      }
    });
  const goEntry = () => {
    if (action.busy) return;
    setSelectedRegion(currentRegion);
    window.history.replaceState(null, "", "#recommend");
    setMode("flow");
    setCourseOpen(false);
    restartTaste();
    reset();
  };
  /** 완전 초기화. 「추천 처음으로」는 지금 고른 취향과 조회한 후보를 그대로
   *  둔 채 화면만 앞으로 돌립니다. 이 함수는 그와 달리 지역·태그·후보·경로·
   *  저장 알림을 전부 비우고 맨 처음 화면으로 돌아갑니다. */
  const resetAll = () => {
    if (action.busy) return;
    setTravelSession({ recommendation: null, plan: null, planInput: null, route: null });
    setSelectedRegion(DEFAULT_PROVINCE);
    setTags([]);
    setProposal(null);
    setAltOpen(false);
    setDayIndex(0);
    window.history.replaceState(null, "", "#recommend");
    setMode("flow");
    setCourseOpen(false);
    restartTaste();
    reset();
  };
  /** 취향 수집을 첫 덩어리부터 다시. 카드 진행과 좋아요도 함께 되돌립니다 --
   *  「다시 고르기」가 태그만 되돌리고 카드는 끝난 채로 두면, 아무 카드도 없는
   *  요약만 남습니다. */
  const restartTaste = () => {
    setRevealed(null);
    setCardIndex(0);
    setLiked([]);
    lastSignalledCard.current = null;
    setSignalError("");
    setPreferenceSaved(false);
  };
  /** 다음 덩어리를 엽니다. 앞의 덩어리는 화면에 그대로 남습니다. */
  const nextTaste = () =>
    setRevealed((current) => Math.min((current ?? 0) + 1, groups.length + 1));
  const status =
    action.error ||
    requestedPlan.error ||
    (action.busy
      ? t("서버에 요청 중입니다…")
      : session.plan
        ? t("서버 저장 확인 · {status}", { status: dataStatusText(session.plan.status) })
        : (session.recommendation?.clarification ??
          dataStatusText(session.recommendation?.status)));
  const tasteOpen = revealed !== null;
  const tasteLabel =
    revealed === null
      ? t("태그")
      : revealed < groups.length
        ? t(groups[revealed]?.label ?? "태그")
        : revealed === groups.length
          ? t("활동 카드")
          : t("요약");
  const tasteTitle =
    revealed === null
      ? t("뭘 하고 싶으세요?")
      : revealed < groups.length
        ? (groups[revealed]
            ? t("{label}을(를) 골라 주세요", { label: t(groups[revealed].label) })
            : t("뭘 하고 싶으세요?"))
        : revealed === groups.length
          ? t("이건 어떠세요?")
          : t("이렇게 정리했어요");
  // 후보 결과가 화면에 붙는 순간 그리로 데려다줍니다. 쌓이는 화면에서는 새
  // 내용이 접힌 화면 **아래**에 붙으므로, 데려다주지 않으면 버튼을 눌러도
  // 아무 일이 없어 보입니다.
  const courseRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (courseOpen && mode === "flow")
      courseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [courseOpen, mode]);
  // 히어로는 **지금 열린 마지막 자리**가 말합니다. 셸은 하나뿐이라 화면을
  // 갈아 끼우지 않고도 머리말만 바뀝니다.
  const hero =
    mode === "chat" ? (
      <ChatHero
        regionTitle={regionTitle}
        asked={bubbles.filter((bubble) => bubble.role === "user").length}
        onBack={goEntry}
        busy={action.busy}
      />
    ) : mode === "realert" ? (
      <RealertHero
        regionTitle={regionTitle}
        proposal={proposal}
        onBack={() => setMode("flow")}
        busy={action.busy}
      />
    ) : courseOpen ? (
      <CourseHero
        regionTitle={regionTitle}
        dayIndex={dayIndex}
        setDayIndex={(index) => recommend(index)}
        onBack={goEntry}
        busy={action.busy}
      />
    ) : tasteOpen ? (
      <TasteHero
        stepNo={tasteStepNo}
        stepTotal={tasteTotal}
        label={tasteLabel}
        title={tasteTitle}
        onBack={goEntry}
        busy={action.busy}
      />
    ) : (
      <EntryHero
        regionTitle={regionTitle}
        savedTastes={savedTastes}
        onChat={() => setMode("chat")}
      />
    );
  return (
    // 셸은 히어로를 본문 **밖에** 그립니다. 히어로 규칙의 뿌리는 그래서
    // 본문(.recommend-page)이 아니라 이 겹입니다 -- 같은 클래스를 두 군데
    // 붙이면 「이 화면」을 가리키는 이름이 둘이 됩니다.
    <AppShell
      tab="recommend"
      hero={<div className="rc-hero-slot">{hero}</div>}
    >
      <article className="recommend-page" aria-busy={action.busy}>
          <div className="rc-stack">
            <button
              type="button"
              className="pd-secondary"
              onClick={resetAll}
              disabled={action.busy}
            >
              {t("초기화")}</button>
          </div>
          {mode === "flow" && (
            <>
              <EntryBody
                region={region}
                onRegion={onRegion}
                shortcuts={cards.slice(0, 3)}
                picked={selectedIds}
                canPick={canPick}
                togglePick={togglePick}
                onChat={() => setMode("chat")}
                onTags={() => setRevealed(0)}
                tasteOpen={tasteOpen}
              />
              {tasteOpen && (
                <TasteBlocks
                  region={region}
                  onRegion={onRegion}
                  revealed={revealed}
                  catalogue={keywordOptions}
                  groups={groups}
                  cards={cards}
                  picked={picked}
                  selectedIds={selectedIds}
                  canPick={canPick}
                  selectionIssue={selectionIssue}
                  labelOf={labelOf}
                  togglePick={togglePick}
                  removePick={removePick}
                  cardIndex={cardIndex}
                  liked={liked}
                  onNext={nextTaste}
                  onRestart={restartTaste}
                  onLike={() => advanceCard(true)}
                  onPass={() => advanceCard(false)}
                  onDone={() => recommend(dayIndex, true)}
                  preferenceSaved={preferenceSaved}
                  busy={action.busy}
                  signalError={t(signalError)}
                />
              )}
              {courseOpen &&
                (!planId || (!requestedPlan.loading && !requestedPlan.error)) && (
                  <div className="rc-course-anchor" ref={courseRef}>
                    <CourseBody
                      dayIndex={dayIndex}
                      setDayIndex={(index) => recommend(index)}
                      saved={Boolean(session.plan?.plan_id)}
                      onSave={save}
                      altOpen={altOpen}
                      setAltOpen={setAltOpen}
                      onRealert={refresh}
                      onRoute={requestRoute}
                      busy={action.busy}
                      statusText={status}
                      loadingCandidates={action.busy}
                    />
                  </div>
                )}
            </>
          )}
          {mode === "chat" && (
            <ChatBody
              region={currentRegion}
              onRegion={onRegion}
              bubbles={bubbles}
              draft={draft}
              setDraft={setDraft}
              busy={action.busy}
              lastTrace={lastTrace}
              onSend={send}
              onRoute={requestRoute}
              onReset={() => { setSelectedRegion(currentRegion); reset(); }}
            />
          )}
          {mode === "realert" && (
            <RealertBody
              proposal={proposal}
              onApply={apply}
              onBack={() => setMode("flow")}
              busy={action.busy}
            />
          )}
        {(action.error ||
          action.busy ||
          requestedPlan.loading ||
          requestedPlan.error ||
          (mode === "flow" && !tasteOpen && profileError)) && (
          <p
            className={"rc-status" + (action.error ? " is-error" : "")}
            role={action.error ? "alert" : "status"}
          >
            {status ||
              (requestedPlan.loading
                ? t("저장 상세를 불러오는 중입니다.")
                : profileError)}
          </p>
        )}
      </article>
    </AppShell>
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
