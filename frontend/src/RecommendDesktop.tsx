import { useEffect, useMemo, useState } from "react";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import {
  DesktopHero,
  DesktopNav,
  DesktopShell,
  FootNote,
  LabelRow,
  SplitBody,
} from "./pongdangDesktop";
import { Icon, StateChip } from "./pongdangUi";
import { AiSuggestion } from "./pongdangUi";
import { dateLabel, kstDate, timeLabel } from "./productData";
import { useAction } from "./useAction";
import { useResource } from "./useResource";
import {
  kakaoRouteLink,
  routePaths,
  planItems,
  routeReasonsText,
  travelJson,
  type RecommendationResult,
  type TravelRequest,
  type TripPlan,
} from "./travelApi";
import { setTravelSession } from "./travelSession";
import { RouteRequestForm } from "./RouteRequestForm";
import { useRouteFormSources, useTravelConcierge } from "./useTravelConcierge";
import { ModelTraceButton, ModelTraceDialog } from "./ModelTraceDialog";
import "./recommendDesktop.css";

// 데스크탑 추천(핸드오프 18b)입니다. 모바일의 여러 단계(취향 고르기 → 대화 →
// 코스 → 지도)를 **한 페이지의 세로 흐름**으로 접었습니다.
//
// 모바일과 같은 서버 계약을 씁니다. 취향은 서버 키워드 카탈로그에서 읽고,
// 대화와 경로 계산은 useTravelConcierge 가 담당합니다. 값이 없으면 «–» 이며
// 0 이나 안전을 뜻하지 않습니다.

interface KeywordCatalogue {
  version: string;
  categories: {
    id: string;
    label: string;
    max_selections: number;
    options: { id: string; label: string }[];
  }[];
}

/** 서버가 발행한 카테고리 중 이 화면에서 고르게 하는 것들. 프런트가 키워드
 *  ID 를 만들지 않습니다. */
const PICKABLE = ["place_type", "activity", "companion", "atmosphere"];

const OPENER = "어떤 물놀이를 찾으세요? 조건을 말로 적어도 됩니다.";
const FOLLOWUPS = [
  "이 후보들로 경로 짜줘",
  "아이랑 갈 만한 곳으로",
  "더 가까운 곳으로",
];

export function RecommendDesktop() {
  const action = useAction();
  const candidateAction = useAction({ replace: true });
  const saveAction = useAction();
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const keywords = useResource<KeywordCatalogue>("travel/keywords");
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const categories = (keywords.data?.categories ?? []).filter((category) =>
    PICKABLE.includes(category.id),
  );
  const selectionCount = Object.values(picked).flat().length;

  const baseRequest = (): TravelRequest => ({
    dates: [kstDate()],
    region: "강릉",
    place_role: "visit",
    preferred_tags: [],
    activity: "relax",
    transport: "driving",
    day_trip: true,
    keyword_selection: Object.entries(picked)
      .filter(([, values]) => values.length)
      .map(([category, values]) => ({ category, values })),
  });

  const { session, bubbles, asked, draft, setDraft, publish, send: sendChat, requestRoute, lastTrace } =
    useTravelConcierge({ opener: OPENER, baseRequest, action });
  const [traceOpen, setTraceOpen] = useState(false);
  const recommendation = session.recommendation;
  const calculated = session.route?.route;
  const items = calculated?.items ?? [];
  // 저장된 코스를 열면 후보 목록(recommendation)은 없고 정차지만 있습니다.
  // 그것도 보여 줄 코스이므로 같은 자리에 그립니다 -- 예전에는 이 화면이
  // recommendation 하나만 보고 그려서, 저장한 코스를 열면 빈 화면이었습니다.
  const savedStops = recommendation ? [] : planItems(session.plan);

  const clearSavedNotice = () => {
    saveAction.cancel();
    setSavedPlanId(null);
    // A saved URL belongs to the previous selection. Do not reload it when a
    // new empty/failed candidate request changes the session.
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
    action.cancel();
    clearSavedNotice();
    setTravelSession({ recommendation: null, plan: null, planInput: null, route: null });
    void candidateAction.run(async (signal) => {
      const result = await travelJson<RecommendationResult>(
        import.meta.env.BASE_URL,
        "travel/recommendations",
        "POST",
        { request: baseRequest(), limit: 5 },
        signal,
      );
      if (!signal.aborted) publish(result);
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

  // 저장한 코스 열기. 내 코스 화면이 만드는 `#recommend?plan_id=…` 링크는
  // 모바일 폭에서만 열렸습니다 -- 이 화면이 plan_id 를 읽지 않았기 때문입니다.
  const planId = new URLSearchParams(window.location.hash.split("?")[1]).get(
    "plan_id",
  );
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

  const context = `강릉 · ${dateLabel()} · 취향 ${selectionCount}개 선택`;
  const listHeadline = candidateAction.busy ? "후보 조회 중"
    : candidateAction.error ? "후보 조회 실패"
    : recommendation ? `후보 ${recommendation.recommendations.length}곳` : "후보 조회 전";
  const error = candidateAction.error || action.error || saveAction.error || requestedPlan.error;
  const mutationBusy = action.busy || candidateAction.busy || saveAction.busy;

  return (
    <DesktopShell>
      <DesktopHero nav={<DesktopNav active="recommend" context={context} />}>
        <div className="rd-hero">
          <div className="rd-hero-lead">
            <div className="pd-dk-kick rd-hero-kick">취향 기반 추천</div>
            <h1 className="rd-hero-title">
              고른 조건으로
              <br />
              실제 장소를 찾습니다
            </h1>
            <p className="rd-hero-note">
              서버가 등록 장소 카탈로그를 조회해 취향 일치 순서로 후보를
              만듭니다. 경로는 출발지와 출발 시각을 넣어 따로 요청합니다.
              순서와 시각은 예상값이며 안전 판정이 아닙니다.
            </p>
          </div>
          <div className="rd-hero-metrics">
            <div>
              <div className="rd-metric-name">후보</div>
              <div className="pd-dk-num rd-metric-value">
                {recommendation?.recommendations.length ?? "–"}
              </div>
            </div>
            <div>
              <div className="rd-metric-name">이동 합</div>
              <div className="pd-dk-num rd-metric-value">
                {calculated ? `${calculated.travel_minutes}분` : "–"}
              </div>
            </div>
            <div>
              <div className="rd-metric-name">예상 귀가</div>
              <div className="pd-dk-num rd-metric-value">
                {calculated ? timeLabel(calculated.return_at) : "–"}
              </div>
            </div>
          </div>
        </div>
      </DesktopHero>

      <LabelRow
        kick="1 · 취향"
        title={
          <>
            무엇을 하고
            <br />
            싶으신가요
          </>
        }
        desc="선택 항목은 서버 키워드 카탈로그(travel-keywords.v1)에서 읽습니다. 선택은 색과 ✓ 두 겹으로 표시합니다."
      >
        {categories.length === 0 ? (
          <p className="rd-note">
            {keywords.error ??
              (keywords.loading
                ? "선택 항목을 불러오는 중입니다."
                : "선택 항목을 불러오지 못했습니다.")}
          </p>
        ) : (
          categories.map((category) => (
            <div className="rd-taste-group" key={category.id}>
              <div className="pd-dk-kick">
                {category.label} · 최대 {category.max_selections}개
              </div>
              <div className="rd-tastes">
                {category.options.map((option) => {
                  const values = picked[category.id] ?? [];
                  const on = values.includes(option.id);
                  return (
                    <button
                      type="button"
                      key={option.id}
                      className={"rd-taste" + (on ? " is-on" : "")}
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((current) => {
                          const next = on
                            ? values.filter((value) => value !== option.id)
                            : [...values, option.id].slice(
                                -category.max_selections,
                              );
                          return { ...current, [category.id]: next };
                        })
                      }
                    >
                      {option.label}
                      {on && <Icon name="check" size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div className="rd-row-foot">
          {/* 이 화면이 아직 하지 못하는 일은 적어 둡니다. 없는 기능을 말없이
              비워 두면 「골랐는데 반영되지 않았다」로 읽힙니다. */}
          <span className="rd-note">
            고른 조건은 이번 요청에만 적용합니다. 취향 저장은 모바일 추천 화면의
            취향 확정에서 합니다. 날짜는 오늘로 고정이며, 다른 날짜와 저장한
            코스의 재알림도 모바일 추천 화면에 있습니다.
          </span>
          <button
            type="button"
            className="pd-dk-button rd-remake"
            onClick={requestList}
          >
            이 조건으로 후보 찾기
          </button>
          {candidateAction.busy && <>
            <span role="status">후보를 조회하고 있습니다…</span>
            <button type="button" className="pd-dk-button is-quiet" onClick={candidateAction.cancel}>후보 조회 취소</button>
          </>}
        </div>
      </LabelRow>

      <LabelRow
        kick="2 · 대화로 좁히기"
        title={
          <>
            조건을 말로
            <br />
            덧붙일 수 있습니다
          </>
        }
        desc="보낸 문장은 서버가 여행 조건 변경으로 해석합니다. 답변 문장은 서버가 조회한 장소·시각으로 구성하며 모델이 장소를 만들지 않습니다."
      >
        <SplitBody columns="1fr 1.1fr">
          <div className="rd-ask">
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
                aria-label="컨시어지에게 보낼 내용"
                placeholder="오후엔 몸 녹일 곳까지 넣어 주세요"
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="submit"
                className="pd-dk-button rd-send"
                disabled={action.busy || !draft.trim()}
              >
                보내기
              </button>
            </form>
            <div className="rd-prompts">
              {(asked ? FOLLOWUPS : ["물 보면서 쉬고 싶어요", ...FOLLOWUPS]).map(
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
              headline={`대화 ${asked}턴 · ${listHeadline}`}
              basis={
                recommendation
                  ? `조회 ${timeLabel(recommendation.queried_at)} KST · 상태 ${recommendation.status} · ${recommendation.request.preferred_tags.join(" · ") || "선택 취향 없음"}`
                  : "아직 서버 조회 결과가 없습니다. 조건을 보내면 실제 장소를 조회합니다."
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
                <div className="rd-bubble">답변을 조회하고 있습니다…</div>
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
              AI 문장은 서버가 조회한 근거로만 만들어집니다. 안전 판단에는 쓸 수
              없습니다.
            </p>
          </div>
        </SplitBody>
      </LabelRow>

      <LabelRow
        kick="3 · 후보와 경로"
        title={
          calculated
            ? `방문 ${items.length}곳 · ${calculated.travel_minutes}분 이동`
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
        desc="활동 조건 점수는 장소별 근거와 활동 지원 여부에 따라 달라지며 안전 판정이 아닙니다. 경로 시각은 출발 기준 교통 자료의 예상값입니다."
      >
        {recommendation?.recommendations.length || savedStops.length ? (
          <>
            <div className="rd-steps">
              {(calculated
                ? items.map((item, index) => ({
                    key: `${item.spot_id}:${index}`,
                    no: index + 1,
                    name: item.name,
                    when: `${timeLabel(item.arrival_at)} 도착 · ${timeLabel(item.departure_at)} 출발 · ${calculated.legs[index] ? `${calculated.legs[index].duration_minutes}분 이동` : "이동시간 –"}`,
                    link: kakaoRouteLink(
                      index === 0 ? calculated.origin : items[index - 1],
                      [item],
                    ),
                  }))
                : recommendation
                ? recommendation.recommendations.map((item) => ({
                    key: String(item.spot_id),
                    no: item.rank,
                    name: item.name,
                    when: `${item.region ?? "지역 미확인"} · ${item.activities.map((activity) => activity.label).join(" · ") || "활동 미확인"}`,
                    link: null,
                  }))
                : // 저장된 코스의 정차지. 시각이 있으면 함께 적습니다.
                  savedStops.map((stop, index) => ({
                    key: `${stop.spot_id}:${index}`,
                    no: index + 1,
                    name: stop.name,
                    when: stop.arrival_at
                      ? `${timeLabel(stop.arrival_at)} 도착`
                      : "시각 미정",
                    link: null,
                  }))
              ).map((step) => (
                <div className="rd-step" key={step.key}>
                  <span className="pd-dk-num rd-step-no">{step.no}</span>
                  <div className="rd-step-body">
                    <div className="rd-step-name">{step.name}</div>
                    <div className="rd-step-when">{step.when}</div>
                  </div>
                  {step.link ? (
                    <a
                      className="rd-step-link"
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      이 구간 길찾기
                    </a>
                  ) : (
                    <span className="rd-step-link is-empty">
                      {calculated ? "좌표 –" : "경로 계산 전"}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {session.route && !session.route.route_calculated && (
              <p className="rd-note">
                경로 미계산:{" "}
                {routeReasonsText(session.route.reason_codes) ||
                  "경로 계산 조건을 확인해 주세요."}
              </p>
            )}
            {calculated && (
              <p className="rd-note">
                {session.route?.optimality ===
                "provisional_missing_comparison_evidence"
                  ? "일부 환경·경로 비교 자료가 없어 최적 경로로 확정하지 않은 잠정 순서입니다."
                  : "선택한 후보 안에서 비교한 순서이며 전체 지역의 최적 경로가 아닙니다."}{" "}
                {routeReasonsText(session.route?.reason_codes ?? [])}
              </p>
            )}
            <RouteRequestForm
              places={originOptions}
              candidates={candidates}
              defaultDate={
                // 저장된 코스를 연 경우에는 그 코스의 날짜를 씁니다.
                (recommendation ?? session.plan)?.request.dates[0]
              }
              disabled={mutationBusy}
              submitLabel={
                calculated ? "조건을 바꿔 다시 계산" : "이 후보로 경로 계산"
              }
              onSubmit={(value) => { clearSavedNotice(); requestRoute(value); }}
            />
            <div className="rd-row-foot">
              <button
                type="button"
                className="pd-dk-button"
                disabled={mutationBusy || !session.planInput}
                onClick={save}
              >
                {session.plan ? "이 코스 다시 저장" : "내 코스에 저장"}
              </button>
              {session.plan && (
                <a className="pd-dk-button is-quiet" href="#my-courses">
                  저장한 코스 보기 →
                </a>
              )}
              <a className="pd-dk-button is-quiet" href="#map?view=course">
                지도 탭에서 보기 →
              </a>
              {wholeTrip && (
                <a
                  className="pd-dk-button"
                  href={wholeTrip}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  카카오맵에서 순서대로 길찾기 →
                </a>
              )}
            </div>
            {/* 저장 결과. 후보가 있는 동안에는 아래 빈 상태 문단이 그려지지
                않으므로, 실패도 성공도 이 자리에서 말해야 합니다 -- 누르고 나서
                아무 일도 없는 것처럼 보이면 안 됩니다.

                useAction 의 error 는 없을 때 빈 문자열입니다. ?? 로 이으면
                빈 줄이 그려지므로 || 로 잇습니다. */}
            {(error || (savedPlanId && session.plan?.plan_id === savedPlanId) || requestedPlan.data === session.plan) && (
              <p className="rd-note" role={error ? "alert" : "status"}>
                {error || (savedPlanId && session.plan?.plan_id === savedPlanId
                  ? "내 코스에 저장했습니다. 이 주소(plan_id)로 다시 열 수 있습니다."
                  : "저장된 코스를 불러왔습니다. 조건을 바꾸면 다시 저장할 수 있습니다.")}
              </p>
            )}
          </>
        ) : (
          <p className="rd-note" role={error ? "alert" : "status"}>
            {error ||
              (candidateAction.busy ? "후보를 조회하고 있습니다…" : "") ||
              recommendation?.clarification ||
              "아직 후보가 없습니다. 조건을 고르고 「이 조건으로 후보 찾기」를 누르거나 대화로 알려 주세요."}
          </p>
        )}
      </LabelRow>

      <LabelRow
        kick="4 · 지도"
        title={
          calculated
            ? `경로 ${paths.length}구간`
            : `후보 ${markers.length}곳`
        }
        desc="좌표는 등록 카탈로그 값입니다. 도로 선은 길찾기 응답을 받은 구간만 그리며, 받지 못한 구간은 직선으로 채우지 않습니다."
      >
        <div className="rd-map">
          {markers.length ? (
            <KakaoMapCanvas
              markers={markers}
              paths={paths}
              selectedId={null}
              renderMarker={(id) => {
                if (id === "origin")
                  return <span className="rd-pin is-origin">출발</span>;
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
              지도에 찍을 실제 좌표가 아직 없습니다. 후보를 먼저 조회해 주세요.
            </p>
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
              좌표가 없는 {unmappable}곳은 지도에 찍지 않습니다.
            </span>
          )}
          {calculated && paths.length < calculated.legs.length && (
            <span className="rd-note rd-legend-note">
              도로 선을 받은 구간 {paths.length}/{calculated.legs.length}개만
              그립니다.
            </span>
          )}
        </div>
      </LabelRow>

      <FootNote
        missing="편의시설 · 대중교통 경로 · 코스 공유"
        note="후보 순서는 취향 일치 기준이고, 경로 시각은 출발 기준 교통 자료의 예상값입니다. 점수 · 신뢰도 · 안전 판정은 서로 다른 값이며 하나로 요약하지 않습니다. 값이 없으면 «–» 로 두며 0 이나 안전으로 치환하지 않습니다."
      />
    </DesktopShell>
  );
}
