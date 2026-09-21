import { t } from "./i18n.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import {
  DesktopHero,
  DesktopNav,
  DesktopShell,
  FootNote,
  LabelRow,
  SplitBody,
} from "./pongdangDesktop";
import { GradeChip, Icon, Skeleton, StateChip } from "./pongdangUi";
import { PlacePhoto } from "./PlacePhoto";
import type { PlacePhoto as Photo } from "./placePhotos";
import { usePlacePhotos } from "./usePlacePhotos";
import { AiSuggestion } from "./pongdangUi";
import {
  conditionPath,
  conditionScore,
  conditionTargetInRange,
  dataStatusText,
  dateLabel,
  kstDate,
  placeRegionLabel,
  timeLabel,
  type Conditions,
} from "./productData";
import type { Activity } from "./aiApi";
import { useAction } from "./useAction";
import { isInitialLoad, useResource } from "./useResource";
import {
  kakaoRouteLink,
  routePaths,
  planItems,
  routeReasonsText,
  travelJson,
  travelActivityLabel,
  type RecommendationResult,
  type TravelRequest,
  type TripPlan,
} from "./travelApi";
import { setTravelSession, useTravelSession } from "./travelSession";
import { RouteCandidatesForm } from "./RouteCandidatesForm";
import { useRouteFormSources, useTravelConcierge } from "./useTravelConcierge";
import { useTastePreference } from "./useTastePreference";
import { ModelTraceButton, ModelTraceDialog } from "./ModelTraceDialog";
import { requestInLanguage, useTravelLanguage } from "./travelLanguage";
import { TravelRegionSelector } from "./TravelRegionSelector";
import { travelRegionLabel, useTravelRegionSelection } from "./travelRegion";
import { DEFAULT_PROVINCE, type RegionCatalog } from "./waterPlaceApi";
import "./recommendDesktop.css";

// 데스크탑 추천입니다. 모바일과 같은 단계(취향 → 대화 → 코스)를 씁니다.
//
// 예전에는 이 화면이 네 단계를 **한 페이지에 전부 세로로 나열**했습니다. 아직
// 아무것도 고르지 않은 사람에게 앞으로 할 일을 한꺼번에 펼쳐 놓고, 후보·지도
// 자리는 「아직 후보가 없습니다」만 적힌 채 화면을 차지했습니다. 이제 한 번에
// 한 단계만 그리고, 취향을 이미 저장한 사람에게는 그 취향을 히어로에서 바로
// 말하고 대화로 이어 갈 수 있게 합니다.
//
// 모바일과 같은 서버 계약을 씁니다. 취향은 서버 키워드 카탈로그에서 읽고,
// 대화와 경로 계산은 useTravelConcierge 가 담당합니다. 값이 없으면 «–» 이며
// 0 이나 안전을 뜻하지 않습니다.

/** 화면에 한 번에 뜨는 단계. `entry` 는 저장된 취향이 있을 때만 씁니다. */
type Step = "entry" | "taste" | "chat" | "course";

const OPENER = "어떤 물놀이를 찾으세요? 조건을 말로 적어도 됩니다.";
const FOLLOWUPS = [
  "이 후보들로 경로 짜줘",
  "아이랑 갈 만한 곳으로",
  "더 가까운 곳으로",
];

/** 후보 · 방문 순서 한 줄이 말하는 것. 번호와 이름만 있던 자리에 점수 조회
 *  대상(`spotId` · `at`)과 취향 일치(`chips`) · 대표 사진을 함께 싣습니다. */
interface RdStepRow {
  key: string;
  spotId: number;
  /** 점수를 조회할 시각. 저장 코스는 도착 시각, 후보는 그날 정오입니다. */
  at: string;
  no: number;
  name: string;
  when: string;
  chips: string[];
  link: string | null;
  photo?: Photo;
}

/** 후보 한 줄. 데스크탑에는 카드가 없으므로(pongdangDesktop.css) 괘선 행을
 *  그대로 두고 밀도만 올립니다 -- 사진 · 점수 · 취향 일치는 카드를 만들지
 *  않고도 같은 줄에서 말할 수 있는 것들입니다. */
function RdStep({
  step,
  activity,
  emptyLink,
}: {
  step: RdStepRow;
  activity: Activity;
  emptyLink: string;
}) {
  const targetValid = conditionTargetInRange(step.at);
  const conditions = useResource<Conditions>(
    targetValid ? conditionPath(step.spotId, activity, step.at) : null,
  );
  const score = conditionScore(conditions.data);
  return (
    <div className="rd-step">
      <span className="pd-dk-num rd-step-no">{step.no}</span>
      <PlacePhoto className="rd-step-photo" name={step.name} photo={step.photo} />
      <div className="rd-step-body">
        <div className="rd-step-name">{step.name}</div>
        <div className="rd-step-when">{step.when}</div>
        {step.chips.length > 0 && (
          <div className="rd-step-chips">
            {step.chips.map((chip) => (
              <span className="rd-step-chip" key={chip}>{chip}</span>
            ))}
          </div>
        )}
      </div>
      {/* 점수를 아직 모르는 동안과 값이 없는 것은 다른 사실입니다. 앞은
          스켈레톤, 뒤는 «–» 입니다(useResource.isInitialLoad). */}
      <GradeChip score={score} loading={targetValid && isInitialLoad(conditions)} />
      {step.link ? (
        <a
          className="rd-step-link"
          href={step.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("이 구간 길찾기")}</a>
      ) : (
        <span className="rd-step-link is-empty">{emptyLink}</span>
      )}
    </div>
  );
}

/** 후보를 조회하는 동안의 자리. 목록을 한 번도 보여준 적 없을 때만 씁니다. */
function RdStepSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="rd-steps" role="status" aria-label={t("후보를 조회하고 있습니다…")}>
      {Array.from({ length: count }, (_, index) => (
        <div className="rd-step is-skeleton" key={index}>
          <span className="rd-step-no">
            <Skeleton width="1.2em" label={t("후보 조회 중")} />
          </span>
          <span className="rd-step-photo rd-step-photo-empty" aria-hidden="true" />
          <div className="rd-step-body">
            <Skeleton width="9em" label={t("후보 조회 중")} />
            <Skeleton width="13em" label={t("후보 조회 중")} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecommendDesktop() {
  const { locale } = useTravelLanguage();
  const savedSession = useTravelSession();
  const regions = useResource<RegionCatalog>("regions");
  const [selectedRegion, setSelectedRegion] = useTravelRegionSelection();
  const region = selectedRegion ?? savedSession.plan?.request.region ?? savedSession.recommendation?.request.region ?? DEFAULT_PROVINCE;
  const action = useAction();
  const candidateAction = useAction({ replace: true });
  const saveAction = useAction();
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const {
    catalogue,
    groups,
    optionIndex,
    labelOf,
    savedIds,
    hasTaste,
    profileLoading,
    profileError,
    savePreference,
  } = useTastePreference();

  // 고른 것. 저장된 취향이 있으면 그것으로 채워 두고 시작합니다 -- 이미 고른
  // 것을 처음부터 다시 고르게 하지 않습니다. `null` 은 「아직 채우기 전」이고
  // 빈 객체는 「사용자가 전부 지웠다」라 서로 다른 사실입니다.
  const [picked, setPicked] = useState<Record<string, string[]> | null>(null);
  const savedKey = savedIds.join(",");
  const seeded = useMemo(() => {
    const groupedByCategory: Record<string, string[]> = {};
    for (const id of savedIds) {
      const category = optionIndex.get(id)?.category;
      if (!category) continue;
      groupedByCategory[category] = [
        ...(groupedByCategory[category] ?? []),
        id,
      ];
    }
    return groupedByCategory;
    // savedKey 로만 다시 계산합니다. optionIndex 는 매 렌더 새 Map 입니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const chosen = picked ?? seeded;
  const chosenIds = Object.values(chosen).flat();
  const selectionCount = chosenIds.length;

  // 저장된 취향 그대로입니다. 저장이 끝나면 useTastePreference 가 조회 기억을
  // 버리고 다시 읽으므로(forgetResource), 방금 저장한 것을 따로 들고 있을
  // 필요가 없습니다 -- 예전에는 여기 `justSaved` 그림자 상태가 있었습니다.
  const savedLabels = savedIds.map(labelOf);
  const tasteKnown = savedLabels.length > 0 || hasTaste;

  const baseRequest = (): TravelRequest => requestInLanguage({
    dates: [kstDate()],
    region,
    place_role: "visit",
    // 저장된 취향과 화면 표기가 같은 이름을 쓰도록 라벨로 싣습니다. 조건은
    // keyword_selection 이 전합니다(서버가 옵션의 tag 를 스스로 붙입니다).
    preferred_tags: [...new Set(chosenIds.map(labelOf))],
    activity: "relax",
    transport: "driving",
    day_trip: true,
    keyword_selection: Object.entries(chosen)
      .filter(([, values]) => values.length)
      .map(([category, values]) => ({ category, values })),
  }, locale);

  const { session, bubbles, asked, draft, setDraft, publish, send: sendChat, requestRoute, lastTrace, chatRequest, changeRegion, reset } =
    useTravelConcierge({ opener: OPENER, baseRequest, action });
  const [traceOpen, setTraceOpen] = useState(false);
  const recommendation = session.recommendation;
  const calculated = session.route?.route;
  const items = calculated?.items ?? [];
  // 저장된 코스를 열면 후보 목록(recommendation)은 없고 정차지만 있습니다.
  // 그것도 보여 줄 코스이므로 같은 자리에 그립니다 -- 예전에는 이 화면이
  // recommendation 하나만 보고 그려서, 저장한 코스를 열면 빈 화면이었습니다.
  const savedStops = recommendation ? [] : planItems(session.plan);

  // 저장한 코스 열기. 내 코스 화면이 만드는 `#recommend?plan_id=…` 링크는
  // 모바일 폭에서만 열렸습니다 -- 이 화면이 plan_id 를 읽지 않았기 때문입니다.
  const planId = new URLSearchParams(window.location.hash.split("?")[1]).get(
    "plan_id",
  );

  // 어느 단계부터 보여 줄지는 **저장된 취향을 읽고 나서** 정합니다. 조회가 끝나기
  // 전에 「취향 없음」으로 단정하면 이미 고른 사람에게도 취향 고르기가 한 번
  // 번쩍이고 지나갑니다. 그동안은 null 이며 화면은 조회 중이라고 적습니다.
  //
  // 사용자가 단계를 옮긴 뒤에는 그 선택이 이깁니다. 옮기기 전까지는 조회 결과에
  // 따라 저절로 정해지므로 상태로 붙들어 두지 않습니다.
  const [moved, setMoved] = useState<Step | null>(null);
  const step: Step | null =
    moved ??
    (planId || session.plan
      ? "course"
      : profileLoading
        ? null
        : tasteKnown
          ? "entry"
          : "taste");
  const setStep = setMoved;

  /** 취향에서 **열린 데까지**. 카테고리 하나씩 열리고, 마지막(groups.length)은
   *  요약입니다. 예전에는 이 값이 「지금 보이는 화면」이라 다음을 누르면 앞에서
   *  고른 것이 사라졌습니다. 지금은 열린 것이 전부 아래로 쌓입니다. */
  const [tasteIndex, setTasteIndex] = useState(0);
  const tasteTotal = groups.length + 1;
  const tasteGroup = groups[tasteIndex];
  /** 취향을 고르고 후보로 넘어왔는가. 후보 아래에 취향 덩어리를 그대로 남겨
   *  두기 위한 값입니다 -- 저장된 취향으로 바로 찾은 경우와 다른 사실입니다. */
  const [tasteVisited, setTasteVisited] = useState(false);

  const clearSavedNotice = () => {
    saveAction.cancel();
    setSavedPlanId(null);
    if (window.location.hash.includes("plan_id="))
      window.history.replaceState(null, "", "#recommend");
  };
  const send = (text: string) => {
    if (!text.trim()) return;
    candidateAction.cancel();
    clearSavedNotice();
    sendChat(text);
  };
  const requestList = () => {
    const previousRequest = step === "chat" ? chatRequest
      : step === "course" ? session.plan?.request ?? recommendation?.request : null;
    const request = requestInLanguage(previousRequest ?? baseRequest(), locale);
    action.cancel();
    clearSavedNotice();
    setTravelSession({ recommendation: null, plan: null, planInput: null, route: null });
    setStep("course");
    void candidateAction.run(async (signal) => {
      const result = await travelJson<RecommendationResult>(
        import.meta.env.BASE_URL,
        "travel/recommendations",
        "POST",
        { request, limit: 5 },
        signal,
      );
      if (signal.aborted) return;
      publish(result);
    });
  };

  // 취향 확정. 예전에는 이 화면이 고른 조건을 **이번 요청에만** 쓰고 버렸고,
  // 저장은 모바일 추천에만 있었습니다. 같은 계약(GET → PUT expected_revision)
  // 으로 여기서도 저장합니다.
  const saveAndFind = () => {
    // 후보 자리는 **조회를 시작할 때** 엽니다. 취향 덩어리를 밀어내지 않고 그
    // 아래에 붙으므로, 조회 중에는 그 자리에 스켈레톤이 섭니다 -- 응답이 온
    // 뒤에 열면 누른 다음 한참 아무 일도 없는 것처럼 보입니다. 앞선 후보는
    // 이 조건의 답이 아니므로 requestList 와 같이 비웁니다.
    setTravelSession({ recommendation: null, plan: null, planInput: null, route: null });
    setTasteVisited(true);
    setStep("course");
    return void candidateAction.run(async (signal) => {
      const request = baseRequest();
      await savePreference(request.preferred_tags, signal);
      if (signal.aborted) return;
      const result = await travelJson<RecommendationResult>(
        import.meta.env.BASE_URL,
        "travel/recommendations",
        "POST",
        { request, limit: 5 },
        signal,
      );
      if (signal.aborted) return;
      publish(result);
    });
  };

  // 코스 저장. 예전에는 이 화면에 저장 경로가 없어서, 데스크탑 사용자는 코스를
  // 만들 수는 있어도 내 코스에 남길 수 없었습니다 -- 그러면서 데스크탑 내
  // 코스 화면은 「추천에서 코스 만들기 →」로 여기 보냈습니다. 닫힌 고리였습니다.
  // 모바일 추천과 같은 계약(POST travel/plans)이며, 저장 뒤 해시에 plan_id 를
  // 남겨 새로고침·공유에도 같은 코스가 열립니다.
  const save = () =>
    void saveAction.run(async (signal) => {
      setSavedPlanId(null);
      if (!session.planInput) throw new Error("저장할 코스가 없습니다.");
      const plan = await travelJson<TripPlan>(
        import.meta.env.BASE_URL,
        "travel/plans",
        "POST",
        session.planInput,
        signal,
      );
      if (!signal.aborted) {
        window.history.replaceState(null, "", `#recommend?plan_id=${plan.plan_id}`);
        setTravelSession({ plan });
        setSavedPlanId(plan.plan_id);
      }
    });

  const requestedPlan = useResource<TripPlan>(
    planId && /^(?:[a-f0-9]{32}|[a-f0-9-]{36})$/i.test(planId)
      ? `travel/plans/${planId}`
      : null,
  );
  // 방금 저장한 코스는 다시 싣지 않습니다. 저장이 해시에 plan_id 를 남기므로
  // 이 조회가 곧장 따라 도는데, 그때 recommendation 을 비우면 **화면에 떠 있던
  // 후보 목록이 저장하자마자 사라집니다**. 다른 코스를 여는 경우에만 갈아
  // 끼웁니다.
  const loadedPlanId = session.plan?.plan_id;
  useEffect(() => {
    const plan = requestedPlan.data;
    if (!plan || plan.plan_id === loadedPlanId) return;
    setTravelSession({
      plan,
      planInput: { request: plan.request, stops: plan.input_stops },
      recommendation: null,
      route: null,
    });
  }, [requestedPlan.data, loadedPlanId]);

  const { candidates, originOptions } = useRouteFormSources();

  // 후보 · 방문 순서 한 벌. 예전에는 이 목록이 JSX 안에서 만들어져 번호와
  // 이름 두 줄이 전부였습니다. 점수 · 사진 · 취향 일치는 **같은 응답에 이미 있던
  // 사실**인데 화면이 버리고 있었습니다.
  const stepActivity = session.plan?.request.activity ?? recommendation?.request.activity ?? "relax";
  const stepAt =
    (session.plan?.request.dates[0] ?? recommendation?.request.dates[0] ?? kstDate()) +
    "T12:00:00+09:00";
  const stepBase: RdStepRow[] = calculated
    ? items.map((item, index) => ({
        key: `${item.spot_id}:${index}`,
        spotId: item.spot_id,
        at: item.arrival_at ?? stepAt,
        no: index + 1,
        name: item.name,
        when: t("{arrival} 도착 · {departure} 출발 · {minutes}", { arrival: timeLabel(item.arrival_at), departure: timeLabel(item.departure_at), minutes: calculated.legs[index] ? t("{minutes}분 이동", { minutes: calculated.legs[index].duration_minutes }) : t("이동시간 –") }),
        chips: [],
        link: kakaoRouteLink(index === 0 ? calculated.origin : items[index - 1], [item]),
      }))
    : recommendation
      ? recommendation.recommendations.map((item) => ({
          key: String(item.spot_id),
          spotId: item.spot_id,
          at: stepAt,
          no: item.rank,
          name: item.name,
          when: t("{region} · {activities}", { region: placeRegionLabel(item), activities: item.activities.map((activity) => travelActivityLabel(activity.activity, activity.label)).join(" · ") || t("활동 미확인") }),
          chips: item.matched_preferences.map((preference) => t(preference.tag)),
          link: null,
        }))
      : // 저장된 코스의 정차지. 시각이 있으면 함께 적습니다.
        savedStops.map((stop, index) => ({
          key: `${stop.spot_id}:${index}`,
          spotId: stop.spot_id,
          at: stop.arrival_at ?? stepAt,
          no: index + 1,
          name: stop.name,
          when: stop.arrival_at
            ? t("{arrival} 도착", { arrival: timeLabel(stop.arrival_at) })
            : t("시각 미정"),
          chips: [t("저장 일정")],
          link: null,
        }));
  // 사진은 목록 하나로 한 번에 읽습니다(usePlacePhotos).
  const stepPhotos = usePlacePhotos(stepBase.map((row) => ({ ...row, id: row.spotId })));
  const stepRows: RdStepRow[] = stepPhotos.rows ?? stepBase;

  // 마커·경로선은 좌표가 있는 실제 장소만 씁니다. 경로가 계산되면 방문 순서를,
  // 아직이면 후보 순서를 번호로 붙입니다. 지도는 이 배열의 동일성으로 다시
  // 만들어지므로, 세션이 바뀔 때만 새로 계산합니다.
  const { ordered, markers } = useMemo(() => {
    const route = session.route?.route;
    const places = route
      ? route.items.map((item) => ({
          id: item.spot_id,
          name: item.name,
          lat: item.latitude,
          lng: item.longitude,
        }))
      : (session.recommendation?.recommendations ?? []).map((item) => ({
          id: item.spot_id,
          name: item.name,
          lat: item.confirmed.latitude,
          lng: item.confirmed.longitude,
        }));
    const start = route?.origin;
    return {
      ordered: places,
      markers: [
        ...(start && start.latitude !== null && start.longitude !== null
          ? [
              {
                id: "origin",
                latitude: start.latitude,
                longitude: start.longitude,
              },
            ]
          : []),
        ...places
          .filter((place) => place.lat !== null && place.lng !== null)
          .map((place) => ({
            id: String(place.id),
            latitude: place.lat!,
            longitude: place.lng!,
          })),
      ],
    };
  }, [session.route, session.recommendation]);
  const paths = useMemo(() => routePaths(session.route), [session.route]);
  const unmappable = ordered.filter(
    (place) => place.lat === null || place.lng === null,
  ).length;
  const wholeTrip = calculated
    ? kakaoRouteLink(calculated.origin, calculated.items)
    : null;

  const currentRegion = (step === "chat" ? chatRequest?.region
    : step === "course" ? session.plan?.request.region ?? recommendation?.request.region : undefined) ?? region;
  const context = t("{region} · {date} · 취향 {count}개 선택", { region: travelRegionLabel(currentRegion, regions.data), date: dateLabel(), count: selectionCount || savedLabels.length });
  const listHeadline = candidateAction.busy ? t("후보 조회 중")
    : candidateAction.error ? t("후보 조회 실패")
    : recommendation ? t("후보 {count}곳", { count: recommendation.recommendations.length }) : t("후보 조회 전");
  const error = candidateAction.error || action.error || saveAction.error || requestedPlan.error;
  const mutationBusy = action.busy || candidateAction.busy || saveAction.busy;

  /** 고른 취향을 지금 화면 밖에서도 말할 수 있는가. 취향 고르는 중에는
   *  본문이 이미 그 내용이므로 히어로에서 되풀이하지 않습니다. */
  const showSavedTaste = tasteKnown && step !== "taste" && step !== null;

  const startOver = () => {
    action.cancel();
    candidateAction.cancel();
    clearSavedNotice();
    setSelectedRegion(currentRegion);
    reset();
    setTasteIndex(0);
    setTasteVisited(false);
    setStep("taste");
  };

  // 완전 초기화. 「취향 바꾸기」는 지금 고른 취향을 그대로 두고 다시 고치는
  // 자리로 이어 갑니다. 이 함수는 그와 달리 지역·취향·후보·경로·저장 알림을
  // 전부 비우고 맨 처음 화면으로 돌아갑니다.
  const resetAll = () => {
    action.cancel();
    candidateAction.cancel();
    clearSavedNotice();
    setTravelSession({ recommendation: null, plan: null, planInput: null, route: null });
    setSelectedRegion(DEFAULT_PROVINCE);
    setPicked({});
    reset();
    setTasteIndex(0);
    setTasteVisited(false);
    setStep("taste");
  };
  // 흐름은 아래로 쌓입니다. 대화만 그 자리를 대신 차지합니다 -- 취향을 고르는
  // 자리가 아니라 다른 일이기 때문입니다.
  const inFlow = step !== null && step !== "chat";
  const showEntry = inFlow && tasteKnown;
  const showTaste = inFlow && (step === "taste" || tasteVisited);
  const showCourse = inFlow && step === "course";
  // 새로 열린 덩어리로 데려다줍니다. 쌓이는 화면에서는 새 내용이 화면 **아래**에
  // 붙으므로, 데려다주지 않으면 눌러도 아무 일이 없어 보입니다.
  const openedRef = useRef<HTMLDivElement | null>(null);
  const courseRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (showTaste && !showCourse)
      openedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tasteIndex, showTaste, showCourse]);
  useEffect(() => {
    if (showCourse)
      courseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showCourse]);
  const onRegion = (next: string) => {
    clearSavedNotice();
    setSelectedRegion(next);
    changeRegion(next);
  };

  return (
    <DesktopShell>
      {/* 추천은 「찾는」 화면이라 탐색 포즈(snorkel)를 표지로 씁니다 --
          코스 저장(towel) · 장소 목록(bucket)과 겹치지 않습니다. */}
      <DesktopHero
        nav={<DesktopNav active="recommend" context={context} />}
        mascot="snorkel"
      >
        <div className="rd-hero">
          <div className="rd-hero-lead">
            {showSavedTaste ? (
              <>
                <div className="pd-dk-kick rd-hero-kick">
                  {t("내 취향 · {count}개", { count: savedLabels.length })}
                </div>
                <h1 className="rd-hero-title">
                  {t("저장한 취향으로")}<br />
                  {t("바로 찾아 드립니다")}</h1>
                <div className="rd-hero-tastes">
                  {savedLabels.map((label) => (
                    <span className="rd-hero-taste" key={label}>
                      {t(label)}
                    </span>
                  ))}
                </div>
                <div className="rd-hero-actions">
                  {step !== "chat" && (
                    <button
                      type="button"
                      className="pd-dk-button rd-hero-ai"
                      onClick={() => setStep("chat")}
                    >
                      {t("AI에게 이어서 물어보기 →")}</button>
                  )}
                  <button
                    type="button"
                    className="pd-dk-button is-quiet rd-hero-edit"
                    onClick={startOver}
                  >
                    {t("취향 바꾸기")}</button>
                </div>
              </>
            ) : (
              <>
                <div className="pd-dk-kick rd-hero-kick">
                  {step === "taste"
                    ? t("취향 고르기 · {current} / {total}", { current: Math.min(tasteIndex + 1, tasteTotal), total: tasteTotal })
                    : t("취향 기반 추천")}
                </div>
                <h1 className="rd-hero-title">
                  {t("고른 조건으로")}<br />
                  {t("실제 장소를 찾습니다")}</h1>
              </>
            )}
          </div>
          <div className="rd-hero-metrics">
            <div>
              <div className="rd-metric-name">{t("후보")}</div>
              <div className="pd-dk-num rd-metric-value">
                {recommendation?.recommendations.length ?? "–"}
              </div>
            </div>
            <div>
              <div className="rd-metric-name">{t("이동 합")}</div>
              <div className="pd-dk-num rd-metric-value">
                {calculated ? t("{minutes}분", { minutes: calculated.travel_minutes }) : "–"}
              </div>
            </div>
            <div>
              <div className="rd-metric-name">{t("예상 귀가")}</div>
              <div className="pd-dk-num rd-metric-value">
                {calculated ? timeLabel(calculated.return_at) : "–"}
              </div>
            </div>
          </div>
        </div>
      </DesktopHero>

      {candidateAction.busy && (
        <div className="rd-row-foot">
          <span role="status">{t("후보를 조회하고 있습니다…")}</span>
          <button type="button" className="pd-dk-button is-quiet" onClick={candidateAction.cancel}>{t("후보 조회 취소")}</button>
        </div>
      )}

      {step === null && (
        <LabelRow kick={t("추천")} title={t("조회 중")}>
          <p className="rd-note" role="status">
            {profileError ?? t("저장된 취향을 조회하고 있습니다.")}
          </p>
        </LabelRow>
      )}

      {showEntry && (
        <LabelRow
          kick={t("시작")}
          title={
            <>
              {t("저장한 취향으로")}<br />
              {t("시작합니다")}</>
          }
        >
          <TravelRegionSelector region={region} onChange={onRegion} disabled={mutationBusy} />
          <div className="rd-tastes">
            {savedLabels.map((label) => (
              <span className="rd-taste is-on" key={label}>
                {t(label)}
                <Icon name="check" size={14} />
              </span>
            ))}
          </div>
          {/* 아래에 취향이나 후보가 이미 열려 있으면 여기서 다시 묻지 않습니다
              -- 고르는 자리와 찾는 버튼이 같은 화면에 두 벌이 됩니다. 이 행은
              그때 「저장돼 있는 취향」을 말하는 자리로만 남습니다. */}
          {!showTaste && !showCourse && (
            <div className="rd-row-foot">

              <button
                type="button"
                className="pd-dk-button is-quiet"
                onClick={() => setStep("chat")}
              >
                {t("AI 대화 이동 →")}</button>
              <button
                type="button"
                className="pd-dk-button rd-remake"
                disabled={action.busy}
                onClick={requestList}
              >
                {t("이 조건으로 후보 찾기")}</button>
            </div>
          )}
          {error && !showTaste && !showCourse && (
            <p className="rd-note" role="alert">
              {error}
            </p>
          )}
        </LabelRow>
      )}

      {showTaste && (
        <LabelRow
          kick={t("취향 {current} / {total}", { current: Math.min(tasteIndex + 1, tasteTotal), total: tasteTotal })}
          title={
            tasteGroup ? (
              t(tasteGroup.label)
            ) : (
              <>
                {t("이렇게")}<br />
                {t("정리했어요")}</>
            )
          }
          desc={
            tasteGroup
              ? t("최대 {count}개까지 고를 수 있습니다. ", { count: tasteGroup.max_selections })
              : t("고른 항목을 취향으로 저장하고 실제 장소를 조회합니다. 선택은 서버 키워드로 그대로 전달되며, 프런트가 조건을 만들어 붙이지 않습니다.")
          }
        >
          {/* 진행 점. 몇 개 중 몇 번째가 열렸는지 같은 자리에서 말합니다. */}
          <div className="rd-progress" aria-hidden="true">
            {Array.from({ length: tasteTotal }, (_, index) => (
              <span key={index} className={index <= tasteIndex ? "is-on" : ""} />
            ))}
          </div>
          <TravelRegionSelector region={region} onChange={onRegion} disabled={mutationBusy} />

          {groups.length === 0 ? (
            catalogue.loading ? (
              <div className="rd-taste-group">
                <div className="rd-tastes" role="status" aria-label={t("선택 항목을 불러오는 중입니다.")}>
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <Skeleton key={index} width={index % 3 === 0 ? "5.5em" : "4em"} label={t("선택 항목 조회 중")} />
                  ))}
                </div>
              </div>
            ) : (
              <p className="rd-note" role={catalogue.error ? "alert" : "status"}>
                {catalogue.error ?? t("서버가 발행한 선택 항목이 없습니다.")}
              </p>
            )
          ) : (
            <>
              {/* 열린 카테고리는 **전부** 남습니다. 예전에는 다음을 누르면 앞에서
                  고른 것이 화면에서 사라져, 되짚으려면 뒤로 가야 했습니다. */}
              {groups.slice(0, tasteIndex + 1).map((group, index) => {
                const values = chosen[group.id] ?? [];
                const current = index === tasteIndex;
                return (
                  <div
                    className={"rd-taste-group" + (current ? "" : " is-past")}
                    key={group.id}
                    ref={current ? openedRef : undefined}
                  >
                    <div className="pd-dk-kick">
                      {t("{label} · 최대 {count}개", { label: t(group.label), count: group.max_selections })}
                    </div>
                    <div className="rd-tastes">
                      {group.options.map((option) => {
                        const on = values.includes(option.id);
                        return (
                          <button
                            type="button"
                            key={option.id}
                            className={"rd-taste" + (on ? " is-on" : "")}
                            aria-pressed={on}
                            onClick={() =>
                              setPicked((currentPicks) => {
                                // 처음 누르는 순간까지는 저장된 취향이 화면의
                                // 값이었습니다. 그것을 밑값으로 이어받지 않으면
                                // 다른 카테고리에서 고른 것이 이 클릭으로
                                // 사라집니다.
                                const previous = currentPicks ?? seeded;
                                const next = on
                                  ? values.filter((value) => value !== option.id)
                                  : [...values, option.id].slice(-group.max_selections);
                                return { ...previous, [group.id]: next };
                              })
                            }
                          >
                            {t(option.label)}
                            {on && <Icon name="check" size={14} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {!tasteGroup && (
                <div className="rd-taste-group" ref={openedRef}>
                  <div className="pd-dk-kick">{t("고른 항목 · {count}개", { count: selectionCount })}</div>
                  <div className="rd-tastes">
                    {selectionCount === 0 ? (
                      <p className="rd-note">
                        {t("고른 항목이 없습니다. 선택 없이도 후보를 찾을 수 있지만, 취향 근거 없이는 추천 이유를 적을 수 없습니다.")}</p>
                    ) : (
                      chosenIds.map((id) => (
                        <span className="rd-taste is-on" key={id}>
                          {t(labelOf(id))}
                          <Icon name="check" size={14} />
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="rd-row-foot">
            <span className="rd-note">
              {t("날짜는 오늘로 고정이며, 다른 날짜와 저장한 코스의 재알림은 모바일 추천 화면에 있습니다.")}</span>
            {/* 「이전」은 없습니다 -- 앞의 카테고리가 위에 그대로 있어 거기서
                바로 고칠 수 있습니다. */}
            {tasteGroup ? (
              <button
                type="button"
                className="pd-dk-button rd-remake"
                onClick={() => setTasteIndex(tasteIndex + 1)}
              >
                {tasteIndex + 1 === groups.length ? t("다음 · 고른 항목 확인") : t("다음")}
              </button>
            ) : (
              <button
                type="button"
                className="pd-dk-button rd-remake"
                disabled={action.busy}
                onClick={saveAndFind}
              >
                {t("취향 저장하고 후보 찾기")}</button>
            )}
          </div>
          {error && !showCourse && (
            <p className="rd-note" role="alert">
              {error}
            </p>
          )}
        </LabelRow>
      )}

      {step === "chat" && (
        <LabelRow
          kick={t("AI 대화 이동")}
          title={
            <>
              {t("조건을 말로")}<br />
              {t("덧붙일 수 있습니다")}</>
          }
          desc={t("보낸 문장은 서버가 여행 조건 변경으로 해석합니다. 답변 문장은 서버가 조회한 장소·시각으로 구성하며 모델이 장소를 만들지 않습니다.")}
        >
          <SplitBody columns="1fr 1.1fr">
            <div className="rd-ask">
              <TravelRegionSelector region={currentRegion} onChange={onRegion} disabled={mutationBusy} />
              <form
                className="rd-field"
                onSubmit={(event) => {
                  event.preventDefault();
                  send(draft);
                }}
              >
                <input
                  className="rd-field-input"
                  type="text"
                  value={draft}
                  maxLength={2000}
                  aria-label={t("컨시어지에게 보낼 내용")}
                  placeholder={t("오후엔 몸 녹일 곳까지 넣어 주세요")}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  className="pd-dk-button rd-send"
                  disabled={action.busy || !draft.trim()}
                >
                  {t("보내기")}</button>
              </form>
              <div className="rd-prompts">
                {(asked ? FOLLOWUPS : [t("물 보면서 쉬고 싶어요"), ...FOLLOWUPS]).map((prompt) => t(prompt)).map(
                  (prompt) => (
                    <button
                      type="button"
                      className={
                        "rd-prompt" + (draft === prompt ? " is-on" : "")
                      }
                      key={prompt}
                      disabled={action.busy}
                      aria-pressed={draft === prompt}
                      onClick={() => setDraft(prompt)}
                    >
                      {prompt}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="rd-answer">
              <AiSuggestion
                headline={t("대화 {count}턴 · {headline}", { count: asked, headline: listHeadline })}
                basis={
                  recommendation
                    ? t("조회 {time} KST · 상태 {status} · {preferences}", { time: timeLabel(recommendation.queried_at), status: dataStatusText(recommendation.status), preferences: recommendation.request.preferred_tags.map((tag) => t(tag)).join(" · ") || t("선택 취향 없음") })
                    : t("아직 서버 조회 결과가 없습니다. 조건을 보내면 실제 장소를 조회합니다.")
                }
              />
              <div className="rd-bubbles">
                {bubbles.map((bubble, index) => (
                  <div
                    className={
                      "rd-bubble" + (bubble.role === "user" ? " is-user" : "")
                    }
                    key={`${index}:${bubble.content.slice(0, 12)}`}
                  >
                    {bubble.content}
                  </div>
                ))}
                {action.busy && (
                  <div className="rd-bubble">{t("답변을 조회하고 있습니다…")}</div>
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
              <p className="rd-note">
                {t("AI 문장은 서버가 조회한 근거로만 만들어집니다. 안전 판단에는 쓸 수 없습니다.")}</p>
            </div>
          </SplitBody>
          <div className="rd-row-foot">
            <span className="rd-note">
              {recommendation?.clarification ??
                t("대화는 이 화면 안에서 같은 취향 조건을 그대로 이어 갑니다.")}
            </span>
            <button
              type="button"
              className="pd-dk-button is-quiet"
              onClick={startOver}
            >
              {t("← 취향 다시 고르기")}</button>
            <button type="button" className="pd-dk-button rd-remake" onClick={requestList}>
              {t("이 조건으로 후보 찾기")}</button>
            {Boolean(
              recommendation?.recommendations.length || savedStops.length,
            ) && (
              <button
                type="button"
                className="pd-dk-button rd-remake"
                onClick={() => setStep("course")}
              >
                {t("후보와 경로 보기 →")}</button>
            )}
            <button
              type="button"
              className="pd-dk-button is-quiet"
              disabled={mutationBusy}
              onClick={resetAll}
            >
              {t("초기화")}</button>
          </div>
        </LabelRow>
      )}

      {showCourse && (
        <div className="rd-course-anchor" ref={courseRef}>
          <LabelRow
            kick={t("후보와 경로")}
            title={
              calculated
                ? t("방문 {count}곳 · {minutes}분 이동", { count: items.length, minutes: calculated.travel_minutes })
                : listHeadline
            }
            chip={
              <StateChip
                kind={
                  recommendation?.recommendations.length || savedStops.length
                    ? "live"
                    : "no_data"
                }
              />
            }
          >
            {recommendation?.recommendations.length || savedStops.length ? (
              <>
                <div className="rd-steps">
                  {stepRows.map((step) => (
                    <RdStep
                      key={step.key}
                      step={step}
                      activity={stepActivity}
                      emptyLink={calculated ? t("좌표 –") : t("경로 계산 전")}
                    />
                  ))}
                </div>
                {session.route && !session.route.route_calculated && (
                  <p className="rd-note">
                    {t("경로 미계산:")}{" "}
                    {routeReasonsText(session.route.reason_codes) ||
                      t("경로 계산 조건을 확인해 주세요.")}
                  </p>
                )}
                {calculated && (
                  <p className="rd-note">
                    {session.route?.optimality ===
                    "provisional_missing_comparison_evidence"
                      ? t("일부 환경·경로 비교 자료가 없어 최적 경로로 확정하지 않은 잠정 순서입니다.")
                      : t("선택한 후보 안에서 비교한 순서이며 전체 지역의 최적 경로가 아닙니다.")}{" "}
                    {routeReasonsText(session.route?.reason_codes ?? [])}
                  </p>
                )}
                <RouteCandidatesForm
                  places={originOptions}
                  candidates={candidates}
                  defaultDate={
                    // 저장된 코스를 연 경우에는 그 코스의 날짜를 씁니다.
                    (recommendation ?? session.plan)?.request.dates[0]
                  }
                  disabled={mutationBusy}
                  submitLabel={
                    calculated ? t("조건을 바꿔 다시 계산") : t("이 후보로 경로 계산")
                  }
                  onSubmit={(value) => { clearSavedNotice(); requestRoute(value); }}
                />
                <div className="rd-row-foot">
                  <button
                    type="button"
                    className="pd-dk-button is-quiet"
                    onClick={() => setStep("chat")}
                  >
                    {t("← AI 대화 이동")}</button>
                  <button
                    type="button"
                    className="pd-dk-button"
                    disabled={mutationBusy || !session.planInput}
                    onClick={save}
                  >
                    {session.plan ? t("이 코스 다시 저장") : t("내 코스에 저장")}
                  </button>
                  <button type="button" className="pd-dk-button rd-remake" onClick={requestList}>
              {t("이 조건으로 후보 찾기")}</button>
                  {session.plan && (
                    <a className="pd-dk-button is-quiet" href="#my-courses">
                      {t("저장한 코스 보기 →")}</a>
                  )}
                  <a className="pd-dk-button is-quiet" href="#map?view=course">
                    {t("지도 탭에서 보기 →")}</a>
                  {wholeTrip && (
                    <a
                      className="pd-dk-button"
                      href={wholeTrip}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("카카오맵에서 순서대로 길찾기 →")}</a>
                  )}
                </div>
                {/* 저장 결과. 후보가 있는 동안에는 아래 빈 상태 문단이 그려지지
                    않으므로, 실패도 성공도 이 자리에서 말해야 합니다 -- 누르고 나서
                    아무 일도 없는 것처럼 보이면 안 됩니다.

                    useAction 의 error 는 없을 때 빈 문자열입니다. ?? 로 이으면
                    빈 줄이 그려지므로 || 로 잇습니다. */}
                {(error || (savedPlanId && session.plan?.plan_id === savedPlanId) || (requestedPlan.data && requestedPlan.data === session.plan)) && (
                  <p className="rd-note" role={error ? "alert" : "status"}>
                    {error || (savedPlanId && session.plan?.plan_id === savedPlanId
                      ? t("내 코스에 저장했습니다. 이 주소(plan_id)로 다시 열 수 있습니다.")
                      : t("저장된 코스를 불러왔습니다. 조건을 바꾸면 다시 저장할 수 있습니다."))}
                  </p>
                )}
              </>
            ) : (
              <>
                {/* 조회 중에는 목록이 올 자리를 잡아 둡니다. 문구 한 줄만 두면
                    눌러도 아무 일이 없는 것처럼 보였습니다. 이미 목록이 있는
                    채로 다시 조회하는 경우에는 이 갈래로 오지 않습니다.
                    아래 행은 조회 중에도 그대로 둡니다 -- 다시 누르는 길이
                    사라지면 안 됩니다. */}
                {candidateAction.busy && !error ? (
                  <RdStepSkeletons count={5} />
                ) : (
                  <p className="rd-note" role={error ? "alert" : "status"}>
                    {error ||
                      recommendation?.clarification ||
                      t("아직 후보가 없습니다. 취향을 고르거나 대화로 알려 주세요.")}
                  </p>
                )}
                <div className="rd-row-foot">
                  <span className="rd-note" />
                  <button
                    type="button"
                    className="pd-dk-button is-quiet"
                    onClick={startOver}
                  >
                    {t("← 취향 다시 고르기")}</button>
                  <button
                    type="button"
                    className="pd-dk-button rd-remake"
                    disabled={action.busy}
                    onClick={requestList}
                  >
                    {t("이 조건으로 후보 찾기")}</button>
                </div>
              </>
            )}
          </LabelRow>

          {/* 후보 조회가 실패한 동안에는 지도 자리를 그리지 않습니다. 실패한
              조회의 낡은 마커·경로를 지도에 남겨 두면 실패를 성공처럼
              보이게 합니다. */}
          {!candidateAction.error && (
            <LabelRow
              kick={t("지도")}
              title={
                calculated ? t("경로 {count}구간", { count: paths.length }) : t("후보 {count}곳", { count: markers.length })
              }
              desc={t("좌표는 등록 카탈로그 값입니다. 도로 선은 길찾기 응답을 받은 구간만 그리며, 받지 못한 구간은 직선으로 채우지 않습니다.")}
            >
              <div className="rd-map">
                {markers.length ? (
                  <KakaoMapCanvas
                    markers={markers}
                    paths={paths}
                    selectedId={null}
                    renderMarker={(id) => {
                      if (id === "origin")
                        return <span className="rd-pin is-origin">{t("출발")}</span>;
                      const index = ordered.findIndex(
                        (place) => place.id === Number(id),
                      );
                      return index === -1 ? null : (
                        <span className="pd-dk-num rd-pin">{index + 1}</span>
                      );
                    }}
                  />
                ) : (
                  <p className="rd-note">
                    {t("지도에 찍을 실제 좌표가 아직 없습니다. 후보를 먼저 조회해 주세요.")}</p>
                )}
              </div>
              <div className="rd-legend">
                {ordered.map((place, index) => (
                  <span className="rd-legend-item" key={`${place.id}:${index}`}>
                    <span className="pd-dk-num rd-legend-no">{index + 1}</span>
                    {place.name}
                  </span>
                ))}
                {unmappable > 0 && (
                  <span className="rd-note rd-legend-note">
                    {t("좌표가 없는 {count}곳은 지도에 찍지 않습니다.", { count: unmappable })}
                  </span>
                )}
                {calculated && paths.length < calculated.legs.length && (
                  <span className="rd-note rd-legend-note">
                    {t("도로 선을 받은 구간 {count}/{total}개만 그립니다.", { count: paths.length, total: calculated.legs.length })}
                  </span>
                )}
              </div>
            </LabelRow>
          )}
        </div>
      )}

      <FootNote
        missing={t("편의시설 · 대중교통 경로 · 코스 공유")}
        note={t("후보 순서는 취향 일치 기준이고, 경로 시각은 출발 기준 교통 자료의 예상값입니다. 점수 · 신뢰도 · 안전 판정은 서로 다른 값이며 하나로 요약하지 않습니다. 값이 없으면 «–» 로 두며 0 이나 안전으로 치환하지 않습니다.")}
      />
    </DesktopShell>
  );
}
