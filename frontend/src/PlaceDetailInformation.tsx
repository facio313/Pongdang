import type { ReactNode } from "react";
import { dateLocale, t } from "./i18n";
import { placeDetailsMissingText, placeDetailsStatusText, placeExtraDetails, placeHomepageUrl, placeOpeningHours, type PlaceDetails } from "./placeDetails";
import "./placeDetails.css";

function collectedDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${date.toLocaleString(dateLocale(), { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" })} KST`
    : value;
}

export function PlaceDetailInformation({
  detail, loading, error, desktop = false, placeKind,
}: {
  detail?: PlaceDetails;
  loading: boolean;
  error?: string;
  desktop?: boolean;
  placeKind?: string | null;
}) {
  const missing = loading ? t("조회 중") : error ? t("조회 실패") : t(placeDetailsMissingText(detail?.status));
  const status = placeDetailsStatusText(detail?.status);
  const homepage = placeHomepageUrl(detail?.homepage);
  const extraDetails = placeExtraDetails(detail);
  const opening = placeOpeningHours(detail?.opening_hours, placeKind);
  const row = (label: string, value: ReactNode, key = label) => (
    <div className={`place-detail-item ${desktop ? "sk-detail-tr" : "sd-info-row"}`} key={key}>
      <dt className={desktop ? "sk-detail-th" : "sd-info-name"}>{label}</dt>
      <dd className={`${desktop ? "sk-detail-td" : "sd-info-value"}${value ? "" : " is-empty"}`}>
        {value || missing}
      </dd>
    </div>
  );
  return (
    <section className="place-details" aria-label={t("명소 상세정보")} aria-busy={loading}>
      <h2 className="place-details-title">{t("이용 정보")}</h2>
      <dl className={`place-details-grid ${desktop ? "sk-detail-table" : "sd-info"}`}>
        {/* 개장 기간이 운영시간보다 먼저 옵니다. 「이용시간 상시 개방」이 혼자
            앞에 서면, 10월 해수욕장에서 그 한 줄이 「지금 가도 된다」로 읽힙니다 --
            상시 개방은 해수욕장 개장과 다른 사실입니다. */}
        {row(t("개장 기간"), detail?.opening_period)}
        {row(t("개장일"), detail?.opening_date)}
        {row(t(opening.label), opening.value)}
        {row(t("휴무일"), detail?.rest_days)}
        {row(t("주차"), detail?.parking)}
        {row(t("편의시설"), detail?.facilities)}
        {row(t("문의"), detail?.contact)}
        {row(t("홈페이지"), homepage
          ? <a href={homepage} target="_blank" rel="noopener noreferrer">{detail?.homepage}</a>
          : detail?.homepage)}
      </dl>
      {opening.beachAccess && <p className="pd-note">{t("해변을 방문할 수 있다는 안내이며, 수영 운영 기간·시간이나 입수 가능 여부를 뜻하지 않습니다.")}</p>}
      <div className="place-details-copy">
        {loading && <p className="pd-note">{t("저장된 상세정보를 조회하고 있습니다.")}</p>}
        {error && <p className="pd-note" role="alert">{t("저장된 상세정보를 불러오지 못했습니다.")} {error}</p>}
        {!loading && !error && status && <p className="pd-note">{t(status)}</p>}
        {detail?.fetched_at && detail.refresh_failed && <p className="pd-note">{t("최신 상세정보 수집에 실패하여 이전에 저장한 정보를 표시합니다.")}</p>}
        {detail?.fetched_at && detail.refresh_pending && !detail.refresh_failed && <p className="pd-note">{t("변경된 상세정보의 수집을 기다리는 동안 이전에 저장한 정보를 표시합니다.")}</p>}
        <div className="place-details-introduction">
          <h2 className="place-details-heading">{t("소개")}</h2>
          <p className="place-details-overview">{detail?.overview || missing}</p>
        </div>
        {extraDetails.length > 0 && <section className="place-details-extra">
          <h2 className="place-details-heading">{t("추가 상세정보 {count}개", { count: extraDetails.length })}</h2>
          <dl>
            {extraDetails.map((entry, index) => row(
              entry.label, entry.value, `${entry.section}:${entry.key}:${index}`,
            ))}
          </dl>
        </section>}
        <div className="place-details-reference">
          {detail?.provider && <p className="pd-note place-details-source">
            <span>{t("출처: {provider}", { provider: detail.provider })}</span>
            {detail.fetched_at && <span>{t("수집일: {date}", { date: collectedDate(detail.fetched_at) })}</span>}
            {detail.source_modified_at && <span>{t("원천 수정일: {date}", { date: collectedDate(detail.source_modified_at) })}</span>}
          </p>}
          <p className="pd-note">{t("개장일은 계절별 개장 기간과 다릅니다. 저장된 안내의 적용 시기와 최신 운영 여부는 방문 전 확인해 주세요.")}</p>
        </div>
      </div>
    </section>
  );
}
