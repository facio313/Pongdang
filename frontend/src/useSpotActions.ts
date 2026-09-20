import { t } from "./i18n.ts";
import { useState } from "react";
import { kstDate, type Place } from "./productData";
import { travelJson, type TripPlan } from "./travelApi";
import { setTravelSession, useTravelSession } from "./travelSession";
import { useAction } from "./useAction";
import { useResource } from "./useResource";
import { useTravelLanguage } from "./travelLanguage";

/** Both detail layouts add the selected real place through the same draft API. */
export function useSpotActions(place: Place | undefined, { queryFavorites = true } = {}) {
  const { locale } = useTravelLanguage();
  const session = useTravelSession();
  const action = useAction();
  const [signalRevision, setSignalRevision] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; draft?: boolean } | null>(null);
  const favorites = useResource<{ rows: { id: string; payload: { kind: string; spot_id: number } }[] }>(
    place && queryFavorites ? `travel/signals?spot_id=${place.id}&kind=favorite` : null, signalRevision,
  );
  const saved = favorites.data?.rows.find((row) => row.payload.kind === "favorite" && row.payload.spot_id === place?.id);
  const add = () => {
    setFeedback(null);
    void action.run(async (signal) => {
      if (!place) return;
      const input = session.planInput ?? {
        request: { locale, dates: [kstDate()], region: place.region?.trim() || undefined, preferred_tags: [], activity: "relax" as const, transport: "driving" as const },
        stops: [],
      };
      if (input.stops.some((stop) => stop.spot_id === place.id)) {
        setFeedback({ text: "이미 코스 초안에 추가된 장소입니다.", draft: true });
        return;
      }
      if (input.stops.length >= 5) throw new Error("경로 후보는 최대 5곳입니다. 지도에서 코스를 확인해 주세요.");
      const planInput = {
        request: input.request,
        stops: [...input.stops, { item_id: `detail-${place.id}`, spot_id: place.id, day: input.request.dates[0], stay_minutes: 60 }],
      };
      const plan = await travelJson<TripPlan>(import.meta.env.BASE_URL, "travel/plans/draft", "POST", planInput, signal);
      if (!signal.aborted) {
        setTravelSession({ plan, planInput, route: null, recommendation: null });
        setFeedback({ text: "코스 초안에 추가했습니다. 지도에서 확인하고 저장해 주세요.", draft: true });
      }
    });
  };
  const toggleFavorite = () => {
    setFeedback(null);
    void action.run(async (signal) => {
      if (!place || !favorites.data) return;
      await travelJson(import.meta.env.BASE_URL,
        saved ? `travel/signals/${saved.id}` : "travel/signals",
        saved ? "DELETE" : "POST",
        saved ? undefined : { kind: "favorite", action: "like", spot_id: place.id }, signal);
      if (!signal.aborted) {
        setSignalRevision((value) => value + 1);
        setFeedback({ text: saved ? "즐겨찾기를 해제했습니다." : "즐겨찾기에 저장했습니다." });
      }
    });
  };
  return { action, favorites, saved, message: feedback ? t(feedback.text) : "", showDraftLink: feedback?.draft ?? false, add, toggleFavorite };
}
