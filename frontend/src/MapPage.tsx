import { useEffect, useMemo, useState } from "react";
import { gradeOf } from "./groupAGrade";
import { GradeChip, Icon, StateChip, type IconName } from "./pongdangUi";
import { AppTabBar } from "./appTabBar";
import { usePlacesById } from "./usePlacesById";
import { useResource } from "./useResource";
import { useConditions } from "./useConditions";
import type { DefaultPlaceSelection } from "./useProductData";
import { useAction } from "./useAction";
import { ConditionScoreDetails } from "./ConditionScoreDetails";
import {
  conditionScore,
  productPlaces,
  kstDate,
  metricText,
  evidenceText,
  timeLabel,
  type Place,
  type ClassifiedWaterPlace,
  type Conditions,
} from "./productData";
import {
  directionLink,
  planItems,
  travelJson,
  routeReasonsText,
  type RecommendationResult,
  type RouteResult,
  type TripPlan,
} from "./travelApi";
import { setTravelSession, useTravelSession } from "./travelSession";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import "./mapPage.css";

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
  search,
  setSearch,
}: {
  view: View;
  selectedSpotId: number | null;
  onSelectSpot: (id: number) => void;
  spots: Spot[];
  search: string;
  setSearch: (value: string) => void;
}) {
  const session = useTravelSession();
  const courseIds =
    session.route?.route?.items.map((item) => item.spot_id) ??
    session.planInput?.stops.map((item) => item.spot_id) ??
    [];
  const key = JSON.stringify([
    spots.map((spot) => [spot.id, spot.lat, spot.lng]),
    view,
    courseIds,
  ]);
  const markers = useMemo(() => {
    const [coords, currentView, ids] = JSON.parse(key) as [
      [number, number | null, number | null][],
      View,
      number[],
    ];
    return coords
      .filter(
        ([id, lat, lng]) =>
          lat !== null &&
          lng !== null &&
          (currentView === "spots" || ids.includes(id)),
      )
      .map(([id, latitude, longitude]) => ({
        id: String(id),
        latitude: latitude!,
        longitude: longitude!,
      }));
  }, [key]);
  const paths = useMemo(
    () =>
      view === "course"
        ? (session.route?.route?.legs.map(
            (leg) => leg.geometry?.polyline ?? [],
          ) ?? [])
        : [],
    [session.route, view],
  );
  return (
    <div className="mp-stage">
      <div className="mp-sbar">
        <span>{timeLabel(new Date().toISOString())}</span>
        <span className="mp-sbar-mark">
          {view === "spots" ? "지도" : "코스 지도"}
        </span>
        <span>강릉</span>
      </div>

      {view === "spots" ? (
        <label className="mp-searchbar">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
            placeholder="물놀이 할 곳 찾기"
            aria-label="장소명·지역 검색"
            style={{
              border: 0,
              padding: 0,
              minWidth: 0,
              width: "100%",
              background: "transparent",
              color: "inherit",
              font: "inherit",
            }}
          />
        </label>
      ) : (
        <div className="mp-searchbar is-course">
          <Icon name="course" size={16} />
          {`선택 코스 · ${courseIds.length}곳 · ${session.route?.route ? `${session.route.route.travel_minutes}분 이동` : "경로 계산 전"}`}
        </div>
      )}

      <div className="mp-slot mp-tile-slot">
        <KakaoMapCanvas
          markers={markers}
          paths={paths}
          selectedId={selectedSpotId === null ? null : String(selectedSpotId)}
          renderMarker={(id) => {
            const spot = spots.find((item) => item.id === Number(id));
            if (!spot) return null;
            const grade = gradeOf(spot.score);
            return (
              <button
                type="button"
                className={
                  "mp-pin" + (spot.id === selectedSpotId ? " is-selected" : "")
                }
                style={{ position: "relative", transform: "none" }}
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
      </div>
    </div>
  );
}

function SpotSheet({
  spot,
  conditions,
  onAdd,
  onFavorite,
}: {
  spot: Spot;
  conditions?: Conditions;
  onAdd: () => void;
  onFavorite: () => void;
}) {
  const href = directionLink(spot.name, spot.lat, spot.lng);
  const tiles: { name: string; value: string; icon: IconName }[] = [
    { name: "수온", value: spot.waterTemp, icon: "thermometer" },
    { name: "기온", value: spot.airTemp, icon: "sun" },
    { name: "풍속", value: spot.wind, icon: "wind" },
  ];
  return (
    <>
      <div className="mp-card">
        <div className="mp-spot-head">
          <div>
            <div className="mp-spot-name">{spot.name}</div>
            <div className="mp-spot-address">{spot.address}</div>
          </div>
          <div className="mp-spot-score">
            <div
              className="mp-num mp-spot-score-num"
              style={{ color: gradeOf(spot.score).color }}
            >
              {spot.score === null ? "–" : spot.score}
            </div>
            <GradeChip score={spot.score} bare />
          </div>
        </div>

        <div className="mp-tiles">
          {tiles.map((tile) => (
            <div className="mp-tile" key={tile.name}>
              <Icon name={tile.icon} size={15} className="mp-tile-icon" />
              <div className="mp-num mp-tile-value">{tile.value}</div>
              <div className="mp-tile-name">{tile.name}</div>
            </div>
          ))}
        </div>

        <div className="mp-chips">
          <span className="mp-unknown-chip">
            <Icon name="warning" size={11} />
            안전 상태 {conditions?.safety_status ?? "unknown"}
          </span>
          <StateChip kind="live" />
        </div>

        <p className="mp-note">
          지도 점수는 선택한 장소를 조회한 값입니다. {evidenceText(conditions)} 안전 상태 unknown은 판정 없음이며 안전함이
          아닙니다.
        </p>
        <ConditionScoreDetails data={conditions} className="mp-note" />
      </div>

      <div className="mp-actions">
        <a
          className="mp-secondary"
          href={href ?? undefined}
          aria-disabled={!href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="transit" size={16} />
          길찾기
        </a>
        <button type="button" className="mp-primary" onClick={onAdd}>
          <Icon name="course" size={16} />
          코스에 넣기
        </button>
      </div>
      <p className="mp-note" style={{ marginTop: 0 }}>
        <StateChip kind="live" /> 카카오 지도에 등록 좌표를 전달합니다. 코스에
        넣으면 저장 전 일정에 추가합니다.{" "}
        <a
          href="#favorites"
          onClick={(event) => {
            event.preventDefault();
            onFavorite();
          }}
        >
          즐겨찾기 저장 →
        </a>
      </p>
    </>
  );
}

function CourseSheet({ onSave }: { onSave: () => void }) {
  const session = useTravelSession();
  const items = session.route?.route?.items ?? planItems(session.plan);
  const stops = items.length
    ? items.map((item, index) => ({
        no: index + 1,
        name: item.name,
        meta: `${timeLabel(item.arrival_at)} 도착`,
        distance: session.route?.route?.legs[index]
          ? `${session.route.route.legs[index].duration_minutes}분`
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
          meta: "방문 시각 미계산",
          distance: null,
        }));
  return (
    <>
      <div className="mp-card">
        <div className="mp-card-top">
          <div className="mp-card-title">이동 순서</div>
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
              <span className="mp-stop-dist">{stop.distance ?? "–"}</span>
            </div>
          ))}
        </div>
        <p className="mp-note">
          {session.route?.route_calculated
            ? `출발 기준 교통 자료의 예상시간입니다. 선택한 후보 안에서 비교한 경로이며, ${session.route.optimality === "provisional_missing_comparison_evidence" ? "일부 비교 자료가 부족한 임시 결과입니다." : "전체 지역의 최적 경로를 뜻하지 않습니다."}`
            : "이동시간과 도로 경로는 아직 계산하지 않았습니다."}{" "}
          {stops.length === 0 &&
            "추천에서 장소를 고르거나 지도에서 코스에 넣어 주세요."}
        </p>
      </div>

      <div className="mp-actions">
        <a className="mp-secondary" href="#recommend">
          <Icon name="transit" size={16} />
          추천에서 편집
        </a>
        <button
          type="button"
          className="mp-primary"
          disabled={!session.planInput || Boolean(session.plan?.plan_id)}
          onClick={onSave}
        >
          <Icon name="save" size={16} />
          {session.plan?.plan_id ? "저장됨" : "내 코스에 저장"}
        </button>
      </div>
      <p className="mp-note" style={{ marginTop: 0 }}>
        <StateChip kind="partial" /> 도로 선은 실제 길찾기 응답이 있는 구간만
        표시합니다. 저장은 방문 장소와 순서를 보존하며 정밀 ETA는 보존하지
        않습니다.
      </p>
    </>
  );
}

export function MapPage() {
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
  const [search, setSearch] = useState("");
  const waterCatalog = useResource<ClassifiedWaterPlace[]>(
    "livecams/preview/places?q=" + encodeURIComponent(search),
  );
  const defaultPlace = useResource<DefaultPlaceSelection>(search ? null : "water-index/default-place");
  const catalog = search ? waterCatalog : {
    ...waterCatalog,
    error: defaultPlace.error ?? waterCatalog.error,
    data: defaultPlace.data || waterCatalog.data
      ? [...(defaultPlace.data?.rows ?? []), ...(waterCatalog.data ?? [])] : undefined,
  };
  const places = { ...catalog, data: catalog.data ? productPlaces(catalog.data) : undefined };
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
  const raw = [
    ...new Map(
      [...(places.data?.rows ?? []), ...coursePlaces.rows].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ];
  const selected =
    raw.find((item) => item.id === selectedSpotId) ??
    raw.find((item) => item.id === defaultPlace.data?.place?.id) ??
    raw.find((item) => item.type === "beach") ??
    raw[0];
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
  const [originId, setOriginId] = useState("");
  const [departure, setDeparture] = useState(
    () =>
      `${session.planInput?.request.dates[0] ?? kstDate()}T${timeLabel(new Date(Date.now() + 600000).toISOString())}`,
  );
  const add = () =>
    void action.run(async (signal) => {
      if (!spot) return;
      const input = session.planInput ?? {
        request: {
          dates: [kstDate()],
          region: "강릉",
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
  const route = () =>
    void action.run(async (signal) => {
      const origin = raw.find((item) => item.id === Number(originId));
      if (!origin || !departure || !session.planInput)
        throw new Error("출발지·출발시각·방문 장소를 선택해 주세요.");
      const request = {
        ...session.planInput.request,
        dates: [departure.slice(0, 10)],
        departure_time: departure.slice(11),
        origin: { label: origin.name, spot_id: origin.id },
        must_include: session.planInput.stops.map((item) => item.spot_id),
      };
      const recommendations = await travelJson<RecommendationResult>(
        import.meta.env.BASE_URL,
        "travel/recommendations",
        "POST",
        { request, limit: 5 },
        signal,
      );
      const ranks = recommendations.recommendations
        .filter((item) => request.must_include.includes(item.spot_id))
        .map((item) => item.rank);
      if (
        ranks.length !== request.must_include.length ||
        !recommendations.selection_token
      )
        throw new Error(
          "선택 장소 일부를 현재 조건에서 경로 후보로 확인하지 못했습니다. 후보를 다시 선택해 주세요.",
        );
      const result = await travelJson<RouteResult>(
        import.meta.env.BASE_URL,
        "travel/routes/recommend",
        "POST",
        {
          selection_token: recommendations.selection_token,
          candidate_ranks: ranks,
          stop_count: ranks.length,
          include_geometry: true,
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
  return (
    <article className="map-page">
      <div className="mp-frame">
        <Stage
          view={view}
          spots={spots}
          selectedSpotId={selected?.id ?? null}
          onSelectSpot={setSelectedSpotId}
          search={search}
          setSearch={(value) => {
            setSearch(value);
            setSelectedSpotId(null);
          }}
        />
        <div className="mp-sheet">
          <div className="mp-handle" aria-hidden="true" />
          <div className="mp-switch" role="group" aria-label="지도 보기 전환">
            {(["spots", "course"] as const).map((key) => (
              <button
                type="button"
                key={key}
                className={"mp-switch-item" + (view === key ? " is-on" : "")}
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                {key === "spots" ? "지점 보기" : "코스 경로"}
              </button>
            ))}
          </div>
          <fieldset
            disabled={action.busy}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            {view === "spots" ? (
              spot ? (
                <SpotSheet
                  spot={spot}
                  conditions={conditions.data}
                  onAdd={add}
                  onFavorite={favorite}
                />
              ) : (
                <div className="mp-card">
                  {places.loading ? "장소 조회 중" : "검색 결과 없음"}
                </div>
              )
            ) : (
              <CourseSheet onSave={save} />
            )}
            <p
              className="mp-note"
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
                  ? "서버에 요청 중입니다…"
                  : `검색 결과 ${raw.length}곳 · 최대 100곳`)}{" "}
              {session.route && !session.route.route_calculated
                ? `경로 미계산: ${routeReasonsText(session.route.reason_codes)}`
                : ""}
            </p>
            <div className="mp-slot mp-todo">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  route();
                }}
              >
                <b>최적경로 탐색</b>
                <br />
                <label>
                  출발지{" "}
                  <select
                    aria-label="출발지"
                    value={originId}
                    onChange={(event) => setOriginId(event.target.value)}
                  >
                    <option value="">등록 장소 선택</option>
                    {raw.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <br />
                <label>
                  출발시각 · KST{" "}
                  <input
                    type="datetime-local"
                    value={departure}
                    onChange={(event) => setDeparture(event.target.value)}
                    required
                  />
                </label>
                <br />
                <button
                  type="submit"
                  className="mp-secondary"
                  disabled={!session.planInput}
                >
                  선택 코스 경로 계산
                </button>
              </form>
            </div>
            <div className="mp-slot mp-todo">
              <div>
                <b>편의시설 필터</b>
                <br />
                샤워장 · 주차 · 카페 · 반려동물 가능
                <br />
                시설 근거별 필터 화면 미작성
              </div>
            </div>
          </fieldset>
          <AppTabBar active="map" />
        </div>
      </div>
    </article>
  );
}
