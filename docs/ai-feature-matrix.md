# AI 기능과 실제 자료 경로

## 그룹 B 추가 읽기·계산 도구

| 도구 | 서버 경로 | 범위와 제한 |
|---|---|---|
| `travel_route` | `app.travel.routing` | 별도 경로 프롬프트에서만 후보 최대 5곳을 환경·취향·카카오 구간 자료로 비교. 모델은 장소·시간 요약만 읽음 |
| `travel_recommend` | `app.travel.recommend` | B1/B3/B5 공통 정책. 실제 장소 최대 300건 검색 후 최대 5곳 반환, 검색 범위·이유·미확인 조건 보존 |
| `travel_draft` | `app.travel.plans` | 소유자 결합 추천 토큰의 순번 선택. 경로/비용 미확인 초안, 저장·예약 실행 없음 |
| `travel_companion` | `app.travel.companion` | 본인 세션의 마지막 갱신 상태와 최근 이벤트 5개. 현재 만료/종료/연결 상태 확인, 갱신·전송 실행 없음 |

개인 저장은 모델 도구와 분리된 인증 API다. 구조화 결과 ID와 후보 순서를 서버에서
검증한다. 상세 계약·외부 연결 상태는 [그룹 B 여행 백엔드](group-b-backend.md),
검증 결과는 [그룹 B 구현 및 검증 기록](group-b-implementation.md)을 참고한다.
아래 표는 기존 공개 자료 읽기 도구이며 이 확장에서도 재사용한다.

이 표의 기준은 현재 저장소의 읽기 코드다. 운영 DB에 해당 자료가 존재하는지,
수집기가 정상 동작하는지, 특정 지역의 대표성 매핑이 검토됐는지는 별도다.
AI는 아래 명시적 등록 도구만 실행하며 HTTP 라우트를 자동으로 도구화하지 않는다.

## 기능 → 화면 → 읽기 서비스 → 자료 조건 → AI 지원 범위

| 등록 도구 | 화면 / 이동 대상 | 실제 읽기 서비스 | 존재·신선도 조건 | AI가 설명하는 범위와 한계 |
|---|---|---|---|---|
| `capabilities` | 데이터 정보 `#info` | 등록 레지스트리, `DataReader.summary()`, 공개 `collection_place` 지역 집계 / 관측 기간 집계 | 현재 요청 시각 기준 제공처 상태·마지막 수집시각·heartbeat. 오래된 heartbeat는 `stale` | 기능 안내, 최대 20개 지역·30개 제공처 상태와 수집 기간. 집계 정상은 장소별 자료 보유·안전의 보증이 아님 |
| `search_places` | 장소 지도 `#water-index-map?spot_id=N` | `spots_waterspot JOIN collection_place`의 이름·지역·주소 매개변수 검색 | 실제 관광/장소 카탈로그 레코드가 있어야 함. 원본 provider/source ID와 카탈로그 갱신시각 보존 | 최대 8개, 첫 페이지, 카탈로그 이름순 후보. 활동은 조회 맥락이며 지원 여부는 후속 근거로 확인. `collection_station`만 존재하는 부이·관측소를 여행장소로 추천하지 않음 |
| `place_conditions` | Water Index / 장소 지도 | `water_index.condition_api.read_conditions`, `twin.api.spatial_view`; 수온은 해당 정규화 metric. 공개 authority와 특보 발표 이력의 제한된 읽기 | 해당 활동의 단위·시간·상태 검증, 여행장소-관측소 매핑의 유효기간, observation/forecast 구분. 과거 대화 수치는 재사용하지 않음 | 최대 3곳의 활동별 조건·수온·추가 해양/기상 근거와 공식 제한. `temperature_confirmed_only`는 대표 매핑·정상 단위·현재 유효한 수온이 있는 후보만 남김. 직접 측정점과 대표 관측소를 구분. 특보의 지역명 일치는 공간 적용 근거가 아니며 발표 기록 부재는 특보 없음이 아님 |
| `assessment_support` | Water Index `#water-index?spot_id=N` | `water_index.storage.read_projection`의 assessments/support, 동일 projection의 coverage; `_public_rows` 검증 | 현재 요청의 장소·활동·대상 기간·general context와 일치하는 저장된 공개 manifest. 최신 기준으로 재조회 | 최대 3개 평가와 지원/미지원·누락 기간. 공개 registry의 수치 모델은 미검증이며 `score=null`. 지원 또는 자료 존재만으로 안전을 판단하지 않음 |
| `forecast_compare` | Water Forecast `#water-forecast?spot_id=N` | `forecast.storage.select_forecasts`, `ForecastView` 검증 | 현재 알려진 불변 revision, 공식 대상시각, 발표·수집시각, 실제 horizon, 활동별 제공처와 매핑 | 최대 3곳 × 각 3개 예보. `no_forecast_data`, `outside_forecast_horizon`, `missing_within_horizon`, row의 `stale`/`partial`/`available`을 보존. 순위나 임의 예측을 만들지 않음 |
| `tides` | 물때 타이머 `#tide?spot_id=N` | `select_forecasts(provider='khoa_tide_extrema')`, `tide_event`, `tides.storage.read_windows` | 공식 고조·저조 revision, 대상일·단위·발표·수집시각. 운영시간은 별도로 검토·등록된 증거 필요 | 각 3개 물때 사건 / 운영 근거. 고조·저조는 입수 가능 시간이 아님. 공식 통제·폐쇄 근거를 필수 fact로 보존 |
| `quality` | 수질 교차검증 `#water-quality?spot_id=N` | `quality.storage.read_analyses`, `ComparisonEnvelope` 검증 | 현재 알려진 장소별 최신 분석. 분석 freshness와 공식 sample revision 상태를 별도로 표시 | 최신 분석 1개, 공식 채수 2개, 측정 비교 3개. 서로 다른 채수시각·단위·방법·공간 범위를 보존. 신뢰도·안전 점수·공식 등급 대체 없음. 관찰 작성자/원문/소유자와 개인 API는 읽지 않음 |
| `livecams` | 라이브캠 `#livecam?spot_id=N` | `livecams.service.read_cameras` — 기존 라우트와 공용 | 검토된 카메라 등록, 이용조건 검토 만료, 접속 검사 만료. `reachable`/`offline`/`unverifiable` 보존 | 최대 3개 공식 공개 페이지와 검사시각. 영상 시청·장면 분석·실시간 내용 확인을 수행하지 않음. `live_verified=false` 유지 |
| `nearby_places` | 장소 지도 | 실제 `collection_place` 카탈로그; 서버 저장 좌표의 bounded bbox 후 매개변수 직선거리 필터 | 출발 장소 자체가 실제 travel catalog에 있고 좌표가 있어야 함 | 반경 20km 이내 최대 8개. 등록 주소·종류·직선거리만 제공. 주차·편의시설·혼잡·개장·경로는 추정하지 않음 |
| `notifications_guide` | 첫 입수의 본인 알림 조회 `#first-swim` | 도구는 DB 및 개인 알림 API를 읽지 않음. 기존 인증 화면으로 이동만 안내 | 기존 SSO 및 화면의 본인 접근 제어 유지 | 읽기 화면 안내만 제공. 이번 버전의 화면은 구독 생성/편집 UI를 제공하지 않으며 AI도 생성·변경·삭제·발송을 실행하지 않음 |

## 확인한 기존 구현과 화면 설명의 차이

- 기존 `/api/data/ai/explanation`은 서버 fact의 순서만 모델에 맡겼다. 새 대화는 별도
  `/api/data/ai` 대화 계약에서 의도 해석과 제한된 함수 호출을 수행하고 기존 설명 계약을 보존한다.
- 기능 제목이나 기존 프런트 화면이 있다는 사실은 실제 관측 근거가 있다는 뜻이 아니었다.
  기존 미리보기 선택값·시연 점수는 AI 입력으로 사용하지 않는다. 이번 작업의 실제 자료 화면은
  검증된 `spot_id`, 활동과 대상 기간으로 기존 `/api/data` API를 다시 읽는다.
- Water Index에는 사용자가 직접 지정한 범위의 산술적 조건 일치 계산이 존재한다.
  이 값은 과학적 적합도/안전 모델이 아니다. AI 도구에는 임의 조건 가중치·계산 POST를 등록하지 않는다.
- 개인 알림 API의 존재는 알림 설정 UI가 이미 완성됐다는 뜻이 아니다.
  현재 AI에서는 본인 알림 조회 화면만 안내한다.

## 공통 범위·시간·출력 규칙

- `swim`, `surf`, `relax`, `mudflat`, `onsen`, `rafting`은 기존 Activity enum을 재사용한다.
- 상대시각은 요청당 고정된 서버 시각 및 `Asia/Seoul`을 사용한다. 오늘/내일은 KST 날짜,
  오전 06–12시, 오후 12–18시, 저녁 18–24시다. 이번 주말은 토요일 00시부터 월요일 00시이며,
  일요일에는 진행 중인 주말을 뜻한다. “이번 주말 오후”는 토/일 중 하루를 확인하도록
  `weekend_day_required`를 반환한다. 밤 시간까지 오후로 포함시키지 않는다.
- 명시 기간은 timezone offset이 있는 ISO 시각만 허용하며 최대 7일, 서버 현재시각에서
  전후 31일 범위 안이다. 실제 provider horizon은 별도로 확인한다. 미래 대상은 예보 모드다.
- 모든 스키마는 extra forbid와 OpenAI strict JSON Schema를 적용한다. 도구에는 임의 URL,
  SQL, 테이블·열, owner, 페이지 번호, cursor가 없다. 도구당 12초, 세션당 6회 실행,
  중복 동일 호출 금지, 선택된 서비스 행 최대 100개, 사실/후보 최대 24KB·50 facts다.
- 선택된 결과가 많으면 `*_page_limit`, `condition_detail_limit`, `tool_detail_limit`를 표시한다.
  범위가 너무 큰 필수 경고/제한은 조용히 버리지 않고 해당 도구 결과 전체를 실패로 처리한다.
  제한된 후보를 지역 전체의 최고나 전국 순위로 표현하지 않는다.
- fact에는 이번 요청의 fact ID, 원본 evidence refs, 출처, 단위, 상태, 관측/예보와 관련 시간,
  매핑 근거를 포함한다. 공개 값이 없으면 null을 유지한다. 기관 reviewer 등 내부 식별자는 제외한다.
- 공식 경고/제한/모델 미검증 안내는 `mandatory=true`로 응답 조립에서 항상 보존한다.
  DB 오류·타임아웃·검증 실패는 `query_failed`로 구분하고 빈 정상 자료로 바꾸지 않는다.
- 후보 이동 링크는 실제 해시 경로와 검증된 spot ID를 사용하며 해당 도구의 활동·기간을 보존한다.
  외부 출처는 인증정보/쿼리/토큰이 없는 공식 HTTPS 공개 페이지만 허용한다.
- 조회 연결과 트랜잭션은 도구 내부에서 종료된다. OpenAI 대기 중 DB 연결을 보유하지 않는다.
  어떠한 도구도 collector 실행·DB 수정·마이그레이션·외부 fetch·알림 발송을 수행하지 않는다.

## 검증 경계

`backend/tests/test_ai_tools.py`는 격리된 SQL fixture 위에서 실제 `read_conditions`와
Water Twin 읽기 서비스를 호출한다. 실제 장소/관측소 구분, 상태·단위·시각·매핑 보존,
KST 자정·주말·범위, 제한·오류·민감정보와 명시적 registry를 검사한다.
이것은 운영 데이터 보유, 공급자 신선도 또는 유료 OpenAI 연결 검증이 아니다.
