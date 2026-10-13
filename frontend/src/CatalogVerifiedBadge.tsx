import { t } from "./i18n";
import { dateLabel, timeLabel } from "./productData";
import { recentCatalogVerification } from "./catalogVerification";
import "./catalogVerifiedBadge.css";

export function CatalogVerifiedBadge({ recent, verifiedAt }: { recent?: boolean; verifiedAt?: string | null }) {
  if (!recentCatalogVerification(recent, verifiedAt)) return null;
  const label = t("최근 관광정보 확인 · {date} {time} KST. 48시간 이내 원천 목록에서 확인했으며, 영업·안전 인증은 아닙니다.", {
    date: dateLabel(verifiedAt!), time: timeLabel(verifiedAt) || "",
  });
  return <span className="catalog-verified-badge" role="img" aria-label={label} title={label}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="m12 1 2.6 2 3.3-.1 1 3.1 2.8 1.8-1 3.2 1 3.2-2.8 1.8-1 3.1-3.3-.1L12 22l-2.6-2-3.3.1-1-3.1-2.8-1.8 1-3.2-1-3.2 2.8-1.8 1-3.1 3.3.1Z" />
      <path d="m7.5 11.5 3 3 6-6" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>;
}
