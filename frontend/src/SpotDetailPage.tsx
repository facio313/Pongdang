import { useState } from "react";
import { AppHeader, AppShell } from "./AppShell";
import { CONFIDENCE_COLOR, gradeOf } from "./groupAGrade";
import { GradeIcon, Icon } from "./pongdangUi";
import { timeLabel } from "./productData";
import type { Spot } from "./spotsCatalog";
import "./spotsPage.css";

// 명소 상세(핸드오프 모바일 20b)입니다. `#spots?spot_id=…` 로 들어오며
// SpotsPage 가 라우팅합니다.
//
// 이 화면이 지키는 것:
//  - 점수 · 안전 판정 · 신뢰도는 서로 다른 값이며 하나로 요약하지 않습니다.
//    신뢰도는 전용색(CONFIDENCE_COLOR)을 쓰고 등급 팔레트와 섞지 않습니다.
//  - 값이 없으면 «–» 이며 0 · 정상 · 안전으로 치환하지 않습니다.
//  - 대표 사진과 운영 정보는 미연동이므로 빈 슬롯과 미연동 카드를 남깁니다.

function InfoRow({ name, value }: { name: string; value: string | null }) {
  return (
    <div className="sd-info-row">
      <span className="sd-info-name">{name}</span>
      <span className={"sd-info-value" + (value === null ? " is-empty" : "")}>
        {value ?? "–"}
      </span>
    </div>
  );
}

export function SpotDetailPage({ spot }: { spot: Spot }) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const grade = gradeOf(spot.score);

  return (
    <article className="spots-page spot-detail">
      <AppShell
        tab="spots"
        hero={
          <header className="sd-hero">
            <span className="pd-slot sd-hero-photo">
              {spot.name} 대표 사진
              <br />
              API 제공 이미지 · 미연동
            </span>
            <div className="sd-hero-bar">
              <AppHeader
                title="명소"
                time={timeLabel(new Date().toISOString())}
              />
            </div>
            <div className="sd-hero-caption">
              <div className="sd-hero-chips">
                <span className="sd-hero-chip">{spot.categoryLabel}</span>
                <span className="sd-hero-chip is-example">예시</span>
              </div>
              <h1 className="sd-hero-name">{spot.name}</h1>
              <div className="sd-hero-address">
                {spot.address} · 현재 위치에서 {spot.distanceKm}km
              </div>
            </div>
          </header>
        }
      >
        <a className="sd-back pd-inline" href="#spots">
          ← 명소 목록
        </a>

        <div className="pd-card sd-score-card">
          <div className="sd-score" data-grade={grade.key}>
            <div className="pd-num sd-score-num">{spot.score ?? "–"}</div>
            <div className="sd-score-grade">
              <GradeIcon gradeKey={grade.key} size={10} />
              {spot.score === null
                ? (spot.unscoredLabel ?? grade.label)
                : grade.label}
            </div>
          </div>
          <div className="sd-score-body">
            <div className="sd-score-title">오늘 이 명소의 물놀이 조건</div>
            <p className="pd-note sd-score-basis">
              {spot.scoreBasis ??
                "이 명소는 물놀이 조건 점수 산정 대상이 아닙니다. 값이 없다는 뜻이며 안전하다는 뜻이 아닙니다."}
            </p>
            {spot.confidence && (
              <div className="sd-confidence">
                <span
                  className="sd-confidence-chip"
                  style={{ background: CONFIDENCE_COLOR }}
                >
                  {spot.confidence.label}
                </span>
                <span className="sd-confidence-note">
                  {spot.confidence.sources}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="pd-card sd-info">
          <InfoRow name="운영" value={spot.operating} />
          <InfoRow name="개장 기간" value={spot.detail.openSeason} />
          <InfoRow name="주차" value={spot.detail.parking} />
          <InfoRow name="편의시설" value={spot.detail.facility} />
          <InfoRow name="문의" value={spot.detail.contact} />
        </div>

        <div className="pd-card">
          <div className="pd-card-title sd-section-title">소개</div>
          <p className={"pd-note sd-summary" + (expanded ? " is-open" : "")}>
            {spot.summary} API 가 내려주는 소개 텍스트가 그대로 들어갑니다.
            길면 3줄에서 접고 「더 보기」를 둡니다.
          </p>
          <button
            type="button"
            className="sd-more pd-tap"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "접기" : "더 보기"}
          </button>
        </div>

        <div className="pd-card">
          <div className="sd-location-head">
            <span className="pd-card-title sd-section-title">위치</span>
            <a className="sd-location-link pd-inline" href="#spots?view=map">
              지도에서 보기 →
            </a>
          </div>
          <div className="pd-slot sd-map-slot">
            {spot.location
              ? "카카오 지도 · 좌표는 실제 · 핀 1개"
              : "좌표가 아직 확인되지 않았습니다 · 지도 표시 없음"}
          </div>
        </div>

        <div className="sd-actions">
          <a className="pd-primary sd-add" href="#my-courses">
            내 코스에 추가
          </a>
          <button
            type="button"
            className="pd-secondary sd-save"
            aria-pressed={saved}
            aria-label={saved ? "저장 해제" : "저장"}
            onClick={() => setSaved((value) => !value)}
          >
            <Icon name="save" size={19} />
          </button>
        </div>

        <div className="pd-card sd-alert">
          <Icon name="warning" size={14} />
          명소 API · 이미지 · 운영 정보는 아직 실연동되지 않았습니다. 위 값은
          레이아웃 확인용 예시이며 안전 판단에 사용할 수 없습니다.
        </div>
      </AppShell>
    </article>
  );
}
