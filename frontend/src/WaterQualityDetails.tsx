import { t } from "./i18n.ts";
import { formatValue, waterQualityDescription, type WaterQualityGrade } from "./productData";

const NAMES: Record<string, string> = {
  ph: "pH", dissolved_oxygen: "용존산소", chlorophyll_a: "클로로필 a",
  dissolved_inorganic_nitrogen: "용존무기질소", dissolved_inorganic_phosphorus: "용존무기인",
  turbidity: "탁도", transparency: "투명도",
};

export function WaterQualityDetails({ data, error, className }: { data?: WaterQualityGrade; error?: string; className?: string }) {
  return <div className={className}>
    <p>{error ?? waterQualityDescription(data)}</p>
    <details>
      <summary>{t("수질 1~5등급 기준과 검사값")}</summary>
      <p>{t("1 매우 좋음 · 2 좋음 · 3 보통 · 4 나쁨 · 5 아주 나쁨")}</p>
      <p>{t("공식 WQI 등급을 우선 사용하며, 등급 없이 WQI 지수만 제공되면 23 이하 / 24~33 / 34~46 / 47~59 / 60 이상으로 분류합니다.")}</p>
      <p>{t("표층 영양염·클로로필 a·투명도와 저층 산소포화도를 평가한 생태 기준입니다. 대장균·장구균 검사와 입수 통제는 별도로 확인해야 합니다.")}</p>
      <p><a href="https://www.meis.go.kr/mei/wqi/introduce.do" target="_blank" rel="noreferrer">{t("해양환경정보포털 기준")}</a>{" · "}<a href="https://www.jkosmee.or.kr/_PR/view/?aidx=18375&bidx=1417" target="_blank" rel="noreferrer">{t("한국연안 수질 평가 논문")}</a></p>
      {data?.measurements.filter(m => NAMES[m.item]).map((m, i) => <p key={`${m.item}-${m.layer}-${i}`}>
        {m.layer === "surface" ? t("표층") : m.layer === "bottom" ? t("저층") : t("측정층 미확인")}{" "}{t(NAMES[m.item])}: {m.is_missing ? t("미측정") : formatValue(m.value, m.unit ?? "")} {!m.unit && m.item !== "ph" ? t("(단위 미제공)") : ""}
      </p>)}
    </details>
  </div>;
}
