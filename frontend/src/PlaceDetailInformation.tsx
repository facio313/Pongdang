import type { ReactNode } from "react";
import { dateLocale, t } from "./i18n";
import { placeDetailsMissingText, placeDetailsStatusText, placeHomepageUrl, type PlaceDetails } from "./placeDetails";
import "./placeDetails.css";

function collectedDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${date.toLocaleString(dateLocale(), { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" })} KST`
    : value;
}

export function PlaceDetailInformation({
  detail, loading, error, desktop = false,
}: {
  detail?: PlaceDetails;
  loading: boolean;
  error?: string;
  desktop?: boolean;
}) {
  const missing = loading ? t("조회 중") : error ? t("조회 실패") : t(placeDetailsMissingText(detail?.status));
  const status = placeDetailsStatusText(detail?.status);
  const homepage = placeHomepageUrl(detail?.homepage);
  const row = (label: string, value: ReactNode, key = label) => (
    <div className={desktop ? "sk-detail-tr" : "sd-info-row"} key={key}>
      <dt className={desktop ? "sk-detail-th" : "sd-info-name"}>{label}</dt>
      <dd className={`${desktop ? "sk-detail-td" : "sd-info-value"}${value ? "" : " is-empty"}`}>
        {value || missing}
      </dd>
    </div>
  );
  return (
    <section className="place-details" aria-label={t("명소 상세정보")} aria-busy={loading}>
      <dl className={desktop ? "sk-detail-table" : "sd-info"}>
        {row(t("운영"), detail?.opening_hours)}
        {row(t("휴무일"), detail?.rest_days)}
        {row(t("개장 기간"), detail?.opening_period)}
        {row(t("개장일"), detail?.opening_date)}
        {row(t("주차"), detail?.parking)}
        {row(t("편의시설"), detail?.facilities)}
        {row(t("문의"), detail?.contact)}
        {row(t("홈페이지"), homepage
          ? <a href={homepage} target="_blank" rel="noopener noreferrer">{detail?.homepage}</a>
          : detail?.homepage)}
      </dl>
      <div className="place-details-copy">
        {loading && <p className="pd-note">{t("저장된 상세정보를 조회하고 있습니다.")}</p>}
        {error && <p className="pd-note" role="alert">{t("저장된 상세정보를 불러오지 못했습니다.")} {error}</p>}
        {!loading && !error && status && <p className="pd-note">{t(status)}</p>}
        {detail?.fetched_at && detail.refresh_failed && <p className="pd-note">{t("최신 상세정보 수집에 실패하여 이전에 저장한 정보를 표시합니다.")}</p>}
        {detail?.fetched_at && detail.refresh_pending && !detail.refresh_failed && <p className="pd-note">{t("변경된 상세정보의 수집을 기다리는 동안 이전에 저장한 정보를 표시합니다.")}</p>}
        <h2 className="place-details-heading">{t("소개")}</h2>
        <p className="place-details-overview">{detail?.overview || missing}</p>
        {Boolean(detail?.details.length) && <details className="place-details-extra">
          <summary>{t("추가 상세정보 {count}개", { count: detail!.details.length })}</summary>
          <dl>
            {detail!.details.map((entry, index) => row(
              entry.label, entry.value, `${entry.section}:${entry.key}:${index}`,
            ))}
          </dl>
        </details>}
        {detail?.provider && <p className="pd-note place-details-source">
          {t("출처: {provider}", { provider: detail.provider })}
          {detail.fetched_at && <> · {t("수집일: {date}", { date: collectedDate(detail.fetched_at) })}</>}
          {detail.source_modified_at && <> · {t("원천 수정일: {date}", { date: collectedDate(detail.source_modified_at) })}</>}
        </p>}
        <p className="pd-note">{t("개장일은 계절별 개장 기간과 다릅니다. 저장된 안내의 적용 시기와 최신 운영 여부는 방문 전 확인해 주세요.")}</p>
      </div>
    </section>
  );
}
