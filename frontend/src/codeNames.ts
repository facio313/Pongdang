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
  PONGDANG_FUSION: "내부 근거 통합",
};
const activities: Record<string, string> = {
  swim: "수영", rafting: "래프팅", onsen: "온천", mudflat: "갯벌 체험",
  relax: "휴식", surf: "서핑",
};
const tasks: Record<string, string> = {
  kma_nowcast: "기상청 초단기 실황",
  kma_ultra_forecast: "기상청 초단기 예보",
  kma_short_forecast: "기상청 단기 예보",
  kma_mid_forecast: "기상청 중기 예보",
  kma_warnings: "기상청 특보 발표 자료",
  kma_aws: "기상청 AWS 관측",
  kma_buoy: "기상청 해양 부이 관측",
  khoa_beach: "국립해양조사원 해수욕 예보",
  khoa_surfing: "국립해양조사원 서핑 예보",
  khoa_mudflat: "국립해양조사원 갯벌 체험 예보",
  khoa_rip_current: "국립해양조사원 이안류 지표",
  khoa_tide_recent: "국립해양조사원 조위 관측소 최신 자료",
  khoa_buoy_recent: "국립해양조사원 해양 관측 부이 최신 자료",
  khoa_water_temperature: "국립해양조사원 수온 관측",
  khoa_tide_level: "국립해양조사원 조위 관측",
  khoa_tide_extrema: "국립해양조사원 고조·저조 예측",
  khoa_waves: "국립해양조사원 파랑 예측",
  koem_catalog: "해양환경공단 관측 지점 목록",
  koem_water_quality: "해양환경공단 해양 수질",
  nier_water_quality: "국립환경과학원 수질 측정 자료",
  hrfco_waterlevel: "홍수통제소 하천 수위",
  kakao_places: "카카오 주변 장소·시설 목록",
  tourism_places: "한국관광공사 주변 관광지 목록",
  "weather-nowcast": "현재 기상 수집",
  "weather-short-forecast": "단기 기상 예보 수집",
  marine: "해양 관측 수집",
  "marine-activity-forecast": "해양 활동 예보 수집",
  "derive-suitability": "원본 근거로 파생 지표 계산",
  "water-index-general": "일반 참여자 적합도 평가",
  "water-index-family": "가족 참여자 적합도 평가",
  "condition-retention": "보존 정책에 따른 이력 정리",
  "daily-forecast": "일별 예보 계산",
  "route-matrix-drive": "자동차 이동 경로 행렬",
  "route-matrix-walk": "도보 이동 경로 행렬",
  "route-matrix-bicycle": "자전거 이동 경로 행렬",
};
const collectionStates: Record<string, string> = {
  pending: "실행 대기",
  running: "실행 중",
  succeeded: "수집 완료",
  partial: "일부 수집 (조회 범위 제한)",
  no_data: "정상 응답 · 대상 자료 없음",
  disabled: "비활성화 (키 미설정)",
  failed: "수집 실패",
  skipped: "건너뜀",
};
const evidenceStates: Record<string, string> = {
  recorded: "수집 기록",
  stale: "유효 기간 경과",
  superseded: "이전 수정본 (이력 보존)",
  missing: "원본 값 없음",
};
const collectionCodes: Record<string, string> = {
  KEY_NOT_CONFIGURED: "서버에 필요한 API 키가 설정되지 않음",
  BOUNDED_CATALOG: "조회 상한이 있는 목록 수집 · 전체 목록을 뜻하지 않음",
  COLLECTION_ERROR: "수집·검증·저장 처리 실패",
  NETWORK_ERROR: "제공처 네트워크 요청 실패",
  SERVICE_NOT_AUTHORIZED: "제공처 인증·서비스 활용 신청 상태 확인 필요",
  PROVIDER_20: "제공처 활용 신청·승인 상태 확인 필요",
  PROVIDER_30: "키와 해당 서비스 활용 신청 상태 확인 필요",
  HTTP_401: "제공처 인증 거부 (HTTP 401)",
  HTTP_403: "제공처 접근 거부 (HTTP 403)",
  HTTP_429: "제공처 요청 한도 초과 (HTTP 429)",
  REQUEST_BUDGET_EXCEEDED: "한 번의 수집 요청 상한 초과",
};
const dictionaries: Record<string, Record<string, string>> = {
  "runs.task_name": tasks,
  "runs.status": collectionStates,
  "runs.error_code": collectionCodes,
  "collection-jobs.task_name": tasks,
  "collection-jobs.state": collectionStates,
  "collection-jobs.last_error": collectionCodes,
  "metrics.state": evidenceStates,
  "snapshots.state": evidenceStates,
  "metrics.name": metrics,
  "metrics.unit": {
    degC: "섭씨 (°C)", percent: "백분율 (%)", mm: "밀리미터",
    "m/s": "초당 미터", degree: "각도 (°)", m: "미터", s: "초",
    cm: "센티미터",
    pH: "산성·염기성 척도", NTU: "탁도 단위", "mg/L": "리터당 밀리그램",
    "m3/s": "초당 세제곱미터",
  },
  "metrics.mode": { observation: "관측", observed: "관측", forecast: "예보", derived: "파생 계산" },
  "metrics.source": providers,
  "snapshots.provider": providers,
  "route-snapshots.provider": providers,
  "route-snapshots.transport": { drive: "자동차", walk: "도보", bicycle: "자전거" },
  "spots.type": { beach: "해변", valley: "계곡", onsen: "온천", mudflat: "갯벌" },
  "facilities.type": { parking: "주차장", toilet: "화장실", shower: "샤워실", convenience: "편의점" },
  "scores.activity": activities,
  "forecasts.activity": activities,
  "scores.participant_profile": { general: "일반 참여자", family: "가족 참여자" },
  "forecasts.participant_profile": { general: "일반 참여자", family: "가족 참여자" },
};

export function isCodeField(dataset: string, field: string): boolean {
  return Object.hasOwn(dictionaries, `${dataset}.${field}`);
}

export function codeName(dataset: string, field: string, value: string): string | undefined {
  if (!isCodeField(dataset, field) || value === "") return undefined;
  const dictionary = dictionaries[`${dataset}.${field}`];
  return Object.hasOwn(dictionary, value) ? dictionary[value] : "미등록 코드";
}
