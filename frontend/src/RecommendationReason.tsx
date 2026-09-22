import { t } from "./i18n.ts";
import { Icon, Skeleton } from "./pongdangUi";
import type { Recommendation } from "./recommendationApi";
import {
  alternativeGroups,
  alternativeText,
  choiceReason,
  recommendationLookupWarning,
  rejectionReason,
  tideLine,
} from "./recommendationText";
import { spotLink } from "./spotsRoute";

/** 점수 아래의 추천 근거. 예전에는 이 자리가 «수온 13°C — 이 조건이 점수를 가장
 *  많이 낮췄어요» 한 줄이었습니다. 그건 **점수 산출의 감사 기록**이지 «오늘 왜
 *  이걸 하라는 건가»의 답이 아니었습니다.
 *
 *  이제 네 줄이 순서대로 놓입니다.
 *
 *  1. 왜 이 활동인가 — 파고 · 파주기가 수영과 서핑을 갈랐다는 사실
 *  2. 왜 다른 활동이 아닌가 — 수온이 낮아 바다를 뺐다는 사실
 *  3. 지금 물때 — 만조 · 간조 전후라 바다를 미뤘다는 사실과 그 면책
 *  4. 대신 갈 곳 — 계곡 · 온천 · 카페 · 명소의 **등록된 실제 장소**
 *
 *  서버가 사유를 말해 주지 않은 줄은 비워 둡니다. 문장을 지어내면 근거가
 *  아니라 넘겨짚기가 됩니다. 점수 산출 근거와 출처 · 면책 전문은 없어지지 않고
 *  바로 아래 `EvidenceNote` 의 「근거 보기」 안에 그대로 남습니다.
 *
 *  **`variant` 는 네 줄을 줄이는 손잡이가 아니라 자리를 나누는 손잡이입니다.**
 *  홈 히어로는 결론(무엇을 · 몇 점)을 크게 말하는 면이라 `"lead"` 로 1번 한
 *  줄만 얹고, 2 · 3 · 4 번은 히어로 **바로 아래** 「오늘 이 활동인 이유」에서
 *  `"full"` 로 한 글자도 빠짐없이 이어집니다. 한 곳에서 사라지는 문장은
 *  없습니다. */
export function RecommendationReason({
  data,
  error,
  loading = false,
  glass = false,
  className,
  variant = "full",
}: {
  data?: Recommendation;
  /** 추천 조회 실패. 비워 두면 화면이 「오늘은 할 게 없다」로 읽히므로
   *  실패는 실패라고 적습니다. */
  error?: string;
  loading?: boolean;
  /** 코발트 히어로 위. 글자색이 어두운 배경용으로 바뀝니다. */
  glass?: boolean;
  className?: string;
  /** `"lead"` 는 1번(왜 이 활동인가) 한 줄만, `"detail"` 은 그 뒤 2 · 3 · 4 번만,
   *  `"full"` 은 넷 전부입니다. 홈은 lead + detail 로 층을 나눠 같은 줄이 두 번
   *  나오지 않게 하고, 다른 화면은 기본값 full 그대로입니다. */
  variant?: "lead" | "detail" | "full";
}) {
  const lead = variant === "lead";
  const detail = variant === "detail";
  const choice = detail ? undefined : choiceReason(data);
  const lookupWarning = detail ? null : recommendationLookupWarning(data);
  const rejection = lead ? undefined : rejectionReason(data);
  const tideInfo = tideLine(data);
  // Optional lookup failures are part of the result's limits, not detail that
  // the home summary may omit while showing a usable score.
  const tide = lead && tideInfo?.code !== "tide_lookup_unavailable" ? undefined : tideInfo;
  const groups = lead ? [] : alternativeGroups(data);
  const root =
    "pd-why" +
    (glass ? " is-glass" : "") +
    (lead ? " is-lead" : "") +
    (className ? ` ${className}` : "");
  // 실패와 조회 중은 결론이 있는 자리(lead · full)에서 한 번만 말합니다.
  // detail 은 그 아래 이어지는 층이라, 같은 문장을 두 번 적으면 두 번 실패한
  // 것처럼 읽힙니다.
  if (detail && (error || loading)) return null;
  if (error)
    return (
      <div className={root}>
        <p className="pd-why-line" role="alert">
          {t("추천 근거를 불러오지 못했어요. {error}", { error: t(error) })}
        </p>
      </div>
    );
  if (loading)
    return (
      <div className={root}>
        <p className="pd-why-line">
          <Skeleton width="16em" glass={glass} label={t("추천 근거 조회 중")} />
        </p>
      </div>
    );
  if (!choice && !rejection && !tide && !lookupWarning && !groups.length) return null;
  return (
    <div className={root}>
      {choice && (
        <p className="pd-why-line is-choice">
          <Icon name="sparkle" size={12} />
          {choice.text}
        </p>
      )}
      {rejection && <p className="pd-why-line">{rejection.text}</p>}
      {tide && <p className="pd-why-line is-tide">{tide.text}</p>}
      {lookupWarning && <p className="pd-why-line" role="status">{lookupWarning}</p>}
      {groups.map((group) => (
        <p className="pd-why-alts" key={group.kind}>
          <span className="pd-why-alts-label">{group.label}</span>
          {group.places.map((place) => (
            <a className="pd-why-alt pd-tap" key={place.spot_id} href={spotLink({ id: place.spot_id })}>
              {alternativeText(place)}
            </a>
          ))}
        </p>
      ))}
    </div>
  );
}
