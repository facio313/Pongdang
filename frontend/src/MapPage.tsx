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
  dataStatusText,
  kstDate,
  metricText,
  placeRegionLabel,
  timeLabel,
  type Place,
  type Conditions,
} from "./productData";
import {
  directionLink,
  exclusionReasonsText,
  kakaoRouteLink,
  planItems,
  routePaths,
  travelJson,
  routeReasonsText,
  type RecommendationResult,
  type RouteResult,
  type TripPlan,
} from "./travelApi";
import {
  RouteRequestForm,
  type RouteRequestValue,
} from "./RouteRequestForm";
import { setTravelSession, useTravelSession } from "./travelSession";
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

function CourseSheet({ onSave }: { onSave: () => void }) {
  const session = useTravelSession();
  const calculated = session.route?.route;
  const items = calculated?.items ?? planItems(session.plan);
  const stops = items.length
    ? items.map((item, index) => ({
        no: index + 1,
        name: item.name,
        meta: t("{time} 도착", { time: timeLabel(item.arrival_at) }),
        distance: calculated?.legs[index]
          ? t("{minutes}분", { minutes: calculated.legs[index].duration_minutes })
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
            : t("이동시간과 도로 경로는 아직 계산하지 않았습니다.")}{" "}
          {stops.length === 0 &&
            t("추천에서 장소를 고르거나 지도에서 코스에 넣어 주세요.")}
        </p>
        {calculated && (
          <p className="pd-note">
            {t("도로 선은 길찾기 응답을 받은 {count}/{total}구간만 그립니다. 받지 못한 구간은 직선으로 채우지 않습니다.", { count: lines, total: calculated.legs.length })}
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
        <a className="pd-secondary mp-action" href="#recommend">
          <Icon name="transit" size={16} />{t("추천에서 편집")}</a>
        <button
          type="button"
          className="pd-primary mp-action"
          disabled={!session.planInput || Boolean(session.plan?.plan_id)}
          onClick={onSave}
        >
          <Icon name="save" size={16} />
          {session.plan?.plan_id ? t("저장됨") : t("내 코스에 저장")}
        </button>
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
  const selected = selectedSpotId !== null
    ? raw.find((item) => item.id === selectedSpotId)
    : raw.find((item) => item.id === places.defaultPlaceId) ??
      raw.find((item) => item.type === "beach") ?? raw[0];
  const conditions = useConditions(selected?.id);
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
  const save = () =>
    void action.run(async (signal) => {
      if (!session.planInput) return;
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
          `#map?view=course&plan_id=${plan.plan_id}`,
        );
        setTravelSession({ plan });
      }
    });
  const route = (value: RouteRequestValue) =>
    void action.run(async (signal) => {
      const stops = session.planInput?.stops ?? [];
      if (!session.planInput || !stops.length)
        throw new Error(
          "경로를 계산할 방문 장소가 없습니다. 지도에서 「코스에 넣기」로 장소를 고르거나 추천에서 코스를 가져와 주세요.",
        );
      // The map's course is an explicit must-visit set, so every stop is
      // required and the visit count is the number of stops.
      const must_include = stops.map((item) => item.spot_id);
      const request = {
        ...session.planInput.request,
        dates: [value.date],
        day_trip: true,
        departure_time: value.departure_time,
        origin: value.origin,
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
          stay_minutes: value.stay_minutes,
          include_geometry: true,
          request,
        },
        signal,
      );
      if (!signal.aborted)
        setTravelSession({
          recommendation: recommendations,
          route: result,
          ...(result.plan_input
            ? { planInput: result.plan_input, plan: null }
            : {}),
        });
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
              <CourseSheet onSave={save} />
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
            {view === "course" && (
              <RouteRequestForm
                places={raw.map((place) => ({ ...place, region: placeRegionLabel(place, "") }))}
                defaultDate={session.planInput?.request.dates[0]}
                disabled={action.busy || !session.planInput?.stops.length}
                submitLabel={
                  session.route?.route_calculated
                    ? t("조건을 바꿔 다시 계산")
                    : t("선택 코스 경로 계산")
                }
                onSubmit={route}
              />
            )}
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
  // 코스 URL은 폭과 관계없이 기존 저장 코스·초안·경로 흐름으로 엽니다.
  // 데스크톱 지점 지도는 코스를 읽지 않으므로 지점 보기에서만 사용합니다.
  const isDesktop = useIsDesktop();
  const isCourse = new URLSearchParams(window.location.hash.split("?")[1]).get("view") === "course";
  return isDesktop && !isCourse ? <MapDesktop /> : <MapScreen />;
}
