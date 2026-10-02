import { t } from "./i18n.ts";
import { useEffect, useMemo, useState, type PointerEventHandler } from "react";
import { courseInputForSelection, moveCoursePlace } from "./courseEditing";
import { useCandidateReorder } from "./useCandidateReorder";
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
import { withJosa } from "./josa";
import {
  conditionPath,
  conditionScore,
  conditionTargetInRange,
  dateLabel,
  formatValue,
  metricText,
  timeLabel,
  type ConditionSummary,
  type Conditions,
  type Place,
} from "./productData";
import {
  kakaoRouteLink,
  planItems,
  routePaths,
  routeReasonsText,
  transportAdviceText,
  transportLabel,
  travelJson,
  unknownConditionsText,
  type PlanItem,
  type PlanInput,
  type TripPlan,
} from "./travelApi";
import { setTravelSession, useTravelSession } from "./travelSession";
import { useAction } from "./useAction";
import { suppressLoginRequired } from "./authError";
import { useRequireLogin } from "./loginPopoverState";
import { useCourseRouteOptimization } from "./useCourseRouteOptimization";
import { TransportSelect } from "./TransportSelect";
import { useMyPlansWithAlarm } from "./useMyPlansWithAlarm";
import { isInitialLoad, useResource } from "./useResource";
import { useConditions } from "./useConditions";
import { useConditionSummaries } from "./useConditionSummaries";
import { mappablePlaces } from "./useWaterPlaces";
import { useWaterPlaceBrowser } from "./useWaterPlaceBrowser";
import { WaterPlaceFilters, WaterPlacePagination } from "./WaterPlaceControls";
import { usePlacesById } from "./usePlacesById";
import { spotLink, sortPlaces } from "./spotsRoute";
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
  spotId,
  editing,
}: {
  no: number;
  name: string;
  meta: string;
  distance: string | null;
  leg: string | null;
  spotId: number;
  editing: {
    included: boolean;
    origin: boolean;
    disabled: boolean;
    onToggle: () => void;
    onMove: (offset: number, handle: HTMLButtonElement) => void;
    onPointerDown: PointerEventHandler<HTMLButtonElement>;
    onPointerMove: PointerEventHandler<HTMLButtonElement>;
    onPointerUp: PointerEventHandler<HTMLButtonElement>;
    onPointerCancel: PointerEventHandler<HTMLButtonElement>;
  };
}) {
  return (
    <div className={"mk-course-stop" + (editing.included ? "" : " is-excluded")} data-spot-id={spotId}>
      <span className="mk-course-stop-number">
        <button
          type="button"
          className="pd-dk-num mk-course-stop-no"
          aria-label={t("{name} 코스에 포함", { name })}
          aria-pressed={editing.included}
          disabled={editing.disabled}
          onClick={editing.onToggle}
        >{no}</button>
        {editing.origin && <span className="mk-course-stop-origin">{t("출발")}</span>}
      </span>
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
      <button
        type="button"
        className="mk-course-stop-drag"
        disabled={editing.disabled}
        draggable={false}
        aria-label={t("{name} 순서 이동", { name })}
        aria-describedby="mk-course-order-help"
        title={t("드래그하거나 위·아래 방향키로 순서를 바꾸세요.")}
        onPointerDown={editing.onPointerDown}
        onPointerMove={editing.onPointerMove}
        onPointerUp={editing.onPointerUp}
        onPointerCancel={editing.onPointerCancel}
        onLostPointerCapture={editing.onPointerCancel}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          editing.onMove(event.key === "ArrowUp" ? -1 : 1, event.currentTarget);
        }}
      >
        <svg width="18" height="24" viewBox="0 0 18 24" fill="currentColor" aria-hidden="true">
          {[6, 12, 18].flatMap((y) => [6, 12].map((x) => <circle key={`${x}:${y}`} cx={x} cy={y} r="1.5" />))}
        </svg>
      </button>
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
  // 공유 코스 링크(plan_id)도 개인정보 자원입니다. 익명 방문자에게는
  // 「로그인 필요」를 알림으로 띄우지 않고, 다른 저장 자원과 같이 조용히
  // 처리합니다(authError.suppressLoginRequired).
  const savedPlan = suppressLoginRequired(
    useResource<TripPlan>(
      planId && /^(?:[a-f0-9]{32}|[a-f0-9-]{36})$/i.test(planId)
        ? `travel/plans/${planId}`
        : null,
    ),
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
        route: savedPlan.data.route_snapshot ?? null,
      });
  }, [savedPlan.data]);

  // ── 내 코스 목록 (항상 표시하는 좌측 패널) ──────────────────
  // 저장한 코스와 동행 알림 상태를 함께 조회합니다(useMyPlansWithAlarm).
  const { myPlans, sessions, plans: myPlansWithAlarm, loginRequired } = useMyPlansWithAlarm();
  const requireLogin = useRequireLogin();
  const openSavedPlan = (plan: TripPlan) => {
    setCourseEdit(null);
    action.cancel();
    setTravelSession({
      plan,
      planInput: { request: plan.request, stops: plan.input_stops },
      recommendation: null,
      route: plan.route_snapshot ?? null,
    });
    window.history.replaceState(
      null,
      "",
      `#map?view=course&plan_id=${plan.plan_id}`,
    );
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
  // 목록 순서. 요약이 아직 오지 않은 동안은 원래 순서입니다 -- 도착할 때마다
  // 줄이 튀어 오르면 누르려던 줄이 손가락 아래에서 움직입니다.
  const orderedRows = useMemo(
    () =>
      summaries.settled
        ? sortPlaces(
            rows,
            new Map(rows.map((place) => [place.id, conditionScore(summaries.byId.get(place.id))])),
          )
        : rows,
    [rows, summaries.settled, summaries.byId],
  );
  // 오른쪽 패널과 아래 근거는 고른 지점 하나만 조회합니다.
  const conditions = useConditions(selected?.id, ACTIVITY, undefined, !!selected);
  const selectedScore = conditionScore(conditions.data);
  const selectedGrade = gradeOf(selectedScore);
  const unmapped = allRows.length - pinned.length;

  // ── 코스 보기 ──────────────────────────────────────────────
  const courseSource = session.plan?.plan_id
    ? `${session.plan.plan_id}:${session.plan.revision}`
    : session.planInput;
  const [courseEdit, setCourseEdit] = useState<{
    source: string | PlanInput | null;
    order: number[];
    included: number[];
  } | null>(null);
  const activeEdit = courseEdit?.source === courseSource ? courseEdit : null;
  const courseChanged = activeEdit !== null;
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
  // 편집 중에도 저장된 기준의 점수 영역을 유지하고, 저장 성공 후 새 기준으로 바꿉니다.
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
  const storedRoute = session.route?.route;
  const calculated = courseChanged ? null : storedRoute;
  const courseItems = storedRoute?.items ?? planItems(session.plan);
  // 세션에서 경로를 계산하지 않았어도, 저장된 코스라면 저장 시점에 계산해 둔
  // 구간별 이동시간(previous_leg)이 남아 있을 수 있습니다. 예전 코스에는
  // 도로선 스냅샷이 없으므로 그 경우에만 저장된 구간 시간을 사용합니다.
  const hasStoredDurations = !courseChanged && !calculated && courseItems.some(
    (item) => (item as PlanItem).previous_leg?.duration_minutes != null,
  );
  const storedStops = courseItems.length
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
              calculated.transport,
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
  const storedIds = storedStops.map((stop) => stop.spotId);
  const courseOrder = activeEdit?.order ?? storedIds;
  const includedIds = activeEdit?.included ?? storedIds;
  const courseSpotIds = courseOrder.filter((id) => includedIds.includes(id));
  const courseStops = courseOrder.flatMap((id, index) => {
    const stop = storedStops.find((item) => item.spotId === id);
    if (!stop) return [];
    const included = includedIds.includes(id);
    return [{
      ...stop,
      no: index + 1,
      ...(courseChanged ? {
        meta: included ? t("경로 계산 전") : t("코스에서 제외"),
        distance: null,
        leg: null,
      } : {}),
    }];
  });
  const coursePlaces = usePlacesById(view === "course" ? storedIds : []);
  const editedInput = courseInputForSelection(session.planInput, courseSpotIds, coursePlaces.rows);
  const allSelected = courseSpotIds.length === courseStops.length;
  const wholeTrip = calculated
    ? kakaoRouteLink(calculated.origin, calculated.items, calculated.transport)
    : null;
  const action = useAction();
  const courseAccess = useAction();
  const editCourse = (order: number[], included: number[]) => {
    if (action.busy) return;
    action.cancel();
    setCourseEdit({ source: courseSource, order, included });
  };
  const { listRef, moveWithKeyboard, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useCandidateReorder(
    (from, to) => editCourse(moveCoursePlace(courseOrder, from, to), includedIds),
    activeEdit ?? session.planInput,
    ".mk-course-stop[data-spot-id]",
  );
  const {
    createCourse: createCourseFor,
    recalculateCourse,
    candidateTrip,
    transport,
    setTransport,
  } = useCourseRouteOptimization(rows, courseSpotIds, coursePlaces.rows, action, { input: editedInput, changed: courseChanged });
  const courseLink = wholeTrip ?? candidateTrip;
  const coursePaths = useMemo(
    () => (view === "course" && !courseChanged ? routePaths(session.route) : []),
    [session.route, view, courseChanged],
  );
  const courseLines = coursePaths.length;
  const origin = courseChanged ? editedInput?.request.origin : calculated?.origin;
  // 동일 좌표·순서의 배열을 유지해 불필요한 마커 갱신을 줄입니다.
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

  // 「코스 생성」은 폼 없이 경로 최적화(필요할 때만) + 저장을 한 번에 합니다.
  const createCourse = () =>
    createCourseFor((plan) => {
      window.history.replaceState(
        null,
        "",
        `#map?view=course&plan_id=${plan.plan_id}`,
      );
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
              key="spots"
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
              key="course"
              markers={courseMarkers}
              paths={coursePaths}
              preserveViewport={courseChanged}
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
              disabled={action.busy || courseAccess.busy}
              onClick={() => {
                setView(key);
                if (key === "course") void courseAccess.run(async (signal) => {
                  // 배경 조회의 캐시 대신 현재 세션을 확인합니다. 401은 기존 팝업으로 안내합니다.
                  await travelJson(import.meta.env.BASE_URL, "travel/plans?limit=1&offset=0", "GET", undefined, signal);
                });
              }}
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
              {/* 점수 있는 곳 먼저, 없는 곳은 아래로(spotsRoute.sortPlaces).
                  모바일 지도 목록과 같은 규칙입니다. */}
              {orderedRows.map((place) => (
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
                    {t("{score} 이루는 항목입니다. 각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다.", { score: withJosa(scoreTitle(ACTIVITY), "을/를") })}</p>
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
                    {t("{score} 이루는 항목입니다. 각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다.", { score: withJosa(scoreTitle(ACTIVITY), "을/를") })}</p>
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
            {/* 왼쪽에는 코스 목록을 유지하고 선택한 코스의 상세만 오른쪽에서 바꿉니다. */}
            <aside className="pd-dk-mappanel is-start" aria-label={t("내 코스 목록")}>
              <div className="pd-dk-mappanel-badge">{t("추천 탭에서 저장한 코스가 그대로 쌓입니다")}</div>
              <div className="mk-course-panel-head">
                <span className="pd-dk-kick">{t("내 코스 목록")}</span>
                {!loginRequired && <StateChip kind={myPlans.data ? "live" : "no_data"} />}
              </div>
              {loginRequired && <>
                <p className="mk-note">{t("로그인하면 저장한 코스를 볼 수 있어요.")}</p>
                <button type="button" className="pd-dk-button" onClick={requireLogin}>{t("로그인")}</button>
              </>}
              {myPlansWithAlarm.map(({ plan, alarm }) => (
                <button
                  type="button"
                  className={"cd-saved" + (session.plan?.plan_id === plan.plan_id ? " is-selected" : "")}
                  aria-pressed={session.plan?.plan_id === plan.plan_id}
                  disabled={action.busy}
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
              {!loginRequired && !myPlans.data?.rows.length && (
                <p className="mk-note" role={myPlans.error ? "alert" : "status"}>
                  {myPlans.error ??
                    (myPlans.loading
                      ? t("저장 코스를 불러오는 중입니다.")
                      : t("아직 저장한 코스가 없습니다. 추천에서 코스를 저장해 주세요."))}
                </p>
              )}
            </aside>

            <aside className="pd-dk-mappanel is-end" aria-label={t("선택한 코스")}>
              <div className="mk-course-panel-head">
                <span className="pd-dk-kick">{t("선택한 코스")}</span>
              </div>
              {courseStops.length > 0 && <>
                {session.plan?.plan_id && courseFirst && (
                  <div className="mk-course-score">
                    <p className="mk-course-score-place">
                      {t(courseChanged ? "저장된 첫 장소 · {name}" : "첫 장소 · {name}", { name: courseFirst.name })}
                    </p>
                    <div className="mk-course-score-value">
                      <span>{scoreTitle(session.plan.request.activity ?? "relax")}</span>
                      <GradeChip score={courseSelectedScore} />
                    </div>
                    <p className="mk-note">
                      {t("{date} · {time} 예보 기준", { date: dateLabel(courseFirst.at), time: timeLabel(courseFirst.at) })}
                    </p>
                    {selectedAlarm && <p className="mk-note">{t("동행 알림 켬")}</p>}
                    {(!courseFirstValid || courseFirstConditions.error) && (
                      <p className="mk-note" role="status">
                        {courseFirstValid ? courseFirstConditions.error : t("저장 날짜가 점수 조회 범위(한국시간 오늘부터 7일 뒤까지)를 벗어났거나 일정 시각이 없습니다.")}
                      </p>
                    )}
                  </div>
                )}
                <div className="mk-course-order-toolbar">
                  <p className="mk-note" id="mk-course-order-help">
                    {t("번호를 눌러 방문 여부를 정하고 오른쪽 손잡이로 순서를 바꾸세요. 선택한 첫 장소에서 출발합니다.")}
                  </p>
                  <button
                    type="button"
                    className="pd-dk-button is-quiet mk-course-select-all"
                    aria-controls="mk-course-editor"
                    disabled={action.busy}
                    onClick={() => editCourse(courseOrder, allSelected ? [] : [...courseOrder])}
                  >{allSelected ? t("전체 체크 해제") : t("전체 체크")}</button>
                </div>
                <div className="mk-course-rows" id="mk-course-editor" ref={listRef}>
                  {courseStops.map((stop, index) => (
                    <CourseStopRow
                      key={stop.spotId}
                      no={stop.no}
                      spotId={stop.spotId}
                      name={stop.name}
                      meta={stop.meta}
                      distance={stop.distance}
                      leg={stop.leg}
                      editing={{
                        included: includedIds.includes(stop.spotId),
                        origin: stop.spotId === courseSpotIds[0],
                        disabled: action.busy,
                        onToggle: () => editCourse(courseOrder, includedIds.includes(stop.spotId)
                          ? includedIds.filter((id) => id !== stop.spotId)
                          : [...includedIds, stop.spotId]),
                        onMove: (offset, handle) => {
                          const target = courseStops[index + offset];
                          if (target) moveWithKeyboard(handle, stop.spotId, target.spotId);
                        },
                        onPointerDown: (event) => onPointerDown(event, stop.spotId),
                        onPointerMove,
                        onPointerUp,
                        onPointerCancel,
                      }}
                    />
                  ))}
                </div>
                <p className="mk-note">
                  {calculated
                    ? <>{t(session.plan?.route_status === "saved_estimate" ? "저장된 예상 경로" : "예상 경로")} · {t("도로선 {count}/{total}구간", { count: courseLines, total: calculated.legs.filter((leg) => leg.geometry?.status !== "same_registered_place").length })}</>
                    : hasStoredDurations
                      ? t("저장된 구간별 이동시간입니다. 도로 경로선은 이 화면에서 다시 계산해야 표시됩니다.")
                      : t("이동시간과 도로 경로는 아직 계산하지 않았습니다.")}
                </p>
                {!courseChanged && session.route?.optimality === "provisional_missing_comparison_evidence" && (
                  <p className="mk-note">
                    {t("일부 비교 자료가 부족한 임시 결과입니다.")}
                  </p>
                )}
                {!courseChanged && session.plan && session.plan.unresolved.length > 0 && (
                  <details className="mk-course-details" key={session.plan.plan_id}>
                    <summary>{t("확인할 항목 {count}개", { count: session.plan.unresolved.length })}</summary>
                    <p>{unknownConditionsText(session.plan.unresolved)}</p>
                  </details>
                )}
                <dl className="mk-course-summary">
                  <div><dt>{t("방문 장소")}</dt><dd>{t("{count}곳", { count: courseSpotIds.length })}</dd></div>
                  {calculated && <>
                    <div><dt>{t("계산한 이동 수단")}</dt><dd>{transportLabel(calculated.transport ?? session.planInput?.request.transport ?? "driving")}</dd></div>
                    <div><dt>{t("예상 이동")}</dt><dd>{t("{minutes}분", { minutes: calculated.travel_minutes })}</dd></div>
                    <div><dt>{t("예상 귀가")}</dt><dd>{timeLabel(calculated.return_at)}</dd></div>
                  </>}
                </dl>
                {calculated?.transport_advice && <p className="mk-note">{transportAdviceText(calculated.transport_advice)}</p>}
                <div className="rt-form">
                  <TransportSelect value={transport} onChange={setTransport} disabled={action.busy} />
                </div>
                <div className="mk-course-actions">
                  <button
                    type="button"
                    className="pd-dk-button"
                    aria-busy={action.busy}
                    disabled={!editedInput?.request.origin || action.busy}
                    onClick={session.plan?.plan_id ? recalculateCourse : createCourse}
                  >
                    {action.busy && <Icon name="refresh" size={16} className="rt-submit-spin" />}
                    {action.busy
                      ? t("계산 중…")
                      : session.plan?.plan_id
                        ? t("최적 경로 다시 계산")
                        : t("코스 생성")}
                  </button>
                  {courseLink && (
                    <a
                      className="pd-dk-button is-quiet"
                      href={courseLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Icon name="transit" size={16} />{t("카카오맵에서 순서대로 길찾기 →")}
                    </a>
                  )}
                </div>
                <p className="mk-note" role={action.error || courseAccess.error || savedPlan.error ? "alert" : "status"}>
                  {action.error ||
                    courseAccess.error ||
                    savedPlan.error ||
                    (courseSpotIds.length === 0
                      ? t("방문할 장소를 하나 이상 선택해 주세요.")
                      : t("체크한 장소와 순서로 다시 계산하고 이 코스에 저장합니다."))}{" "}
                  {!courseChanged && session.route && !session.route.route_calculated
                    ? t("경로 미계산: {reason}", { reason: routeReasonsText(session.route.reason_codes) })
                    : ""}
                </p>
              </>}
              {courseStops.length === 0 && (
                <p className="mk-note" role={action.error || courseAccess.error || savedPlan.error ? "alert" : "status"}>
                  {action.error || courseAccess.error || savedPlan.error || (savedPlan.loading
                    ? t("저장 코스를 불러오는 중입니다.")
                    : t("왼쪽 목록에서 코스를 선택해 주세요."))}
                </p>
              )}

              {/* 전역 주의 문구입니다. 페이지가 스크롤되지 않으므로 화면 아래에 둘
                  자리가 없어 이 패널의 마지막에 들어옵니다. */}
              <FootNote
                wave={false}
                missing={t("편의 시설 · 안전요원 정보 · 조위 시계열")}
                note={t("선택한 이동 수단으로 계산한 예상 경로입니다. 도보·자전거·대중교통은 출발시각별 조회를 지원하지 않습니다. 좌표가 없는 정차지는 지도에 찍지 않습니다.")}
              />
            </aside>
          </>
        )}
      </DesktopMapShell>
    </DesktopShell>
  );
}
