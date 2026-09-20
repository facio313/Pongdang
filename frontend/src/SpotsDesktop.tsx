import { useMemo, useState } from "react";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { PlacePhoto, PlacePhotoCredit } from "./PlacePhoto";
import { gradeOf } from "./groupAGrade";
import {
  DesktopHero,
  DesktopNav,
  DesktopScore,
  DesktopShell,
  FootNote,
  LabelRow,
  SplitBody,
} from "./pongdangDesktop";
import {
  Icon,
  ScoreExplainer,
  ScoreGauge,
  ScoreReason,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { EvidenceNote } from "./EvidenceNote";
import { isInitialLoad } from "./useResource";
import { scoreReason, scoreTitle, verdictOf } from "./scoreMeaning";
import { RecommendationReason } from "./RecommendationReason";
import { activityHeadline } from "./recommendationText";
import { dateLabel, type Place } from "./productData";
import { useBestActivity } from "./useBestActivity";
import { usePlacesById } from "./usePlacesById";
import { useSpotActions } from "./useSpotActions";
import { mappablePlaces, useWaterPlaces } from "./useWaterPlaces";
import { sortPlaces, spotLink } from "./spotsRoute";
import "./spotsDesktop.css";

// 데스크탑 명소(핸드오프 19a 목록 · 19b 상세)입니다. 모바일과 같은 라우트를
// 쓰며 SpotsPage 가 폭으로 갈라 이 레이아웃을 붙입니다.
//
// 예전에는 이 화면이 예시 목록(spotsCatalog)을 그렸습니다. 「강릉 명소 128곳」 ·
// 카테고리 카운트(해변 18 · 카페 41 …) · 거리 · 운영시간이 전부 지어낸 값이었고,
// 「20개 단위로 더 불러옵니다」라는 있지도 않은 동작까지 약속했습니다.
//
// 이제 목록은 모바일과 같은 훅(useWaterPlaces)이 읽는 실제 장소입니다. 서버에
// 없는 것은 지어내지 않고 비웁니다.

const KIND_LABEL: Record<string, string> = { beach: "해변", valley: "계곡" };
const kindLabel = (place: Place) =>
  (place.type && KIND_LABEL[place.type]) ?? "분류 미확인";

function ListRow({ place }: { place: Place }) {
  return (
    <div className="sk-row">
      <a className="place-photo-link" href={spotLink(place)} aria-label={`${place.name} 상세`}>
        <PlacePhoto className="sk-row-photo" name={place.name} photo={place.photo} />
      </a>
      <div className="sk-row-body">
        <div className="sk-row-head">
          <b className="sk-row-name">{place.name}</b>
          <span className="sk-row-category">{kindLabel(place)}</span>
        </div>
        <p className="sk-row-summary">{place.address ?? "주소 없음"}</p>
        <PlacePhotoCredit photo={place.photo} />
        <div className="sk-row-meta">
          <span>
            <span className="sk-meta-name">지역</span>
            <b>{place.region ?? "–"}</b>
          </span>
          <span>
            <span className="sk-meta-name">좌표</span>
            <b>
              {typeof place.lat === "number" && typeof place.lng === "number"
                ? "확인됨"
                : "–"}
            </b>
          </span>
        </div>
      </div>
      <div className="sk-row-score">
        {/* 점수는 고른 장소만 조회합니다. 목록 전체에 붙이려면 장소마다 한
            번씩 불러야 합니다. 그래서 여기서는 점수를 약속하지 않습니다. */}
        <DesktopScore score={null} align="right" unscoredLabel="상세에서 조회" />
        <a className="sk-row-link" href={spotLink(place)}>
          상세 →
        </a>
      </div>
    </div>
  );
}

function SpotsListDesktop() {
  const [search, setSearch] = useState("");
  const places = useWaterPlaces(search);
  const rows = useMemo(() => sortPlaces(places.rows ?? []), [places.rows]);
  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const place of places.rows ?? [])
      counts.set(kindLabel(place), (counts.get(kindLabel(place)) ?? 0) + 1);
    return [...counts.entries()];
  }, [places.rows]);
  return (
    <DesktopShell>
      <DesktopHero
        nav={
          <DesktopNav
            active="spots"
            context={`강릉 · 수집된 물놀이 장소 · ${dateLabel()}`}
          />
        }
        mascot="spot"
      >
        <div className="sk-hero">
          <div className="sk-hero-lead">
            <div className="pd-dk-kick sk-hero-kick">
              공공 API · 백엔드 가공 목록
            </div>
            <h1 className="sk-hero-title">
              강릉 명소{" "}
              {places.loading ? (
                <Skeleton width="2em" glass label="장소 조회 중" />
              ) : (
                <span className="pd-dk-num sk-hero-count">{places.total}</span>
              )}
              곳
            </h1>
          </div>
        </div>
      </DesktopHero>

      {/* 검색은 히어로(코발트 면)가 아니라 그 아래, 걸러낼 목록 바로 위에
          둡니다. 무엇을 바꾸는 컨트롤인지 자리로 말합니다. */}
      <div className="sk-searchbar">
        <label className="sk-search">
          <Icon name="search" size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
            placeholder="장소명 · 지역 검색"
            aria-label="장소명·지역 검색"
          />
        </label>
        {/* 정렬 버튼이 있었습니다. 「퐁당 점수순」은 목록의 점수를 모르는
            채 비교해 눌러도 순서가 바뀌지 않았고, 남은 「이름순」 하나로는
            고를 것이 없습니다(spotsRoute.sortPlaces). */}
        <span className="sk-search-order">이름순</span>
      </div>

      <LabelRow
        kick="목록"
        title={
          <>
            수집된
            <br />
            물놀이 장소
          </>
        }
        chip={<StateChip kind={places.rows ? "live" : "no_data"} />}
        desc={
          <>
            {/* 예전에는 여기가 「해변 18 · 온천 6 · 카페 41 …」이었습니다.
                근거 없는 숫자였습니다. 이제 실제로 받아 온 목록을 셉니다. */}
            <span className="sk-counts">
              {kinds.map(([label, count], index) => (
                <span
                  className={"sk-count" + (index === 0 ? " is-lead" : "")}
                  key={label}
                >
                  {label}{" "}
                  <span className="pd-dk-num sk-count-num">{count}</span>
                </span>
              ))}
            </span>
            리뷰 평점은 쓰지 않습니다. 거리 · 운영시간은 아직 내려주는 API 가
            없어 비워 둡니다. 대표 사진은 수집된 사진이 있는 장소에 표시합니다.
          </>
        }
      >
        <div className="sk-list">
          {rows.map((place) => (
            <ListRow key={place.id} place={place} />
          ))}
          {!rows.length && (
            <p className="sk-note" role={places.error ? "alert" : "status"}>
              {places.error ??
                (places.loading ? "장소를 조회하고 있습니다." : "검색 결과 없음")}
            </p>
          )}
          {/* 예전에는 「20개 단위로 더 불러옵니다」와 동작하지 않는 «더 보기»
              버튼이 있었습니다. 없는 동작을 약속하지 않습니다. 서버가 100건에서
              자르는 것은 사실이므로 그것만 밝힙니다. */}
          {rows.length > 0 && (
            <div className="sk-list-foot">
              <span className="sk-note">
                목록 {rows.length}곳 전체입니다 · 서버가 한 번에 최대 100곳까지
                내려줍니다
              </span>
            </div>
          )}
        </div>
      </LabelRow>

      <FootNote
        missing="운영시간 · 편의시설 · 현재 위치 거리 계산"
        note="퐁당 점수는 물놀이 조건 점수이며 명소의 품질 평가가 아닙니다. 목록에는 점수를 싣지 않습니다 -- 장소마다 따로 조회해야 하므로 상세에서 읽습니다. 리뷰 평점은 수집하지 않습니다."
      />
    </DesktopShell>
  );
}

function SpotDetailDesktop({ spotId }: { spotId: number }) {
  // 분류(해변 · 계곡)는 분류된 목록에만 있습니다. datasets/spots 의 type 은
  // 수집 종류라 분류로 쓸 수 없습니다(useWaterPlaces 주석).
  const catalog = useWaterPlaces("");
  const lookup = usePlacesById([spotId]);
  const classified = catalog.rows?.find((item) => item.id === spotId);
  const place: Place | undefined = useMemo(() => classified
    ? { ...classified, photo: classified.photo ?? lookup.rows[0]?.photo }
    : lookup.rows[0], [classified, lookup.rows]);
  const { best, loading, recommendation } = useBestActivity(place?.id, Boolean(place) || lookup.loading);
  const { action, message, showDraftLink, add } = useSpotActions(place, { queryFavorites: false });
  const score = best?.score ?? null;
  const grade = gradeOf(score);
  const verdict =
    best && !loading ? verdictOf(best.activity, gradeOf(best.score).key) : null;
  // 아직 어느 쪽에서도 장소를 받지 못한 상태. 모바일 상세와 같은 규칙으로
  // 「없음」과 구분해 그립니다 -- 조회 중에 「장소를 찾지 못했습니다」라고
  // 적으면 곧 올 값을 없다고 단정하는 셈입니다.
  const placeLoading = !place && lookup.loading;
  const pinned = useMemo(() => mappablePlaces(place ? [place] : []), [place]);
  const markers = useMemo(
    () =>
      pinned.map(({ place: item, latitude, longitude }) => ({
        id: String(item.id),
        latitude,
        longitude,
      })),
    [pinned],
  );
  // 「주변 명소」는 거리순이었는데 장소 간 거리를 주는 API 가 없습니다. 같은
  // 분류의 다른 장소를 이름순으로 보여 주고, 거리라고 부르지 않습니다.
  const sameKind = sortPlaces(
    (catalog.rows ?? []).filter(
      (item) => item.id !== spotId && item.type === place?.type,
    ),
  ).slice(0, 5);

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
            <span className="sk-crumb-sep">›</span>{" "}
            {place ? kindLabel(place) : "분류 미확인"}{" "}
            <span className="sk-crumb-sep">›</span>{" "}
            {place?.name ?? (placeLoading ? "조회 중" : "장소 없음")}
          </>
        }
      />

      <div className="sk-detail">
        <div className="sk-detail-photo">
          <PlacePhoto className="sk-detail-slot" name={place?.name ?? "장소"} photo={place?.photo} eager />
          <div className="sk-detail-caption">
            <div className="sk-detail-chips">
              <span className="sk-detail-chip">
                {place ? kindLabel(place) : "분류 미확인"}
              </span>
            </div>
            <h1 className="sk-detail-name">
              {placeLoading ? (
                <Skeleton width="6em" glass label="장소 조회 중" />
              ) : (
                (place?.name ?? "장소를 찾지 못했습니다")
              )}
            </h1>
            <div className="sk-detail-address">
              {place?.address ?? "주소 없음"} ·{" "}
              {place?.region ?? "지역 미확인"}
            </div>
          </div>
        </div>

        <div className="sk-detail-body">
          {/* 장소 조회 실패. 모바일 상세는 알리는데 이 화면은 lookup 을 받아
              rows 만 쓰고 오류를 한 번도 읽지 않았습니다. */}
          {lookup.error && (
            <p className="sk-note" role="alert">
              {lookup.error}
            </p>
          )}
          <PlacePhotoCredit photo={place?.photo} />
          <div className="sk-detail-score-row">
            <div>
              <div className="pd-dk-kick">
                {best
                  ? `오늘 여기서 가장 좋은 활동 · ${activityHeadline(best.activity)}`
                  : recommendation.error
                  ? "오늘의 활동을 불러오지 못했습니다"
                  : "오늘 이 장소의 물놀이 조건"}
              </div>
              <DesktopScore
                score={score}
                size={72}
                unscoredLabel={best ? undefined : "산정 가능한 활동 없음"}
              />
              {best && <div className="sk-note">{scoreTitle(best.activity)}</div>}
            </div>
            <div className="sk-detail-confidence">
              <ScoreGauge score={score} loading={loading} />
              {verdict && <p className="sk-detail-verdict">{verdict}</p>}
              {/* 왜 이 활동인가 · 왜 저것이 아닌가 · 지금 물때 · 대신 갈 곳. */}
              <RecommendationReason
                data={recommendation.data}
                error={recommendation.error}
                loading={isInitialLoad(recommendation)}
              />
              <ScoreReason
                text={scoreReason(best?.data).text}
                loading={loading}
              />
              <EvidenceNote data={best?.data} className="sk-note" />
              <ScoreExplainer data={best?.data} />
            </div>
          </div>

          {/* 아래 다섯 줄은 서버에 컬럼이 없습니다. 지어내지 않고 비웁니다. */}
          <div className="sk-detail-table">
            {["운영", "개장 기간", "주차", "편의시설", "문의"].map((name) => (
              <div className="sk-detail-tr" key={name}>
                <span className="sk-detail-th">{name}</span>
                <span className="sk-detail-td is-empty">–</span>
              </div>
            ))}
          </div>
          <p className="sk-note sk-detail-summary">
            운영 · 개장 기간 · 주차 · 편의시설 · 문의 · 소개를 내려주는 API 가
            아직 없습니다. 값이 없다는 뜻이며 「없음」이나 「이용 불가」가
            아닙니다.
          </p>

          {place && <>
            <div className="sk-detail-actions">
              <button type="button" className="pd-dk-button" disabled={action.busy} onClick={add}>
                내 코스에 추가
              </button>
              <a className="sk-detail-map-link" href={`#map?spot_id=${place.id}`}>
                지도 탭에서 보기 →
              </a>
            </div>
            {action.error && <p className="sk-note" role="alert">{action.error}</p>}
            {message && <p className="sk-note" role="status">{message} {showDraftLink && <a href="#map?view=course">코스 초안 보기</a>}</p>}
          </>}
        </div>
      </div>

      <LabelRow
        kick="위치 · 같은 분류"
        title={
          <>
            지도 탭과
            <br />
            같은 지도
          </>
        }
        chip={<StateChip kind={place ? "live" : "no_data"} />}
        desc="카카오 지도를 그대로 쓰고 핀 소스만 이 장소로 바꿉니다. 좌표는 서버가 준 실제 값이며, 없으면 찍지 않습니다."
      >
        <SplitBody columns="1.6fr 1fr">
          <div className="sk-detail-map">
            {markers.length ? (
              <KakaoMapCanvas
                markers={markers}
                selectedId={String(spotId)}
                renderMarker={() => (
                  <span className="sk-detail-pin" data-grade={grade.key}>
                    <span className="pd-dk-num">{score ?? "–"}</span>
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
            <div className="pd-dk-kick">같은 분류의 장소 · 이름순</div>
            {sameKind.map((item) => (
              <a className="sk-nearby" href={spotLink(item)} key={item.id}>
                <span className="pd-dk-num sk-nearby-score" data-grade="unscored">
                  –
                </span>
                <span className="sk-nearby-body">
                  <span className="sk-nearby-name">{item.name}</span>
                  <span className="sk-nearby-meta">
                    {kindLabel(item)} · {item.region ?? "지역 미확인"}
                  </span>
                </span>
              </a>
            ))}
            {!sameKind.length && (
              <p className="sk-note">같은 분류의 다른 장소가 목록에 없습니다.</p>
            )}
            {/* 예전에는 「여기 거리는 현재 위치가 아니라 이 명소에서의
                거리입니다」라고 적혀 있었지만, 장소 간 거리를 주는 API 가
                없습니다. 거리라고 부르지 않습니다. */}
            <p className="sk-note sk-nearby-note">
              장소 사이 거리를 내려주는 API 가 없어 이름순으로 둡니다. 점수는
              각 장소 상세에서 조회합니다.
            </p>
          </div>
        </SplitBody>
      </LabelRow>

      <FootNote missing="운영시간 · 편의시설 · 장소 간 거리" />
    </DesktopShell>
  );
}

export function SpotsDesktop({ spotId }: { spotId?: number }) {
  return spotId ? (
    <SpotDetailDesktop spotId={spotId} />
  ) : (
    <SpotsListDesktop />
  );
}
