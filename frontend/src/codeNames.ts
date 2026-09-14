// Display-only dictionaries, scoped by dataset and field. Never rewrite DB values.
const metrics: Record<string, string> = {
  air_temperature_c: "기온",
  relative_humidity_pct: "상대 습도",
  precipitation_1h_mm: "1시간 강수량",
  wind_speed_ms: "풍속",
  wind_direction_degrees: "풍향",
  cloud_cover_pct: "구름 덮임 비율",
  precipitation_probability_pct: "강수 확률",
  minimum_air_temperature_c: "최저 기온",
  maximum_air_temperature_c: "최고 기온",
  water_temperature_c: "수온",
  wave_height_m: "파고",
  wave_period_seconds: "파주기",
  tidal_height_cm: "조위",
  current_speed_ms: "유속",
  rip_current_risk: "이안류 위험 지표",
  beach_activity_index: "해수욕 활동 지수",
  surf_activity_index: "서핑 활동 지수",
  water_ph: "수소 이온 농도 (pH)",
  turbidity_ntu: "탁도",
  dissolved_oxygen_mg_l: "용존 산소량",
  river_discharge_m3s: "하천 유량",
  hot_tub_temperature_c: "온천탕 수온",
  dew_point_c: "이슬점 온도",
};
const providers: Record<string, string> = {
  KMA: "기상청",
  KHOA: "국립해양조사원",
  TourAPI: "한국관광공사 관광 정보",
  Valhalla: "이동 경로 API",
  PONGDANG_DEMO_KMA: "기상청 계열 합성 예시 (실제 수집 아님)",
  PONGDANG_DEMO_KHOA: "해양 관측 합성 예시 (실제 수집 아님)",
  PONGDANG_DEMO_MOE: "수질 합성 예시 (수집기 미구현)",
  PONGDANG_DEMO_DERIVED: "파생 계산 합성 예시",
  PONGDANG_DEMO_VALHALLA: "이동 경로 합성 예시 (실제 경로 아님)",
  PONGDANG_FUSION: "내부 근거 통합",
};
const activities: Record<string, string> = {
  swim: "수영", rafting: "래프팅", onsen: "온천", mudflat: "갯벌 체험",
  relax: "휴식", surf: "서핑",
};
const tasks: Record<string, string> = {
  "weather-nowcast": "현재 기상 수집",
  "weather-short-forecast": "단기 기상 예보 수집",
  marine: "해양 관측 수집",
  "marine-activity-forecast": "해양 활동 예보 수집",
  "water-quality-example": "수질 합성 예시",
  "sync-tour-spots-example": "관광 장소 동기화 예시",
  "derive-suitability": "원본 근거로 파생 지표 계산",
  "water-index-general": "일반 참여자 적합도 평가",
  "water-index-family": "가족 참여자 적합도 평가",
  "condition-retention": "보존 정책에 따른 이력 정리",
  "daily-forecast": "일별 예보 계산",
  "route-matrix-drive": "자동차 이동 경로 행렬",
  "route-matrix-walk": "도보 이동 경로 행렬",
  "route-matrix-bicycle": "자전거 이동 경로 행렬",
};
const dictionaries: Record<string, Record<string, string>> = {
  "metrics.name": metrics,
  "metrics.unit": {
    degC: "섭씨 (°C)", percent: "백분율 (%)", mm: "밀리미터",
    "m/s": "초당 미터", degree: "각도 (°)", m: "미터", s: "초",
    cm: "센티미터", demo_index: "합성 지수 (공식 지수 아님)",
    pH: "산성·염기성 척도", NTU: "탁도 단위", "mg/L": "리터당 밀리그램",
    "m3/s": "초당 세제곱미터",
  },
  "metrics.mode": { observed: "관측", forecast: "예보", derived: "파생 계산", demo: "합성 예시" },
  "metrics.source": providers,
  "snapshots.provider": providers,
  "route-snapshots.provider": providers,
  "route-snapshots.transport": { drive: "자동차", walk: "도보", bicycle: "자전거" },
  "spots.type": { beach: "해변", valley: "계곡", onsen: "온천", mudflat: "갯벌" },
  "spots.catalog_verification": { demo_unverified: "합성 예시 · 미검증" },
  "facilities.type": { parking: "주차장", toilet: "화장실", shower: "샤워실", convenience: "편의점" },
  "facilities.tag": { DEMO_NOT_A_REAL_FACILITY: "합성 예시 · 실제 시설 아님" },
  "scores.activity": activities,
  "forecasts.activity": activities,
  "scores.participant_profile": { general: "일반 참여자", family: "가족 참여자" },
  "forecasts.participant_profile": { general: "일반 참여자", family: "가족 참여자" },
  "forecasts.unavailable_reason": { DEMO_NOT_REAL_FORECAST: "합성 예시 · 실제 예보 아님" },
  "runs.error_code": { DEMO_NOT_EXECUTED: "합성 예시 · 실제 실행하지 않음" },
  "lineage.relation": { demo_calculation_input: "더미 파생 계산의 입력 근거" },
};

export function isCodeField(dataset: string, field: string): boolean {
  return Object.hasOwn(dictionaries, `${dataset}.${field}`) ||
    (dataset === "runs" && field === "task_name");
}

export function codeName(dataset: string, field: string, value: string): string | undefined {
  if (!isCodeField(dataset, field) || value === "") return undefined;
  if (dataset === "runs" && field === "task_name") {
    const demo = value.startsWith("DEMO/");
    const code = demo ? value.slice(5) : value;
    const name = Object.hasOwn(tasks, code) ? tasks[code] : "미등록 코드";
    return demo ? `${name} · 합성 예시 (실제 실행 아님)` : name;
  }
  const dictionary = dictionaries[`${dataset}.${field}`];
  return Object.hasOwn(dictionary, value) ? dictionary[value] : "미등록 코드";
}
