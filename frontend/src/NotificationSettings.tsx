import { useState } from "react";
import { useAction } from "./useAction";
import { useResource } from "./useResource";
import { kstDate, type Place, type RowPage } from "./productData";
import { travelJson } from "./travelApi";

// Reuse the existing data screen toolbar; in-app delivery requires an explicit save.
export function NotificationSettings({ onSaved }: { onSaved: () => void }) {
  const [search, setSearch] = useState("강릉");
  const places = useResource<RowPage<Place>>(
    "datasets/spots?page_size=100&q=" + encodeURIComponent(search),
  );
  const [spotId, setSpotId] = useState("");
  const [temperature, setTemperature] = useState("");
  const [year, setYear] = useState(kstDate().slice(0, 4));
  const [message, setMessage] = useState("");
  const action = useAction();
  return (
    <>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async (signal) => {
            const result = await travelJson<{ id: string }>(
              import.meta.env.BASE_URL,
              "notifications/subscriptions",
              "POST",
              {
                spot_id: Number(spotId),
                year: Number(year),
                minimum_temperature_c: Number(temperature),
                timezone: "Asia/Seoul",
                channel: "in_app",
                active: true,
              },
              signal,
            );
            if (!signal.aborted && result.id) {
              setMessage(
                "알림 구독을 저장했습니다. 기준 충족 여부와 발송 상태는 별도로 확인합니다.",
              );
              onSaved();
            }
          });
        }}
      >
        <label>
          장소 검색
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          알림 장소
          <select
            value={spotId}
            onChange={(event) => setSpotId(event.target.value)}
            required
          >
            <option value="">선택</option>
            {places.data?.rows.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          연도
          <input
            type="number"
            min="2000"
            max="2100"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            required
          />
        </label>
        <label>
          선호 수온 기준 · °C
          <input
            type="number"
            min="-5"
            max="60"
            step="0.1"
            value={temperature}
            onChange={(event) => setTemperature(event.target.value)}
            required
          />
        </label>
        <button disabled={action.busy} type="submit">
          앱 내 알림 구독 저장
        </button>
      </form>
      <p role={action.error ? "alert" : "status"}>
        {action.error || places.error || (action.busy ? "저장 중…" : message)}
      </p>
    </>
  );
}
