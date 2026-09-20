import { useMemo, useState } from "react";
import { setTravelSession } from "./travelSession";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl } from "./mascots";
import {
  DesktopHero,
  DesktopNav,
  DesktopShell,
  FootNote,
  LabelRow,
} from "./pongdangDesktop";
import { GradeIcon, Skeleton, StateChip } from "./pongdangUi";
import { planItems, type TripPlan } from "./travelApi";
import {
  conditionPath,
  conditionScore,
  conditionTargetInRange,
  dateLabel,
  timeLabel,
  type Conditions,
} from "./productData";
import { isInitialLoad, useResource } from "./useResource";
import { usePlacesById } from "./usePlacesById";
import "./coursesDesktop.css";

// 데스크탑 내 코스(핸드오프 18d)입니다. 왼쪽 지도(고정) + 오른쪽 시간축 일정,
// 아래 괘선 행에 저장한 코스 목록을 둡니다.
//
// 예전에는 이 화면에 훅이 하나도 없었습니다. 「저장한 코스 3개 · 9월 15일」 ·
// 「3곳 · 12.0km · 4h 30m」 · 09:20 경포 서핑 → 12:00 안목 카페 → 14:30 사천진
// 온천이 전부 파일 안 상수였습니다. 저장한 코스가 하나도 없어도 코스가 있는
// 것처럼 보였습니다.
//
// 이제 모바일 「내 코스」와 **같은 API**(travel/plans)를 읽습니다. 저장된 것이
// 없으면 없다고 적습니다.

export function CoursesDesktop() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const plans = useResource<{ rows: TripPlan[] }>(
    "travel/plans?limit=100&offset=0",
  );
  // 동행 알림 상태. 모바일 내 코스는 이것을 읽는데 이 화면은 조회조차 하지
  // 않아, 알림이 켜진 코스와 꺼진 코스가 같아 보였습니다.
  const sessions = useResource<{
    rows: {
      plan_id: string;
      state: string;
      notifications: { enabled: boolean };
    }[];
  }>("travel/sessions?limit=100&offset=0");
  const courses = (plans.data?.rows ?? []).map((plan) => ({
    id: plan.plan_id!,
    name: plan.request.dates[0]
      ? `${plan.request.dates[0]} 물 코스`
      : "저장 코스",
    date: plan.request.dates.join(" · ") || null,
    items: planItems(plan),
    alarm:
      sessions.data?.rows.some(
        (session) =>
          session.plan_id === plan.plan_id &&
          session.state === "active" &&
          session.notifications.enabled,
      ) ?? false,
    plan,
  }));
  // 아무것도 고르지 않았으면 첫 코스를 폅니다 -- 다만 그것은 **기본 선택**이
  // 아니라 그냥 보여 주는 것이므로, 목록의 눌림 상태(aria-pressed)는 실제로
  // 고른 것만 따릅니다. 예전에는 여기서 강제로 첫 코스를 골라 두어, 다시 눌러
  // 접을 수가 없었습니다.
  const picked = courses.find((course) => course.id === selectedId) ?? null;
  const selected = picked ?? courses[0] ?? null;
  // 조회 결과에서 곧바로 고릅니다. courses 는 매 렌더 새로 만들어지지만
  // plans.data.rows 의 원소는 조회가 바뀔 때만 달라지므로, 그 참조에 기대어
  // 정차지 배열을 고정할 수 있습니다 -- 매 렌더 새 배열을 만들면 아래 지도가
  // 계속 다시 그려집니다.
  const rows = plans.data?.rows;
  const plan = useMemo(
    () => rows?.find((item) => item.plan_id === selectedId) ?? rows?.[0],
    [rows, selectedId],
  );
  const stops = useMemo(
    () =>
      plan?.days.flatMap((day) =>
        day.items.map((item) => ({
          ...item,
          at: item.arrival_at ?? `${day.date}T12:00:00+09:00`,
        })),
      ) ?? [],
    [plan],
  );
  // 좌표는 저장된 코스 장소를 id 로 조회해 얻습니다 -- 예전에는 예시 목록의
  // 검증 좌표 세 개를 그대로 찍고 있었습니다.
  const places = usePlacesById(stops.map((stop) => stop.spot_id));
  // 지도는 markers 참조가 바뀔 때마다 다시 그리므로(KakaoMapCanvas 의 effect),
  // 좌표가 같은 동안에는 같은 배열을 유지해야 합니다. 콜백이 바깥 값을 직접
  // 읽지 않도록 원시 값만 담은 문자열 키에 의존을 좁힙니다(MapPage 와 같은
  // 방식).
  const markerKey = JSON.stringify(
    stops.map((stop, index) => {
      const place = places.rows.find((row) => row.id === stop.spot_id);
      return [stop.spot_id, place?.lat ?? null, place?.lng ?? null, index + 1];
    }),
  );
  const markers = useMemo(() => {
    const coords = JSON.parse(markerKey) as [
      number,
      number | null,
      number | null,
      number,
    ][];
    // 좌표가 없는 장소는 핀을 만들지 않습니다 -- 없는 위치를 임의로 만들지
    // 않습니다.
    return coords.flatMap(([id, latitude, longitude, order]) =>
      latitude !== null && longitude !== null
        ? [{ id: String(id), latitude, longitude, order }]
        : [],
    );
  }, [markerKey]);
  // 점수는 첫 정차지 하나만 조회합니다. 모바일 내 코스와 같은 규칙입니다.
  const first = stops[0];
  const firstValid = conditionTargetInRange(first?.at);
  const firstConditions = useResource<Conditions>(
    firstValid
      ? conditionPath(
          first?.spot_id,
          plan?.request.activity ?? "relax",
          first?.at,
        )
      : null,
  );
  const firstScore = conditionScore(firstConditions.data);
  const firstGrade = gradeOf(firstScore);

  return (
    <DesktopShell>
      <DesktopHero
        nav={
          <DesktopNav
            active="my-courses"
            context={`저장한 코스 ${courses.length}개 · ${dateLabel()}`}
          />
        }
        band
        wave="static"
      >
        <div className="cd-hero">
          <div className="cd-hero-lead">
            <div className="pd-dk-kick cd-hero-kick">내 코스</div>
            <h1 className="cd-hero-title">
              {selected ? selected.name : "저장한 코스가 없습니다"}
            </h1>
          </div>
          <img
            className="cd-hero-mascot"
            src={mascotUrl("course")}
            alt={MASCOT_ALT}
            width={86}
            height={86}
          />
          {/* 예전에는 여기가 「3곳 · 12.0km · 4h 30m」이었습니다. 이동 거리와
              소요 시간을 코스 목록 API 가 내려주지 않으므로 장소 수만 싣고,
              없는 값은 «–» 로 둡니다. */}
          <div className="cd-hero-summary">
            <div>
              <div className="cd-summary-name">장소</div>
              <div className="pd-dk-num cd-summary-value">
                {selected ? `${stops.length}곳` : "–"}
              </div>
            </div>
            <div>
              <div className="cd-summary-name">날짜</div>
              <div className="pd-dk-num cd-summary-value">
                {selected?.date ?? "–"}
              </div>
            </div>
            <div>
              <div className="cd-summary-name">이동 · 소요</div>
              <div className="pd-dk-num cd-summary-value is-empty">–</div>
            </div>
          </div>
        </div>
      </DesktopHero>

      <div className="cd-stage">
        <div className="cd-map">
          <KakaoMapCanvas
            markers={markers}
            selectedId={null}
            renderMarker={(id) => {
              const marker = markers.find((item) => item.id === id);
              const stop = stops.find((item) => String(item.spot_id) === id);
              if (!marker || !stop) return null;
              return (
                <span className="cd-pin">
                  <span className="pd-dk-num cd-pin-core">{marker.order}</span>
                  <span className="cd-pin-label">{stop.name}</span>
                </span>
              );
            }}
            overlay={
              <span className="cd-map-badge">
                저장된 코스 장소 · 경로선은 지도 탭에서 계산합니다
              </span>
            }
          />
        </div>

        <div className="cd-schedule">
          <div className="cd-schedule-head">
            <span className="pd-dk-kick">
              {selected ? selected.name : "일정"}
            </span>
            <StateChip kind={plans.data ? "live" : "no_data"} />
          </div>
          {stops.map((stop, index) => {
            // 점수는 첫 정차지만 조회합니다. 정차지마다 부르면 요청이 코스
            // 길이만큼 늘어납니다.
            const score = index === 0 ? firstScore : null;
            const grade = index === 0 ? firstGrade : gradeOf(null);
            const place = places.rows.find((row) => row.id === stop.spot_id);
            return (
              <div className="cd-item" key={`${stop.spot_id}-${index}`}>
                <div className="cd-item-time">
                  <div className="pd-dk-num cd-item-clock">
                    {stop.arrival_at ? timeLabel(stop.arrival_at) : "–"}
                  </div>
                  <div className="cd-item-duration">
                    {stop.arrival_at ? "도착" : "시각 미정"}
                  </div>
                </div>
                <div className="cd-item-body">
                  <div className="cd-item-name">{stop.name}</div>
                  <div className="cd-item-detail">
                    {place?.address ?? "주소 조회 중"}
                  </div>
                  <div className="cd-item-score" data-grade={grade.key}>
                    <GradeIcon gradeKey={grade.key} size={12} />
                    {index === 0 && isInitialLoad(firstConditions) ? (
                      <Skeleton width="3em" label="점수 조회 중" />
                    ) : (
                      `점수 ${score ?? "–"} · ${grade.label}`
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {!stops.length && (
            <p className="cd-note" role={plans.error ? "alert" : "status"}>
              {plans.error ??
                (plans.loading
                  ? "저장 코스를 불러오는 중입니다."
                  : "아직 저장한 코스가 없습니다. 추천에서 코스를 저장해 주세요.")}
            </p>
          )}
          <div className="cd-actions">
            {/* 예전에는 「순서 바꾸기」 · 「공유」 버튼이 있었지만 눌러도 아무
                일이 없었습니다. 실제로 동작하는 링크만 둡니다. */}
            {/* 고른 코스를 그대로 추천 화면으로 넘깁니다. 예전에는 #recommend
                로만 보내 선택이 사라졌습니다 -- 모바일 내 코스는 세션을
                이관하고 plan_id 를 함께 싣습니다. */}
            {selected && (
              <a
                className="pd-dk-button"
                href={`#recommend?plan_id=${selected.id}`}
                onClick={() =>
                  setTravelSession({
                    plan: selected.plan,
                    planInput: {
                      request: selected.plan.request,
                      stops: selected.plan.input_stops,
                    },
                    recommendation: null,
                    route: null,
                  })
                }
              >
                이 코스 열기 →
              </a>
            )}
            <a
              className={"pd-dk-button" + (selected ? " is-quiet" : "")}
              href="#recommend"
            >
              추천에서 코스 만들기 →
            </a>
            <a className="pd-dk-button is-quiet" href="#map?view=course">
              지도에서 경로 계산 →
            </a>
            <span className="cd-note">
              {places.error ??
                "정차지 좌표는 저장된 장소를 조회해 찍습니다. 좌표가 없는 장소는 지도에 나타나지 않습니다."}{" "}
              {/* 나머지 정차지의 «–» 는 조건이 나쁜 것이 아니라 묻지 않은
                  것입니다. 그 사실을 적지 않으면 자료 없음으로 읽힙니다. */}
              점수는 첫 정차지만 조회합니다 -- 나머지 –는 조회하지 않았다는
              뜻이며 자료 없음이 아닙니다.
            </span>
          </div>
        </div>
      </div>

      <LabelRow
        kick="저장한 코스"
        title={`${courses.length}개`}
        chip={<StateChip kind={plans.data ? "live" : "no_data"} />}
        desc="추천 탭에서 저장한 코스가 그대로 쌓입니다. 최대 100개까지 조회합니다."
      >
        {courses.map((course) => (
          <button
            type="button"
            className={
              "cd-saved" + (course.id === picked?.id ? " is-selected" : "")
            }
            key={course.id}
            aria-pressed={course.id === picked?.id}
            onClick={() =>
              // 다시 누르면 접힙니다. 예전에는 한 번 고르면 해제할 수 없었고,
              // 첫 코스가 늘 강제로 펼쳐져 있었습니다.
              setSelectedId((current) =>
                current === course.id ? null : course.id,
              )
            }
          >
            <div className="cd-saved-body">
              <div className="cd-saved-name">{course.name}</div>
              <div className="cd-saved-meta">
                {course.date ?? "날짜 미정"} · {course.items.length}곳 ·{" "}
                {course.items.map((item) => item.name).join(" · ") || "장소 없음"}
              </div>
              <div className="cd-saved-alarm">
                {/* 조회 중과 「꺼짐」은 다릅니다. 모르는 것을 꺼짐으로 바꾸지
                    않습니다. */}
                {sessions.error
                  ? "동행 알림 조회 실패"
                  : sessions.loading
                    ? "동행 알림 조회 중"
                    : course.alarm
                      ? "동행 알림 켬"
                      : "동행 알림 꺼짐"}
              </div>
            </div>
            {/* 이동 거리 · 소요 시간은 코스 목록 API 에 없습니다. «–» 이며
                0 이 아닙니다. */}
            <span className="pd-dk-num cd-saved-duration is-empty">–</span>
          </button>
        ))}
        {!courses.length && (
          <p className="cd-note" role={plans.error ? "alert" : "status"}>
            {plans.error ??
              (plans.loading
                ? "저장 코스를 불러오는 중입니다."
                : "아직 저장한 코스가 없습니다.")}
          </p>
        )}
      </LabelRow>

      <FootNote
        missing="이동 거리 · 소요 시간 · 코스 공유 · 순서 변경"
        note="날짜 · 소요 시간이 없는 코스는 «–» 로 둡니다 — 0 이 아닙니다. 점수는 첫 정차지 기준이며, 정차지마다 조회하지 않습니다."
      />
    </DesktopShell>
  );
}
