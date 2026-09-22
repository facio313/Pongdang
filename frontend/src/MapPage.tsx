import { t } from "./i18n.ts";
import { useTravelLanguage } from "./travelLanguage";
import { useEffect, useMemo, useState } from "react";
import { MapDesktop } from "./MapDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { gradeOf } from "./groupAGrade";
import { GradeChip, Icon, Skeleton, StateChip, type IconName } from "./pongdangUi";
import { AppFootNote, AppHeader, AppShell } from "./AppShell";
import { usePlacesById } from "./usePlacesById";
import { isInitialLoad, useResource } from "./useResource";
import { useConditions } from "./useConditions";
import { useWaterPlaceBrowser } from "./useWaterPlaceBrowser";
import { WaterPlaceFilters, WaterPlacePagination } from "./WaterPlaceControls";
import { useAction } from "./useAction";
import { ConditionScoreDetails } from "./ConditionScoreDetails";
import { EvidenceNote } from "./EvidenceNote";
import {
  conditionScore,
  conditionPath,
  conditionTargetInRange,
  dataStatusText,
  kstDate,
  metricText,
  timeLabel,
  type Place,
  type Conditions,
} from "./productData";
import {
  directionLink,
  kakaoRouteLink,
  planItems,
  routePaths,
  travelJson,
  routeReasonsText,
  unknownConditionsText,
  type PlanItem,
  type TripPlan,
} from "./travelApi";
import { setTravelSession, useTravelSession } from "./travelSession";
import { useCourseRouteOptimization } from "./useCourseRouteOptimization";
import { useMyPlansWithAlarm, type PlanWithAlarm } from "./useMyPlansWithAlarm";
import { mappablePlaces } from "./useWaterPlaces";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { MapSheet } from "./MapSheet";
import { useSheetHeight } from "./useSheetHeight";
import "./mapPage.css";

// 모바일 지도입니다. 지도가 프레임을 다 쓰고, 헤더 · 검색 · 시트가 그 위에
// 뜹니다.
//
// 예전에는 지도가 화면 위쪽 고정 높이 띠(clamp(280px,42dvh,380px))였고 그 아래
// «시트»는 사실 페이지와 함께 스크롤되는 블록이었습니다. 지점 정보를 읽으려면
// 지도를 화면 밖으로 밀어내야 했습니다.
//
// 디자인 시스템 v2 는 그대로입니다: 히어로 레이어의 역할이 원래 「오늘의 상태 ·
// 지도 · 라이브캠」이므로(§01) 지도 면이 곧 히어로 레이어이고, 코발트 면은 위
// 헤더 띠 하나뿐입니다(§07 히어로는 화면당 하나). 근거 · 폼 · 상태 칩은 전부
// 밝은 레이어인 시트 안에 둡니다(§07).

type View = "spots" | "course";
interface Spot extends Place {
  score: number | null;
  waterTemp: string;
  airTemp: string;
  wind: string;
}

function Stage({
  view,
  selectedSpotId,
  onSelectSpot,
  spots,
  places,
  search,
  setSearch,
  sheetHeight,
}: {
  view: View;
  selectedSpotId: number | null;
  onSelectSpot: (id: number) => void;
  spots: Spot[];
  places: Place[];
  search: string;
  setSearch: (value: string) => void;
  /** 시트가 지도를 덮는 높이. 핀이 시트 뒤로 숨으면 고를 수 없습니다. */
  sheetHeight: number;
}) {
  const session = useTravelSession();
  const calculated = session.route?.route;
  const courseIds =
    calculated?.items.map((item) => item.spot_id) ??
    session.planInput?.stops.map((item) => item.spot_id) ??
    [];
  const start = calculated?.origin;
  // Coordinates come from the stable catalog rows, independently of score
  // updates. Changing a condition therefore does not recreate the map.
  const markers = useMemo(() => {
    const ids = new Set(calculated?.items.map((item) => item.spot_id) ??
      session.planInput?.stops.map((item) => item.spot_id) ?? []);
    // Include the registered origin so bounds still frame the whole course.
    const origin = view === "course" && start && start.latitude !== null && start.longitude !== null
      ? { id: "origin", latitude: start.latitude, longitude: start.longitude } : null;
    return [
      ...(origin ? [origin] : []),
      ...places.flatMap((place) => place.lat !== null && place.lng !== null &&
        (view === "spots" || ids.has(place.id))
        ? [{ id: String(place.id), latitude: place.lat, longitude: place.lng }] : []),
    ];
  }, [places, view, start, calculated?.items, session.planInput?.stops]);
  const paths = useMemo(
    () => (view === "course" ? routePaths(session.route) : []),
    [session.route, view],
  );
  return (
    <div className="mp-stage">
      <KakaoMapCanvas
        markers={markers}
        paths={paths}
        selectedId={selectedSpotId === null ? null : String(selectedSpotId)}
        // 위는 코발트 헤더 + 검색 알약이, 아래는 시트가 덮습니다. 덮인 만큼
        // 여백을 잡아야 핀이 그 뒤로 숨지 않습니다.
        insets={{ top: 104, right: 16, bottom: sheetHeight + 12, left: 16 }}
        renderMarker={(id) => {
          if (id === "origin")
            return (
              <span className="mp-pin is-origin">
                <span className="mp-pin-ring">
                  <span className="mp-pin-core">{t("출발")}</span>
                </span>
                <span className="mp-pin-label">{start?.label ?? t("출발지")}</span>
              </span>
            );
          const spot = spots.find((item) => item.id === Number(id));
          if (!spot) return null;
          const grade = gradeOf(spot.score);
          return (
            <button
              type="button"
              className={
                "mp-pin" + (spot.id === selectedSpotId ? " is-selected" : "")
              }
              data-inline-pin="true"
              aria-pressed={spot.id === selectedSpotId}
              aria-label={spot.name}
              onClick={() => onSelectSpot(spot.id)}
            >
              <span
                className="mp-pin-ring"
                style={{
                  background: "conic-gradient(rgba(27,39,51,.16) 0 100%)",
                }}
              >
                <span className="mp-pin-core" style={{ color: grade.color }}>
                  {view === "course"
                    ? courseIds.indexOf(spot.id) + 1
                    : (spot.score ?? "–")}
                </span>
              </span>
              <span className="mp-pin-label">
                {spot.name} {spot.score ?? "–"}
              </span>
            </button>
          );
        }}
      />

      {/* 지도 위 띠. 공용 .pd-hero 규칙(하단 라운드 22 · 그림자)을 쓰되 지도 ·
          내 코스 두 화면만 면과 잉크를 반전합니다 -- 흰 면에 코발트 잉크
          (mapPage.css). 그래서 onCobalt 를 주지 않습니다. */}
      <header className="pd-hero mp-topbar">
        <AppHeader
          title={view === "spots" ? t("지도") : t("코스 지도")}
          time={timeLabel(new Date().toISOString())}
        />
      </header>

      {view === "spots" ? (
        <label className="mp-searchbar">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
            placeholder={t("물놀이 할 곳 찾기")}
            aria-label={t("장소명·지역 검색")}
            className="mp-search-input"
          />
        </label>
      ) : (
        <div className="mp-searchbar is-course">
          <Icon name="course" size={16} />
          {t("선택 코스 · {count}곳 · {minutes}", { count: courseIds.length, minutes: session.route?.route ? t("{minutes}분 이동", { minutes: session.route.route.travel_minutes }) : t("경로 계산 전") })}
        </div>
      )}
    </div>
  );
}

function SpotSheet({
  spot,
  conditions,
  loading = false,
  onAdd,
  onFavorite,
}: {
  spot: Spot;
  conditions?: Conditions;
  /** 조건 조회 중. 「자료 없음」(–)과 구분해 그립니다. */
  loading?: boolean;
  onAdd: () => void;
  onFavorite: () => void;
}) {
  const href = directionLink(spot.name, spot.lat, spot.lng);
  const tiles: { name: string; value: string; icon: IconName }[] = [
    { name: t("수온"), value: spot.waterTemp, icon: "thermometer" },
    { name: t("기온"), value: spot.airTemp, icon: "sun" },
    { name: t("풍속"), value: spot.wind, icon: "wind" },
  ];
  return (
    <>
      <div className="pd-card">
        <div className="mp-spot-head">
          <div>
            <div className="mp-spot-name">{spot.name}</div>
            <div className="mp-spot-address">{spot.address}</div>
          </div>
          <div className="mp-spot-score">
            <div
              className="pd-num mp-spot-score-num"
              style={{ color: gradeOf(spot.score).color }}
            >
              {loading ? (
                <Skeleton width="1.6em" label={t("점수 조회 중")} />
              ) : spot.score === null ? (
                "–"
              ) : (
                spot.score
              )}
            </div>
            <GradeChip score={spot.score} loading={loading} bare />
          </div>
        </div>

        <div className="mp-tiles">
          {tiles.map((tile) => (
            <div className="mp-tile" key={tile.name}>
              <Icon name={tile.icon} size={15} className="mp-tile-icon" />
              <div className="pd-num mp-tile-value">
                {loading ? <Skeleton width="2.6em" /> : tile.value}
              </div>
              <div className="mp-tile-name">{tile.name}</div>
            </div>
          ))}
        </div>

        <div className="mp-chips">
          <span className="mp-unknown-chip">
            <Icon name="warning" size={11} />
            {t("안전 상태 {status}", { status: dataStatusText(conditions?.safety_status ?? "unknown") })}
          </span>
          <StateChip kind="live" />
        </div>

        {/* 안전 상태는 바로 위 mp-chips 가 이미 크게 말하고 있으므로 이 줄의
            칩은 끕니다. 문장 자체는 「근거 보기」 안에 그대로 있습니다. */}
        <p className="pd-note">{t("지도 점수는 선택한 장소를 조회한 값입니다.")}</p>
        <EvidenceNote data={conditions} className="pd-note" chip={false} />
        <ConditionScoreDetails data={conditions} className="pd-note" />
      </div>

      <div className="mp-actions">
        <a
          className="pd-secondary mp-action"
          href={href ?? undefined}
          aria-disabled={!href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="transit" size={16} />{t("길찾기")}</a>
        <button type="button" className="pd-primary mp-action" onClick={onAdd}>
          <Icon name="course" size={16} />{t("코스에 넣기")}</button>
      </div>
      <p className="pd-note mp-actions-note">
        <StateChip kind="live" /> {t("카카오 지도에 등록 좌표를 전달합니다. 코스에 넣으면 저장 전 일정에 추가합니다.")}{" "}
        {/* 문단 안에 흐르는 인라인 링크입니다. min-height 는 인라인 요소에
            듣지 않으므로 히트박스만 넓히는 .pd-tap 을 붙입니다. */}
        <a
          className="pd-inline pd-tap"
          href="#favorites"
          onClick={(event) => {
            event.preventDefault();
            onFavorite();
          }}
        >{t("즐겨찾기 저장 →")}</a>
      </p>
    </>
  );
}

function CourseSheet({
  onCreate,
  onRecalculate,
  busy,
  showDetail,
  selectedPlanId,
  onBack,
  myPlans,
  plans,
  sessions,
  onSelectPlan,
  originRows,
  originId,
  onOriginChange,
  candidateTrip,
}: {
  onCreate: () => void;
  onRecalculate: () => void;
  busy: boolean;
  showDetail: boolean;
  selectedPlanId: string | null;
  onBack: () => void;
  myPlans: {
    data?: { rows: TripPlan[] };
    loading: boolean;
    error?: string;
  };
  plans: PlanWithAlarm[];
  sessions: { loading: boolean; error?: string };
  onSelectPlan: (plan: TripPlan) => void;
  /** 출발지로 고를 수 있는, 좌표가 있는 등록 장소 목록(데스크탑 MapDesktop.tsx
   *  의 mk-origin 과 같은 기능). */
  originRows: Place[];
  originId: number | null;
  onOriginChange: (id: number) => void;
  candidateTrip: string | null;
}) {
  const session = useTravelSession();
  // 선택한(저장한) 코스의 동행 알림 상태. useMyPlansWithAlarm 이 travel/plans ·
  // travel/sessions 를 이미 결합해 두었으므로 plan_id 로 찾기만 합니다.
  const selectedAlarm = plans.find(
    (item) => item.plan.plan_id === session.plan?.plan_id,
  )?.alarm ?? false;
  // 점수는 첫 정차지 하나만 조회합니다. 데스크탑 MapDesktop.tsx 와 같은 규칙입니다 --
  // 정차지마다 부르면 요청이 코스 길이만큼 늘어납니다.
  const selectedStops = useMemo(
    () =>
      session.plan?.days.flatMap((day) =>
        day.items.map((item) => ({
          ...item,
          at: item.arrival_at ?? day.date + "T12:00:00+09:00",
        })),
      ) ?? [],
    [session.plan],
  );
  const first = selectedStops[0];
  const firstTargetValid = conditionTargetInRange(first?.at);
  const selectedConditions = useResource<Conditions>(
    firstTargetValid
      ? conditionPath(first?.spot_id, session.plan?.request.activity ?? "relax", first?.at)
      : null,
  );
  const selectedScore = conditionScore(selectedConditions.data);
  if (!showDetail)
    return (
      <div className="pd-card">
        <div className="mp-card-top">
          <div className="pd-card-title">{t("내 코스 목록")}</div>
          <StateChip kind={myPlans.data ? "live" : "no_data"} />
        </div>
        <div className="mp-rows">
          {plans.map(({ plan, alarm }) => (
            <button
              type="button"
              className="mp-saved-course"
              key={plan.plan_id}
              onClick={() => onSelectPlan(plan)}
            >
              <div className="mp-saved-course-name">
                {plan.request.dates[0]
                  ? t("{date} 물 코스", { date: plan.request.dates[0] })
                  : t("저장 코스")}
              </div>
              <div className="mp-saved-course-meta">
                {t("{count}곳", { count: planItems(plan).length })} ·{" "}
                {planItems(plan).map((item) => item.name).join(" · ") || t("장소 없음")}
              </div>
              <span className={"mp-saved-course-alarm" + (alarm ? "" : " is-off")}>
                {sessions.error
                  ? t("동행 알림 조회 실패")
                  : sessions.loading
                    ? t("동행 알림 조회 중")
                    : alarm
                      ? t("동행 알림 켬")
                      : t("동행 알림 꺼짐")}
              </span>
            </button>
          ))}
        </div>
        {!myPlans.data?.rows.length && (
          <p className="pd-note" role={myPlans.error ? "alert" : "status"}>
            {myPlans.error ??
              (myPlans.loading
                ? t("저장 코스를 불러오는 중입니다.")
                : t("아직 저장한 코스가 없습니다. 추천에서 코스를 저장해 주세요."))}
          </p>
        )}
      </div>
    );
  const calculated = session.route?.route;
  const items = calculated?.items ?? planItems(session.plan);
  // 세션에서 경로를 계산하지 않았어도, 저장된 코스라면 저장 시점에 계산해 둔
  // 구간별 이동시간(previous_leg)이 남아 있을 수 있습니다. 도로 경로선은
  // 저장하지 않으므로 그건 세션 계산(calculated) 없이는 그릴 수 없습니다.
  const hasStoredDurations = !calculated && items.some(
    (item) => (item as PlanItem).previous_leg?.duration_minutes != null,
  );
  const stops = items.length
    ? items.map((item, index) => ({
        no: index + 1,
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
          name: item.name,
          meta: t("방문 시각 미계산"),
          distance: null,
          leg: null,
        }));
  const wholeTrip = calculated
    ? kakaoRouteLink(calculated.origin, calculated.items)
    : null;
  const lines = routePaths(session.route).length;
  return (
    <>
      <div className="pd-card">
        <div className="mp-card-top">
          <div className="pd-card-title">{t("이동 순서")}</div>
          <StateChip kind="live" />
        </div>
        {session.plan?.plan_id && (
          <>
            <div className="mp-course-detail-meta">
              <GradeChip score={selectedScore} />
              <span className="pd-note">
                {selectedAlarm ? t("동행 세션에서 켜짐") : t("시작된 동행 알림 없음")}
              </span>
            </div>
            <p className="pd-note">
              {first?.name ?? t("첫 장소 없음")} · {first?.at ?? t("일정 시각 없음")}.{" "}
              {firstTargetValid ? selectedConditions.error : t("저장 날짜가 조회 범위(현재 기준 앞뒤 31일)를 벗어났거나 일정 시각이 없습니다.")}
            </p>
          </>
        )}
        {selectedPlanId && (
          <button type="button" className="pd-secondary mp-action" onClick={onBack}>
            {t("← 코스 목록으로")}
          </button>
        )}
        {originRows.length ? (
          <label className="mp-origin">
            <span className="mp-origin-label">{t("출발지")}</span>
            <select
              className="mp-origin-select"
              aria-label={t("출발지")}
              value={String(originId ?? originRows[0]?.id ?? "")}
              onChange={(event) => onOriginChange(Number(event.target.value))}
            >
              {originRows.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="pd-note" role="status">
            {t("출발지로 쓸 좌표가 있는 등록 장소가 없습니다.")}
          </p>
        )}
        <div className="mp-rows">
          {stops.map((stop) => (
            <div className="mp-stop" key={stop.no}>
              <span className="mp-stop-no">{stop.no}</span>
              <div className="mp-stop-body">
                <div className="mp-stop-name">{stop.name}</div>
                <div className="mp-stop-meta">{stop.meta}</div>
              </div>
              {stop.leg ? (
                <a
                  className="mp-stop-dist"
                  href={stop.leg}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {stop.distance ?? "–"} {t("· 길찾기")}</a>
              ) : (
                <span className="mp-stop-dist">{stop.distance ?? "–"}</span>
              )}
            </div>
          ))}
        </div>
        <p className="pd-note">
          {session.route?.route_calculated
            ? t("출발 기준 교통 자료의 예상시간입니다. 선택한 후보 안에서 비교한 경로이며, {detail}", { detail: session.route.optimality === "provisional_missing_comparison_evidence" ? t("일부 비교 자료가 부족한 임시 결과입니다.") : t("전체 지역의 최적 경로를 뜻하지 않습니다.") })
            : hasStoredDurations
              ? t("저장된 구간별 이동시간입니다. 도로 경로선은 이 화면에서 다시 계산해야 표시됩니다.")
              : t("이동시간과 도로 경로는 아직 계산하지 않았습니다.")}{" "}
          {stops.length === 0 &&
            t("추천에서 장소를 고르거나 지도에서 코스에 넣어 주세요.")}
        </p>
        {calculated && (
          <p className="pd-note">
            {t("도로 선은 길찾기 응답을 받은 {count}/{total}구간만 그립니다. 받지 못한 구간은 직선으로 채우지 않습니다.", { count: lines, total: calculated.legs.length })}
          </p>
        )}
        {session.plan?.plan_id && (
          <p className="pd-note">
            <StateChip kind="live" /> {t("상태: {status} · 경로: {route}. 미확인 조건: {unresolved}. 종합 안전 점수는 제공하지 않습니다.", { status: dataStatusText(session.plan.status), route: dataStatusText(session.plan.route_status), unresolved: unknownConditionsText(session.plan.unresolved) || t("없음") })}
          </p>
        )}
        {wholeTrip && (
          <a
            className="pd-secondary mp-action mp-course-link"
            href={wholeTrip}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="transit" size={16} />{t("카카오맵에서 순서대로 길찾기 →")}</a>
        )}
      </div>

      <div className="mp-actions">
        <button
          type="button"
          className="pd-primary mp-action"
          aria-busy={busy}
          disabled={!session.planInput?.stops.length || busy}
          onClick={session.plan?.plan_id ? onRecalculate : onCreate}
        >
          <Icon name={busy ? "refresh" : "save"} size={16} className={busy ? "mp-spin" : undefined} />
          {busy ? t("계산 중…") : session.plan?.plan_id ? t("최적 경로 다시 계산") : t("코스 생성")}
        </button>
        {candidateTrip && (
          <a
            className="pd-secondary mp-action"
            href={candidateTrip}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="transit" size={16} />{t("카카오맵에서 후보 순서대로 길찾기 →")}</a>
        )}
      </div>
      <p className="pd-note mp-actions-note">
        <StateChip kind="partial" /> {t("카카오맵 길찾기는 등록 좌표와 순서를 전달합니다. 저장은 방문 장소와 순서를 보존하며 정밀 ETA는 보존하지 않습니다.")}</p>
    </>
  );
}

function MapScreen() {
  const { locale } = useTravelLanguage();
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
  const [view, setView] = useState<View>(() =>
    new URLSearchParams(window.location.hash.split("?")[1]).get("view") ===
    "course"
      ? "course"
      : "spots",
  );

  // 내 코스 목록(코스 시트 초기 화면). 저장한 코스와 동행 알림 상태를 함께
  // 조회합니다(useMyPlansWithAlarm, 데스크탑 MapDesktop.tsx 와 같은 훅).
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
  const showCourseDetail =
    Boolean(selectedPlanId) ||
    (!session.plan?.plan_id && Boolean(session.planInput?.stops.length));

  const browser = useWaterPlaceBrowser();
  const { search, setSearch, places } = browser;
  // 목록 조회는 명소 탭과 같은 훅을 씁니다. 같은 장소를 두 화면이 서로 다른
  // 소스로 읽지 않기 위해서입니다. 조회 키는 입력이 멎은 뒤에 바뀝니다 --
  // 타자마다 목록을 다시 묻지 않기 위해서입니다.
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(() => {
    const value = Number(
      new URLSearchParams(window.location.hash.split("?")[1]).get("spot_id"),
    );
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  });
  const coursePlaces = usePlacesById(
    view === "course"
      ? (session.planInput?.stops.map((item) => item.spot_id) ?? [])
      : selectedSpotId
        ? [selectedSpotId]
        : [],
  );
  const raw = useMemo(() => [
    ...new Map(
      [...(places.rows ?? []), ...coursePlaces.rows].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ], [places.rows, coursePlaces.rows]);
  // 코스 경로의 출발지 후보. 좌표가 있는 등록 장소만 고를 수 있습니다 -- 데스크탑
  // MapDesktop.tsx 의 rows(pinned)와 같은 기준입니다(mappablePlaces).
  const originRows = useMemo(
    () => mappablePlaces(raw).map(({ place }) => place),
    [raw],
  );
  const courseSpotIds =
    session.route?.route?.items.map((item) => item.spot_id) ??
    session.planInput?.stops.map((item) => item.spot_id) ??
    [];
  const selected = selectedSpotId !== null
    ? raw.find((item) => item.id === selectedSpotId)
    : raw.find((item) => item.id === places.defaultPlaceId) ??
      raw.find((item) => item.type === "beach") ?? raw[0];
  // "코스 경로" 뷰에서는 지점 점수를 보여주지 않으므로 여기서는 묻지
  // 않습니다 -- 코스 정차지마다 부르지 않는 CourseSheet 와 같은 규칙입니다.
  const conditions = useConditions(selected?.id, undefined, undefined, view === "spots");
  const spots = raw.map((item) => ({
    ...item,
    score:
      item.id === selected?.id
        ? conditionScore(conditions.data)
        : null,
    waterTemp:
      item.id === selected?.id
        ? metricText(conditions.data, "water_temperature")
        : "–",
    airTemp:
      item.id === selected?.id
        ? metricText(conditions.data, "air_temperature")
        : "–",
    wind:
      item.id === selected?.id
        ? metricText(conditions.data, "wind_speed")
        : "–",
  }));
  const spot = spots.find((item) => item.id === selected?.id);
  const action = useAction();
  const add = () =>
    void action.run(async (signal) => {
      if (!spot) return;
      const input = session.planInput ?? {
        request: {
          locale,
          dates: [kstDate()],
          region: "gangwon",
          preferred_tags: [],
          activity: "relax" as const,
          transport: "driving" as const,
        },
        stops: [],
      };
      if (input.stops.some((stop) => stop.spot_id === spot.id)) {
        setView("course");
        return;
      }
      if (input.stops.length >= 5)
        throw new Error(
          "경로 후보는 최대 5곳입니다. 추천에서 코스를 다시 골라 주세요.",
        );
      const planInput = {
        request: input.request,
        stops: [
          ...input.stops,
          {
            item_id: `map-${spot.id}`,
            spot_id: spot.id,
            day: input.request.dates[0],
            stay_minutes: 60,
          },
        ],
      };
      const plan = await travelJson<TripPlan>(
        import.meta.env.BASE_URL,
        "travel/plans/draft",
        "POST",
        planInput,
        signal,
      );
      if (!signal.aborted) {
        setTravelSession({
          plan,
          planInput,
          route: null,
          recommendation: null,
        });
        setView("course");
      }
    });
  const favorite = () =>
    void action.run(async (signal) => {
      if (!spot) return;
      await travelJson(
        import.meta.env.BASE_URL,
        "travel/signals",
        "POST",
        { kind: "favorite", action: "like", spot_id: spot.id },
        signal,
      );
      if (!signal.aborted) window.location.hash = "#favorites";
    });
  // 정차지 집합을 실제 출발지·시각으로 순열 탐색해 방문 순서를 최적화하고
  // 저장합니다. 데스크탑 MapDesktop.tsx 와 같은 훅을 씁니다 -- 예전에는 이
  // 코드가 두 파일에 복붙되어 있어 한쪽에만 기능(출발지 선택)이 반영되는 일이
  // 있었습니다.
  const {
    originId,
    setOriginId,
    createCourse: createCourseFor,
    recalculateCourse,
    candidateTrip,
  } = useCourseRouteOptimization(originRows, courseSpotIds, coursePlaces.rows, action);
  const createCourse = () =>
    createCourseFor((plan) => {
      setSelectedPlanId(plan.plan_id!);
      window.history.replaceState(
        null,
        "",
        `#map?view=course&plan_id=${plan.plan_id}`,
      );
    });
  const sheet = useSheetHeight();
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="map-page">
      <AppShell
        tab="map"
        bare
        fullscreen
        hero={
          <Stage
            view={view}
            spots={spots}
            places={raw}
            selectedSpotId={selected?.id ?? null}
            onSelectSpot={setSelectedSpotId}
            search={search}
            setSearch={(value) => {
              setSearch(value);
              setSelectedSpotId(null);
            }}
            sheetHeight={sheet.height}
          />
        }
      >
        <MapSheet
          title={
            view === "spots" ? (spot?.name ?? t("지점 정보")) : t("선택 코스 경로")
          }
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          sheetRef={sheet.ref}
          head={
            <div className="mp-switch" role="group" aria-label={t("지도 보기 전환")}>
              {(["spots", "course"] as const).map((key) => (
                <button
                  type="button"
                  key={key}
                  className={"mp-switch-item" + (view === key ? " is-on" : "")}
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                >
                  {key === "spots" ? t("지점 보기") : t("코스 경로")}
                </button>
              ))}
            </div>
          }
        >
          <fieldset className="mp-fieldset" disabled={action.busy}>
            {view === "spots" && <>
              <WaterPlaceFilters
                district={browser.district} kind={browser.kind}
                onDistrict={(district) => { browser.setDistrict(district); setSelectedSpotId(null); }}
                onKind={(kind) => { browser.setKind(kind); setSelectedSpotId(null); }}
              />
              <WaterPlacePagination {...places} count={places.rows?.length ?? 0} onPage={(page) => { browser.setPage(page); setSelectedSpotId(null); }} />
            </>}
            {view === "spots" ? (
              spot ? (
                <SpotSheet
                  spot={spot}
                  conditions={conditions.data}
                  loading={isInitialLoad(conditions)}
                  onAdd={add}
                  onFavorite={favorite}
                />
              ) : (
                <div className="pd-card">
                  {selectedSpotId !== null
                    ? coursePlaces.error ?? (coursePlaces.loading
                        ? t("선택한 장소를 조회하고 있습니다.")
                        : t("선택한 장소를 찾을 수 없습니다."))
                    : places.loading ? t("장소 조회 중") : t("검색 결과 없음")}
                </div>
              )
            ) : (
              <CourseSheet
                onCreate={createCourse}
                onRecalculate={recalculateCourse}
                busy={action.busy}
                showDetail={showCourseDetail}
                selectedPlanId={selectedPlanId}
                onBack={backToCourseList}
                myPlans={myPlans}
                plans={myPlansWithAlarm}
                sessions={sessions}
                onSelectPlan={openSavedPlan}
                originRows={originRows}
                originId={originId}
                onOriginChange={setOriginId}
                candidateTrip={candidateTrip}
              />
            )}
            <p
              className="pd-note"
              role={
                action.error ||
                savedPlan.error ||
                places.error ||
                coursePlaces.error ||
                conditions.error
                  ? "alert"
                  : "status"
              }
            >
              {action.error ||
                savedPlan.error ||
                places.error ||
                coursePlaces.error ||
                conditions.error ||
                (action.busy
                  ? t("서버에 요청 중입니다…")
                  : t("현재 페이지와 선택한 장소 중 좌표가 있는 곳을 표시합니다."))}{" "}
              {session.route && !session.route.route_calculated
                ? t("경로 미계산: {reason}", { reason: routeReasonsText(session.route.reason_codes) })
                : ""}
            </p>
            <div className="pd-slot mp-todo">
              <div>
                <b>{t("편의시설 필터")}</b>
                <br />{t("샤워장 · 주차 · 카페 · 반려동물 가능")}<br />{t("시설 근거별 필터 화면 미작성")}</div>
            </div>
          </fieldset>
          {/* 전역 주의 문구입니다. 풀스크린에서는 .pd-body 가 없어 AppShell 이
              그리지 않으므로 시트 끝에 직접 둡니다 -- 자리를 옮겼을 뿐
              생략하지 않습니다. */}
          <AppFootNote wave={false} />
        </MapSheet>
      </AppShell>
    </article>
  );
}

export function MapPage() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <MapDesktop /> : <MapScreen />;
}
