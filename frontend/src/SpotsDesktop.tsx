import { useMemo, useState } from "react";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { CONFIDENCE_COLOR, gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl } from "./mascots";
import {
  DesktopHero,
  DesktopNav,
  DesktopScore,
  DesktopShell,
  FootNote,
  LabelRow,
  SplitBody,
} from "./pongdangDesktop";
import { StateChip } from "./pongdangUi";
import {
  NEARBY_SPOTS,
  SPOTS,
  SPOT_SORTS,
  SPOT_TOTAL,
  mappableSpots,
  sortSpots,
  spotLink,
  type Spot,
  type SpotSort,
} from "./spotsCatalog";
import "./spotsDesktop.css";

// 데스크탑 명소(핸드오프 19a 목록 · 19b 상세)입니다. 모바일과 같은 라우트를
// 쓰며 SpotsPage 가 폭으로 갈라 이 레이아웃을 붙입니다.
//
// 명소 API · 대표 이미지 · 운영시간 · 거리 계산은 전부 미연동입니다. 퐁당 점수는
// 물놀이 조건 점수이지 명소의 품질 평가가 아니며, 산정 대상이 아니면 «–» 이고
// 0 점이 아닙니다. 리뷰 평점은 쓰지 않습니다.

const CONTEXT = "강릉 · 현재 위치 기준 · 목록 06:00 갱신";

/** 왼쪽 라벨 열의 카테고리 카운트. 전체 건수와 마찬가지로 예시 값입니다. */
const CATEGORY_COUNTS: { label: string; count: number }[] = [
  { label: "해변", count: 18 },
  { label: "온천 · 스파", count: 6 },
  { label: "카페 · 거리", count: 41 },
  { label: "문화 · 전시", count: 33 },
  { label: "체험 · 레저", count: 30 },
];

function ListRow({ spot }: { spot: Spot }) {
  return (
    <div className="sk-row">
      <span className="pd-dk-slot sk-row-photo">{spot.name} 대표 사진</span>
      <div className="sk-row-body">
        <div className="sk-row-head">
          <b className="sk-row-name">{spot.name}</b>
          <span className="sk-row-category">{spot.categoryLabel}</span>
        </div>
        <p className="sk-row-summary">
          {spot.address} · {spot.summary}
        </p>
        <div className="sk-row-meta">
          <span>
            <span className="sk-meta-name">거리</span>
            <span className="pd-dk-num sk-meta-value">{spot.distanceKm}km</span>
          </span>
          <span>
            <span className="sk-meta-name">운영</span>
            <b className={spot.operatingClosed ? "is-closed" : "is-open"}>
              {spot.operating}
            </b>
            {spot.operatingNote && (
              <span className="pd-dk-num sk-meta-hours">
                {spot.operatingNote}
              </span>
            )}
          </span>
          {spot.detail.parking && (
            <span>
              <span className="sk-meta-name">주차</span>
              <b>{spot.detail.parking}</b>
            </span>
          )}
        </div>
      </div>
      <div className="sk-row-score">
        <DesktopScore
          score={spot.score}
          align="right"
          unscoredLabel={spot.unscoredLabel}
        />
        <a className="sk-row-link" href={spotLink(spot)}>
          상세 →
        </a>
      </div>
    </div>
  );
}

function SpotsListDesktop() {
  const [sort, setSort] = useState<SpotSort>("popular");
  const rows = useMemo(() => sortSpots(SPOTS, sort), [sort]);
  return (
    <DesktopShell>
      <DesktopHero nav={<DesktopNav active="spots" context={CONTEXT} />}>
        <div className="sk-hero">
          <div className="sk-hero-lead">
            <div className="pd-dk-kick sk-hero-kick">
              공공 API · 백엔드 가공 목록
            </div>
            <h1 className="sk-hero-title">
              강릉 명소{" "}
              <span className="pd-dk-num sk-hero-count">{SPOT_TOTAL}</span>곳
            </h1>
            <div className="sk-sorts" role="group" aria-label="정렬">
              {SPOT_SORTS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={"sk-sort" + (item.key === sort ? " is-on" : "")}
                  aria-pressed={item.key === sort}
                  onClick={() => setSort(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <img
            className="sk-hero-mascot"
            src={mascotUrl("spot")}
            alt={MASCOT_ALT}
            width={186}
            height={186}
          />
        </div>
      </DesktopHero>

      <LabelRow
        kick="목록"
        title={
          <>
            해변 · 온천 · 카페
            <br />
            문화 · 체험
          </>
        }
        chip={
          <>
            <StateChip kind="example" />
            <span className="pd-state-chip">명소 API 미연동</span>
          </>
        }
        desc={
          <>
            <span className="sk-counts">
              {CATEGORY_COUNTS.map((item, index) => (
                <span
                  className={"sk-count" + (index === 0 ? " is-lead" : "")}
                  key={item.label}
                >
                  {item.label}{" "}
                  <span className="pd-dk-num sk-count-num">{item.count}</span>
                </span>
              ))}
            </span>
            리뷰 평점은 쓰지 않습니다. 거리는 현재 위치, 운영 여부는 API
            운영시간으로 계산합니다.
          </>
        }
      >
        <div className="sk-list">
          {rows.map((spot) => (
            <ListRow key={spot.id} spot={spot} />
          ))}
          <div className="sk-list-foot">
            <span className="sk-note">
              20개 단위로 더 불러옵니다. 정렬을 바꾸면 서버에서 다시 받아옵니다.
            </span>
            <button type="button" className="pd-dk-button is-pill">
              더 보기
            </button>
          </div>
        </div>
      </LabelRow>

      <FootNote
        missing="명소 API · 대표 이미지 · 운영시간 · 현재 위치 거리 계산"
        note="퐁당 점수는 물놀이 조건 점수이며 명소의 품질 평가가 아닙니다. 산정 대상이 아닌 명소는 «–»로 두며 0점이 아닙니다. 리뷰 평점은 수집하지 않습니다."
      />
    </DesktopShell>
  );
}

function SpotDetailDesktop({ spot }: { spot: Spot }) {
  const grade = gradeOf(spot.score);
  const pinned = useMemo(
    () => mappableSpots(spot.location ? [spot] : []),
    [spot],
  );
  const markers = useMemo(
    () =>
      pinned.map(({ spot: item, latitude, longitude }) => ({
        id: String(item.id),
        latitude,
        longitude,
      })),
    [pinned],
  );
  const nearby = NEARBY_SPOTS.filter((row) => row.spot.id !== spot.id);

  return (
    <DesktopShell>
      {/* 상세는 코발트 히어로가 없습니다 -- 사진이 지배 요소이므로 네비를 흰
          배경 위에 얹습니다. */}
      <DesktopNav
        active="spots"
        onSurface
        context={
          <>
            <a className="sk-crumb-link" href="#spots">
              명소
            </a>{" "}
            <span className="sk-crumb-sep">›</span> {spot.categoryLabel}{" "}
            <span className="sk-crumb-sep">›</span> {spot.name}
          </>
        }
      />

      <div className="sk-detail">
        <div className="sk-detail-photo">
          <span className="pd-dk-slot sk-detail-slot">
            {spot.name} 대표 사진 · API 제공 이미지 · 미연동
          </span>
          <div className="sk-detail-caption">
            <div className="sk-detail-chips">
              <span className="sk-detail-chip">{spot.categoryLabel}</span>
              <span className="sk-detail-chip is-example">예시</span>
            </div>
            <h1 className="sk-detail-name">{spot.name}</h1>
            <div className="sk-detail-address">
              {spot.address} · 현재 위치에서 {spot.distanceKm}km
            </div>
          </div>
        </div>

        <div className="sk-detail-body">
          <div className="sk-detail-score-row">
            <div>
              <div className="pd-dk-kick">오늘 이 명소의 물놀이 조건</div>
              <DesktopScore
                score={spot.score}
                size={72}
                unscoredLabel={spot.unscoredLabel}
              />
            </div>
            <div className="sk-detail-confidence">
              {spot.confidence ? (
                <div className="sk-confidence-row">
                  <span
                    className="sk-confidence-chip"
                    style={{ background: CONFIDENCE_COLOR }}
                  >
                    {spot.confidence.label}
                  </span>
                  <span className="sk-note">{spot.confidence.sources}</span>
                </div>
              ) : (
                <div className="sk-confidence-row">
                  <span className="pd-state-chip">신뢰도 –</span>
                  <span className="sk-note">산정 대상이 아닙니다</span>
                </div>
              )}
              <p className="sk-note sk-confidence-note">
                {spot.scoreBasis ??
                  "이 명소는 물놀이 조건 점수 산정 대상이 아닙니다. 값이 없다는 뜻이며 안전하다는 뜻이 아닙니다."}{" "}
                점수 · 안전 판정 · 신뢰도는 서로 다른 값이며 하나로 요약하지
                않습니다.
              </p>
            </div>
          </div>

          <div className="sk-detail-table">
            {[
              { name: "운영", value: spot.operating, open: true },
              { name: "개장 기간", value: spot.detail.openSeason },
              { name: "주차", value: spot.detail.parking },
              { name: "편의시설", value: spot.detail.facility },
              { name: "문의", value: spot.detail.contact },
            ].map((row) => (
              <div className="sk-detail-tr" key={row.name}>
                <span className="sk-detail-th">{row.name}</span>
                <span
                  className={
                    "sk-detail-td" +
                    (row.value === null ? " is-empty" : "") +
                    (row.open ? " is-open" : "")
                  }
                >
                  {row.value ?? "–"}
                </span>
              </div>
            ))}
          </div>

          <p className="sk-note sk-detail-summary">
            {spot.summary} 소개 텍스트는 API 값을 그대로 노출하며, 길면 4줄에서
            접습니다.
          </p>

          <div className="sk-detail-actions">
            <a className="pd-dk-button" href="#my-courses">
              내 코스에 추가
            </a>
            <button type="button" className="pd-dk-button is-quiet sk-save">
              저장
            </button>
            <a className="sk-detail-map-link" href="#spots?view=map">
              지도에서 보기 →
            </a>
          </div>
        </div>
      </div>

      <LabelRow
        kick="위치 · 주변"
        title={
          <>
            지도 탭과
            <br />
            같은 지도
          </>
        }
        chip={<StateChip kind="example" />}
        desc="카카오 지도를 그대로 쓰고 핀 소스만 명소 목록으로 바꿉니다. 좌표는 실제 값이고 점수는 예시입니다."
      >
        <SplitBody columns="1.6fr 1fr">
          <div className="sk-detail-map">
            {spot.location ? (
              <KakaoMapCanvas
                markers={markers}
                selectedId={String(spot.id)}
                renderMarker={() => (
                  <span className="sk-detail-pin" data-grade={grade.key}>
                    <span className="pd-dk-num">{spot.score ?? "–"}</span>
                  </span>
                )}
              />
            ) : (
              <div className="pd-dk-slot sk-detail-map-empty">
                좌표가 아직 확인되지 않았습니다 · 지도 표시 없음
              </div>
            )}
          </div>
          <div>
            <div className="pd-dk-kick">주변 명소 · 거리순</div>
            {nearby.map((row) => {
              const nearbyGrade = gradeOf(row.spot.score);
              return (
                <a
                  className="sk-nearby"
                  href={spotLink(row.spot)}
                  key={row.spot.id}
                >
                  <span
                    className="pd-dk-num sk-nearby-score"
                    data-grade={nearbyGrade.key}
                  >
                    {row.spot.score ?? "–"}
                  </span>
                  <span className="sk-nearby-body">
                    <span className="sk-nearby-name">{row.spot.name}</span>
                    <span className="sk-nearby-meta">
                      {row.spot.categoryLabel} · {row.fromSpotKm}km ·{" "}
                      {nearbyGrade.label}
                    </span>
                  </span>
                </a>
              );
            })}
            <p className="sk-note sk-nearby-note">
              여기 거리는 현재 위치가 아니라 {spot.name}에서의 거리입니다.
            </p>
          </div>
        </SplitBody>
      </LabelRow>

      <FootNote missing="명소 API · 대표 이미지 · 운영시간 · 편의시설 · 거리 계산" />
    </DesktopShell>
  );
}

export function SpotsDesktop({ spot }: { spot?: Spot }) {
  return spot ? <SpotDetailDesktop spot={spot} /> : <SpotsListDesktop />;
}
