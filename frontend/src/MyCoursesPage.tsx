import { t } from "./i18n.ts";
import { useState } from "react";
import { CoursesDesktop } from "./CoursesDesktop";
import { useIsDesktop } from "./useIsDesktop";
import { gradeOf } from "./groupAGrade";
import { GradeChip, GradeIcon, Icon, StateChip } from "./pongdangUi";
import { AppHeader, AppShell } from "./AppShell";
import { useResource } from "./useResource";
import { planItems, unknownConditionsText, type TripPlan } from "./travelApi";
import type { Activity } from "./aiApi";
import { ConditionScoreDetails } from "./ConditionScoreDetails";
import { setTravelSession } from "./travelSession";
import { timeLabel, conditionPath, conditionScore, conditionTargetInRange, dataStatusText, type Conditions } from "./productData";
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
      <AppShell
        tab="my-courses"
        hero={
        <header className="pd-hero mc-hero">
          <AppHeader title={t("강원도")} time={timeLabel(new Date().toISOString())} onCobalt />
          <div className="mc-hero-inner">
            <p className="pd-lbl">
              {plans.error ? t("저장 코스 개수 미확인")
                : plans.loading ? t("저장 코스 조회 중")
                : t("저장 {count}개", { count: courses.length })}
            </p>
            <h1 className="mc-hero-title">{t("내 코스")}</h1>
            <p className="mc-hero-sub">{t("내가 저장한 여행 일정을 확인하세요")}</p>
            <p className="mc-hero-note">{t("기존 SSO 계정에 저장된 코스입니다. 여행 알림은 시작된 동행 세션의 설정을 표시하며 백그라운드 발송과 다릅니다.")}</p>
          </div>
        </header>
        }
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
