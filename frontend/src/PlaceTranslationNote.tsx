import { t } from "./i18n";

export function PlaceTranslationNote({ status, originalName }: { status?: string; originalName?: string }) {
  if (status === "machine_translated") return <p className="pd-note">
    {t("자동번역 · 원문 내용과 다를 수 있습니다.")}{originalName ? ` ${t("원문: {name}", { name: originalName })}` : ""}
  </p>;
  if (status === "source_fallback") return <p className="pd-note">{t("저장된 번역이 없어 한국어 원문을 표시합니다.")}</p>;
  return null;
}
