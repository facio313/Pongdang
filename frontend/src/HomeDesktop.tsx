import { MASCOT_ALT, mascotUrl, type MascotRole } from "./mascots";
import {
  DesktopHero,
  DesktopNav,
  DesktopShell,
  FootNote,
  LabelRow,
  SplitBody,
} from "./pongdangDesktop";
import { GradeChip, Icon, StateChip } from "./pongdangUi";
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
// 값은 전부 디자인 시안의 예시입니다(명소 API · 시간대별 예보 · 코스 데이터
// 미연동). 실연동 시 이 상수들이 훅으로 바뀌며 레이아웃은 그대로입니다.

const CONTEXT = "강릉 경포해변 · 9월 15일 · 예보 06:00 기준";

/** 시간대별 막대. 막대 높이는 점수의 상대 위치이며 점수 기여도가 아닙니다. */
const HOURS: { hour: number; score: number }[] = [
  { hour: 6, score: 58 },
  { hour: 8, score: 68 },
  { hour: 10, score: 74 },
  { hour: 12, score: 80 },
  { hour: 13, score: 84 },
  { hour: 15, score: 81 },
  { hour: 17, score: 72 },
  { hour: 19, score: 61 },
  { hour: 21, score: 48 },
];
const CURRENT_HOUR_INDEX = 2;
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

function HomeHero() {
  return (
    <DesktopHero
      nav={<DesktopNav active="home" context={CONTEXT} />}
      wave="animated"
      minHeight={250}
    >
      <div className="hd-hero">
        <div className="hd-hero-lead">
          <div className="pd-dk-kick hd-hero-kick">강릉 물놀이</div>
          <h1 className="hd-hero-title">
            오늘 바다는
            <br />
            들어가기 좋습니다
          </h1>
          <div className="hd-hero-buttons">
            <a className="pd-dk-button is-on-cobalt" href="#today">
              오늘 상태 자세히 보기 →
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
            <div className="pd-dk-num hd-metric-value">22.1°C</div>
          </div>
          <div>
            <div className="hd-metric-name">파고</div>
            <div className="pd-dk-num hd-metric-value">0.6m</div>
          </div>
          <div>
            <div className="hd-metric-name">수질 · 수집 미구현</div>
            <div className="pd-dk-num hd-metric-value is-empty">–</div>
          </div>
        </div>
      </div>
    </DesktopHero>
  );
}

function HourBars() {
  const max = Math.max(...HOURS.map((item) => item.score));
  return (
    <>
      <div className="hd-hours">
        {HOURS.map((item, index) => {
          const now = index === CURRENT_HOUR_INDEX;
          return (
            <div className={"hd-hour" + (now ? " is-now" : "")} key={item.hour}>
              <div className="pd-dk-num hd-hour-score">{item.score}</div>
              <div className="hd-hour-track">
                <span
                  className="hd-hour-bar"
                  style={{ height: (item.score / max) * BAR_MAX_HEIGHT }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="hd-hour-labels">
        {HOURS.map((item, index) => (
          <div
            className={
              "hd-hour-label" +
              (index === CURRENT_HOUR_INDEX ? " is-now" : "")
            }
            key={item.hour}
          >
            <span className="pd-dk-num">{item.hour}시</span>
          </div>
        ))}
      </div>
      <div className="hd-hour-summary">
        <span className="hd-summary-item">
          <span className="hd-summary-name">수온</span>
          <span className="pd-dk-num hd-summary-value">22.1°C</span>
        </span>
        <span className="hd-summary-item">
          <span className="hd-summary-name">파고</span>
          <span className="pd-dk-num hd-summary-value">0.6m</span>
        </span>
        <span className="hd-summary-item">
          <span className="hd-summary-name">강수</span>
          <span className="pd-dk-num hd-summary-value">10%</span>
        </span>
        <span className="hd-summary-item">
          <span className="hd-summary-name">수질</span>
          <span className="pd-dk-num hd-summary-value is-empty">–</span>
          <StateChip kind="uncollected" />
        </span>
        <span className="hd-hour-note">
          시간대별 예보는 미연동이며 막대는 값의 상대 위치입니다.
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
  return (
    <DesktopShell>
      <HomeHero />

      <LabelRow
        kick="오늘 한눈에"
        title="경포해변 · 시간대별"
        chip={<StateChip kind="example" />}
        desc="지점 비교 · 7일 예보 · 물때 · 수질 근거는 오늘 탭에 있습니다. 홈에서는 지금 상태와 다음 행동만 둡니다."
        link={{ href: "#today", label: "오늘 탭에서 근거 보기" }}
      >
        <HourBars />
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
