import { MASCOT_ALT, MASCOT_ROLES, mascotUrl } from "./mascots";
import {
  DesktopHero,
  DesktopNav,
  DesktopScore,
  DesktopShell,
  FootNote,
  LabelRow,
  SplitBody,
} from "./pongdangDesktop";
import { AiSuggestion, StateChip } from "./pongdangUi";
import { useIsDesktop } from "./useIsDesktop";
import "./desktopKitPage.css";

// 개발 · 검증용 화면입니다. `#desktop-kit` 으로만 들어오며 제품 화면에서는
// 링크하지 않습니다(DevIndexPage 와 같은 관례).
//
// 데스크탑 프리미티브 4종을 디자인 원본(19a · 18a)의 샘플 내용으로 한 번씩
// 그려, 화면을 붙이기 전에 문법 자체를 눈으로 확인합니다. 실제 화면이 붙은
// 뒤에도 회귀 확인용으로 남깁니다.
//
// 여기 숫자는 전부 레이아웃 확인용 예시이며 수집 데이터가 아닙니다.

const CONTEXT = "강릉 경포해변 · 9월 15일 · 예보 06:00 기준";

const SAMPLE_SPOTS: {
  name: string;
  category: string;
  score: number | null;
  unscoredLabel?: string;
}[] = [
  { name: "경포해변", category: "해변", score: 72 },
  {
    name: "안목 커피거리",
    category: "카페 · 거리",
    score: null,
    unscoredLabel: "산정 대상 아님",
  },
  { name: "사천진 온천", category: "온천", score: 70 },
];

export function DesktopKitPage() {
  const isDesktop = useIsDesktop();
  return (
    <DesktopShell>
      <DesktopHero
        nav={<DesktopNav active="home" context={CONTEXT} />}
        wave="animated"
        minHeight={250}
      >
        <div className="dk-kit-hero">
          <div>
            <div className="pd-dk-kick dk-kit-hero-kick">강릉 물놀이</div>
            <h1 className="dk-kit-hero-title">
              데스크탑 프리미티브
              <br />
              미리보기
            </h1>
            <div className="dk-kit-hero-buttons">
              <a className="pd-dk-button is-on-cobalt" href="#dev">
                화면 인덱스로 →
              </a>
              <span className="pd-dk-button is-glass">
                useIsDesktop · {isDesktop ? "true (≥1080px)" : "false (<1080px)"}
              </span>
            </div>
          </div>
          <img
            className="dk-kit-hero-mascot"
            src={mascotUrl("home")}
            alt={MASCOT_ALT}
            width={250}
            height={250}
          />
          <div className="dk-kit-hero-metrics">
            <div>
              <div className="pd-dk-num dk-kit-metric-value">22.1°C</div>
              <div className="dk-kit-metric-name">수온</div>
            </div>
            <div>
              <div className="pd-dk-num dk-kit-metric-value">0.6m</div>
              <div className="dk-kit-metric-name">파고</div>
            </div>
            <div>
              <div className="pd-dk-num dk-kit-metric-value">–</div>
              <div className="dk-kit-metric-name">
                수질 <StateChip kind="uncollected" />
              </div>
            </div>
          </div>
        </div>
      </DesktopHero>

      <LabelRow
        kick="LabelRow"
        title="200px 라벨 열 + 1fr 본문"
        chip={<StateChip kind="example" />}
        desc="데스크탑 본문의 기본 단위입니다. 행마다 하단 괘선으로 끊고, 카드와 그림자는 쓰지 않습니다."
        link={{ href: "#dev", label: "화면 인덱스" }}
      >
        <SplitBody>
          {SAMPLE_SPOTS.map((spot) => (
            <div key={spot.name}>
              <div className="dk-kit-spot-name">{spot.name}</div>
              <div className="dk-kit-spot-category">{spot.category}</div>
              <div className="dk-kit-spot-score">
                <DesktopScore
                  score={spot.score}
                  unscoredLabel={spot.unscoredLabel}
                />
              </div>
            </div>
          ))}
        </SplitBody>
      </LabelRow>

      <LabelRow
        kick="SplitBody"
        title="3열 · 1.25fr 1fr 덮어쓰기"
        desc="columns 로 열 비율을 바꿉니다. 첫 칸의 왼쪽 괘선과 패딩은 자동으로 지워집니다."
      >
        <SplitBody columns="1.25fr 1fr">
          <div>
            <div className="dk-kit-lead">서핑과 온천을 고르셨습니다</div>
            <div className="dk-kit-chips">
              <span className="dk-kit-taste is-on">
                <img src={mascotUrl("surf")} alt="" width={20} height={20} />
                서핑
              </span>
              <span className="dk-kit-taste is-on">
                <img
                  src={mascotUrl("hotspring")}
                  alt=""
                  width={20}
                  height={20}
                />
                온천
              </span>
              <span className="dk-kit-taste">카페</span>
              <span className="dk-kit-taste">갯벌 체험</span>
            </div>
          </div>
          <div className="dk-kit-ai">
            <img
              className="dk-kit-ai-mascot"
              src={mascotUrl("ai")}
              alt={MASCOT_ALT}
              width={92}
              height={92}
            />
            <div>
              <AiSuggestion
                headline="오전 서핑 뒤 오후 온천을 붙이는 편이 낫습니다"
                basis="파고 0.6m(09시 예보) · 물때 밀물 12:34 · 수온 22.1°C. 전부 예시 값입니다."
              />
            </div>
          </div>
        </SplitBody>
      </LabelRow>

      <LabelRow
        kick="Slot"
        title="미확정 슬롯"
        desc="아직 디자인이 확정되지 않은 자리는 빈 채로 두지 않고 무엇이 들어올지 밝힙니다."
      >
        <div className="pd-dk-slot dk-kit-slot">
          시간대별 그래프 (06–21시) · 별도 작업
        </div>
      </LabelRow>

      <LabelRow kick="Mascot" title="마스코트 용도 매핑" desc="같은 개념에는 언제나 같은 포즈가 옵니다. 화면은 파일명이 아니라 용도로만 고릅니다.">
        <div className="dk-kit-mascots">
          {MASCOT_ROLES.map((role) => (
            <figure key={role} className="dk-kit-mascot">
              <img src={mascotUrl(role)} alt={MASCOT_ALT} width={64} height={64} />
              <figcaption>{role}</figcaption>
            </figure>
          ))}
        </div>
      </LabelRow>

      <div className="dk-kit-surface-nav">
        <DesktopNav
          active="map"
          onSurface
          context={
            <>
              명소 <span className="dk-kit-crumb">›</span> 해변{" "}
              <span className="dk-kit-crumb">›</span> 경포해변
            </>
          }
        />
        <p className="dk-kit-surface-note">
          흰 배경 변형입니다. 코발트 히어로가 없는 화면(명소 상세)에서 씁니다.
        </p>
      </div>

      <FootNote missing="프리미티브 미리보기 화면이므로 모든 값이 예시입니다" />
      <FootNote
        alert
        missing="시간대별 예보 · 조위 · 수질 수집 · 명소 API · 코스 저장"
        note="경고 바 형태입니다. 오늘 · 지도 화면처럼 미연동 항목이 안전 판단에 직접 걸리는 화면에서 씁니다."
      />
    </DesktopShell>
  );
}
