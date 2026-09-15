import { useState } from "react";
import { gradeOf } from "./groupAGrade";
import { GradeChip, GradeIcon, Icon, StateChip } from "./pongdangUi";
import { AppTabBar } from "./appTabBar";
import { useResource } from "./useResource";
import { planItems, type TripPlan } from "./travelApi";
import type { Activity } from "./aiApi";
import { ConditionScoreDetails } from "./ConditionScoreDetails";
import { setTravelSession } from "./travelSession";
import { timeLabel, conditionPath, conditionScore, conditionTargetInRange, type Conditions } from "./productData";
import { useAction } from "./useAction";
import "./myCoursesPage.css";

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
    <details className="mc-note">
      <summary>{name} · 장소별 조건 {conditionScore(conditions.data) ?? "–"}점</summary>
      <p>{at} · 저장 일정 시각의 예보입니다. {valid ? conditions.error : "저장 날짜가 조회 범위(현재 기준 앞뒤 31일)를 벗어났습니다."}</p>
      <ConditionScoreDetails data={conditions.data} />
    </details>
  );
}

export function MyCoursesPage() {
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
      ? `${plan.request.dates[0]} 물 코스`
      : "저장 코스",
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
  const selectedStops = selected?.plan.days.flatMap((day) => day.items.map((item) => ({
    ...item, at: item.arrival_at ?? day.date + "T12:00:00+09:00",
  }))) ?? [];
  const first = selectedStops[0];
  const firstTargetValid = conditionTargetInRange(first?.at);
  const selectedConditions = useResource<Conditions>(firstTargetValid
    ? conditionPath(first?.spot_id, selected?.plan.request.activity ?? "relax", first?.at) : null);
  const selectedScore = conditionScore(selectedConditions.data);

  return (
    <article className="my-courses-page">
      <div className="mc-frame">
        <header className="mc-hero">
          <div className="mc-sbar">
            <span>{timeLabel(new Date().toISOString())}</span>
            <span className="mc-sbar-mark">MY COURSES</span>
            <span>강릉</span>
          </div>
          <div className="mc-hero-inner">
            <p className="mc-lbl">저장 {courses.length}개</p>
            <h1 className="mc-hero-title">내 코스</h1>
            <p className="mc-hero-sub">내가 저장한 여행 일정을 확인하세요</p>
            <p className="mc-hero-note">
              기존 SSO 계정에 저장된 코스입니다. 여행 알림은 시작된 동행 세션의
              설정을 표시하며 백그라운드 발송과 다릅니다.
            </p>
          </div>
        </header>

        <div className="mc-body">
          <p className="mc-note" style={{ margin: 0 }}>
            <StateChip kind={plans.data ? "live" : "no_data"} />{" "}
            {plans.error ??
              (plans.loading
                ? "저장 코스를 불러오는 중입니다."
                : courses.length
                  ? `저장 코스 ${courses.length}개 · 최대 100개`
                  : "아직 저장한 코스가 없습니다. 추천에서 코스를 저장해 주세요.")}{" "}
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
                className={"mc-row" + (isSelected ? " is-selected" : "")}
                aria-pressed={isSelected}
                onClick={() =>
                  setSelectedId((current) =>
                    current === course.id ? null : course.id,
                  )
                }
              >
                <span className="mc-score-badge" data-grade={grade.key}>
                  {score ?? "–"}
                </span>
                <span className="mc-row-body">
                  <span className="mc-row-name">{course.name}</span>
                  <span className="mc-row-meta">
                    <GradeIcon gradeKey={grade.key} size={12} />
                    <span>
                      {isSelected ? `첫 장소 참고 · ${grade.label}` : "선택하면 점수 조회"} · {course.parts} · {course.date ?? "날짜 –"}
                    </span>
                  </span>
                </span>
                <span
                  className={"mc-alarm-chip" + (course.alarm ? "" : " is-off")}
                >
                  {course.alarm ? "동행 알림 켬" : "동행 알림 꺼짐"}
                </span>
              </button>
            );
          })}

          {selected && (
            <div className="mc-detail">
              <div className="mc-detail-title">{selected.name}</div>
              <dl>
                <dt>첫 장소 참고점수</dt>
                <dd>
                  <GradeChip score={selectedScore} />
                </dd>
                <dt>구성</dt>
                <dd>{selected.parts}</dd>
                <dt>날짜</dt>
                <dd>{selected.date ?? "–"}</dd>
                <dt>알림</dt>
                <dd>
                  {selected.alarm
                    ? "동행 세션에서 켜짐"
                    : "시작된 동행 알림 없음"}
                </dd>
              </dl>
              <p className="mc-note">
                <StateChip kind="live" /> 상태: {selected.plan.status} · 경로:{" "}
                {selected.plan.route_status}. 미확인 조건:{" "}
                {selected.plan.unresolved.join(" · ") || "없음"}. 종합 안전
                점수는 제공하지 않습니다.
              </p>
              <p className="mc-note">
                {first?.name ?? "첫 장소 없음"} · {first?.at ?? "일정 시각 없음"}.{" "}
                {firstTargetValid ? selectedConditions.error : "저장 날짜가 조회 범위(현재 기준 앞뒤 31일)를 벗어났거나 일정 시각이 없습니다."}
              </p>
              <ConditionScoreDetails data={selectedConditions.data} className="mc-note" />
              {selectedStops.map((stop) => <PlanStopScore
                key={stop.item_id} id={stop.spot_id} name={stop.name} at={stop.at} activity={selected.plan.request.activity}
              />)}
              <div className="mc-detail-actions">
                <button
                  type="button"
                  className="mc-secondary"
                  disabled={share.busy}
                  onClick={() =>
                    void share.run(async () => {
                      await navigator.clipboard.writeText(
                        `${selected.name}\n${selected.parts}\n${selected.date ?? "날짜 없음"}`,
                      );
                    })
                  }
                >
                  <Icon name="share" size={16} />
                  요약 복사
                </button>
                <a
                  className="mc-primary"
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
                  <Icon name="course" size={16} />
                  코스 상세 열기
                </a>
              </div>
            </div>
          )}

          {TODO_SCREENS.map((item) => (
            <div className="mc-slot" key={item.title}>
              <div>
                <b>{item.title}</b>
                <br />
                {item.detail}
                <br />
                {"href" in item ? (
                  <a href={item.href}>내 기록 열기 →</a>
                ) : (
                  "저장 코스의 요약 복사를 이용하세요"
                )}
              </div>
            </div>
          ))}

          <AppTabBar active="my-courses" />
        </div>
      </div>
    </article>
  );
}
