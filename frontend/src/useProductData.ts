import { t } from "./i18n.ts";
import { useMemo } from "react";
import { useProductPlaceSelection } from "./productPlaceSelection";
import { useResource } from "./useResource";
import { useConditions } from "./useConditions";
import { useBestActivity } from "./useBestActivity";
import { usePlacePhotos } from "./usePlacePhotos";
import { activityRecommendationDisplay } from "./recommendationText";
import {
  periodPath,
  productPlaces,
  sessionNow,
  type ClassifiedWaterPlace,
  type TideResult,
  type WaterQualityGrade,
} from "./productData";
export interface DefaultPlaceSelection {
  place: ClassifiedWaterPlace | null;
  display_name: string;
  status: "preferred" | "fallback" | "no_current_data" | "no_places";
  message: string;
  rows: ClassifiedWaterPlace[];
}
/** `mode: "best"` 는 여섯 활동을 모두 조회해 오늘 가장 좋은 활동을 고릅니다.
 *  홈 히어로가 수영 한 종목에 고정돼 있던 자리를 대신합니다. 기본값은 예전대로
 *  수영 한 번만 조회합니다. */
/** 장소 id 로 막아 둔 조회를 **끝난 것으로** 만듭니다.
 *
 *  장소를 아직 모르는 동안의 「조회 중」은 곧 경로가 정해진다는 약속입니다
 *  (useResource 의 ResourcePath). 그런데 기본 해수욕장 조회가 끝났는데도 장소가
 *  없으면 그 약속은 지켜지지 않습니다 -- 조회에 실패했거나, 서버가 수집된
 *  해수욕장이 없다고 제대로 답한 경우입니다. 그대로 두면 화면이 오지 않을 값을
 *  기다리며 영영 스켈레톤에 머뭅니다.
 *
 *  실패와 「장소 없음」은 여기서 하나로 합쳐지지 않습니다. 실패면 그 문구를
 *  함께 내려보내 화면이 「불러오지 못했다」로 읽히고, 장소가 없는 것이면
 *  error 없이 끝나 「고를 활동이 없다」로 읽힙니다. */
export function settledWithoutPlace<T extends { loading: boolean; error?: string }>(
  state: T,
  placeSettled: boolean,
  error?: string,
): T {
  return placeSettled
    ? { ...state, loading: false, error: state.error ?? error }
    : state;
}

export function useProductData(mode: "swim" | "best" = "swim") {
  // 마운트마다 새로 잡지 않습니다. 이 값이 조회 경로에 들어가므로, 폭이 바뀌어
  // 레이아웃이 갈릴 때마다 같은 자료를 다른 경로로 다시 묻게 됩니다(sessionNow 주석).
  const now = sessionNow();
  const selection = useProductPlaceSelection();
  const catalog = useResource<DefaultPlaceSelection>(selection.mode === "default" ? "water-index/default-place" : null);
  const explicit = useResource<ClassifiedWaterPlace[]>(selection.mode === "selected" && selection.spotId !== null
    ? `livecams/preview/places?spot_id=${selection.spotId}` : null);
  const selected = selection.mode === "default" ? catalog.data?.place
    : explicit.data?.find((row) => row.id === selection.spotId);
  const source = selection.mode === "default" ? catalog : explicit;
  const selectedRows = useMemo(() => selection.mode === "default" && catalog.data
    ? productPlaces(catalog.data.rows).rows
    : selected ? productPlaces([selected]).rows : undefined, [selection.mode, catalog.data, selected]);
  const photos = usePlacePhotos(selectedRows);
  const place = selected ? photos.rows?.find((row) => row.id === selected.id) ?? productPlaces([selected]).rows[0] : undefined;
  const places = { ...source, data: photos.rows ? { rows: photos.rows, total: photos.rows.length } : undefined };
  const displayName = selected
    ? selection.mode === "default" ? catalog.data?.display_name ?? selected.name : selected.name
    : source.loading ? t("장소 조회 중") : t("장소 선택 필요");
  const selectionMessage = source.error ?? (source.loading
    ? t("기준 장소의 수집 자료를 확인하고 있습니다.")
    : selection.mode === "default"
      ? t(catalog.data?.message ?? "기본 해수욕장을 조회하지 못했습니다.")
      : selection.spotId === null ? t("장소를 선택해 주세요.")
      : selected ? t("{place} 한 장소의 관측·예보입니다.", { place: selected.name })
      : t("선택한 장소를 찾지 못했습니다. 다른 장소를 선택해 주세요."));
  // 훅은 조건부로 부를 수 없으므로 두 쪽을 모두 부르되, 쓰지 않는 쪽은
  // enabled: false 로 끕니다. 호출 수는 그대로여도 조회 횟수는 고른 모드만큼
  // 입니다 -- 홈이 여섯 활동을 보느라 오늘 탭까지 더 조회하게 만들지 않으려는
  // 것입니다. 예전에는 id 를 빼서 껐는데, 그러면 「장소를 아직 모름」과 구분이
  // 되지 않아 첫 페인트에서 쓰는 쪽까지 「자료 없음」으로 읽혔습니다.
  const activities = useBestActivity(place?.id, mode === "best");
  // A recommendation failure must not also hide separately stored place
  // measurements. Read their baseline only when the combined response failed;
  // the unavailable recommendation remains explicit and is never invented here.
  const recommendationFailed = mode === "best" && !!activities.error && !activities.recommendation.data;
  const useSingle = mode !== "best" || recommendationFailed;
  const single = useConditions(place?.id, "swim", undefined, useSingle);
  // best 가 없어도 근거·안전 문장은 나와야 하므로 첫 활동(수영) 상태로 물러섭니다.
  const conditions =
    useSingle ? single : (activities.best ?? activities.all[0]);
  // 히어로 위쪽 관측 패널(기온·수온·파고·바람·강수)은 활동과 무관한 「지금
  // 날씨와 바다」입니다. 서버는 그 활동이 보는 지표만 내려주므로, 여기에
  // best 응답을 쓰면 갯벌이 뽑힌 날 수온·파고가 통째로 «–» 가 됩니다.
  // 수영 응답이 해양 지표를 가장 넓게 담고 있어 기준으로 씁니다(all[0] 이
  // 수영이라 조회가 더 늘지 않습니다).
  const baseline = useSingle ? single : activities.all[0];
  const activityStates = recommendationFailed ? activities.all.map(state => state.activity === "swim"
    ? { ...state, ...single, ...activityRecommendationDisplay(single.data) } : state) : activities.all;
  // 기본 해수욕장 조회가 끝났는데도 장소가 없으면 id 는 **영영** 정해지지
  // 않습니다 -- 조회에 실패했거나(catalog.error), 서버가 수집된 해수욕장이
  // 없다고 제대로 답한 경우(status: no_places)입니다. 그 사실을 아래로
  // 내려보내지 않으면 화면이 오지 않을 값을 기다리며 스켈레톤에 머뭅니다.
  // 「조회 중」은 곧 온다는 약속이라 그것도 거짓말입니다.
  //
  // 둘은 여기서 하나로 합쳐지지 않습니다. 실패면 실패 문구를 함께 내려보내
  // 히어로가 「불러오지 못했다」로 읽히고, 장소가 없는 것이면 error 없이
  // 끝나 「고를 활동이 없다」로 읽힙니다.
  const placeSettled = !source.loading && !place;
  const settled = <T extends { loading: boolean; error?: string }>(state: T) =>
    settledWithoutPlace(state, placeSettled, source.error);
  return {
    now,
    places,
    place,
    conditions: settled(conditions),
    baseline: settled(baseline),
    best: activities.best,
    activities: activityStates.map(settled),
    /** 서버가 고른 활동과 그 근거. `mode: "best"` 가 아니면 undefined 입니다. */
    recommendation: settled(activities.recommendation),
    displayName,
    selectionMessage: conditions.data?.projection?.status === "refreshing"
      ? `${selectionMessage} ${t("새 자료 반영 중 · 이전 계산 결과")}` : selectionMessage,
    /** 장소가 영영 정해지지 않는 상태. 이 훅 밖에서 장소 id 로 막아 둔 조회가
     *  있으면 `settledWithoutPlace` 에 함께 넘겨야 합니다. */
    placeSettled,
    placeRequired: selection.mode === "selected" && placeSettled && !source.error,
  };
}
export function useTodayData(
  id: number | undefined,
  now: string,
  /** useProductData 가 돌려주는 값입니다. 넘기지 않으면 장소가 오지 않는 날
   *  이 화면들이 스켈레톤에 머뭅니다(settledWithoutPlace 주석 참고). */
  placeSettled = false,
) {
  const tides = useResource<TideResult>(periodPath("tides/events", id, now, 2));
  const quality = useResource<WaterQualityGrade>(
    id ? `quality/grade?spot_id=${id}` : undefined,
  );
  return {
    tides: settledWithoutPlace(tides, placeSettled),
    quality: settledWithoutPlace(quality, placeSettled),
  };
}
