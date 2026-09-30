import { t } from "./i18n.ts";
import { InfoPopover } from "./pongdangUi";
import { formatValue, waterQualityDescription, type WaterQualityGrade } from "./productData";

const NAMES: Record<string, string> = {
  ph: "pH", dissolved_oxygen: "용존산소", chlorophyll_a: "클로로필 a",
  dissolved_inorganic_nitrogen: "용존무기질소", dissolved_inorganic_phosphorus: "용존무기인",
  turbidity: "탁도", transparency: "투명도",
  water_temperature: "수온", biochemical_oxygen_demand: "생물화학적 산소요구량",
  chemical_oxygen_demand: "화학적 산소요구량", suspended_solids: "부유물질",
  total_nitrogen: "총질소", total_phosphorus: "총인", total_organic_carbon: "총유기탄소",
  total_coliform: "총대장균군", e_coli: "대장균",
};

/** popover 를 켜면 접힌 등급 기준이 카드를 늘리지 않고 말풍선으로 열립니다
 *  (InfoPopover 주석). 내용은 어느 쪽이든 같습니다. */
export function WaterQualityDetails({ data, error, className, popover = false }: { data?: WaterQualityGrade; error?: string; className?: string; popover?: boolean }) {
  // 담수(내륙) 표본은 해역 WQI 등급 체계가 아니므로 그 기준 설명을 붙이지
  // 않습니다 -- 다른 기준의 설명을 같은 값에 대 놓으면 등급을 오독합니다.
  const inland = data?.method_version === "inland-sampling.v1";
  const label = t(inland ? "담수 관측소 검사값" : "수질 1~5등급 기준과 검사값");
  const body = <>
    {!inland && <>
      <p>{t("1 매우 좋음 · 2 좋음 · 3 보통 · 4 나쁨 · 5 아주 나쁨")}</p>
      {/* 예전에는 WQI 분류와 평가 기준이 두 문단이었습니다. 같은 「이 등급이
          무엇으로 정해지는가」라서 한 문단으로 합쳤습니다 -- 대장균·장구균과
          입수 통제를 따로 확인해야 한다는 단서는 그대로 둡니다. */}
      <p>{t("공식 WQI 등급을 우선 사용하며, 등급 없이 지수만 오면 23 이하 / 24~33 / 34~46 / 47~59 / 60 이상으로 분류합니다. 표층 영양염·클로로필 a·투명도와 저층 산소포화도를 평가한 생태 기준이며, 대장균·장구균 검사와 입수 통제는 별도로 확인해야 합니다.")}</p>
      <p><a href="https://www.meis.go.kr/mei/wqi/introduce.do" target="_blank" rel="noreferrer">{t("해양환경정보포털 기준")}</a>{" · "}<a href="https://www.jkosmee.or.kr/_PR/view/?aidx=18375&bidx=1417" target="_blank" rel="noreferrer">{t("한국연안 수질 평가 논문")}</a></p>
    </>}
    {inland && <p><a href="https://water.nier.go.kr/" target="_blank" rel="noreferrer">{t("국립환경과학원 물환경정보시스템")}</a></p>}
    {data?.measurements.filter(m => NAMES[m.item]).map((m, i) => <p key={`${m.item}-${m.layer}-${i}`}>
      {m.layer === "surface" ? t("표층") : m.layer === "bottom" ? t("저층") : t("측정층 미확인")}{" "}{t(NAMES[m.item])}: {m.is_missing ? t("미측정") : formatValue(m.value, m.unit ?? "")} {!m.unit && m.item !== "ph" ? t("(단위 미제공)") : ""}
    </p>)}
  </>;
  return <div className={className}>
    <p>{error ?? waterQualityDescription(data)}</p>
    {popover ? <InfoPopover label={label}>{body}</InfoPopover> : <details>
      <summary>{label}</summary>
      {body}
    </details>}
  </div>;
}
