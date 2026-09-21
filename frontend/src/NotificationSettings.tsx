import { t } from "./i18n";
import { useState } from "react";
import { useAction } from "./useAction";
import { useResource } from "./useResource";
import { kstDate } from "./productData";
import { travelJson } from "./travelApi";
import { waterPlacesPath, WATER_PLACE_PAGE_SIZE, type WaterPlacePage } from "./waterPlaceApi";
import { WaterPlaceFilters, WaterPlacePagination } from "./WaterPlaceControls";
import type { NotificationSubscription } from "./notificationApi";

// Reuse the existing data screen toolbar; in-app delivery requires an explicit save.
export function NotificationSettings({ onSaved, subscription = null, onCancel }: { onSaved: (id: string) => void; subscription?: NotificationSubscription | null; onCancel?: () => void }) {
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("");
  const [page, setPage] = useState(1);
  const places = useResource<WaterPlacePage>(waterPlacesPath(search, { district, page }));
  const rows = places.data?.rows.filter((place) =>
    place.place_kind === "beach" || place.place_kind === "valley",
  ) ?? [];
  const [spotId, setSpotId] = useState(subscription ? String(subscription.spot_id) : "");
  const [temperature, setTemperature] = useState(subscription ? String(subscription.minimum_temperature_c) : "");
  const [year, setYear] = useState(subscription ? String(subscription.year) : kstDate().slice(0, 4));
  const [active, setActive] = useState(subscription?.active ?? true);
  const [message, setMessage] = useState("");
  const action = useAction();
  const selectedPlace = subscription ? { id: subscription.spot_id } : rows.find((place) => String(place.id) === spotId);
  const placesUnavailable = !subscription && (places.loading || Boolean(places.error));
  return (
    <>
      {!subscription && <WaterPlaceFilters district={district} onDistrict={(value) => { setDistrict(value); setPage(1); setSpotId(""); setMessage(""); }} />}
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage("");
          void action.run(async (signal) => {
            if (placesUnavailable || !selectedPlace)
              throw new Error("분류가 확인된 해변·계곡을 목록에서 선택해 주세요.");
            const result = await travelJson<{ id: string }>(
              import.meta.env.BASE_URL,
              subscription ? `notifications/subscriptions/${encodeURIComponent(subscription.id)}?expected_revision=${subscription.revision}` : "notifications/subscriptions",
              subscription ? "PUT" : "POST",
              {
                spot_id: selectedPlace.id,
                year: Number(year),
                minimum_temperature_c: Number(temperature),
                timezone: subscription?.timezone ?? "Asia/Seoul",
                channel: subscription?.channel ?? "in_app",
                destination: subscription?.destination ?? null,
                active,
              },
              signal,
            );
            if (!signal.aborted && result.id) {
              setMessage(
                "알림 구독을 저장했습니다. 기준 충족 여부와 발송 상태는 별도로 확인합니다.",
              );
              onSaved(result.id);
            }
          });
        }}
      >
        {subscription ? <p>{t("알림 장소")} · {subscription.spot_name ?? t("장소 ID {id}", { id: subscription.spot_id })}</p> : <><label>{t("장소 검색")}<input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
              setSpotId("");
              setMessage("");
            }}
            maxLength={100}
          />
        </label>
        <label>{t("알림 장소")}<select
            value={spotId}
            onChange={(event) => {
              setSpotId(event.target.value);
              setMessage("");
            }}
            disabled={places.loading || Boolean(places.error)}
            required
          >
            <option value="">{t("선택")}</option>
            {rows.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label></>}
        <label>{t("연도")}<input
            type="number"
            min={Number(kstDate().slice(0, 4))}
            max={Number(kstDate().slice(0, 4)) + 1}
            value={year}
            onChange={(event) => setYear(event.target.value)}
            required
          />
        </label>
        <label>{t("선호 수온 기준 · °C")}<input
            type="number"
            min="-5"
            max="60"
            step="0.1"
            value={temperature}
            onChange={(event) => setTemperature(event.target.value)}
            required
          />
        </label>
        {subscription && <label><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />{t("구독 활성화")}</label>}
        <button disabled={action.busy || placesUnavailable || !selectedPlace} type="submit">{t(subscription ? "알림 구독 수정 저장" : "앱 내 알림 구독 저장")}</button>
        {subscription && <button type="button" disabled={action.busy} onClick={onCancel}>{t("수정 취소")}</button>}
      </form>
      {!subscription && <><WaterPlacePagination
        page={page} pageSize={places.data?.page_size ?? WATER_PLACE_PAGE_SIZE}
        total={places.data?.total ?? 0} count={rows.length} hasMore={places.data?.has_more ?? false}
        loading={places.loading} error={places.error}
        onPage={(value) => { setPage(value); setSpotId(""); setMessage(""); }}
      />
      <p className="table-note">{t("해변·계곡으로 분류된 물놀이 장소를 페이지당 최대 100곳 표시합니다. 장소 분류가 입수 안전을 뜻하지 않습니다.")}</p>
      {places.loading && <p role="status">{t("알림을 설정할 물놀이 장소를 조회하고 있습니다.")}</p>}
      {!places.loading && !places.error && rows.length === 0 && <p role="status">{t("검색 조건에 해당하는 물놀이 장소가 없습니다.")}</p>}</>}
      <p role={action.error || (!subscription && places.error) ? "alert" : "status"}>
        {action.error || (!subscription && places.error) || (action.busy ? t("저장 중…") : t(message))}
      </p>
    </>
  );
}
