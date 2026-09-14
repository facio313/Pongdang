# A1 전체 활동 자료·검증 기록

검토일: 2026-09-14 (Asia/Seoul). 대상: 수영(`swim`), 서핑(`surf`), 휴식(`relax`), 갯벌(`mudflat`), 온천(`onsen`), 래프팅(`rafting`).

사용자가 선택한 종합 점수의 의미는 **선택한 활동 안에서 여러 조건을 합산한 점수**다. 활동 여섯 개를 서로 평균 내지 않는다. 입력 자료의 단위·시각·공간·수정 이력 검증, 계산 소프트웨어 검증, 실제 이용자의 선호·현장 안전에 대한 외부 검증은 서로 다른 결과로 기록한다. 계산식 시험 통과를 활동의 안전 또는 선호 타당성 검증으로 표시하지 않는다.

## 검토 범위와 결과의 한계

이번 자료 점검은 Pongdang 소스와 저장된 검증 산출물을 확인하고, 별도 임시 PostgreSQL 18.3의 `pongdang_test`에서 수집→저장→조회 회귀시험을 실행했다. 운영 DB나 다른 앱 DB에는 접속하지 않았다. 운영 수집자료를 만들기 위한 합성 입력, 시작 시 자동 seed, HTTP 요청을 통한 저장은 추가하지 않았다. 시험 모듈의 표본은 폐기 가능한 DB의 소프트웨어 검증 전용이다.

`live-verification.json`에 기록된 이전 실수신은 2026-09-14 04:24 KST에 KMA 단기예보 78건, KHOA 수온 26건, KHOA 고·저조 예측 20건을 별도 `pongdang_test`로 받은 결과다. 이것은 기존 어댑터의 당시 수신·저장 근거이며, 이번 시점의 데이터 가용성이나 여섯 활동 모델의 현장 타당성 검증을 뜻하지 않는다. 이번 점검에서 자격증명을 사용한 새 외부 실수신은 수행하지 않았다.

## 입력 지표와 단위

아래 표는 어댑터가 실제 응답에서 정규화할 수 있는 지표를 뜻한다. 특정 장소·시각에 현재 값이 저장돼 있다는 뜻은 아니다. 목록 밖의 물리량을 비슷한 지표로 대체하지 않는다.

| 자료 제공자·어댑터 | 주요 정규화 이름 | 보존 단위 | 보존해야 하는 차이 |
|---|---|---|---|
| KMA 단기·초단기 (`ingestion/weather.py:CATEGORIES`) | `air_temperature`, `minimum_air_temperature`, `maximum_air_temperature` | `degC` | 일 최저·최고와 대상시각 기온은 다름 |
| 같은 자료 | `relative_humidity`, `precipitation_probability` | `%` | 습도와 강수확률은 별개 물리량 |
| 같은 자료 | `precipitation`, `snowfall` | `mm/1h`, `cm/1h` | 강수량의 집계시간을 제거하지 않음; `1mm 미만` 등 원문을 임의 수치화하지 않음 |
| 같은 자료 | `wind_speed`, `eastward_wind`, `northward_wind` | `m/s` | 풍속과 벡터 성분은 다름 |
| 같은 자료 | `wind_direction`, `wave_height` | `degree`, `m` | 방향과 파고는 별개 조건 |
| 같은 자료 | `sky_condition`, `precipitation_type`, `lightning` | `code` | 범주 코드 숫자를 연속 수치 점수로 사용하지 않음 |
| KMA AWS (`AWS_COLUMNS`) | `wind_speed`, `gust_speed`, `wind_speed_10min`, `air_temperature`, `relative_humidity` | `m/s`, `degC`, `%` | 순간·최대·10분 관측을 같은 조건값으로 혼합하지 않음 |
| KMA AWS | `precipitation`, `precipitation_15min`, `precipitation_12h`, `precipitation_day` | `mm/1h`, `mm/15min`, `mm/12h`, `mm/day` | 강수 집계시간 구분 |
| KMA 해양부이 (`BUOY_COLUMNS`) | `water_temperature`, `wave_height`, `maximum_wave_height`, `average_wave_height`, `wave_period`, `wave_direction` | `degC`, `m`, `s`, `degree` | `wave_height`는 `WH_SIG`; 최대·평균파고와 구분 |
| KHOA 관측 (`ingestion/marine.py:FIELDS`) | `water_temperature`, `air_temperature`, `wind_speed`, `wave_height`, `wave_period`, `wave_direction` | `°C`, `m/s`, `m`, `s`, `degree` | KMA의 `degC`와 `°C`는 정확한 단위 표기 변환만 가능 |
| KHOA 조위 관측·부이 | `current_speed` | 조위 계열 `m/s`, 부이 계열 `cm/s` | 100배 차이의 단위 보존; 정확한 비율 변환 때 원값도 보존 |
| KHOA 조위·고저조 | `tide_level` | `cm` | 조위 기준면과 장소 구분; 조위→갯벌 탈출시간 추정 금지 |
| KHOA 활동예보 (`_activity`) | `water_temperature`, `air_temperature`, `wind_speed`, `wave_height`, `wave_period` | `°C`, `m/s`, `m`, `s` | 원 제공 필드는 `avg*`이며 반일/일 대상기간; 순간 관측과 다름 |
| KHOA 활동예보 | `official_activity_index`, `official_activity_grade`, `surfing_skill`, `opening_status`, `experience_start`, `experience_end` | 응답 단위 없음 | 공식 등급을 Pongdang 자체 점수로 바꾸지 않음; 운영 상태 원문이 곧 완전한 통제 근거는 아님 |
| HRFCO (`ingestion/water.py:hrfco`) | `river_level`, `river_flow` | `m`, `m³/s` | 수위표 기준면을 station datum에 보존; 수위→유량 추정 금지 |
| KOEM·NIER 정기채수 | `water_temperature` | `°C` | 일 단위 검사일이며, 오래된 검사 수온을 현재 관측으로 사용하지 않음 |
| KOEM·NIER 정기채수 | `ph`, `dissolved_oxygen`, `chemical_oxygen_demand`, `total_nitrogen`, `total_phosphorus` 등 | 빈 문자열 | 이 어댑터가 검수한 응답에 농도 단위가 없어 임의 `mg/L` 등을 붙이지 않음 |
| NIER 정기채수 | `e_coli`, `total_coliform`, `river_level`, `river_flow` 등 | 빈 문자열 | 미생물 단위 추정 금지; HRFCO의 단위가 있는 실측 유량과 동일시하지 않음 |

추가 기압·염분·습도·바람 센서별 지표도 원래 테이블에서 조회할 수 있다. 위 표의 점수 후보 목록은 데이터 카탈로그의 공개 열 허용목록을 줄이지 않는다.

## 활동별 확보 가능한 입력과 남아 있는 근거

| 활동 | 기존 어댑터의 조건 후보 | 합산 전에 지켜야 할 자료 범위 | 별도 확보·검증해야 하는 근거 |
|---|---|---|---|
| 수영 | 수온, 파고, 풍속, 기온, 강수 | 수영 구역을 대표하는 관측소 또는 해당 활동예보 지점·유효기간 | 실제 입욕 구역·개장/통제, 수질 검사 단위·적용범위, 이안류/기상 위험의 공간·시간 적용, 장비·노출시간·사용자 맥락과 현장 선호표본 |
| 서핑 | 파고, 주기, 방향, 풍속, 수온 | 관측/예보 시각과 평균·최대 구분; `khoa_surfing`의 기술수준 원문 보존 | 서프브레이크의 방향·지형·노출, 이용자 기술·장비, 파랑 전파/관측소 대표성, 운영 통제와 현장 평가표본 |
| 휴식 | 기온, 바람, 강수, 습도, 해양 조건 | KMA 5km 격자와 해변 지점을 연결하는 검수 근거; `khoa_beach`의 원래 장소 | 실외/실내 여부, 그늘·시설·접근성·체류시간 등 환경 및 선호 맥락, 현장 선호표본 |
| 갯벌 | 기온, 바람, 강수, 조석 원자료·체험 시작/종료 원문 | `khoa_mudflat`은 해당 체험장만; 조위관측소와 체험 동선 연결 검수 | 체험장 운영시간·통제, 동선별 침수 및 귀환 가능 구간, 공식 탈출/고립 방지 근거; 저조 시각만으로 활동 가능시간을 만들지 않음 |
| 온천 | 기온·바람 등 주변 환경 후보 | 해양·하천의 `water_temperature`를 욕조/탕 수온으로 사용하지 않음 | 현재 어댑터에는 검수된 탕별 `bath_water_temperature`, 실내 온도, 시설 운영·수질/위생 검사가 없음; 시설별 측정 체계와 적용범위, 이용 맥락 및 선호표본 필요 |
| 래프팅 | HRFCO 유량·수위, 기온, 바람, 강수 | 실제 코스 구간과 관측소의 관계 검수; `river_level`로 `river_flow`를 대체하지 않음 | 코스별 유량 적합성 관계, 방류/급변·운영 통제, 코스 난도·장비·가이드, 노출시간 및 이용자 평가표본 |

여섯 활동 모두 코드의 선택 계약은 존재한다. 장소가 관광 카탈로그에 있거나 주변에 센서가 있다는 사실만으로 활동 지원·안전 또는 종합 환경 적합도를 확정하지 않는다. 필요한 입력이 없는 경우 결측과 이유를 명시하며 다른 활동의 지표로 채우지 않는다.

## 이번에 연결한 종합 점수의 계약

`GET /api/data/water-index/activities`가 여섯 활동·활동별 선택 가능한 지표와 아직 필요한 현장 근거를 제공한다. `GET /api/data/water-index/conditions`는 선택한 실제 장소·활동·관측/예보·목표시각의 읽기 전용 자료를 반환한다. `POST /api/data/water-index/condition-score`는 사용자가 고른 관측소, 명시한 최소/최대 범위와 중요도만 받아 저장된 자료로 조건 일치 점수를 계산한다. 요청자가 측정값을 전달해서 운영 자료를 대신할 수 없다.

점수는 `100 × Σ(중요도 × 범위 충족[0 또는 1]) / Σ중요도`이며 범위의 경계를 포함한다. 예를 들어 중요도 3인 조건이 불충족, 중요도 1인 조건이 충족이면 25점이다. 이 예의 수치와 범위는 산술 설명이며 특정 활동의 권장 기상·수온 범위가 아니다. 기본 임계값이나 중요도를 과학적 기준인 것처럼 채우지 않는다. 서로 다른 활동의 점수를 합산하지 않는다.

선택한 조건 하나라도 자료를 확보하지 못했거나 유효시각·단위·활동·공간 범위가 맞지 않으면 `incomplete`와 `score=null`로 보류한다. 동일 장소·활동에 적용되는 공식 제한 또는 미지원 근거가 있으면 `blocked`와 `score=null`이다. 자료에 명시적인 0이 있으면 결측으로 취급하지 않는다. 현행 안전 필수검사 목록의 검증이 완료되지 않았으므로 공식 주의 근거는 이유코드로 유지하고 전체 안전 상태는 `unknown`으로 남긴다.

안전·활동 지원이 알려지지 않은 상태에서도 사용자가 정한 조건의 산술 일치 여부는 표시할 수 있다. 응답에는 그 불확실성과 아직 필요한 근거를 함께 유지한다. 이 경로의 `종합 조건 일치 점수`는 사용자가 명시한 조건에 관한 계산 결과이며, 기존 A1의 `environment_score`와 과학적 환경 적합도·안전 상태는 계속 별도 미검증 상태를 유지한다. 프론트도 두 의미를 혼합하면 안 된다.

## 공간·시간·수정 이력 재사용 경로

- `water_index/adapters.py:input_from_records`는 snapshot/metric ID 일치와 시각 충돌을 확인하고 제공자 ID, 원 기록 ID, 수신·발표·관측·유효시각, 원단위, 결측을 보존한다. 집계 방법·장소 대표성·활동 지원·안전은 추정하지 않는다.
- `water_index/sources.py:StationMapping`은 장소·관측소·활동·적용기간·공간 범위·버전·공식 공개 HTTPS 출처·검수자를 명시한다. 다른 장소로의 자동 최근접 매핑은 없다. 이전 매핑은 `supersedes_id`로 정정하며 원 근거를 변경하지 않는다.
- `twin/api.py:station_links`와 `evidence`는 HTTP에서 재사용 가능한 읽기 경로다. 특정 `as_of`에 알려졌던 수정본과 명시적 결측 정정을 보존하고 결과가 100개를 넘으면 축소 요청 오류를 반환한다. 오래된 정상값으로 결측 정정을 덮지 않는다. 계산에는 별도로 선택 활동, 물리량, 단위, 목표시각과 매핑 적용범위가 맞는지 확인해야 한다.
- `forecast/storage.py:read_normalized`는 worker 한 회차 최대 5,000개 자료를 읽고 초과 시 실패한다. 이 함수는 HTTP의 100행 페이지를 대신하는 무제한 조회용으로 사용하지 않는다.
- `water_index/producer.py:produce_assessments`는 직접 관측소 지점 또는 검수된 매핑만 사용한다. `khoa_beach`는 `swim`/`relax`, `khoa_surfing`은 `surf`, `khoa_mudflat`은 `mudflat`으로 유지한다. 한 자료 상품이 다른 활동으로 둔갑하지 않도록 새 조회도 같은 범위를 유지해야 한다.
- `SourceBatch`는 미래 관측·미래 수신·미래 발표, 중복 지표, 한 배치 내 상충 근거를 거부한다. 알 수 없는 발표시각은 `null`이다. 실패한 fetch가 성공기록을 생성하거나 유효기간을 늘려서는 안 된다.
- 원본 내용이 `A → B → A`로 돌아오면 기존 수집 저장 방식은 이전 A의 원 수신시각을 유지하면서 다시 활성화한다. 현재 schema에는 그 재활성화의 발생시각 이력이 없으므로, 최종 수신시각 순서와 활성 원본이 다른 상황에서는 새 조건 계산이 `revision_reactivation_history_unavailable`과 `unknown`/`score=null`로 보류한다. 과거 조회에 현재 상태를 거꾸로 투영하거나 B를 계속 최신 유효값으로 선택하지 않는다.

## 실행 검증

| 범위 | 결과 | 해석 |
|---|---|---|
| 기존 KMA·KHOA·KOEM/NIER/HRFCO 어댑터, 수집 저장, producer/forecast/tides, spatial 회귀시험 8개 모듈 | **111 passed**, 2026-09-14, 8.13초 | Python 3.14.4 + PostgreSQL 18.3의 분리된 `pongdang_test`; 두 Starlette 관련 deprecation warning |
| 새 활동 조건/종합 점수 API 통합시험 (`test_condition_score_integration.py`) | **16 passed**, 2026-09-14, 2.99초 | 여섯 활동 선택, 100/0/가중25점, 0·경계 포함, 결측/누락 정정 및 과거 조회, 동시간 상충, 만료·단위 불명, 매핑 정정, 공식 제한·미지원·주의, 욕조/해수/하천 구분, 예보 발표시각과 활동상품 범위 |
| 여섯 활동의 실제 이용자 선호·현장 안전 검증 | **미수행** | 검수된 장소별 적용범위·정답/평가표본을 확보한 후 별도 평가 필요 |

기존 시험 실행 모듈은 `test_weather.py`, `test_marine.py`, `test_water.py`, `test_ingestion.py`, `test_collection.py`, `test_assessment_forecast_tides.py`, `test_assessment_forecast_tides_integration.py`, `test_spatial_integrations.py`다. 전체 frontend lint/tests/build와 backend Ruff/전체 tests의 최종 결과는 작업 완료 기록에 함께 남긴다.

재실행은 프로젝트의 `backend/.venv/bin/python` 또는 lockfile을 유지하는 `uv run --frozen`으로 한다. DB 시험 전에 `POSTGRES_DB=pongdang_test`와 새 임시 클러스터의 소켓을 명시한다. DB 시험 모듈들이 `pongdang_data` schema를 정리하므로 동일 DB를 대상으로 여러 pytest 프로세스를 병렬 실행하지 않는다. 사용 후 임시 PostgreSQL을 종료한다.
