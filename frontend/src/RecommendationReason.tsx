import { Icon, Skeleton } from "./pongdangUi";
import type { Recommendation } from "./recommendationApi";
import {
  alternativeGroups,
  alternativeText,
  choiceReason,
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
 *  바로 아래 `EvidenceNote` 의 「근거 보기」 안에 그대로 남습니다. */
export function RecommendationReason({
  data,
  error,
  loading = false,
  glass = false,
  className,
}: {
  data?: Recommendation;
  /** 추천 조회 실패. 비워 두면 화면이 「오늘은 할 게 없다」로 읽히므로
   *  실패는 실패라고 적습니다. */
  error?: string;
  loading?: boolean;
  /** 코발트 히어로 위. 글자색이 어두운 배경용으로 바뀝니다. */
  glass?: boolean;
  className?: string;
}) {
  const choice = choiceReason(data);
  const rejection = rejectionReason(data);
  const tide = tideLine(data);
  const groups = alternativeGroups(data);
  const root =
    "pd-why" + (glass ? " is-glass" : "") + (className ? ` ${className}` : "");
  if (error)
    return (
      <div className={root}>
        <p className="pd-why-line" role="alert">
          추천 근거를 불러오지 못했어요. {error}
        </p>
      </div>
    );
  if (loading)
    return (
      <div className={root}>
        <p className="pd-why-line">
          <Skeleton width="16em" glass={glass} label="추천 근거 조회 중" />
        </p>
      </div>
    );
  if (!choice && !rejection && !tide && !groups.length) return null;
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
