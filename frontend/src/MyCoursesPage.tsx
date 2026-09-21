import { t } from "./i18n.ts";
import { useMemo, useState } from "react";
import { CoursesDesktop } from "./CoursesDesktop";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { MapSheet } from "./MapSheet";
import { useSheetHeight } from "./useSheetHeight";
import { usePlacesById } from "./usePlacesById";
import { useIsDesktop } from "./useIsDesktop";
import { gradeOf } from "./groupAGrade";
import { GradeChip, GradeIcon, Icon, StateChip } from "./pongdangUi";
import { AppFootNote, AppHeader, AppShell } from "./AppShell";
import { useResource } from "./useResource";
import { planItems, unknownConditionsText, type TripPlan } from "./travelApi";
import type { Activity } from "./aiApi";
import { ConditionScoreDetails } from "./ConditionScoreDetails";
import { setTravelSession } from "./travelSession";
import { timeLabel, conditionPath, conditionScore, conditionTargetInRange, dataStatusText, type Conditions } from "./productData";
import { useAction } from "./useAction";
import "./myCoursesPage.css";

// 모바일 내 코스입니다. 지도가 프레임을 다 쓰고, 저장한 코스 목록과 상세가
// 그 위에 뜬 시트 안에 있습니다.
//
// 예전에는 이 화면에 **지도가 아예 없었습니다.** 「경포 · 안목 · 사천진」 같은
// 코스를 저장해 두고도 그게 어디인지는 글로만 읽었고, 지도로 보려면 지도 탭으로
// 건너가 코스를 다시 골라야 했습니다. 데스크탑 내 코스는 처음부터 지도를 갖고
// 있었으므로, 같은 라우트가 폭에 따라 다른 사실을 말하고 있었습니다.
//
// 이제 데스크탑과 **같은 방식**으로 정차지 좌표를 조회해 순번 핀을 찍습니다
// (CoursesDesktop 의 markerKey 메모 주석 참고). 좌표가 없는 장소는 핀을 만들지
// 않습니다 -- 없는 위치를 임의로 만들지 않습니다.

const TODO_SCREENS = [
  {
    title: "코스 공유",
    detail: "링크 · 이미지 카드 · 카카오 공유",
  },
  {
    title: "지난 코스 기록",
    detail: "다녀온 장소와 후기 기록 조회",
    href: "#travel-history",
  },
];

function PlanStopScore({ id, name, at, activity }: { id: number; name: string; at: string; activity: Activity }) {
  const valid = conditionTargetInRange(at);
  const conditions = useResource<Conditions>(valid ? conditionPath(id, activity, at) : null);
  return (
    <details className="pd-note">
      <summary>{t("{name} · 장소별 조건 {score}점", { name, score: conditionScore(conditions.data) ?? "–" })}</summary>
      <p>{t("{at} · 저장 일정 시각의 예보입니다.", { at })} {valid ? conditions.error : t("저장 날짜가 조회 범위(현재 기준 앞뒤 31일)를 벗어났습니다.")}</p>
      <ConditionScoreDetails data={conditions.data} />
    </details>
  );
}

function MyCoursesScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const plans = useResource<{ rows: TripPlan[] }>(
    "travel/plans?limit=100&offset=0",
  );
  const sessions = useResource<{
    rows: {
      plan_id: string;
      state: string;
      notifications: { enabled: boolean };
    }[];
  }>("travel/sessions?limit=100&offset=0");
  const share = useAction();
  const courses = (plans.data?.rows ?? []).map((plan) => ({
    id: plan.plan_id!,
    name: plan.request.dates[0]
      ? t("{date} 물 코스", { date: plan.request.dates[0] })
      : t("저장 코스"),
    parts: planItems(plan)
      .map((item) => item.name)
      .join(" · "),
    date: plan.request.dates.join(" · ") || null,
    alarm:
      sessions.data?.rows.some(
        (session) =>
          session.plan_id === plan.plan_id &&
          session.state === "active" &&
          session.notifications.enabled,
      ) ?? false,
    plan,
  }));
  const selected = courses.find((course) => course.id === selectedId) ?? null;
  // 정차지는 조회 결과에서 곧바로 고릅니다. courses 는 매 렌더 새로 만들어지지만
  // plans.data.rows 의 원소는 조회가 바뀔 때만 달라지므로, 그 참조에 기대어
  // 정차지 배열을 고정할 수 있습니다 -- 매 렌더 새 배열을 만들면 아래 지도가
  // 계속 다시 그려집니다(CoursesDesktop 과 같은 방식).
  const rows = plans.data?.rows;
  const plan = useMemo(
    () => rows?.find((item) => item.plan_id === selectedId) ?? null,
    [rows, selectedId],
  );
  const selectedStops = useMemo(
    () =>
      plan?.days.flatMap((day) =>
        day.items.map((item) => ({
          ...item,
          at: item.arrival_at ?? day.date + "T12:00:00+09:00",
        })),
      ) ?? [],
    [plan],
  );
  const first = selectedStops[0];
  const firstTargetValid = conditionTargetInRange(first?.at);
  const selectedConditions = useResource<Conditions>(firstTargetValid
    ? conditionPath(first?.spot_id, selected?.plan.request.activity ?? "relax", first?.at) : null);
  const selectedScore = conditionScore(selectedConditions.data);

  // 정차지 좌표. 코스를 고르기 전에는 조회하지 않습니다 -- 목록만 보는 동안
  // 장소 조회를 낼 이유가 없습니다.
  const places = usePlacesById(selectedStops.map((stop) => stop.spot_id));
  // 지도는 markers 참조가 바뀔 때마다 다시 그리므로(KakaoMapCanvas 의 effect),
  // 좌표가 같은 동안에는 같은 배열을 유지해야 합니다. 콜백이 바깥 값을 직접
  // 읽지 않도록 원시 값만 담은 문자열 키에 의존을 좁힙니다(CoursesDesktop 과
  // 같은 방식).
  const markerKey = JSON.stringify(
    selectedStops.map((stop, index) => {
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
  const sheet = useSheetHeight();
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="my-courses-page">
      <AppShell
        tab="my-courses"
        bare
        fullscreen
        hero={
          <div className="mc-stage">
            <KakaoMapCanvas
              markers={markers}
              selectedId={null}
              insets={{
                top: 60,
                right: 16,
                bottom: sheet.height + 12,
                left: 16,
              }}
              renderMarker={(id) => {
                const marker = markers.find((item) => item.id === id);
                const stop = selectedStops.find(
                  (item) => String(item.spot_id) === id,
                );
                if (!marker || !stop) return null;
                // 코스 핀은 점수가 아니라 **순서**를 말합니다. 점수 핀(지도
                // 화면)과 모양을 다르게 두어 혼동하지 않게 합니다.
                return (
                  <span className="mc-pin">
                    <span className="pd-num mc-pin-core">{marker.order}</span>
                    <span className="mc-pin-label">{stop.name}</span>
                  </span>
                );
              }}
            />

            {/* 지도 위 띠. 공용 .pd-hero 규칙을 쓰되 지도 · 내 코스 두 화면만
                면과 잉크를 반전합니다 -- 흰 면에 코발트 잉크
                (myCoursesPage.css). 그래서 onCobalt 를 주지 않습니다. */}
            <header className="pd-hero mc-topbar">
              <AppHeader
                title={t("내 코스")}
                time={timeLabel(new Date().toISOString())}
              />
            </header>

            {!markers.length && (
              // 빈 지도를 성공처럼 보이게 하지 않습니다. 코스를 고르지 않은
              // 것 · 조회 중인 것 · 찍을 좌표가 없는 것은 서로 다른 사실이므로
              // 구분해 말합니다. 조회 중을 「좌표 없음」으로 단정하지 않습니다.
              <p
                className="mc-map-note"
                role={places.error ? "alert" : "status"}
              >
                {!selected
                  ? t("코스를 고르면 정차지를 지도에 찍습니다.")
                  : (places.error ??
                    (places.loading
                      ? t("정차지 좌표를 조회하고 있습니다.")
                      : t("이 코스의 정차지는 등록 좌표가 없어 지도에 찍지 않았습니다.")))}
              </p>
            )}
          </div>
        }
      >
        <MapSheet
          title={
            selected
              ? selected.name
              : plans.error
                ? t("저장 코스 개수 미확인")
                : plans.loading
                  ? t("저장 코스 조회 중")
                  : t("저장 {count}개", { count: courses.length })
          }
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          sheetRef={sheet.ref}
        >
          <p
            className="pd-note mc-lead"
            role={plans.error ?? sessions.error ?? share.error ? "alert" : "status"}
          >
            {plans.data ? <StateChip kind="live" /> : (
              <span className="pd-state-chip">
                {plans.error ? t("조회 실패") : t("조회 중")}
              </span>
            )}{" "}
            {plans.error ??
              (plans.loading
                ? t("저장 코스를 불러오는 중입니다.")
                : courses.length
                  ? t("저장 코스 {count}개 · 최대 100개", { count: courses.length })
                  : t("아직 저장한 코스가 없습니다. 추천에서 코스를 저장해 주세요."))}{" "}
            {sessions.error} {share.error}
          </p>
          {courses.map((course) => {
            const isSelected = course.id === selectedId;
            const score = isSelected ? selectedScore : null;
            const grade = gradeOf(score);
            return (
              <button
                type="button"
                key={course.id}
                className={
                  "mc-row pd-pressable" + (isSelected ? " is-selected" : "")
                }
                aria-pressed={isSelected}
                onClick={() =>
                  setSelectedId((current) =>
                    current === course.id ? null : course.id,
                  )
                }
              >
                {/* 고르지 않은 줄은 점수를 **조회하지 않은** 것이지 「자료
                    없음」이 아닙니다. 예전에는 둘 다 «–» 배지여서, 저장 코스가
                    전부 평가 불가로 보였습니다. 조회 전에는 배지 대신 펼침
                    표시를 둡니다. */}
                {isSelected ? (
                  <span className="mc-score-badge" data-grade={grade.key}>
                    {score ?? "–"}
                  </span>
                ) : (
                  <span className="mc-score-badge is-unqueried" aria-hidden="true">
                    <Icon name="course" size={15} />
                  </span>
                )}
                <span className="mc-row-body">
                  <span className="mc-row-name">{course.name}</span>
                  <span className="mc-row-meta">
                    {isSelected && <GradeIcon gradeKey={grade.key} size={12} />}
                    <span>
                      {isSelected ? t("첫 장소 참고 · {grade}", { grade: t(grade.label) }) : t("선택하면 점수 조회")} · {course.parts} · {course.date ?? t("날짜 –")}
                    </span>
                  </span>
                </span>
                <span
                  className={"mc-alarm-chip" + (course.alarm ? "" : " is-off")}
                >
                  {course.alarm ? t("동행 알림 켬") : t("동행 알림 꺼짐")}
                </span>
              </button>
            );
          })}

          {selected && (
            <div className="pd-card">
              <div className="pd-card-title">{selected.name}</div>
              <dl className="mc-detail-list">
                <dt>{t("첫 장소 참고점수")}</dt>
                <dd>
                  <GradeChip score={selectedScore} />
                </dd>
                <dt>{t("구성")}</dt>
                <dd>{selected.parts}</dd>
                <dt>{t("날짜")}</dt>
                <dd>{selected.date ?? "–"}</dd>
                <dt>{t("알림")}</dt>
                <dd>
                  {selected.alarm
                    ? t("동행 세션에서 켜짐")
                    : t("시작된 동행 알림 없음")}
                </dd>
              </dl>
              <p className="pd-note">
                <StateChip kind="live" /> {t("상태: {status} · 경로: {route}. 미확인 조건: {unresolved}. 종합 안전 점수는 제공하지 않습니다.", { status: dataStatusText(selected.plan.status), route: dataStatusText(selected.plan.route_status), unresolved: unknownConditionsText(selected.plan.unresolved) || t("없음") })}
              </p>
              <p className="pd-note">
                {first?.name ?? t("첫 장소 없음")} · {first?.at ?? t("일정 시각 없음")}.{" "}
                {firstTargetValid ? selectedConditions.error : t("저장 날짜가 조회 범위(현재 기준 앞뒤 31일)를 벗어났거나 일정 시각이 없습니다.")}
              </p>
              {/* 정차지마다 점수를 묻지 않습니다. 아래 펼침은 눌렀을 때만
                  조회합니다. */}
              <ConditionScoreDetails data={selectedConditions.data} className="pd-note" />
              {selectedStops.map((stop) => <PlanStopScore
                key={stop.item_id} id={stop.spot_id} name={stop.name} at={stop.at} activity={selected.plan.request.activity}
              />)}
              <div className="mc-detail-actions pd-action-slot">
                <button
                  type="button"
                  className="pd-secondary mc-action"
                  disabled={share.busy}
                  onClick={() =>
                    void share.run(async () => {
                      await navigator.clipboard.writeText(
                        `${selected.name}\n${selected.parts}\n${selected.date ?? t("날짜 없음")}`,
                      );
                    })
                  }
                >
                  <Icon name="share" size={16} />{t("요약 복사")}</button>
                <a
                  className="pd-primary mc-action"
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
                  <Icon name="course" size={16} />{t("코스 상세 열기")}</a>
              </div>
            </div>
          )}

          {TODO_SCREENS.map((item) => (
            <div className="pd-slot mc-slot" key={item.title}>
              <div>
                <b>{t(item.title)}</b>
                <br />
                {t(item.detail)}
                <br />
                {"href" in item ? (
                  <a href={item.href}>{t("내 기록 열기 →")}</a>
                ) : (
                  t("저장 코스의 요약 복사를 이용하세요")
                )}
              </div>
            </div>
          ))}

          {/* 전역 주의 문구입니다. 풀스크린에서는 .pd-body 가 없어 AppShell 이
              그리지 않으므로 시트 끝에 직접 둡니다 -- 자리를 옮겼을 뿐
              생략하지 않습니다. */}
          <AppFootNote wave={false} />
        </MapSheet>
      </AppShell>
    </article>
  );
}

export function MyCoursesPage() {
  // 같은 라우트(#my-courses)에서 폭으로 레이아웃을 갈아 끼웁니다. 데스크탑은
  // 지도와 시간축 일정을 나란히 두는 2열 구성입니다.
  const isDesktop = useIsDesktop();
  return isDesktop ? <CoursesDesktop /> : <MyCoursesScreen />;
}
