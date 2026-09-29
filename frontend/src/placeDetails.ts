export interface PlaceDetailEntry {
  section: string;
  key: string;
  label: string;
  value: string;
}

export interface PlaceDetails {
  spot_id: number;
  status: "available" | "empty" | "pending" | "failed" | "unmatched" | "unsupported";
  provider: string | null;
  source_id: string | null;
  content_type: string | null;
  fetched_at: string | null;
  source_modified_at: string | null;
  refresh_pending: boolean;
  refresh_failed: boolean;
  opening_hours: string | null;
  rest_days: string | null;
  opening_period: string | null;
  opening_date: string | null;
  parking: string | null;
  facilities: string | null;
  contact: string | null;
  homepage: string | null;
  overview: string | null;
  details: PlaceDetailEntry[];
}

/** Keep published opening guidance, including older stored notices, as text.
 * It describes this place; it is not an activity-specific permission or a window
 * calculated from tides. Extra schedule fields retain the provider's own label. */
export function placeOperatingSchedule(detail?: PlaceDetails): { label: string; value: string }[] {
  if (!detail) return [];
  const rows: { label: string; value: string }[] = [];
  for (const [label, value] of [
    ["이용시간", detail.opening_hours],
    ["개장 기간", detail.opening_period],
    ["휴무일", detail.rest_days],
  ] as const) {
    if (value?.trim()) rows.push({ label, value });
  }
  for (const entry of detail.details) {
    if (entry.section === "info" && /(?:이용|운영|입장|체험).*시간|휴무|개장.*기간/.test(entry.label)
      && entry.value.trim() && !rows.some(row => row.value === entry.value)) {
      rows.push({ label: entry.label, value: entry.value });
    }
  }
  return rows;
}

/** Displayed places share one read of stored details, bounded like the list. */
export function placeDetailsPath(ids: number[]) {
  const selected = [...new Set(ids)]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((a, b) => a - b)
    .slice(0, 100);
  return selected.length ? `place-details?spot_ids=${selected.join(",")}` : null;
}

export function placeDetailsStatusText(status: PlaceDetails["status"] | undefined) {
  switch (status) {
    case "available": return null;
    case "empty": return "제공처에서 상세정보를 제공하지 않았습니다.";
    case "failed": return "상세정보 수집에 실패했습니다.";
    case "unmatched": return "이 장소와 연결된 관광 상세정보가 없습니다.";
    case "unsupported": return "이 장소는 상세정보 수집 대상이 아닙니다.";
    default: return "상세정보를 아직 수집하지 않았습니다.";
  }
}

export function placeDetailsMissingText(status: PlaceDetails["status"] | undefined) {
  if (status === "available" || status === "empty") return "정보 미제공";
  if (status === "failed") return "수집 실패";
  if (status === "unmatched") return "상세정보 연결 없음";
  if (status === "unsupported") return "수집 대상 아님";
  return "미수집";
}

/** A homepage is plain provider text unless it is a public HTTPS URL. */
export function placeHomepageUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** 장소 분류 이름. 명소 목록 · 명소 상세 · 데스크탑 목록이 같은 말을 쓰도록
 *  한 곳에 둡니다 -- 예전에는 세 파일이 저마다 같은 표를 들고 있었습니다.
 *
 *  분류는 **분류된 목록**(water-places)에만 있습니다. datasets/spots 의 type
 *  은 수집 종류(beach_search_result · tourism)라 분류로 쓸 수 없어, 값이 없는
 *  장소는 「분류 미확인」입니다 -- 해변으로 물러서지 않습니다. */
const KIND_LABEL: Record<string, string> = {
  beach: "해변",
  valley: "계곡",
};

export function kindLabel(place?: { type?: string | null }): string {
  return (place?.type && KIND_LABEL[place.type]) || "분류 미확인";
}
