import { TRAVEL_LANGUAGES, setTravelLanguage, useTravelLanguage } from "./travelLanguage";
import "./travelLanguage.css";
import { t } from "./i18n";

export function TravelLanguageSelector() {
  const { locale, persisted } = useTravelLanguage();
  return (
    <section className="pd-language">
      <div className="pd-language-title">{t("언어")}{locale !== "en" && " · Language"}</div>
      <div className="pd-language-options" role="group" aria-label={t("언어 선택")}>
        {TRAVEL_LANGUAGES.map((language) => (
          <button
            type="button"
            key={language.locale}
            lang={language.locale}
            aria-pressed={locale === language.locale}
            onClick={() => setTravelLanguage(language.locale)}
          >
            {language.label}
          </button>
        ))}
      </div>
      <p className="pd-language-note">
        {t("화면의 메뉴·설명과 새 여행 안내에 적용합니다. 관광정보는 공식 외국어 정보나 저장된 번역이 있으면 사용하며, 기존 대화·코스는 그대로 유지합니다.")}
      </p>
      {!persisted && <p className="pd-language-note" role="status">{t("이 브라우저에서는 언어 선택을 저장할 수 없어 현재 탭에서만 적용합니다.")}</p>}
    </section>
  );
}

/** Language control for data and utility pages outside the product shells. */
export function InlineLanguageSelector() {
  return <details className="pd-language-inline">
    <summary>{t("언어 선택")}</summary>
    <TravelLanguageSelector />
  </details>;
}

export function TravelLanguageNote() {
  const { locale } = useTravelLanguage();
  const language = TRAVEL_LANGUAGES.find((item) => item.locale === locale)!;
  return (
    <p className="pd-language-current">
      {t("여행 안내 언어")}: <b lang={locale}>{language.label}</b>
      <span>{t("사이드 메뉴에서 변경 · 해당 언어의 수집 자료가 없으면 추천 결과가 없을 수 있습니다.")}</span>
    </p>
  );
}
