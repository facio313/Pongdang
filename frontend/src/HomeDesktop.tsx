import { MASCOT_ALT, mascotUrl, type MascotRole } from "./mascots";
import {
  DesktopHero,
  DesktopNav,
  DesktopShell,
  FootNote,
  LabelRow,
  SplitBody,
} from "./pongdangDesktop";
import {
  ComponentBars,
  GradeChip,
  Icon,
  MetricValue,
  ScoreExplainer,
  ScoreGauge,
  ScoreReason,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { activities, type Activity } from "./aiApi";
import { gradeOf } from "./groupAGrade";
import {
  componentBars,
  scoreReason,
  scoreTitle,
  verdictOf,
} from "./scoreMeaning";
import { EvidenceNote } from "./EvidenceNote";
import {
  conditionModeLabel,
  dateLabel,
  waterQualityLabel,
  type Conditions,
  type WaterQualityGrade,
} from "./productData";
import { isInitialLoad, useResource } from "./useResource";
import { useProductData } from "./useProductData";
import { useHourlyScores } from "./useHourlyScores";
import type { ActivityCondition } from "./useBestActivity";
import {
  BEACH_PICKS,
  TASTE_LABEL,
  TASTE_PICKS,
  spotLink,
  type Spot,
} from "./spotsCatalog";
import "./homeDesktop.css";

// 데스크탑 홈(핸드오프 18a)입니다. 모바일 홈과 **같은 라우트(#home)**이며
// HomePage.tsx 가 폭으로 갈라 이 레이아웃을 붙입니다.
//
// 모바일과 문법이 다릅니다 -- 흰 카드 스택이 아니라 괘선으로 끊는 LabelRow
// 연속입니다. 프리미티브는 pongdangDesktop.tsx 가 단일 출처이고, 여기에는 이
// 화면에만 있는 내용물만 둡니다.
//
// 점수와 관측값은 모바일 홈과 **같은 훅**을 씁니다(useProductData("best") ·
// useHourlyScores). 같은 라우트인데 폭에 따라 다른 사실을 말하지 않기
// 위해서입니다 -- 예전에는 이 파일 안의 상수가 수온 22.1°C 와 시간대 점수
// 아홉 개를 지어내고 있었습니다.
//
// 아직 예시인 것: 명소(spotsCatalog) · 취향 · 코스 · 라이브캠. 각 자리에
// 「예시 데이터」 칩을 달아 밝힙니다.

const HERO_DATE = dateLabel();
const BAR_MAX_HEIGHT = 104;

const TASTES: { label: string; mascot: MascotRole; on: boolean }[] = [
  { label: "서핑", mascot: "surf", on: true },
  { label: "온천", mascot: "hotspring", on: true },
  { label: "카페", mascot: "cafe", on: false },
  { label: "갯벌 체험", mascot: "spot", on: false },
];

const COURSE_STEPS: {
  name: string;
  activity: string;
  mascot: MascotRole;
  time: string;
  leg: string;
}[] = [
  {
    name: "경포해변",
    activity: "서핑 · 2시간",
    mascot: "surf",
    time: "09:20",
    leg: "출발 · 4.2km",
  },
  {
    name: "안목 카페거리",
    activity: "휴식 · 점심 · 1시간",
    mascot: "cafe",
    time: "12:00",
    leg: "이동 · 5.1km",
  },
  {
    name: "사천진 온천",
    activity: "온천 · 1시간 30분",
    mascot: "hotspring",
    time: "14:30",
    leg: "이동 · 2.7km",
  },
];

const LIVECAMS: {
  name: string;
  place: string;
  at: string;
  live: boolean;
}[] = [
  { name: "경포해변", place: "해수욕장 중앙", at: "06:00", live: true },
  { name: "안목해변", place: "커피거리 방면", at: "06:00", live: true },
  // 송출이 없는 자리는 빈 칸으로 두지 않고 「카메라 미설치」를 밝힙니다.
  { name: "사천진해변", place: "–", at: "–", live: false },
];

/** 예전에는 이 히어로가 「오늘 바다는 / 들어가기 좋습니다」라는 고정 문장과
 *  하드코딩된 수온 22.1°C 였습니다. 모바일 홈이 실제 점수를 읽는 동안
 *  데스크탑만 시안 값을 보여 주고 있었습니다. 같은 라우트(#home)인데 폭에
 *  따라 다른 사실을 말하면 안 됩니다. */
function HomeHero({
  placeName,
  conditions,
  baseline,
  best,
  quality,
  qualityLoading = false,
  loading = false,
  baselineLoading = false,
}: {
  placeName: string;
  conditions?: Conditions;
  /** 활동과 무관한 「지금 날씨와 바다」의 기준 응답(useProductData 주석). */
  baseline?: Conditions;
  best: ActivityCondition | null;
  quality: string;
  qualityLoading?: boolean;
  loading?: boolean;
  baselineLoading?: boolean;
}) {
  const verdict =
    best && !loading ? verdictOf(best.activity, gradeOf(best.score).key) : null;
  return (
    <DesktopHero
      nav={
        <DesktopNav
          active="home"
          context={`${placeName} · ${HERO_DATE} · ${conditionModeLabel(baseline)} 기준`}
        />
      }
      wave="animated"
      minHeight={250}
    >
      <div className="hd-hero">
        <div className="hd-hero-lead">
          <div className="pd-dk-kick hd-hero-kick">강릉 물놀이</div>
          {/* 조사(이/가)를 붙이지 않으려고 활동 이름을 줄로 떼어 둡니다.
              「수영」·「갯벌」처럼 받침이 갈립니다. */}
          <h1 className="hd-hero-title">
            {loading ? (
              <Skeleton width="8em" glass label="오늘의 활동 조회 중" />
            ) : best ? (
              <>
                오늘 가장 좋은 활동
                <br />
                {activities[best.activity]}
              </>
            ) : (
              <>
                오늘 점수를 낼 수 있는
                <br />
                활동이 없습니다
              </>
            )}
          </h1>
          <div className="hd-hero-score">
            <span className="pd-dk-num hd-hero-score-num">
              {loading ? (
                <Skeleton width="1.6em" glass label="점수 조회 중" />
              ) : (
                (best?.score ?? "–")
              )}
            </span>
            <GradeChip
              score={best?.score ?? null}
              prefix={best ? scoreTitle(best.activity) : undefined}
              loading={loading}
              glass
              bare
            />
          </div>
          <ScoreGauge score={best?.score ?? null} loading={loading} glass />
          {/* 등급명은 상태어라 가도 되는지가 읽히지 않습니다. 값이 없으면
              문장을 지어내지 않고 비워 둡니다. */}
          {verdict && <p className="hd-hero-verdict">{verdict}</p>}
          <ScoreReason
            text={scoreReason(best?.data).text}
            loading={loading}
            glass
          />
          <div className="hd-hero-buttons">
            <a className="pd-dk-button is-on-cobalt" href="#today">
              활동 여섯 가지 모두 보기 →
            </a>
            <a className="pd-dk-button is-glass" href="#recommend">
              코스 만들기
            </a>
          </div>
        </div>
        <img
          className="hd-hero-mascot"
          src={mascotUrl("home")}
          alt={MASCOT_ALT}
          width={250}
          height={250}
        />
        <div className="hd-hero-metrics">
          <div>
            <div className="hd-metric-name">수온</div>
            <div className="pd-dk-num hd-metric-value">
              <MetricValue
                conditions={baseline}
                name="water_temperature"
                loading={baselineLoading}
                glass
              />
            </div>
          </div>
          <div>
            <div className="hd-metric-name">파고</div>
            <div className="pd-dk-num hd-metric-value">
              <MetricValue
                conditions={baseline}
                name="wave_height"
                loading={baselineLoading}
                glass
              />
            </div>
          </div>
          {/* 수질은 점수에 들어가지 않습니다. 점수 옆에 그냥 두면 근거로
              읽히므로 그 사실을 함께 적습니다. */}
          <div>
            <div className="hd-metric-name">수질 · 점수 미반영</div>
            <div className="pd-dk-num hd-metric-value">
              {qualityLoading ? <Skeleton width="3.2em" glass /> : quality}
            </div>
          </div>
        </div>
      </div>
      <EvidenceNote data={conditions} className="hd-hero-note" glass />
      <div className="hd-hero-actions">
        <ScoreExplainer data={conditions} />
      </div>
    </DesktopHero>
  );
}

/** 예전에는 아홉 개 막대가 전부 파일 안 상수였습니다(6시 58점, 8시 68점 …).
 *  이제 고른 활동의 실제 시간대 예보를 읽습니다. 값이 없는 시각은 막대를
 *  그리지 않고 «–» 로 둡니다 -- 높이 0 인 막대는 「0 점」과 구별되지 않습니다. */
function HourBars({
  id,
  now,
  activity,
  conditions,
  loading = false,
}: {
  id?: number;
  now: string;
  activity: Activity;
  conditions?: Conditions;
  loading?: boolean;
}) {
  const hours = useHourlyScores(id, now, activity);
  const scored = hours.filter((hour) => hour.score !== null);
  // 막대 높이는 그날 안에서의 상대 위치입니다. 점수 기여도가 아닙니다.
  const max = Math.max(...scored.map((hour) => hour.score as number), 1);
  return (
    <>
      <div className="hd-hours">
        {hours.map((hour) => {
          const grade = gradeOf(hour.score);
          return (
            <div
              className={"hd-hour" + (hour.score === null ? " is-empty" : "")}
              data-grade={grade.key}
              key={hour.hour}
              aria-label={`${hour.hour}시 · ${hour.score === null ? "평가값 없음" : `${hour.score}점 ${grade.label}`}`}
            >
              <div className="pd-dk-num hd-hour-score">
                {hour.loading ? (
                  <Skeleton width="1.6em" label="시간대 점수 조회 중" />
                ) : (
                  (hour.score ?? "–")
                )}
              </div>
              <div className="hd-hour-track">
                {hour.score !== null && (
                  <span
                    className="hd-hour-bar"
                    style={{
                      height: Math.max(6, (hour.score / max) * BAR_MAX_HEIGHT),
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="hd-hour-labels">
        {hours.map((hour) => (
          <div className="hd-hour-label" key={hour.hour}>
            <span className="pd-dk-num">{Number(hour.hour)}시</span>
          </div>
        ))}
      </div>

      {/* 점수가 무엇으로 이루어졌는지. 모바일 「오늘 한눈에」와 같은 구성입니다.
          시간대 축 바로 아래 붙이면 그 축에 속한 값으로 읽히므로 괘선과
          소제목으로 끊습니다 -- 시각별 점수와 항목별 점수는 다른 값입니다. */}
      <div className="hd-parts">
        <div className="hd-parts-head">지금 점수를 이루는 것들</div>
        <ComponentBars bars={componentBars(conditions)} loading={loading} />
      </div>

      <div className="hd-hour-summary">
        <span className="hd-hour-note">
          막대는 그날 안에서의 상대 위치이며 점수 기여도가 아닙니다. 값이 없는
          시각은 –이고 0점이 아닙니다. 항목 점수는 100점 만점이며, 총점은 이
          항목들을 같은 비중으로 평균낸 값입니다.
        </span>
      </div>
    </>
  );
}

function BeachCard({ spot }: { spot: Spot }) {
  return (
    <a className="hd-beach" href={spotLink(spot)}>
      <span className="pd-dk-slot hd-beach-photo">
        {spot.name} 대표 사진
      </span>
      <span className="hd-beach-head">
        <b className="hd-beach-name">{spot.name}</b>
        <span className="hd-beach-category">{spot.categoryLabel}</span>
        <span className="pd-dk-num hd-beach-distance">{spot.distanceKm}km</span>
      </span>
      <span className="hd-beach-foot">
        <GradeChip
          score={spot.score}
          bare
          prefix="퐁당"
          label={spot.score === null ? spot.unscoredLabel : undefined}
        />
        <span className="hd-beach-operating">
          {spot.operatingNote ?? spot.operating}
        </span>
      </span>
    </a>
  );
}

export function HomeDesktop() {
  const { now, place, conditions, baseline, best, displayName, selectionMessage } =
    useProductData("best");
  const quality = useResource<WaterQualityGrade>(
    place ? `quality/grade?spot_id=${place.id}` : null,
  );
  return (
    <DesktopShell>
      <HomeHero
        placeName={displayName}
        conditions={conditions.data}
        baseline={baseline.data}
        best={best}
        quality={quality.error ? "조회 실패" : waterQualityLabel(quality.data)}
        qualityLoading={isInitialLoad(quality)}
        loading={isInitialLoad(conditions)}
        baselineLoading={isInitialLoad(baseline)}
      />

      <LabelRow
        kick="오늘 한눈에"
        title={
          best
            ? `${displayName} · ${activities[best.activity]} 점수를 이루는 것들`
            : `${displayName} · 시간대별`
        }
        chip={<StateChip kind={conditions.data ? "live" : "no_data"} />}
        desc="지점 비교 · 7일 예보 · 물때 · 수질 근거는 오늘 탭에 있습니다. 홈에서는 지금 상태와 다음 행동만 둡니다."
        link={{ href: "#today", label: "오늘 탭에서 근거 보기" }}
      >
        <HourBars
          id={place?.id}
          now={now}
          activity={best?.activity ?? "swim"}
          conditions={conditions.data}
          loading={isInitialLoad(conditions)}
        />
        <p className="hd-row-note" role={conditions.error ? "alert" : "status"}>
          {conditions.error ?? selectionMessage}
        </p>
      </LabelRow>

      <LabelRow
        kick="바다가 좋은 오늘"
        title={
          <>
            해변 명소
            <br />
            바로 이어가기
          </>
        }
        chip={<span className="pd-state-chip">명소 API 미연동</span>}
        desc="오늘 상황이 바다를 권하면 바로 아래에 해변 카테고리 명소를 연이어 붙여, 상태 열람에서 장소 선택으로 넘어가게 합니다."
        link={{ href: "#spots", label: "명소 탭 전체 보기" }}
      >
        <div className="hd-beaches">
          {BEACH_PICKS.map((spot) => (
            <BeachCard key={spot.id} spot={spot} />
          ))}
        </div>
        <p className="hd-row-note">
          명소 목록은 공공 API를 백엔드에서 가공해 내리는 데이터입니다. 퐁당
          점수는 물놀이 조건이 있는 명소에만 산정되며, 없으면 «–»이고 0점이
          아닙니다. 리뷰 평점은 사용하지 않습니다.
        </p>
      </LabelRow>

      <LabelRow
        kick="취향 맞추기"
        title={
          <>
            뭘 좋아하는지
            <br />
            알려 주세요
          </>
        }
        desc="고른 취향은 추천 탭의 코스 생성에 그대로 쓰입니다."
      >
        <SplitBody columns="1.25fr 1fr">
          <div className="hd-taste">
            <div className="hd-taste-lead">서핑과 온천을 고르셨습니다</div>
            <div className="hd-taste-chips">
              {TASTES.map((taste) => (
                <span
                  className={"hd-taste-chip" + (taste.on ? " is-on" : "")}
                  key={taste.label}
                >
                  <img src={mascotUrl(taste.mascot)} alt="" width={20} height={20} />
                  {taste.label}
                  {taste.on && <Icon name="check" size={13} />}
                </span>
              ))}
            </div>
            <div className="hd-taste-actions">
              <a className="pd-dk-button" href="#recommend">
                이 취향으로 추천 받기 →
              </a>
              <a className="hd-taste-reset" href="#recommend">
                취향 다시 고르기
              </a>
            </div>
          </div>
          <div className="hd-ai">
            <img
              className="hd-ai-mascot"
              src={mascotUrl("ai")}
              alt={MASCOT_ALT}
              width={92}
              height={92}
            />
            <div>
              {/* 「AI 제안」 칩이 붙은 자리에는 같은 덩어리 안에 근거가 반드시
                  함께 있어야 합니다(핸드오프 데이터 표기 규칙 4). */}
              <span className="pd-ai-chip">
                <Icon name="sparkle" size={12} />
                AI 제안
              </span>
              <div className="hd-ai-headline">
                오전 서핑 후 오후 온천을 붙이면 오늘 조건에 가장 잘 맞습니다
              </div>
              <p className="hd-ai-basis">
                근거 — 파고 0.6m(서핑 적정) · 12:34 이후 밀물 · 오후 수온 하강
                예보. 근거 데이터는 예시입니다.
              </p>
            </div>
          </div>
        </SplitBody>
      </LabelRow>

      <LabelRow
        kick="취향에 맞는 명소"
        title={
          <>
            {TASTE_LABEL}을
            <br />
            고르셨으니
          </>
        }
        desc="고른 취향 카테고리만 걸러 명소를 붙입니다. 카페를 고르면 같은 자리에 카페 명소가 들어옵니다."
      >
        <SplitBody>
          {TASTE_PICKS.map((spot) => (
            <a className="hd-taste-spot" href={spotLink(spot)} key={spot.id}>
              <span className="pd-dk-slot hd-taste-photo">{spot.name} 사진</span>
              <span>
                <span className="hd-taste-spot-name">{spot.name}</span>
                <span className="hd-taste-spot-meta">
                  {spot.categoryLabel} · {spot.distanceKm}km ·{" "}
                  {spot.operatingNote ?? "운영 정보 –"}
                </span>
                <span className="hd-taste-spot-score">
                  <GradeChip
                    score={spot.score}
                    bare
                    prefix="퐁당"
                    label={spot.score === null ? spot.unscoredLabel : undefined}
                  />
                </span>
              </span>
            </a>
          ))}
        </SplitBody>
      </LabelRow>

      <LabelRow
        kick="물놀이 최적경로"
        title={
          <>
            오늘 조건으로
            <br />
            3곳 · 12.0km
          </>
        }
        chip={<StateChip kind="example" />}
        desc="물때와 활동 점수, 이동 거리를 함께 본 순서 제안입니다. 코스 데이터는 아직 저장되지 않습니다."
      >
        <SplitBody>
          {COURSE_STEPS.map((step, index) => (
            <div className="hd-step" key={step.name}>
              <div className="hd-step-head">
                <span className="pd-dk-num hd-step-no">{index + 1}</span>
                {index < COURSE_STEPS.length - 1 && (
                  <span className="hd-step-line" />
                )}
              </div>
              <div className="hd-step-body">
                <img
                  src={mascotUrl(step.mascot)}
                  alt=""
                  width={46}
                  height={46}
                />
                <div>
                  <div className="hd-step-name">{step.name}</div>
                  <div className="hd-step-activity">{step.activity}</div>
                </div>
              </div>
              <div className="hd-step-time">
                <span className="pd-dk-num hd-step-clock">{step.time}</span>
                <span className="hd-step-leg">{step.leg}</span>
              </div>
            </div>
          ))}
        </SplitBody>
        <div className="hd-course-foot">
          <span className="hd-row-note">
            이동 시간은 자동차 기준 추정값이며, 코스 순서는 저장된 데이터가 아닌
            제안입니다.
          </span>
          <a className="pd-dk-button is-pill" href="#map?view=course">
            지도에서 경로 탐색 →
          </a>
        </div>
      </LabelRow>

      <LabelRow
        kick="라이브캠"
        title="지금 바다 보기"
        desc="붐빔 정도 · 파도 모양 · 하늘은 수치로 저장하지 않습니다. 눈으로 확인하는 구간입니다."
        link={{ href: "#livecam", label: "전체 화면으로" }}
      >
        <div className="hd-cams">
          {LIVECAMS.map((cam) => (
            <div className="hd-cam" key={cam.name}>
              {cam.live ? (
                <div className="pd-dk-slot hd-cam-frame">
                  {cam.name} 라이브캠 스틸
                  <span className="hd-cam-live">
                    <span className="hd-cam-dot" />
                    LIVE
                  </span>
                </div>
              ) : (
                <div className="hd-cam-frame is-empty">
                  <img
                    src={mascotUrl("empty")}
                    alt=""
                    width={46}
                    height={46}
                  />
                  <div className="hd-cam-empty-title">송출 없음</div>
                  <div className="hd-cam-empty-note">카메라 미설치</div>
                </div>
              )}
              <div className={"hd-cam-head" + (cam.live ? "" : " is-empty")}>
                <b>{cam.name}</b>
                <span className="hd-cam-place">{cam.place}</span>
                <span className="pd-dk-num hd-cam-at">{cam.at}</span>
              </div>
            </div>
          ))}
        </div>
      </LabelRow>

      <FootNote missing="조위 · 수질 수집 · 첫 입수 알림 트리거 · 시간대별 예보 · 코스 데이터" />
    </DesktopShell>
  );
}
