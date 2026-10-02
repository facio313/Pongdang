import { t } from "./i18n.ts";
import { useMemo } from "react";
import { AppHeader, AppShell } from "./AppShell";
import { PlacePhoto, PlacePhotoCredit } from "./PlacePhoto";
import { PlaceDetailInformation } from "./PlaceDetailInformation";
import { PlaceDistanceInfo } from "./PlaceDistanceInfo";
import { FirstSwimGuide } from "./FirstSwimGuide";
import { gradeOf } from "./groupAGrade";
import { Icon, Skeleton } from "./pongdangUi";
import { SpotConditionsCard } from "./SpotConditionsCard";
import { placeMatchesId, placeRegionLabel, type Place } from "./productData";
import { distanceLabel, hasPlaceCoordinates, placeDistanceKm } from "./placeDistance";
import { kindLabel } from "./placeDetails";
import { KakaoMapCanvas } from "./KakaoMapCanvas";
import { useBestActivity } from "./useBestActivity";
import { usePlacesById } from "./usePlacesById";
import { usePlaceDetails } from "./usePlaceDetails";
import { mappablePlaces, useWaterPlace, useWaterPlaces } from "./useWaterPlaces";
import { useSpotActions } from "./useSpotActions";
import { sortPlaces, spotLink } from "./spotsRoute";
import "./spotsPage.css";

// 명소 상세(핸드오프 모바일 20b)입니다. `#spots?spot_id=…` 로 들어오며
// SpotsPage 가 라우팅합니다.
//
// 예전에는 예시 목록(spotsCatalog)에서 Spot 객체를 통째로 받아, 점수 · 거리 ·
// 운영시간 · 소개가 전부 지어낸 값이었습니다. 이제 id 로 서버 장소를 조회하고
// 점수는 홈과 같은 훅(useBestActivity)으로 읽습니다.
//
// 이 화면이 지키는 것:
//  - 점수 · 안전 판정은 서로 다른 값이며 하나로 요약하지 않습니다.
//  - 값이 없으면 «–» 이며 0 · 정상 · 안전으로 치환하지 않습니다.
//  - 상세 안내는 수집기가 저장한 값만 읽으며 누락과 수집 실패를 구분합니다.

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


export function SpotDetailPage({ spotId }: { spotId: number }) {
  // 분류(해변 · 계곡)는 분류된 목록에만 있습니다. datasets/spots 의 type 은
  // 수집 종류(beach_search_result · tourism)라 분류로 쓸 수 없습니다.
  // 그래서 분류 목록에서 먼저 찾고, 거기 없으면(100건 밖) id 조회로 갑니다.
  const catalog = useWaterPlace(spotId);
  const lookup = usePlacesById([spotId]);
  const details = usePlaceDetails([spotId]);
  const classified = catalog.place;
  // 아래 useMemo 들의 의존성이라 매 렌더 새 객체가 되면 지도 마커와 주변
  // 목록이 계속 다시 계산됩니다(데스크탑 상세와 같은 처리).
  const place: Place | undefined = useMemo(
    () =>
      classified
        ? { ...classified, photo: classified.photo ?? lookup.rows[0]?.photo }
        : lookup.rows[0],
    [classified, lookup.rows],
  );
  // 홈 히어로와 같은 규칙으로 오늘 가장 좋은 활동을 고릅니다. 장소마다 조건이
  // 다르므로 「이 명소에서 무엇을 하기 좋은가」가 상세의 답입니다.
  const { best, loading, recommendation } = useBestActivity(place?.id, Boolean(place) || lookup.loading);
  const score = best?.score ?? null;
  const grade = gradeOf(score);
  // 아직 어느 쪽에서도 장소를 받지 못한 상태. 「없음」과 구분해 그립니다.
  const placeLoading = !place && lookup.loading;
  const { action, favorites, favoritesLoginRequired, saved, message, showDraftLink, add, toggleFavorite } = useSpotActions(place);
  // 지도에 찍을 좌표. 좌표가 없으면 핀을 만들지 않습니다 -- 없는 위치를
  // 임의로 만들지 않습니다(데스크탑 상세와 같은 규칙).
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
  // 같은 분류의 가까운 장소. 이미 읽은 목록 안에서 저장 좌표로 계산하며
  // 길찾기 API 를 호출하지 않습니다.
  const nearbyCatalog = useWaterPlaces("");
  const sameKind = useMemo(
    () =>
      sortPlaces(
        (nearbyCatalog.rows ?? []).filter(
          (item) => !placeMatchesId(item, spotId) && item.type === place?.type,
        ),
      )
        .map((item) => ({ item, distance: placeDistanceKm(place, item) }))
        .sort((a, b) =>
          a.distance === null
            ? b.distance === null ? 0 : 1
            : b.distance === null ? -1 : a.distance - b.distance,
        )
        .slice(0, 5),
    [nearbyCatalog.rows, place, spotId],
  );

  return (
    <article className="spots-page spot-detail">
      <AppShell
        tab="spots"
        showFooterNote={false}
        // 이 히어로에는 마스코트를 두지 않습니다. 표지는 보여 줄 수 없는 것을
        // 대신 세우는 것이고, 여기에는 그 장소의 실제 사진이 이미 있습니다
        // (홈 hm-pick · 추천 rc-stop 도 같은 이유로 없습니다).
        hero={
          <header className="sd-hero">
            <PlacePhoto className="sd-hero-photo" name={place?.name ?? t("장소")} photo={place?.photo} eager />
            <div className="sd-hero-bar">
              <AppHeader
                title={t("명소")}
              />
            </div>
            <div className="sd-hero-caption">
              <div className="sd-hero-chips">
                <span className="sd-hero-chip">
                  {t(kindLabel(place))}
                </span>
              </div>
              <h1 className="sd-hero-name">
                {placeLoading ? (
                  <Skeleton width="6em" glass label={t("장소 조회 중")} />
                ) : (
                  (place?.name ?? t("장소를 찾지 못했습니다"))
                )}
              </h1>
              <div className="sd-hero-address">
                {place?.address ?? t("주소 없음")} · {placeRegionLabel(place)}
              </div>
            </div>
          </header>
        }
      >
        <PlacePhotoCredit photo={place?.photo} />
        <a className="sd-back pd-inline" href="#spots">{t("← 명소 목록")}</a>

        {lookup.error && (
          <p className="pd-note" role="alert">
            {lookup.error}
          </p>
        )}

        <SpotConditionsCard data={recommendation.data} loading={loading} error={recommendation.error} />

        {classified && (classified.type === "beach" || classified.type === "valley") && <FirstSwimGuide spotId={classified.id} />}

        <div className="pd-card place-details-card">
          <PlaceDetailInformation detail={details.byId.get(spotId)} loading={details.loading} error={details.error} />
        </div>

        <div className="pd-card">
          <div className="sd-location-head">
            <span className="pd-card-title sd-section-title">{t("위치")}</span>
            {place && <a className="sd-location-link pd-inline" href={`#map?spot_id=${place.id}`}>{t("지도에서 보기 →")}</a>}
          </div>
          <div className="sd-info">
            <InfoRow name={t("주소")} value={place?.address ?? null} />
            <InfoRow
              name={t("좌표")}
              value={
                typeof place?.lat === "number" && typeof place?.lng === "number"
                  ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`
                  : null
              }
            />
          </div>
          {/* 이 장소의 지도. 데스크탑 상세는 이미 지도를 품고 있었고 모바일은
              좌표 숫자와 「지도에서 보기 →」 링크뿐이라, 어디쯤인지 보려면
              화면을 떠나야 했습니다. */}
          <div className="sd-map">
            {markers.length ? (
              <KakaoMapCanvas
                markers={markers}
                selectedId={String(spotId)}
                renderMarker={() => (
                  <span className="sd-map-pin" data-grade={grade.key}>
                    <span className="pd-num">{score ?? "–"}</span>
                  </span>
                )}
              />
            ) : (
              !placeLoading && (
                <div className="pd-slot sd-map-empty">
                  {t("좌표가 아직 확인되지 않았습니다 · 지도 표시 없음 — 없는 위치를 임의로 만들지 않습니다.")}
                </div>
              )
            )}
          </div>
          <PlaceDistanceInfo place={place} loading={placeLoading} />
        </div>

        {/* 같은 분류의 가까운 장소. 이미 읽은 목록 안에서 저장 좌표로
            계산하며 길찾기 API 를 부르지 않습니다(데스크탑과 같은 규칙). */}
        <div className="pd-card">
          <div className="pd-card-title sd-section-title">
            {t(hasPlaceCoordinates(place) ? "같은 분류의 장소 · 직선거리순" : "같은 분류의 장소 · 이름순")}
          </div>
          {sameKind.map(({ item, distance }) => (
            <a className="sd-nearby" href={spotLink(item)} key={item.id}>
              <span className="pd-num sd-nearby-distance">{distanceLabel(distance)}</span>
              <span className="sd-nearby-body">
                <span className="sd-nearby-name">{item.name}</span>
                <span className="sd-nearby-meta">
                  {t(kindLabel(item))} · {placeRegionLabel(item)}
                </span>
              </span>
            </a>
          ))}
          {!sameKind.length && (
            <p className="pd-note">{t("같은 분류의 다른 장소가 목록에 없습니다.")}</p>
          )}
          <p className="pd-note">{t("현재 목록의 같은 분류 장소를 표시합니다. 거리는 이 명소의 좌표를 기준으로 계산한 직선거리입니다.")}</p>
        </div>

        {place && <>
          <div className="sd-actions">
            <button type="button" className="pd-primary sd-add" disabled={action.busy} onClick={add}>{t("내 코스에 추가")}</button>
            <button type="button" className="pd-secondary sd-save"
              disabled={action.busy || favorites.loading || (!favorites.data && !favoritesLoginRequired)}
              aria-pressed={Boolean(saved)} aria-label={saved ? t("저장 해제") : t("저장")}
              onClick={toggleFavorite}>
              <Icon name="save" size={19} />
            </button>
          </div>
          {favorites.loading && <p role="status">{t("즐겨찾기 조회 중…")}</p>}
          {/* 이 화면에는 지도(카카오 키 없음)처럼 다른 알림도 있으므로, 액션 실패는
              전용 클래스로 구분합니다 -- 「저장이 실패했는가」를 묻는 검사가
              지도 경고를 집어 들지 않도록. */}
          {favorites.error && <p className="sd-action-error" role="alert">{t("즐겨찾기 조회 실패:")} {favorites.error}</p>}
          {action.error && <p className="sd-action-error" role="alert">{action.error}</p>}
          {message && <p role="status">{message} {showDraftLink && <a href="#map?view=course">{t("코스 초안 보기")}</a>}</p>}
        </>}
      </AppShell>
    </article>
  );
}
