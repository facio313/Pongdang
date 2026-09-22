import { t } from "./i18n.ts";
import { useEffect, useMemo, useState } from "react";
import { KakaoMapCanvas, type MapControlApi } from "./KakaoMapCanvas";
import { gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl } from "./mascots";
import { DESKTOP_MAP } from "./desktopMap";
import {
  DesktopMapShell,
  DesktopNav,
  DesktopShell,
  FootNote,
} from "./pongdangDesktop";
import {
  ComponentBars,
  GradeChip,
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
  conditionPath,
  conditionScore,
  conditionTargetInRange,
  dataStatusText,
  dateLabel,
  formatValue,
  kstDate,
  metricText,
  timeLabel,
  type ConditionSummary,
  type Conditions,
  type Place,
} from "./productData";
import {
  exclusionReasonsText,
  kakaoRouteLink,
  originFromPlace,
  planItems,
  routePaths,
  routeReasonsText,
  travelJson,
  unknownConditionsText,
  type PlanItem,
  type RecommendationResult,
  type RouteResult,
  type TripPlan,
} from "./travelApi";
import { setTravelSession, useTravelSession } from "./travelSession";
import { useMyPlansWithAlarm } from "./useMyPlansWithAlarm";
import { isInitialLoad, useResource } from "./useResource";
import { useAction } from "./useAction";
import { useConditions } from "./useConditions";
import { useConditionSummaries } from "./useConditionSummaries";
import { mappablePlaces } from "./useWaterPlaces";
import { useWaterPlaceBrowser } from "./useWaterPlaceBrowser";
import { WaterPlaceFilters, WaterPlacePagination } from "./WaterPlaceControls";
import { usePlacesById } from "./usePlacesById";
import { spotLink } from "./spotsRoute";
import "./mapDesktop.css";
import "./coursesDesktop.css";

// 데스크탑 지도입니다. 지도가 화면의 지배 요소입니다.
//
// 핸드오프 18c 는 「얇은 띠 히어로 + 352px 목록 | 지도」 2열이었습니다. 그
// 구성에서는 지도가 아무리 커도 화면의 한 칸이고, 근거 · 저장 코스를 읽으려면
// 지도를 스크롤 밖으로 밀어내야 했습니다. 그래서 **지도를 뷰포트 전체로 띄우고
// 나머지를 그 위에 얹는** 구성으로 바꿨습니다(DesktopMapShell).
//
// 디자인 시스템 v2 는 그대로 지킵니다: 히어로(코발트) 레이어의 역할이 원래
// 「오늘의 상태 · 지도 · 라이브캠」이므로(§01) 지도 면이 곧 히어로 레이어이고,
// 코발트 면은 상단 네비 띠 하나뿐입니다(§07 히어로는 화면당 하나). 검색 · 목록 ·
// 근거 · 상태 칩은 전부 밝은 레이어 패널 안에 둡니다(§07).
//
// 예전에는 이 화면에 훅이 하나도 없었습니다. 지점 목록 · 수온 · 근거 막대 ·
// 편의 시설이 전부 파일 안 상수였고, 같은 라우트의 모바일 지도는 그동안 실제
// 장소와 조건을 읽고 있었습니다. 이제 모바일과 **같은 훅**을 씁니다.
//
// 지도 컴포넌트는 모바일과 같은 KakaoMapCanvas 를 그대로 씁니다 -- 데스크탑
// 비율로 커졌을 뿐입니다.
//
// 예전에는 「지점 보기」만 이 화면에 있었고 코스 URL(#map?view=course)은 폭과
// 관계없이 모바일 흐름으로 보냈습니다("데스크톱 지점 지도는 코스를 읽지
// 않으므로"). 그런데 내 코스 데스크탑의 "지도에서 경로 계산 →" 링크가 이미
// 그 URL 로 데스크탑 사용자를 보내고 있어, 실제로는 데스크탑에 코스 화면이
// 없는 결과로 이어졌습니다. 이제 지점 · 코스 두 뷰를 한 화면 안에서 전환합니다
// -- 다른 데스크탑 화면들과 같은 문법입니다(SpotsPage 의 view=map 처럼, 화면
// 하나가 하위 뷰를 전부 내부에서 분기합니다).

/** 점수를 매길 활동. 모바일 지도는 수영 기준이므로 같은 기준을 씁니다. */
const ACTIVITY: Activity = "swim";

/** 지점 한 줄.
 *
 *  **스스로 조회하지 않습니다.** 예전에는 줄마다 useConditions 를 불렀고,
 *  목록이 100줄이면 지도에 들어가는 것만으로 조건 조회가 100건 나갔습니다.
 *  서버의 연결 슬롯은 네 개뿐이라 그 요청들은 서로를 굶겨 상당수가 503 으로
 *  돌아왔고, 만료된 근거를 만나면 줄마다 재조회 루프까지 돌았습니다.
 *
 *  이제 목록 전체의 요약을 MapDesktop 이 한 번(묶음당 한 요청) 조회해
 *  내려줍니다. 한 줄이 쓰는 사실은 그대로입니다. */
function SpotRow({
  place,
  summary,
  loading,
  selected,
  onSelect,
}: {
  place: Place;
  summary?: Pick<ConditionSummary, "condition_score" | "water_temperature" | "retained">;
  loading: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const score = conditionScore(summary);
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
        {loading ? <Skeleton width="1.6em" label={t("점수 조회 중")} /> : (score ?? "–")}
      </span>
      <span className="mk-spot-body">
        <span className="mk-spot-name">{place.name}</span>
        <span className="mk-spot-grade">
          <GradeIcon gradeKey={grade.key} size={12} />
          {t(grade.label)}
          {summary?.retained && <> · {t("이전 관측")}</>}
        </span>
      </span>
      <span className="pd-dk-num mk-spot-temp">
        {formatValue(summary?.water_temperature?.value, summary?.water_temperature?.unit)}
      </span>
    </button>
  );
}

/** 코스 정차지 한 줄. 모바일 CourseSheet 의 mp-stop 과 같은 사실(순번 · 이름 ·
 *  도착 시각 · 구간 이동시간 · 길찾기)을 데스크탑 패널 문법으로 그립니다. */
function CourseStopRow({
  no,
  name,
  meta,
  distance,
  leg,
}: {
  no: number;
  name: string;
  meta: string;
  distance: string | null;
  leg: string | null;
}) {
  return (
    <div className="mk-course-stop">
      <span className="pd-dk-num mk-course-stop-no">{no}</span>
      <span className="mk-course-stop-body">
        <span className="mk-course-stop-name">{name}</span>
        <span className="mk-course-stop-meta">{meta}</span>
      </span>
      {leg ? (
        <a
          className="mk-course-stop-dist"
          href={leg}
          target="_blank"
          rel="noopener noreferrer"
        >
          {distance ?? "–"} {t("· 길찾기")}
        </a>
      ) : (
        <span className="mk-course-stop-dist">{distance ?? "–"}</span>
      )}
    </div>
  );
}

export function MapDesktop() {
  // 뷰 전환은 화면 안에서만 일어납니다 -- 눌러도 URL 은 바뀌지 않습니다.
  // 외부 링크(#map?view=course)가 정하는 것은 **처음 여는 뷰**뿐입니다.
  const [view, setView] = useState<"spots" | "course">(() =>
    new URLSearchParams(window.location.hash.split("?")[1]).get("view") ===
    "course"
      ? "course"
      : "spots",
  );

  const session = useTravelSession();
  const planId = new URLSearchParams(window.location.hash.split("?")[1]).get(
    "plan_id",
  );
  const savedPlan = useResource<TripPlan>(
    planId && /^(?:[a-f0-9]{32}|[a-f0-9-]{36})$/i.test(planId)
      ? `travel/plans/${planId}`
      : null,
  );
  useEffect(() => {
    if (savedPlan.data)
      setTravelSession({
        plan: savedPlan.data,
        planInput: {
          request: savedPlan.data.request,
          stops: savedPlan.data.input_stops,
        },
        recommendation: null,
        route: null,
      });
  }, [savedPlan.data]);

  // ── 내 코스 목록 (좌측 패널 초기 화면) ──────────────────────
  // 저장한 코스와 동행 알림 상태를 함께 조회합니다(useMyPlansWithAlarm).
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(planId);
  const { myPlans, sessions, plans: myPlansWithAlarm } = useMyPlansWithAlarm();
  const openSavedPlan = (plan: TripPlan) => {
    setTravelSession({
      plan,
      planInput: { request: plan.request, stops: plan.input_stops },
      recommendation: null,
      route: null,
    });
    setSelectedPlanId(plan.plan_id!);
    window.history.replaceState(
      null,
      "",
      `#map?view=course&plan_id=${plan.plan_id}`,
    );
  };
  const backToCourseList = () => {
    setSelectedPlanId(null);
    setTravelSession({ plan: null, planInput: null, recommendation: null, route: null });
    window.history.replaceState(null, "", "#map?view=course");
  };

  // ── 지점 보기 ──────────────────────────────────────────────
  // 지도 조작 API 는 지도가 준비된 뒤 effect 에서 넘어옵니다.
  const [mapApi, setMapApi] = useState<MapControlApi | null>(null);
  const browser = useWaterPlaceBrowser();
  const { search, setSearch, places } = browser;
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const value = Number(
      new URLSearchParams(window.location.hash.split("?")[1]).get("spot_id"),
    );
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  });
  const selectedPlace = usePlacesById(selectedId === null ? [] : [selectedId]);
  const allRows = useMemo(
    () => [...new Map(
      [...(places.rows ?? []), ...selectedPlace.rows].map((place) => [place.id, place]),
    ).values()],
    [places.rows, selectedPlace.rows],
  );
  const pinned = useMemo(() => mappablePlaces(allRows), [allRows]);
  const markers = useMemo(
    () =>
      pinned.map(({ place, latitude, longitude }) => ({
        id: String(place.id),
        latitude,
        longitude,
      })),
    [pinned],
  );
  const rows = useMemo(() => pinned.map(({ place }) => place), [pinned]);
  const selected = selectedId !== null
    ? allRows.find((place) => place.id === selectedId)
    : rows.find((place) => place.id === places.defaultPlaceId) ?? rows[0];
  // 목록 전체의 점수 · 수온은 **묶음으로 한 번** 조회합니다. 줄마다 부르지
  // 않습니다(useConditionSummaries 의 주석 참고).
  const summaries = useConditionSummaries(
    useMemo(() => (places.rows ?? []).map((place) => place.id), [places.rows]),
    ACTIVITY,
  );
  // 오른쪽 패널과 아래 근거는 고른 지점 하나만 조회합니다.
  const conditions = useConditions(selected?.id, ACTIVITY, undefined, !!selected);
  const selectedScore = conditionScore(conditions.data);
  const selectedGrade = gradeOf(selectedScore);
  const unmapped = allRows.length - pinned.length;

  // ── 코스 보기 ──────────────────────────────────────────────
  // 왼쪽 패널의 초기 화면은 내 코스 목록입니다. 저장된 코스를 고르거나
  // (selectedPlanId), 추천에서 아직 저장 전인 초안(planInput)을 들고 온
  // 경우에만 상세(이동 순서)를 곧바로 보여줍니다.
  const showCourseDetail =
    Boolean(selectedPlanId) ||
    (!session.plan?.plan_id && Boolean(session.planInput?.stops.length));
  // 선택한(저장한) 코스의 동행 알림 상태. useMyPlansWithAlarm 이 travel/plans ·
  // travel/sessions 를 이미 결합해 두었으므로 plan_id 로 찾기만 합니다.
  const selectedAlarm = myPlansWithAlarm.find(
    (item) => item.plan.plan_id === session.plan?.plan_id,
  )?.alarm ?? false;
  // 점수는 첫 정차지 하나만 조회합니다. 모바일 CourseSheet(MapPage.tsx)와 같은 규칙입니다 --
  // 정차지마다 부르면 요청이 코스 길이만큼 늘어납니다.
  const courseSelectedStops = useMemo(
    () =>
      session.plan?.days.flatMap((day) =>
        day.items.map((item) => ({
          ...item,
          at: item.arrival_at ?? day.date + "T12:00:00+09:00",
        })),
      ) ?? [],
    [session.plan],
  );
  const courseFirst = courseSelectedStops[0];
  const courseFirstValid = conditionTargetInRange(courseFirst?.at);
  const courseFirstConditions = useResource<Conditions>(
    courseFirstValid
      ? conditionPath(courseFirst?.spot_id, session.plan?.request.activity ?? "relax", courseFirst?.at)
      : null,
  );
  const courseSelectedScore = conditionScore(courseFirstConditions.data);
  // 데이터 조합은 모바일 CourseSheet 와 같습니다(MapPage.tsx). 계산된 경로가
  // 있으면 그 순서 · 시각 · 구간을, 없으면 초안 코스의 후보 순서만 씁니다.
  const calculated = session.route?.route;
  const courseItems = calculated?.items ?? planItems(session.plan);
  const courseSpotIds =
    calculated?.items.map((item) => item.spot_id) ??
    session.planInput?.stops.map((item) => item.spot_id) ??
    [];
  const coursePlaces = usePlacesById(view === "course" ? courseSpotIds : []);
  // 세션에서 경로를 계산하지 않았어도, 저장된 코스라면 저장 시점에 계산해 둔
  // 구간별 이동시간(previous_leg)이 남아 있을 수 있습니다. 도로 경로선은
  // 저장하지 않으므로 그건 세션 계산(calculated) 없이는 그릴 수 없습니다.
  const hasStoredDurations = !calculated && courseItems.some(
    (item) => (item as PlanItem).previous_leg?.duration_minutes != null,
  );
  const courseStops = courseItems.length
    ? courseItems.map((item, index) => ({
        no: index + 1,
        spotId: item.spot_id,
        name: item.name,
        meta: t("{time} 도착", { time: timeLabel(item.arrival_at) }),
        distance: calculated?.legs[index]
          ? t("{minutes}분", { minutes: calculated.legs[index].duration_minutes })
          : (item as PlanItem).previous_leg?.duration_minutes != null
            ? t("{minutes}분", { minutes: (item as PlanItem).previous_leg!.duration_minutes! })
            : null,
        leg: calculated
          ? kakaoRouteLink(
              index === 0 ? calculated.origin : calculated.items[index - 1],
              [calculated.items[index]],
            )
          : null,
      }))
    : (session.recommendation?.recommendations ?? [])
        .filter((item) =>
          session.planInput?.stops.some(
            (stop) => stop.spot_id === item.spot_id,
          ),
        )
        .map((item, index) => ({
          no: index + 1,
          spotId: item.spot_id,
          name: item.name,
          meta: t("방문 시각 미계산"),
          distance: null,
          leg: null,
        }));
  const wholeTrip = calculated
    ? kakaoRouteLink(calculated.origin, calculated.items)
    : null;
  const coursePaths = useMemo(
    () => (view === "course" ? routePaths(session.route) : []),
    [session.route, view],
  );
  const courseLines = coursePaths.length;
  const origin = calculated?.origin;
  // 지도는 markers 참조가 바뀔 때마다 다시 그리므로(KakaoMapCanvas 의 effect),
  // 좌표가 같은 동안에는 같은 배열을 유지해야 합니다 -- 원시 값만 담은 문자열
  // 키에 의존을 좁힙니다(모바일 MapPage.tsx 와 같은 방식).
  const courseMarkerKey = JSON.stringify([
    origin && origin.latitude !== null && origin.longitude !== null
      ? [origin.latitude, origin.longitude]
      : null,
    courseSpotIds.map((id) => {
      const place = coursePlaces.rows.find((row) => row.id === id);
      return [id, place?.lat ?? null, place?.lng ?? null];
    }),
  ]);
  const courseMarkers = useMemo(() => {
    const [originCoords, stopCoords] = JSON.parse(courseMarkerKey) as [
      [number, number] | null,
      [number, number | null, number | null][],
    ];
    return [
      ...(originCoords
        ? [{ id: "origin", latitude: originCoords[0], longitude: originCoords[1] }]
        : []),
      ...stopCoords.flatMap(([id, latitude, longitude], index) =>
        latitude !== null && longitude !== null
          ? [{ id: String(id), latitude, longitude, order: index + 1 }]
          : [],
      ),
    ];
  }, [courseMarkerKey]);

  const action = useAction();
  // 후보지 정차지 집합을 실제 출발지·시각으로 순열 탐색해 방문 순서를
  // 최적화합니다(추천 화면의 경로 계산과 같은 서버 로직). 이미 사용자가 고른
  // 출발지·시각으로 계산해 둔 경로가 있으면(session.route.route_calculated)
  // 다시 계산해 덮어쓰지 않고 그대로 씁니다.
  const optimizeCourseRoute = async (signal: AbortSignal) => {
    const stops = session.planInput?.stops ?? [];
    if (!session.planInput || !stops.length)
      throw new Error(
        "경로를 계산할 방문 장소가 없습니다. 추천에서 코스를 만들거나 저장한 코스를 열어 주세요.",
      );
    if (session.route?.route_calculated)
      return session.route.plan_input ?? session.planInput;
    const originPlace = rows.find(
      (place) => place.lat !== null && place.lng !== null,
    );
    if (!originPlace)
      throw new Error(t("출발지로 쓸 좌표가 있는 등록 장소가 없습니다."));
    // 지도 코스는 명시적으로 고른 필수 방문 집합이므로, 모든 정차지가
    // 필수이고 방문 수는 정차지 수와 같습니다.
    const must_include = stops.map((item) => item.spot_id);
    const catalogIds = new Set(must_include);
    const origin = originFromPlace(originPlace, catalogIds)!;
    const departure = new Date(Date.now() + 600000).toISOString();
    const request = {
      ...session.planInput.request,
      dates: [kstDate(departure)],
      day_trip: true,
      departure_time: timeLabel(departure),
      origin,
      must_include,
    };
    const recommendations = await travelJson<RecommendationResult>(
      import.meta.env.BASE_URL,
      "travel/recommendations",
      "POST",
      { request, limit: 5 },
      signal,
    );
    const ranks = recommendations.recommendations
      .filter((item) => must_include.includes(item.spot_id))
      .map((item) => item.rank);
    if (ranks.length !== must_include.length || !recommendations.selection_token)
      throw new Error(
        t("선택 장소 {count}곳 중 {count2}곳만 현재 조건에서 경로 후보로 확인했습니다. ", { count: must_include.length, count2: ranks.length }) +
          (exclusionReasonsText(recommendations.excluded, must_include) ||
            t("후보를 다시 선택해 주세요.")),
      );
    const result = await travelJson<RouteResult>(
      import.meta.env.BASE_URL,
      "travel/routes/recommend",
      "POST",
      {
        selection_token: recommendations.selection_token,
        candidate_ranks: ranks,
        stop_count: ranks.length,
        stay_minutes: 60,
        include_geometry: true,
        request,
      },
      signal,
    );
    if (signal.aborted) return session.planInput;
    setTravelSession({
      recommendation: recommendations,
      route: result,
      ...(result.plan_input
        ? { planInput: result.plan_input, plan: null }
        : {}),
    });
    return result.plan_input ?? session.planInput;
  };

  // 「코스 생성」은 폼 없이 경로 최적화(필요할 때만) + 저장을 한 번에 합니다.
  const createCourse = () =>
    void action.run(async (signal) => {
      const planInput = await optimizeCourseRoute(signal);
      if (signal.aborted) return;
      const plan = await travelJson<TripPlan>(
        import.meta.env.BASE_URL,
        "travel/plans",
        "POST",
        planInput,
        signal,
      );
      if (!signal.aborted) {
        setSelectedPlanId(plan.plan_id!);
        window.history.replaceState(
          null,
          "",
          `#map?view=course&plan_id=${plan.plan_id}`,
        );
        setTravelSession({ plan });
      }
    });

  // 이미 저장된 코스도 정차지 구성은 그대로 두고 방문 순서 최적화와 이동시간을
  // 다시 계산해 저장할 수 있어야 합니다 -- 기존에는 plan_id 가 있으면 「코스
  // 생성」버튼이 막혀 저장된 코스를 다시 계산할 방법이 없었습니다.
  const recalculateCourse = () =>
    void action.run(async (signal) => {
      if (!session.plan?.plan_id)
        throw new Error("다시 계산할 저장된 코스가 없습니다.");
      const planInput = await optimizeCourseRoute(signal);
      if (signal.aborted) return;
      const plan = await travelJson<TripPlan>(
        import.meta.env.BASE_URL,
        `travel/plans/${session.plan.plan_id}`,
        "PUT",
        { ...planInput, expected_revision: session.plan.revision },
        signal,
      );
      if (!signal.aborted) setTravelSession({ plan });
    });

  return (
    <DesktopShell fullscreen>
      <DesktopMapShell
        nav={
          <DesktopNav
            active="map"
            context={
              view === "spots"
                ? t("{region} · {date} · 지도에 표시된 지점 {count}곳", { region: browser.regionLabel, date: dateLabel(), count: pinned.length })
                : t("선택 코스 · {count}곳 · {detail}", { count: courseSpotIds.length, detail: calculated ? t("{minutes}분 이동", { minutes: calculated.travel_minutes }) : t("경로 계산 전") })
            }
            onMap
          />
        }
        map={
          view === "spots" ? (
            <KakaoMapCanvas
              markers={markers}
              selectedId={selected ? String(selected.id) : null}
              insets={{
                top: DESKTOP_MAP.nav,
                left: DESKTOP_MAP.panel,
                right: selected ? DESKTOP_MAP.panel : DESKTOP_MAP.edge,
                bottom: DESKTOP_MAP.edge,
              }}
              renderMarker={(id) => {
                const place = rows.find((item) => item.id === Number(id));
                if (!place) return null;
                // 핀마다 조회하지 않습니다 -- 그러면 100번이 됩니다. 목록과 같은
                // 묶음 요약을 읽으므로 고르기 전에도 점수를 말할 수 있습니다.
                const isSelected = place.id === selected?.id;
                const score = isSelected
                  ? selectedScore
                  : conditionScore(summaries.byId.get(place.id));
                const grade = gradeOf(score);
                return (
                  <button
                    type="button"
                    className={"mk-pin" + (isSelected ? " is-selected" : "")}
                    data-grade={grade.key}
                    aria-pressed={isSelected}
                    aria-label={t("{name} 퐁당 {score} {grade}", { name: place.name, score: score ?? "–", grade: t(grade.label) })}
                    onClick={() => setSelectedId(place.id)}
                  >
                    <span className="pd-dk-num mk-pin-core">{score ?? "–"}</span>
                    <span className="mk-pin-label">{place.name}</span>
                  </button>
                );
              }}
              onReady={setMapApi}
            />
          ) : (
            <KakaoMapCanvas
              markers={courseMarkers}
              paths={coursePaths}
              selectedId={null}
              insets={{
                top: DESKTOP_MAP.nav,
                left: DESKTOP_MAP.panel,
                right: DESKTOP_MAP.panel,
                bottom: DESKTOP_MAP.edge,
              }}
              renderMarker={(id) => {
                if (id === "origin")
                  return (
                    <span className="mk-course-pin is-origin">
                      <span className="mk-course-pin-core">{t("출발")}</span>
                      <span className="mk-course-pin-label">
                        {origin?.label ?? t("출발지")}
                      </span>
                    </span>
                  );
                const marker = courseMarkers.find((item) => item.id === id);
                const stop = courseStops.find(
                  (item) => String(item.spotId) === id,
                );
                if (!marker || !stop) return null;
                return (
                  <span className="mk-course-pin">
                    <span className="pd-dk-num mk-course-pin-core">
                      {stop.no}
                    </span>
                    <span className="mk-course-pin-label">{stop.name}</span>
                  </span>
                );
              }}
            />
          )
        }
      >
        <div className="mk-switch" role="group" aria-label={t("지도 보기 전환")}>
          {(["spots", "course"] as const).map((key) => (
            <button
              type="button"
              key={key}
              className={"mk-switch-item" + (view === key ? " is-on" : "")}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {key === "spots" ? t("지점 보기") : t("코스 경로")}
            </button>
          ))}
        </div>

        {view === "spots" ? (
          <>
            <aside className="pd-dk-mappanel is-start" aria-label={t("지점 목록")}>
              {/* 예전에는 지도 면 왼쪽 위에 떠 있던 뱃지입니다. 풀스크린에서는
                  지도 위에 설 자리가 패널과 겹치므로 패널의 첫 줄로 들어왔습니다. */}
              <div className="pd-dk-mappanel-badge">{t("카카오 지도 · 보이는 지점의 점수를 묶어서 조회합니다")}</div>
              {/* 예전에는 히어로에 「수영 · 서핑 · 온천 · 주차 · 샤워장」 필터가
                  있었고 눌러도 목록이 바뀌지 않았습니다. 동작하지 않는 컨트롤은
                  두지 않습니다. 대신 실제로 목록을 바꾸는 검색을, 걸러낼 지점 목록
                  바로 위에 둡니다. */}
              <label className="mk-search">
                <Icon name="search" size={17} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSelectedId(null);
                  }}
                  maxLength={100}
                  placeholder={t("장소명 · 지역 검색")}
                  aria-label={t("장소명·지역 검색")}
                />
              </label>
              <WaterPlaceFilters
                district={browser.district} kind={browser.kind}
                onDistrict={(district) => { browser.setDistrict(district); setSelectedId(null); }}
                onKind={(kind) => { browser.setKind(kind); setSelectedId(null); }}
              />

              <div className="pd-dk-kick mk-side-kick">
                {t("지점 {count}곳 · {activity} 점수", { count: pinned.length, activity: t(activities[ACTIVITY]) })}
              </div>
              {selectedId !== null && !selected && (
                <p className="mk-note" role={selectedPlace.error ? "alert" : "status"}>
                  {selectedPlace.error ?? (selectedPlace.loading
                    ? t("선택한 장소를 조회하고 있습니다.")
                    : t("선택한 장소를 찾을 수 없습니다."))}
                </p>
              )}
              {rows.map((place) => (
                <SpotRow
                  key={place.id}
                  place={place}
                  summary={place.id === selected?.id ? {
                    retained: conditions.data?.retained,
                    condition_score: conditions.data?.condition_score,
                    water_temperature: conditions.data?.metrics.find((metric) => metric.name === "water_temperature"),
                  } : summaries.byId.get(place.id)}
                  loading={place.id === selected?.id ? conditions.loading : summaries.loading}
                  selected={place.id === selected?.id}
                  onSelect={() => setSelectedId(place.id)}
                />
              ))}
              {!rows.length && (
                <p className="mk-note" role={places.error ? "alert" : "status"}>
                  {places.error ??
                    (places.loading ? t("장소를 조회하고 있습니다.") : t("검색 결과 없음"))}
                </p>
              )}

              <WaterPlacePagination {...places} count={places.rows?.length ?? 0} onPage={(page) => { browser.setPage(page); setSelectedId(null); }} />
              <p className="mk-note">{t("현재 페이지와 선택한 장소 중 좌표가 있는 곳을 표시합니다.")}{unmapped > 0 &&
                  t(" 좌표가 아직 확인되지 않은 {count}곳은 지도에 찍지 않았습니다 — 없는 위치를 임의로 만들지 않습니다.", { count: unmapped })}
              </p>
              <div className="mk-alert">
                <Icon name="warning" size={15} />{t("값이 없는 상태가 안전을 뜻하지 않습니다")}</div>
            </aside>

            <div className="pd-dk-mapcontrols">
              <button type="button" aria-label={t("확대")} onClick={() => mapApi?.zoomIn()}>
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
              <button type="button" aria-label={t("축소")} onClick={() => mapApi?.zoomOut()}>
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
                aria-label={t("현재 위치로 이동")}
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

            {/* 오른쪽 패널. 예전에는 지도 위에 뜬 작은 카드(이름 · 점수)와, 스크롤을
                내려야 나오는 근거 행이 따로 있었습니다. 고른 지점에 대해 화면이 할
                말은 하나이므로 한 패널에 모읍니다 -- 지점 · 점수 · 근거 막대 · 설명 ·
                상세 링크, 그리고 전역 주의 문구까지.

                예전에는 근거 막대가 「파고 0.6m 적정 72%」처럼 지어낸 비율이었고,
                편의 시설은 주차 · 샤워장이 늘 「있음」이었습니다. 이제 점수를 이루는
                실제 항목을 그립니다. 편의 시설을 내려주는 API 는 없으므로 그 칸은
                없앴습니다 -- 「정보 없음」 아이콘만 남기면 있는 기능처럼 보입니다. */}
            <aside className="pd-dk-mappanel is-end" aria-label={t("선택 지점 근거")}>
              <div className="pd-dk-kick mk-evidence-kick">{t("선택 지점")}</div>
              {selected ? (
                <>
                  <div className="mk-detail-head">
                    <img
                      src={mascotUrl("swim")}
                      alt={MASCOT_ALT}
                      width={52}
                      height={52}
                    />
                    <div className="mk-detail-lead">
                      <div className="mk-detail-name">{selected.name}</div>
                      <div className="mk-detail-meta">
                        {selected.address ?? t("주소 없음")} {t("· 수온")}{" "}
                        {metricText(conditions.data, "water_temperature")}
                      </div>
                    </div>
                    <div className="mk-detail-score" data-grade={selectedGrade.key}>
                      <div className="pd-dk-num mk-detail-score-num">
                        {isInitialLoad(conditions) ? (
                          <Skeleton width="1.4em" label={t("점수 조회 중")} />
                        ) : (
                          (selectedScore ?? "–")
                        )}
                      </div>
                      <div className="mk-detail-score-grade">
                        <GradeIcon gradeKey={selectedGrade.key} size={13} />
                        {selectedGrade.label}
                      </div>
                    </div>
                  </div>
                  <div className="mk-detail-actions">
                    <a className="pd-dk-button" href="#map?view=course">{t("코스에 추가")}</a>
                    <a className="mk-detail-link" href={spotLink(selected)}>
                      {selected.name} {t("상세 →")}</a>
                  </div>
                  <div className="mk-evidence-head-row">
                    <h2 className="mk-evidence-title">
                      {activities[ACTIVITY]} {t("점수 근거")}</h2>
                    <StateChip kind={conditions.data ? "live" : "no_data"} />
                  </div>
                  <p className="mk-note">
                    {t("{score}를 이루는 항목입니다. 각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다.", { score: scoreTitle(ACTIVITY) })}</p>
                  <ComponentBars
                    bars={componentBars(conditions.data)}
                    loading={isInitialLoad(conditions)}
                  />
                  <ScoreReason
                    text={scoreReason(conditions.data).text}
                    loading={isInitialLoad(conditions)}
                  />
                  <EvidenceNote
                    data={conditions.data}
                    className="mk-note"
                    chip={false}
                  />
                  <ScoreExplainer data={conditions.data} />
                </>
              ) : isInitialLoad(places) ? (
                // 지점 목록이 아직 처음 조회 중이라 고를 대상 자체가 없는
                // 짧은 순간입니다. 「지점을 고르면…」한 줄로 대신하면 목록이
                // 도착해 지점이 자동으로 고정되는 순간 패널이 한 줄에서
                // 전체 근거 블록으로 갑자기 부풀어 들썩입니다. 같은 틀을
                // 스켈레톤으로 미리 채워 크기를 고정합니다.
                <>
                  <div className="mk-detail-head">
                    <img
                      src={mascotUrl("swim")}
                      alt={MASCOT_ALT}
                      width={52}
                      height={52}
                    />
                    <div className="mk-detail-lead">
                      <div className="mk-detail-name">
                        <Skeleton width="8em" label={t("장소 조회 중")} />
                      </div>
                      <div className="mk-detail-meta">
                        <Skeleton width="12em" />
                      </div>
                    </div>
                    <div className="mk-detail-score" data-grade="unscored">
                      <div className="pd-dk-num mk-detail-score-num">
                        <Skeleton width="1.4em" />
                      </div>
                      <div className="mk-detail-score-grade">
                        <Skeleton width="3.4em" />
                      </div>
                    </div>
                  </div>
                  <div className="mk-evidence-head-row">
                    <h2 className="mk-evidence-title">
                      {activities[ACTIVITY]} {t("점수 근거")}</h2>
                    <StateChip kind="no_data" />
                  </div>
                  <p className="mk-note">
                    {t("{score}를 이루는 항목입니다. 각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다.", { score: scoreTitle(ACTIVITY) })}</p>
                  <ComponentBars bars={componentBars(undefined)} loading />
                  <ScoreReason text="" loading />
                </>
              ) : (
                <p className="mk-note" role="status">{t("지점을 고르면 그 지점의 점수 근거를 조회합니다.")}</p>
              )}

              {/* 전역 주의 문구입니다. 페이지가 스크롤되지 않으므로 화면 아래에 둘
                  자리가 없어 이 패널의 마지막에 들어옵니다 -- 자리를 옮겼을 뿐
                  생략하지 않습니다. */}
              <FootNote
                wave={false}
                missing={t("편의 시설 · 안전요원 정보 · 조위 시계열")}
                note={t("마커 좌표는 서버가 준 실제 값입니다. 목록의 점수는 지점마다 따로 묻지 않고 묶어서 한 번에 조회하며, 근거가 없는 지점은 «–» 입니다. NULL · unknown 은 안전한 상태를 뜻하지 않습니다.")}
              />
            </aside>
          </>
        ) : (
          <>
            {/* 왼쪽 패널: 상세를 볼 코스가 없으면 내 코스 목록, 있으면 이동
                순서(모바일 CourseSheet 의 mp-rows 와 같은 데이터). */}
            <aside className="pd-dk-mappanel is-start" aria-label={t(showCourseDetail ? "이동 순서" : "내 코스 목록")}>
              {showCourseDetail ? (
                <>
                  <div className="pd-dk-mappanel-badge">{t("선택 코스의 정차지 순서 · 카카오맵 길찾기")}</div>
                  <div className="mk-course-panel-head">
                    <span className="pd-dk-kick">{t("이동 순서")}</span>
                    <StateChip kind="live" />
                  </div>
                  {session.plan?.plan_id && (
                    <>
                      <div className="mk-course-alarm">
                        <GradeChip score={courseSelectedScore} />
                        <span className="mk-note">
                          {selectedAlarm ? t("동행 세션에서 켜짐") : t("시작된 동행 알림 없음")}
                        </span>
                      </div>
                      <p className="mk-note">
                        {courseFirst?.name ?? t("첫 장소 없음")} · {courseFirst?.at ?? t("일정 시각 없음")}.{" "}
                        {courseFirstValid ? courseFirstConditions.error : t("저장 날짜가 조회 범위(현재 기준 앞뒤 31일)를 벗어났거나 일정 시각이 없습니다.")}
                      </p>
                    </>
                  )}
                  {selectedPlanId && (
                    <button type="button" className="pd-dk-button is-quiet" onClick={backToCourseList}>
                      {t("← 코스 목록으로")}
                    </button>
                  )}
                  <div className="mk-course-rows">
                    {courseStops.map((stop) => (
                      <CourseStopRow
                        key={stop.no}
                        no={stop.no}
                        name={stop.name}
                        meta={stop.meta}
                        distance={stop.distance}
                        leg={stop.leg}
                      />
                    ))}
                  </div>
                  <p className="mk-note">
                    {session.route?.route_calculated
                      ? t("출발 기준 교통 자료의 예상시간입니다. 선택한 후보 안에서 비교한 경로이며, {detail}", { detail: session.route.optimality === "provisional_missing_comparison_evidence" ? t("일부 비교 자료가 부족한 임시 결과입니다.") : t("전체 지역의 최적 경로를 뜻하지 않습니다.") })
                      : hasStoredDurations
                        ? t("저장된 구간별 이동시간입니다. 도로 경로선은 이 화면에서 다시 계산해야 표시됩니다.")
                        : t("이동시간과 도로 경로는 아직 계산하지 않았습니다.")}{" "}
                    {courseStops.length === 0 &&
                      t("추천에서 코스를 만들거나 저장한 코스를 열어 주세요.")}
                  </p>
                  {calculated && (
                    <p className="mk-note">
                      {t("도로 선은 길찾기 응답을 받은 {count}/{total}구간만 그립니다. 받지 못한 구간은 직선으로 채우지 않습니다.", { count: courseLines, total: calculated.legs.length })}
                    </p>
                  )}
                  {session.plan?.plan_id && (
                    <p className="mk-note">
                      <StateChip kind="live" /> {t("상태: {status} · 경로: {route}. 미확인 조건: {unresolved}. 종합 안전 점수는 제공하지 않습니다.", { status: dataStatusText(session.plan.status), route: dataStatusText(session.plan.route_status), unresolved: unknownConditionsText(session.plan.unresolved) || t("없음") })}
                    </p>
                  )}
                  {wholeTrip && (
                    <a
                      className="pd-dk-button"
                      href={wholeTrip}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Icon name="transit" size={16} />{t("카카오맵에서 순서대로 길찾기 →")}
                    </a>
                  )}
                </>
              ) : (
                <>
                  <div className="pd-dk-mappanel-badge">{t("추천 탭에서 저장한 코스가 그대로 쌓입니다")}</div>
                  <div className="mk-course-panel-head">
                    <span className="pd-dk-kick">{t("내 코스 목록")}</span>
                    <StateChip kind={myPlans.data ? "live" : "no_data"} />
                  </div>
                  {myPlansWithAlarm.map(({ plan, alarm }) => (
                    <button
                      type="button"
                      className="cd-saved"
                      key={plan.plan_id}
                      onClick={() => openSavedPlan(plan)}
                    >
                      <div className="cd-saved-body">
                        <div className="cd-saved-name">
                          {plan.request.dates[0]
                            ? t("{date} 물 코스", { date: plan.request.dates[0] })
                            : t("저장 코스")}
                        </div>
                        <div className="cd-saved-meta">
                          {t("{count}곳", { count: planItems(plan).length })} ·{" "}
                          {planItems(plan).map((item) => item.name).join(" · ") || t("장소 없음")}
                        </div>
                        <div className="cd-saved-alarm">
                          {sessions.error
                            ? t("동행 알림 조회 실패")
                            : sessions.loading
                              ? t("동행 알림 조회 중")
                              : alarm
                                ? t("동행 알림 켬")
                                : t("동행 알림 꺼짐")}
                        </div>
                      </div>
                    </button>
                  ))}
                  {!myPlans.data?.rows.length && (
                    <p className="mk-note" role={myPlans.error ? "alert" : "status"}>
                      {myPlans.error ??
                        (myPlans.loading
                          ? t("저장 코스를 불러오는 중입니다.")
                          : t("아직 저장한 코스가 없습니다. 추천에서 코스를 저장해 주세요."))}
                    </p>
                  )}
                </>
              )}
            </aside>

            {/* 오른쪽 패널: 후보지 목록과 코스 생성. 출발지·시각 입력 없이
                「코스 생성」한 번으로 경로 최적화(필요한 경우)와 저장을 함께
                수행합니다(createCourse, 위 정의 참고). 이미 저장된 코스는
                같은 정차지로 방문 순서를 다시 최적화해 저장할 수 있습니다
                (recalculateCourse). */}
            <aside className="pd-dk-mappanel is-end" aria-label={t("후보지")}>
              <div className="mk-course-panel-head">
                <span className="pd-dk-kick">{t("후보지")}</span>
                <StateChip kind={action.busy ? "no_data" : "live"} />
              </div>
              <div className="mk-course-rows">
                {courseStops.map((stop) => (
                  <CourseStopRow
                    key={stop.no}
                    no={stop.no}
                    name={stop.name}
                    meta={stop.meta}
                    distance={stop.distance}
                    leg={stop.leg}
                  />
                ))}
              </div>
              {courseStops.length === 0 && (
                <p className="mk-note" role="status">
                  {t("추천에서 코스를 만들거나 저장한 코스를 열어 주세요.")}
                </p>
              )}
              <button
                type="button"
                className="pd-dk-button"
                aria-busy={action.busy}
                disabled={!session.planInput?.stops.length || action.busy}
                onClick={session.plan?.plan_id ? recalculateCourse : createCourse}
              >
                {action.busy && <Icon name="refresh" size={16} className="rt-submit-spin" />}
                {action.busy
                  ? t("계산 중…")
                  : session.plan?.plan_id
                    ? t("최적 경로 다시 계산")
                    : t("코스 생성")}
              </button>
              <p className="mk-note" role={action.error || savedPlan.error ? "alert" : "status"}>
                {action.error ||
                  savedPlan.error ||
                  t("카카오맵 길찾기는 등록 좌표와 순서를 전달합니다. 저장은 방문 장소와 순서를 보존하며 정밀 ETA는 보존하지 않습니다.")}{" "}
                {session.route && !session.route.route_calculated
                  ? t("경로 미계산: {reason}", { reason: routeReasonsText(session.route.reason_codes) })
                  : ""}
              </p>

              {/* 전역 주의 문구입니다. 페이지가 스크롤되지 않으므로 화면 아래에 둘
                  자리가 없어 이 패널의 마지막에 들어옵니다. */}
              <FootNote
                wave={false}
                missing={t("편의 시설 · 안전요원 정보 · 조위 시계열")}
                note={t("경로는 자동차 이동만 계산하며 예상값이고 안전 판정이 아닙니다. 좌표가 없는 정차지는 지도에 찍지 않습니다.")}
              />
            </aside>
          </>
        )}
      </DesktopMapShell>
    </DesktopShell>
  );
}
