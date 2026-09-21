import { useState } from "react";
import { t } from "./i18n";
import { distanceLabel, hasPlaceCoordinates, placeDistanceKm, type PlaceCoordinates } from "./placeDistance";
import { useTravelSession } from "./travelSession";
import "./placeDetails.css";

export function PlaceDistanceInfo({ place, loading = false }: { place: PlaceCoordinates | undefined; loading?: boolean }) {
  const session = useTravelSession();
  const [current, setCurrent] = useState<PlaceCoordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedOrigin = session.route?.route?.origin ?? session.planInput?.request.origin ?? session.recommendation?.request.origin;
  const origin = current ?? (savedOrigin ? { lat: savedOrigin.latitude, lng: savedOrigin.longitude } : null);
  const kilometers = placeDistanceKm(origin, place);
  const locate = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError("이 브라우저에서 현재 위치를 사용할 수 없습니다.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      setCurrent({ lat: position.coords.latitude, lng: position.coords.longitude });
      setLocating(false);
    }, () => {
      setCurrent(null);
      setLocating(false);
      setError("현재 위치를 확인하지 못했습니다. 위치 권한을 확인해 주세요.");
    }, { timeout: 10000, maximumAge: 60000 });
  };
  return (
    <div className="place-distance">
      <div className="place-distance-result">
        <span>{t("직선거리")}</span>
        <strong>{distanceLabel(kilometers)}</strong>
      </div>
      {kilometers !== null && <p className="pd-note">{t("기준: {name}", { name: current || savedOrigin?.label === "현재 위치" ? t("현재 위치") : savedOrigin?.label ?? t("출발지") })}</p>}
      <p className="pd-note">{loading ? t("장소 조회 중") : !hasPlaceCoordinates(place)
        ? t("장소 좌표가 없어 거리를 계산할 수 없습니다.")
        : t("좌표로 계산한 직선거리이며 도로 이동거리가 아닙니다.")}</p>
      {hasPlaceCoordinates(place) && <button type="button" className="pd-secondary place-distance-button" onClick={locate} disabled={locating}>
        {locating ? t("현재 위치 확인 중…") : t("현재 위치로 거리 보기")}
      </button>}
      {error && <p className="pd-note" role="alert">{t(error)}</p>}
    </div>
  );
}
