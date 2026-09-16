import { useMemo, useState } from "react";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl, type MascotRole } from "./mascots";
import {
  DesktopHero,
  DesktopNav,
  DesktopShell,
  FootNote,
  LabelRow,
  SplitBody,
} from "./pongdangDesktop";
import { GradeIcon, Icon, StateChip } from "./pongdangUi";
import { MAPPABLE_SPOTS, mappableSpots } from "./spotsCatalog";
import "./recommendDesktop.css";

// 데스크탑 추천(핸드오프 18b)입니다. 모바일의 여러 단계(취향 고르기 → 대화 →
// 코스 → 지도)를 **한 페이지의 세로 흐름**으로 접었습니다.
//
// 코스 데이터 · 서핑/온천 점수 · 이동 시간 · 대화형 응답은 전부 미연동입니다.
// AI 문장에는 「AI 제안」 칩과 근거를 같은 덩어리 안에 둡니다.

const CONTEXT = "강릉 · 9월 15일 · 취향 2개 선택";

const TASTES: { label: string; mascot: MascotRole }[] = [
  { label: "서핑", mascot: "surf" },
  { label: "온천", mascot: "hotspring" },
  { label: "카페", mascot: "cafe" },
  { label: "갯벌 체험", mascot: "spot" },
  { label: "스노클링", mascot: "snorkel" },
  { label: "휴식", mascot: "rest" },
  { label: "래프팅", mascot: "rafting" },
];
const INITIAL_TASTES = ["서핑", "온천"];

const MODES = ["코스", "장소", "활동"];

const PROMPTS = ["비 오는 날 아이랑", "차 없이 이동", "2시간 안에 끝내기"];

/** AI 문장이 쓴 근거. 규칙상 문장과 같은 덩어리 안에 있어야 합니다. */
const BASIS: { name: string; value: string; note: string }[] = [
  { name: "근거 · 파고", value: "0.6m", note: "서핑 적정 구간" },
  { name: "근거 · 물때", value: "12:34", note: "간조 이후 밀물" },
  { name: "근거 · 수온", value: "22.1°C", note: "오후 하강 예보" },
];

/** 만들어진 코스. 카페거리는 취향 미선택이라 점수가 «–» 이며 0 이 아닙니다. */
const STEPS: {
  name: string;
  mascot: MascotRole;
  when: string;
  score: number | null;
  scoreNote: string;
}[] = [
  {
    name: "경포해변 서핑",
    mascot: "surf",
    when: "09:20 · 2시간",
    score: 82,
    scoreNote: "수영 점수 기준",
  },
  {
    name: "안목 카페거리",
    mascot: "cafe",
    when: "12:00 · 1시간 · 5.1km",
    score: null,
    scoreNote: "취향 미선택 · 이동 중 경유",
  },
  {
    name: "사천진 온천",
    mascot: "hotspring",
    when: "14:30 · 1시간 30분 · 2.7km",
    score: 70,
    scoreNote: "휴식 점수 기준",
  },
];

export function RecommendDesktop() {
  const [picked, setPicked] = useState<string[]>(INITIAL_TASTES);
  const [mode, setMode] = useState(MODES[0]);
  const pinned = useMemo(() => mappableSpots(MAPPABLE_SPOTS), []);
  const markers = useMemo(
    () =>
      pinned.map(({ spot, latitude, longitude }, index) => ({
        id: String(spot.id),
        latitude,
        longitude,
        order: index + 1,
      })),
    [pinned],
  );
  const pickedLabel = picked.length ? picked.join("과 ") : "고른 취향 없이";

  return (
    <DesktopShell>
      <DesktopHero nav={<DesktopNav active="recommend" context={CONTEXT} />}>
        <div className="rd-hero">
          <div className="rd-hero-lead">
            <div className="pd-dk-kick rd-hero-kick">취향 기반 추천</div>
            <h1 className="rd-hero-title">
              {pickedLabel}으로
              <br />
              오늘 하루를 짰습니다
            </h1>
            <p className="rd-hero-note">
              고른 취향 · 오늘 조건 · 이동 거리를 함께 봅니다. 아래에서 취향을
              바꾸면 코스가 다시 만들어집니다.
            </p>
          </div>
          <img
            className="rd-hero-mascot"
            src={mascotUrl("surf")}
            alt={MASCOT_ALT}
            width={200}
            height={200}
          />
          <div className="rd-hero-metrics">
            <div>
              <div className="rd-metric-name">코스 길이</div>
              <div className="pd-dk-num rd-metric-value">12.0km</div>
            </div>
            <div>
              <div className="rd-metric-name">머무는 시간</div>
              <div className="pd-dk-num rd-metric-value">4h 30m</div>
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
        desc="선택은 색과 ✓ 두 겹으로 표시합니다. 모바일 취향 고르기와 같은 항목 · 같은 순서입니다."
      >
        <div className="rd-tastes">
          {TASTES.map((taste) => {
            const on = picked.includes(taste.label);
            return (
              <button
                type="button"
                key={taste.label}
                className={"rd-taste" + (on ? " is-on" : "")}
                aria-pressed={on}
                onClick={() =>
                  setPicked((current) =>
                    current.includes(taste.label)
                      ? current.filter((item) => item !== taste.label)
                      : [...current, taste.label],
                  )
                }
              >
                <img src={mascotUrl(taste.mascot)} alt="" width={22} height={22} />
                {taste.label}
                {on && <Icon name="check" size={14} />}
              </button>
            );
          })}
        </div>
        <div className="rd-row-foot">
          <span className="rd-note">
            취향은 계정에 저장되며 홈 배너 · 내 코스에서도 같은 값을 씁니다.
          </span>
          <button type="button" className="pd-dk-button rd-remake">
            이 취향으로 다시 만들기
          </button>
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
        chip={<StateChip kind="uncollected" />}
        desc="대화형 응답은 아직 실연동되지 않았습니다. 답변에는 근거를 함께 노출합니다."
      >
        <SplitBody columns="1fr 1.1fr">
          <div className="rd-ask">
            <div className="rd-modes" role="group" aria-label="질문 범위">
              {MODES.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={"rd-mode" + (item === mode ? " is-on" : "")}
                  aria-pressed={item === mode}
                  onClick={() => setMode(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="rd-field">
              <span className="rd-field-text">
                오후엔 몸 녹일 곳까지 넣어 주세요
              </span>
              <span className="pd-dk-button rd-send">보내기</span>
            </div>
            <div className="rd-prompts">
              {PROMPTS.map((prompt) => (
                <span className="rd-prompt" key={prompt}>
                  {prompt}
                </span>
              ))}
            </div>
          </div>
          <div className="rd-answer">
            <div className="rd-answer-head">
              <img
                src={mascotUrl("ai")}
                alt={MASCOT_ALT}
                width={72}
                height={72}
              />
              <div>
                <span className="pd-ai-chip">
                  <Icon name="sparkle" size={12} />
                  AI 제안
                </span>
                <div className="rd-answer-text">
                  오전에 경포에서 서핑하고, 12:34 밀물 뒤에는 사천진 온천으로
                  옮기는 편이 낫습니다.
                </div>
              </div>
            </div>
            {/* 「AI 제안」 칩이 붙은 자리에는 근거가 같은 덩어리 안에
                있어야 합니다(핸드오프 데이터 표기 규칙 4). */}
            <div className="rd-basis">
              {BASIS.map((row) => (
                <div className="rd-basis-row" key={row.name}>
                  <span className="rd-basis-name">{row.name}</span>
                  <span className="pd-dk-num rd-basis-value">{row.value}</span>
                  <span className="rd-basis-note">{row.note}</span>
                </div>
              ))}
            </div>
            <p className="rd-note">
              AI 문장은 위 근거로만 만들어졌고, 근거 값도 <b>예시</b>입니다. 안전
              판단에는 쓸 수 없습니다.
            </p>
          </div>
        </SplitBody>
      </LabelRow>

      <LabelRow
        kick="3 · 만들어진 코스"
        title={
          <>
            서핑 → 카페 →<br />
            온천 · 3곳
          </>
        }
        chip={<StateChip kind="example" />}
        desc="활동 점수는 저장된 3종(수영 · 래프팅 · 휴식) 기준이며, 서핑 · 온천 점수는 수집 항목이 아닙니다."
      >
        <SplitBody>
          {STEPS.map((step, index) => {
            const grade = gradeOf(step.score);
            return (
              <div className="rd-step" key={step.name}>
                <div className="rd-step-head">
                  <span className="pd-dk-num rd-step-no">{index + 1}</span>
                  {index < STEPS.length - 1 && <span className="rd-step-line" />}
                </div>
                <div className="rd-step-body">
                  <img
                    src={mascotUrl(step.mascot)}
                    alt=""
                    width={62}
                    height={62}
                  />
                  <div>
                    <div className="rd-step-name">{step.name}</div>
                    <div className="rd-step-when">{step.when}</div>
                  </div>
                </div>
                <div className="rd-step-score" data-grade={grade.key}>
                  <span className="pd-dk-num rd-step-score-num">
                    {step.score ?? "–"}
                  </span>
                  {step.score === null ? (
                    <span className="rd-step-score-note">{step.scoreNote}</span>
                  ) : (
                    <span className="rd-step-score-grade">
                      <GradeIcon gradeKey={grade.key} size={12} />
                      {step.scoreNote} · {grade.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </SplitBody>
        <div className="rd-row-foot">
          <span className="rd-note">
            카페거리 점수는 값이 없어 «–»로 둡니다 — 0점이 아닙니다. 이동 시간은
            자동차 기준 추정값입니다.
          </span>
          <a className="pd-dk-button" href="#my-courses">
            내 코스에 저장
          </a>
          <a className="pd-dk-button is-quiet" href="#map?view=course">
            지도에서 보기 →
          </a>
        </div>
      </LabelRow>

      <LabelRow
        kick="4 · 지도 미리보기"
        title="3곳 · 12.0km"
        desc="좌표는 실제 값이고 점수는 예시입니다. 전체 경로 탐색은 지도 탭에서 합니다."
      >
        <div className="rd-map">
          <KakaoMapCanvas
            markers={markers}
            selectedId={null}
            renderMarker={(id) => {
              const marker = markers.find((item) => item.id === id);
              return marker ? (
                <span className="pd-dk-num rd-pin">{marker.order}</span>
              ) : null;
            }}
            overlay={
              <span className="rd-map-badge">추천 경로 · 예시</span>
            }
          />
        </div>
        <div className="rd-legend">
          {STEPS.map((step, index) => (
            <span className="rd-legend-item" key={step.name}>
              <span className="pd-dk-num rd-legend-no">{index + 1}</span>
              {step.name}
            </span>
          ))}
          <span className="rd-note rd-legend-note">
            경로 · 소요 시간은 미연동 추정값
          </span>
        </div>
      </LabelRow>

      <FootNote
        missing="코스 데이터 · 서핑 · 온천 점수 · 이동 시간 · 대화형 응답"
        note="AI 제안은 노출된 근거만으로 만든 문장이며, 근거 값도 예시입니다. 점수 · 신뢰도 · 안전 판정은 서로 다른 값이며 하나로 요약하지 않습니다."
      />
    </DesktopShell>
  );
}
