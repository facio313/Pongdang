import { t } from "./i18n.ts";
import { AppHeader, AppShell } from "./AppShell";
import { PlacePhoto, PlacePhotoCredit } from "./PlacePhoto";
import { gradeOf } from "./groupAGrade";
import { GradeIcon, Icon, ScoreExplainer, ScoreGauge, ScoreReason, Skeleton } from "./pongdangUi";
import { EvidenceNote } from "./EvidenceNote";
import { timeLabel, type Place } from "./productData";
import { scoreReason, scoreTitle, verdictOf } from "./scoreMeaning";
import { RecommendationReason } from "./RecommendationReason";
import { activityHeadline } from "./recommendationText";
import { useBestActivity } from "./useBestActivity";
import { usePlacesById } from "./usePlacesById";
import { useWaterPlaces } from "./useWaterPlaces";
import { useSpotActions } from "./useSpotActions";
import { isInitialLoad } from "./useResource";
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
//  - 서버에 없는 항목(운영 · 개장 기간 · 주차 · 편의시설 · 문의 · 소개)은
//    지어내지 않고 비운 채 그 사실을 밝힙니다.

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

const KIND_LABEL: Record<string, string> = { beach: "해변", valley: "계곡" };

export function SpotDetailPage({ spotId }: { spotId: number }) {
  // 분류(해변 · 계곡)는 분류된 목록에만 있습니다. datasets/spots 의 type 은
  // 수집 종류(beach_search_result · tourism)라 분류로 쓸 수 없습니다.
  // 그래서 분류 목록에서 먼저 찾고, 거기 없으면(100건 밖) id 조회로 갑니다.
  const catalog = useWaterPlaces("");
  const lookup = usePlacesById([spotId]);
  const classified = catalog.rows?.find((item) => item.id === spotId);
  const place: Place | undefined = classified
    ? { ...classified, photo: classified.photo ?? lookup.rows[0]?.photo }
    : lookup.rows[0];
  // 홈 히어로와 같은 규칙으로 오늘 가장 좋은 활동을 고릅니다. 장소마다 조건이
  // 다르므로 「이 명소에서 무엇을 하기 좋은가」가 상세의 답입니다.
  const { best, loading, recommendation } = useBestActivity(place?.id, Boolean(place) || lookup.loading);
  const score = best?.score ?? null;
  const grade = gradeOf(score);
  const verdict =
    best && !loading ? verdictOf(best.activity, gradeOf(best.score).key) : null;
  // 아직 어느 쪽에서도 장소를 받지 못한 상태. 「없음」과 구분해 그립니다.
  const placeLoading = !place && lookup.loading;
  const { action, favorites, saved, message, showDraftLink, add, toggleFavorite } = useSpotActions(place);

  return (
    <article className="spots-page spot-detail">
      <AppShell
        tab="spots"
        hero={
          <header className="sd-hero">
            <PlacePhoto className="sd-hero-photo" name={place?.name ?? t("장소")} photo={place?.photo} eager />
            <div className="sd-hero-bar">
              <AppHeader
                title={t("명소")}
                time={timeLabel(new Date().toISOString())}
              />
            </div>
            <div className="sd-hero-caption">
              <div className="sd-hero-chips">
                <span className="sd-hero-chip">
                  {t((place?.type && KIND_LABEL[place.type]) || "분류 미확인")}
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
                {place?.address ?? t("주소 없음")} · {(place?.region ?? t("지역 미확인"))}
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

        <div className="pd-card sd-score-card">
          <div className="sd-score" data-grade={grade.key}>
            <div className="pd-num sd-score-num">
              {loading ? (
                <Skeleton width="1.6em" label={t("점수 조회 중")} />
              ) : (
                (score ?? "–")
              )}
            </div>
            <div className="sd-score-grade">
              <GradeIcon gradeKey={grade.key} size={10} />
              {t(grade.label)}
            </div>
          </div>
          <div className="sd-score-body">
            <div className="sd-score-title">
              {best
                ? t("오늘 여기서 가장 좋은 활동 · {activity}", { activity: activityHeadline(best.activity) })
                : recommendation.error
                  ? t("오늘의 활동을 불러오지 못했습니다")
                  : t("오늘 이 장소의 물놀이 조건")}
            </div>
            {best && (
              <div className="sd-score-what">{scoreTitle(best.activity)}</div>
            )}
            <ScoreGauge score={score} loading={loading} />
            {verdict && <p className="sd-score-verdict">{verdict}</p>}
            {/* 왜 이 활동인가 · 왜 저것이 아닌가 · 지금 물때 · 대신 갈 곳. */}
            <RecommendationReason
              data={recommendation.data}
              error={recommendation.error}
              loading={isInitialLoad(recommendation)}
            />
            <ScoreReason text={scoreReason(best?.data).text} loading={loading} />
            <EvidenceNote data={best?.data} className="pd-note" />
            <ScoreExplainer data={best?.data} />
          </div>
        </div>

        {/* 아래 다섯 줄은 모두 서버에 컬럼이 없습니다. 지어내지 않고 비웁니다.
            travel 카탈로그도 opening_hours 를 None 으로 고정해 내려줍니다. */}
        <div className="pd-card sd-info">
          <InfoRow name={t("운영")} value={null} />
          <InfoRow name={t("개장 기간")} value={null} />
          <InfoRow name={t("주차")} value={null} />
          <InfoRow name={t("편의시설")} value={null} />
          <InfoRow name={t("문의")} value={null} />
          <p className="pd-note">{t("운영 · 개장 기간 · 주차 · 편의시설 · 문의를 내려주는 API 가 아직 없습니다. 값이 없다는 뜻이며 「없음」이나 「이용 불가」가 아닙니다.")}</p>
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
          {!(typeof place?.lat === "number" && typeof place?.lng === "number") &&
            !placeLoading && (
              <p className="pd-note">{t("좌표가 아직 확인되지 않았습니다 · 지도 표시 없음 — 없는 위치를 임의로 만들지 않습니다.")}</p>
            )}
        </div>

        {place && <>
          <div className="sd-actions">
            <button type="button" className="pd-primary sd-add" disabled={action.busy} onClick={add}>{t("내 코스에 추가")}</button>
            <button type="button" className="pd-secondary sd-save"
              disabled={action.busy || favorites.loading || !favorites.data}
              aria-pressed={Boolean(saved)} aria-label={saved ? t("저장 해제") : t("저장")}
              onClick={toggleFavorite}>
              <Icon name="save" size={19} />
            </button>
          </div>
          {favorites.loading && <p role="status">{t("즐겨찾기 조회 중…")}</p>}
          {favorites.error && <p role="alert">{t("즐겨찾기 조회 실패:")} {favorites.error}</p>}
          {action.error && <p role="alert">{action.error}</p>}
          {message && <p role="status">{message} {showDraftLink && <a href="#map?view=course">{t("코스 초안 보기")}</a>}</p>}
        </>}
      </AppShell>
    </article>
  );
}
