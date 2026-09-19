import { useState } from "react";
import { MASCOT_ALT, mascotUrl } from "./mascots";
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
  type Place,
  type WaterQualityGrade,
} from "./productData";
import { isInitialLoad, useResource } from "./useResource";
import { useProductData } from "./useProductData";
import { useHourlyScores } from "./useHourlyScores";
import type { ActivityCondition } from "./useBestActivity";
import { spotLink } from "./spotsRoute";
import { useWaterPlaces } from "./useWaterPlaces";
import { useTravelSession } from "./travelSession";
import { newWebcamShuffleSeed } from "./livecamPreviewApi";
import { previewPlayerUrl, safeWebcamUrl } from "./livecamApi";
import { useWebcamCatalog } from "./useWebcamCatalog";
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
// 명소 · 취향 · 코스 · 라이브캠도 모바일과 같은 소스를 읽습니다. 예전에는
// 이 자리들이 전부 파일 안 상수였습니다 -- 고른 적 없는 취향이 「서핑과 온천을
// 고르셨습니다」로 떠 있었고, 저장된 적 없는 코스가 「3곳 · 12.0km」로 적혀
// 있었습니다. 데이터가 없으면 지어내지 않고 그 사실을 적습니다.

const HERO_DATE = dateLabel();
const BAR_MAX_HEIGHT = 104;

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

function BeachCard({ place }: { place: Place }) {
  return (
    <a className="hd-beach" href={spotLink(place)}>
      {/* 대표 사진을 내려주는 API 가 없습니다. 네 칸이 반복되는 자리라 점선
          슬롯 대신 중립 자리표시자를 씁니다. */}
      <span className="hd-beach-photo" aria-label={`${place.name} 대표 사진 없음`} />
      <span className="hd-beach-head">
        <b className="hd-beach-name">{place.name}</b>
        <span className="hd-beach-category">해변</span>
      </span>
      <span className="hd-beach-foot">
        <span className="hd-beach-operating">
          {place.region ?? "지역 미확인"}
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
  // 아래 네 덩어리는 모바일 홈이 이미 쓰는 것과 같은 소스입니다. 예전에는 이
  // 자리들이 전부 파일 안 상수였습니다.
  const catalog = useWaterPlaces("");
  const beaches = (catalog.rows ?? [])
    .filter((item) => item.type === "beach")
    .slice(0, 4);
  const session = useTravelSession();
  const tastePicks = (session.recommendation?.recommendations ?? []).slice(0, 3);
  const tags = [
    ...new Set(
      (session.recommendation?.recommendations ?? []).flatMap((item) =>
        item.matched_preferences.map((preference) => preference.tag),
      ),
    ),
  ];
  const course = session.route?.route ?? null;
  const [shuffleSeed] = useState(newWebcamShuffleSeed);
  const webcams = useWebcamCatalog(1, "", shuffleSeed);
  const cameras = (webcams.result?.rows ?? [])
    .flatMap((camera) => {
      const player = previewPlayerUrl(camera, webcams.result!.valid_until, webcams.now);
      const href =
        player ?? safeWebcamUrl(camera.public_page, camera.provider_camera_id);
      return href
        ? [{ camera, href, label: player ? "타임랩스" : "원본 보기" }]
        : [];
    })
    .slice(0, 3);
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
        chip={<StateChip kind={catalog.rows ? "live" : "no_data"} />}
        desc="서버가 카테고리와 장소명을 보고 해변으로 분류한 곳입니다. 상태 열람에서 장소 선택으로 바로 넘어가게 붙입니다."
        link={{ href: "#spots", label: "명소 탭 전체 보기" }}
      >
        <div className="hd-beaches">
          {beaches.map((place) => (
            <BeachCard key={place.id} place={place} />
          ))}
        </div>
        {!beaches.length && (
          <p className="hd-row-note" role={catalog.error ? "alert" : "status"}>
            {catalog.error ??
              (catalog.loading
                ? "해변 목록을 조회하고 있습니다."
                : "수집된 해변이 아직 없습니다.")}
          </p>
        )}
        <p className="hd-row-note">
          명소를 고르면 그곳의 퐁당 점수를 조회합니다. 목록에 점수를 싣지 않는
          것은 장소마다 한 번씩 조회해야 하기 때문입니다. 거리 · 운영시간 ·
          대표 사진은 아직 내려주는 API 가 없습니다. 리뷰 평점은 쓰지 않습니다.
        </p>
      </LabelRow>

      {/* 예전에는 「서핑과 온천을 고르셨습니다」가 늘 떠 있었고 칩 네 개 중
          둘이 켜져 있었습니다. 고른 적이 없는데도 고른 것처럼 보였습니다 --
          취향은 파일 안 상수였습니다. 실제로 고른 취향은 추천 결과 안에만
          남습니다(matched_preferences). */}
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
            <div className="hd-taste-lead">
              {tags.length
                ? `${tags.join(" · ")}을 고르셨습니다`
                : "아직 고른 취향이 없습니다"}
            </div>
            {tags.length > 0 && (
              <div className="hd-taste-chips">
                {tags.map((tag) => (
                  <span className="hd-taste-chip is-on" key={tag}>
                    {tag}
                    <Icon name="check" size={13} />
                  </span>
                ))}
              </div>
            )}
            <div className="hd-taste-actions">
              <a className="pd-dk-button" href="#recommend">
                {tags.length ? "추천 다시 보기 →" : "취향 고르기 →"}
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
                  함께 있어야 합니다(핸드오프 데이터 표기 규칙 4). 예전에는
                  「오전 서핑 후 오후 온천」이라는 고정 문장과 「파고 0.6m ·
                  12:34 이후 밀물」이라는 지어낸 근거가 적혀 있었습니다. */}
              <span className="pd-ai-chip">
                <Icon name="sparkle" size={12} />
                AI 제안
              </span>
              <div className="hd-ai-headline">
                {best
                  ? `오늘 이 장소에서는 ${activities[best.activity]}이(가) 가장 잘 맞습니다`
                  : "오늘 점수를 낼 수 있는 활동이 없습니다"}
              </div>
              <p className="hd-ai-basis">
                근거 — {scoreReason(best?.data).text}
              </p>
            </div>
          </div>
        </SplitBody>
      </LabelRow>

      {/* 「취향에 맞는 명소」 줄이 여기 있었습니다. 고른 취향이 없으면 보여 줄
          것도 없어, 추천 결과가 있을 때만 싣습니다. */}
      {tastePicks.length > 0 && (
        <LabelRow
          kick="취향에 맞는 명소"
          title={
            <>
              고르신 취향에
              <br />
              맞춰 골랐습니다
            </>
          }
          chip={<StateChip kind="live" />}
          desc="추천에서 고른 취향에 맞춰 서버가 고른 장소입니다."
          link={{ href: "#recommend", label: "추천 다시 보기" }}
        >
          <SplitBody>
            {tastePicks.map((item) => (
              <a
                className="hd-taste-spot"
                href={spotLink({ id: item.spot_id })}
                key={item.spot_id}
              >
                <span
                  className="hd-taste-photo"
                  aria-label={`${item.name} 대표 사진 없음`}
                />
                <span>
                  <span className="hd-taste-spot-name">{item.name}</span>
                  <span className="hd-taste-spot-meta">
                    {item.region ?? "지역 미확인"} ·{" "}
                    {item.activities.map((activity) => activity.label).join(" · ") ||
                      "활동 미확인"}
                  </span>
                </span>
              </a>
            ))}
          </SplitBody>
        </LabelRow>
      )}

      {/* 예전에는 「오늘 조건으로 3곳 · 12.0km」와 경포 09:20 → 안목 12:00 →
          사천진 14:30 이 파일 안 상수로 적혀 있었습니다. 저장된 코스가 없어도
          코스가 있는 것처럼 보였습니다. */}
      <LabelRow
        kick="물놀이 최적경로"
        title={
          course
            ? `오늘 조건으로 ${course.items.length}곳`
            : "코스를 만들면 여기에"
        }
        chip={<StateChip kind={course ? "live" : "partial"} />}
        desc="추천에서 장소를 고르고 지도에서 경로를 요청하면 그 결과가 여기에 들어옵니다."
      >
        {course ? (
          <SplitBody>
            {course.items.map((item, index) => (
              <div className="hd-step" key={item.spot_id}>
                <div className="hd-step-head">
                  <span className="pd-dk-num hd-step-no">{index + 1}</span>
                  {index < course.items.length - 1 && (
                    <span className="hd-step-line" />
                  )}
                </div>
                <div className="hd-step-body">
                  <div>
                    <div className="hd-step-name">{item.name}</div>
                  </div>
                </div>
              </div>
            ))}
          </SplitBody>
        ) : (
          <div className="pd-dk-slot hd-course-empty">
            추천에서 장소를 고르고 지도에서 경로를 요청하세요
          </div>
        )}
        <div className="hd-course-foot">
          <span className="hd-row-note">
            {course
              ? `예상 이동 ${course.travel_minutes}분 · 이동 시간은 경로 제공자가 준 추정값입니다.`
              : "코스를 만들기 전에는 보여 줄 순서가 없습니다. 없는 코스를 예시로 채우지 않습니다."}
          </span>
          <a className="pd-dk-button is-pill" href="#map?view=course">
            지도에서 경로 탐색 →
          </a>
        </div>
      </LabelRow>

      {/* 예전에는 라이브캠 세 칸이 파일 안 상수였습니다(경포 · 안목 06:00
          LIVE). 모바일 홈은 같은 자리에서 이미 실제 카탈로그를 읽고
          있었습니다 -- 데스크탑만 지어내고 있었습니다. */}
      <LabelRow
        kick="라이브캠"
        title="지금 바다 보기"
        chip={<StateChip kind={webcams.result ? "live" : "no_data"} />}
        desc="붐빔 정도 · 파도 모양 · 하늘은 수치로 저장하지 않습니다. 눈으로 확인하는 구간입니다."
        link={{ href: "#livecam", label: "전체 화면으로" }}
      >
        <div className="hd-cams">
          {cameras.map(({ camera, href, label }) => (
            <a
              className="hd-cam"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              key={camera.provider_camera_id}
            >
              <div className="pd-dk-slot hd-cam-frame">
                {camera.title}
                <span className="hd-cam-live">
                  <span className="hd-cam-dot" />
                  {label}
                </span>
              </div>
              <div className="hd-cam-head">
                <b>{camera.title}</b>
                <span className="hd-cam-place">{label}</span>
              </div>
            </a>
          ))}
          {/* 송출이 없는 자리는 빈 칸으로 두지 않고 그 사실을 밝힙니다. */}
          {!cameras.length && (
            <div className="hd-cam">
              <div className="hd-cam-frame is-empty">
                <img src={mascotUrl("empty")} alt="" width={46} height={46} />
                <div className="hd-cam-empty-title">
                  {webcams.loading ? "조회 중" : "송출 없음"}
                </div>
                <div className="hd-cam-empty-note">
                  {webcams.error ??
                    (webcams.loading
                      ? "물 풍경을 고르는 중입니다"
                      : "열 수 있는 물 풍경 카메라가 없습니다")}
                </div>
              </div>
            </div>
          )}
        </div>
        <p className="hd-row-note">
          위치와 관계없이 고른 랜덤 물 풍경입니다. 배경은 영상 썸네일이
          아닙니다. Webcams provided by windy.com
        </p>
      </LabelRow>

      {/* 시간대별 예보와 코스는 이제 연동됐으므로 목록에서 뺐습니다. 남은
          것만 적습니다 -- 다 고친 뒤에도 미연동이라고 적어 두면 그것도
          거짓말입니다. */}
      <FootNote missing="명소 대표 이미지 · 운영시간 · 장소까지의 거리 · 첫 입수 알림 트리거" />
    </DesktopShell>
  );
}
