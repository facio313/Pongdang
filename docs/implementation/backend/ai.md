# B AI 선행 기반 인계

`backend/BACKEND_GOAL.md` B의 공통 장소·활동·시간·근거 설명·실패 처리 기반을
구현했다. 추천, 일정 작성, 대화형 컨시어지 등 B1~B5 전체 제품을 구현했다고 보고하지
않는다. 기존 프론트 디자인·라우팅·컴포넌트 구조를 변경하지 않았으며 새 AI 화면을
추가하지 않았다.

## 구현 상태

| 구분 | 상태 |
|---|---|
| 공통 장소·활동·at/as_of·관측/예보 모드 | 구현; A3의 동일 bounded SpatialQuery 재사용 |
| A1~A8 제한 서비스 목록 | 구현; 실제 읽기 API 경로 목록과 공통 100행 상한 |
| 근거 있는 결정적 설명 | 구현; A3가 읽은 실제 정규화 metric만 설명 |
| 선택적 모델 adapter | 구현; OpenAI Responses가 **이미 만든 사실의 순서만** 결정 |
| 모델 출력 검증·실패 fallback | 구현; 원래 사실을 수정/추가/삭제할 수 없음 |
| 호출/토큰/비용 예약과 restart/concurrency | 구현; UTC 일별 PostgreSQL atomic 예약 |
| 모델/단가/키/운영 활성화 | 기본 미설정; 실제 호출하지 않았음 |
| 소프트웨어 검증 | 독립 단위 24개 통과, DB 4개 및 전체 실행 결과는 progress.md 참조 |
| 모델 품질/운영 비용 실측 | 미검증; 테스트 대역 성공과 구분 |

구현 파일은 `backend/app/ai/service.py`, 독립 검증은
`backend/tests/test_ai_foundation.py`이다. `tests/test_feature_services.py`에도 실제
DB→HTTP 설명 GET 무쓰기·기본 예약 테스트가 있다. schema migration의
`migrate_ai(connection)`는 빈 `pongdang_data.ai_daily_budget` 테이블을 명시적으로
생성한다. 별도 AI job이나 startup 실행은 없으며 실제 모델 요청은 인증된 POST에서만
가능하다. GET은 provider를 호출하거나 예산을 쓰지 않는다.

## API 계약

배포 URL은 기존 `/pongdang/` BASE_URL 규칙을 유지한다.

| 메서드 | 경로 | 인증/부작용 |
|---|---|---|
| GET | `/api/data/ai/tools` | 공개된 제한 서비스 registry; 읽기만 |
| GET | `/api/data/ai/explanation` | 실제 DB 근거의 결정적 설명; 읽기만 |
| POST | `/api/data/ai/explanation` | 기존 `access-pongdang` SSO+Origin; 모델 선택 시 예약 쓰기 |

GET 쿼리: `spot_id` 필수 양의 정수, `activity` 기본 swim,
`at`/`as_of` timezone-aware ISO-8601(생략 가능), `mode=observation|forecast`.
지원 활동은 swim, surf, relax, mudflat, onsen, rafting이다. at은 as_of를 기준으로
31일 이내이며 미래 as_of는 거절한다. 존재하지 않는 장소는 404다.

POST는 같은 필드의 JSON과 `use_model` boolean(기본 false)을 받는다.

```json
{
  "spot_id": 123,
  "activity": "swim",
  "at": "2026-09-13T12:00:00+09:00",
  "as_of": "2026-09-13T12:00:00+09:00",
  "mode": "observation",
  "use_model": false
}
```

위 ID/시간은 계약 예시다. 운영 호출에서는 A3의 실제 장소 ID·조회 가능한 시간 범위를
사용한다. 미래 예보는 실제 공식 forecast 모드 자료를 소비하며 현재 관측을 미래값으로
생성하지 않는다. A3의 `as_of` revision 선별과 결측/만료 표시를 그대로 소비한다.

응답은 `contract_version=evidence-explanation.v1`, `spot_id`, `activity`, `at`,
`as_of`, `mode`, `data_status`, `status`, `provider`, `model`, `facts`,
`reason_codes`, `disclaimer`다. 각 fact에는 `fact_id`, 서버가 만든 `text`,
`evidence_refs`가 있으며 `metric:{id}:snapshot:{id}`로 원 근거 revision을 가리킨다.
대표 관측소는 `mapping:{mapping_id}`도 보존하고 직접 현장 실측과 다른 문구를 쓴다.

`data_status=no_data`는 자료 부족이지 안전하다는 뜻이 아니다. `status=no_data`에서도
자료 부족 사실과 원 `no_mapped_measurements` 등의 reason code를 설명한다.
`status=deterministic_fallback`은 원 근거는 있으나 모델 사용 조건/결과가 유효하지 않아
서버 설명을 반환한 것이다. `provider=deterministic`, `model=null`이다.
model 사용 여부와 관계없이 `disclaimer`는 관측/예보와 입수 안전·검증된 적합도 점수를
분리한다. null 관측을 0으로 변환하지 않는다.

대표 reason code:

- `ai_not_configured`: provider/model/API 키 미설정.
- `ai_pricing_not_configured`: 해당 model과 exact 일치하는 단가 설정 미확인.
- `ai_input_limit`: facts뿐 아니라 instructions/schema를 포함한 전체 HTTP JSON이 상한 초과.
- `ai_budget_exhausted`: UTC 일별 호출·토큰·비용 예약 한도 도달.
- `ai_budget_unavailable`: 예산 DB 장애; 원 근거로 결정적 설명을 반환하며 모델 미호출.
- `ai_output_unverified_or_unavailable`: timeout, provider 오류, 불완전/거절/형식 불일치 응답.
- `no_evidence_to_order`: 정렬할 실제 관측/예보 근거가 없어 모델을 사용하지 않음.
- `explanation_fact_limit`: 정규화 metric 20개까지만 설명; 원 A3 응답으로 전체 범위 조회.

## 모델이 사실을 만들 수 없는 실행 구조

서버가 실제 A3 DB 결과에서 metric명·수치·단위·현재 상태·관측소·측정/발표 시각을
만든다. 없는 수치, 수질등급, 안전 결론, 점수, 장소를 생성하는 model prompt는 없다.
사용자 리뷰 본문, SSO subject, 이메일, provider URL, DB/API credentials는 model 입력에
포함하지 않는다. 모델은 다음 구조만 반환할 수 있다.

```json
{"ordered_fact_ids": ["서버가 실제 제공한 ID만"]}
```

API JSON schema는 unknown property를 금지하고 허용 fact ID를 enum으로 제한한다.
서버의 `validate_order`가 전체 fact ID가 정확히 한 번씩 포함됐는지 다시 검증한다.
모델이 문장·점수·안전 문구를 추가하거나 ID를 만들거나 누락/중복시키면 전체 모델
출력을 버린다. 검증된 순서대로 **원래 서버 fact 객체**만 재배열한다. 출력 문자열을
사용자 화면에 그대로 전달하는 통로는 없다.

제한 서비스 registry는 A1 assessments, A2 forecasts, A3 twin, A4 temperature,
A5 livecams, A6 tides/events, A7 owner subscriptions, A8 quality/comparisons를
가리킨다. 각 서비스의 OpenAPI 입력 검증·페이지 상한·출처 계약·인증 경계를 적용한다.
arbitrary SQL, URL proxy, 동적 import/임의 도구 실행 기능이 아니다. 다음 AI 제품에서
서비스를 사용하더라도 알림 구독 등 인증된 정보는 기존 사용자 소유권을 유지해야 한다.

## Provider·토큰·비용 설정

현재 adapter는 고정 HTTPS endpoint `https://api.openai.com/v1/responses`만 사용하고
redirect를 따르지 않는다. `store=false`, `service_tier=default`, structured JSON output,
`max_output_tokens`를 명시하며 tool/파일/검색 기능은 보내지 않는다. 서버 key는
Authorization 헤더에만 넣는다. 실제 모델 호출과 model 선택은 이번 작업에서 하지 않았다.

2026-09-14에 OpenAI Docs로 현재 공식 [Responses 요청 명세](https://developers.openai.com/api/reference/cli/resources/responses/methods/create),
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[API 요금표](https://developers.openai.com/api/docs/pricing)를 확인했다.
공식 명세의 `max_output_tokens`는 visible output과 reasoning token을 포함한다.
JSON schema 준수만으로 사실성을 보장하지 않으므로 서버에서 ID 집합과 원 객체를
별도로 검증한다. 요금은 선택한 model·서비스 tier에 맞게 운영자가 확인해야 한다.

| 설정 | 기본 / 의미 |
|---|---|
| `AI_PROVIDER` | disabled; 현재 openai 지원 |
| `AI_MODEL` | 빈 값; 실제 계정에서 사용 가능한 모델 식별자 |
| `AI_API_KEY` | 빈 값; 서버만 읽음 |
| `AI_PRICING_MODEL` | 빈 값; AI_MODEL과 exact 일치해야 모델 활성화 가능 |
| `AI_INPUT_MICROUSD_PER_MILLION_TOKENS` | null; 선택 모델의 보수적인 input 요금 |
| `AI_OUTPUT_MICROUSD_PER_MILLION_TOKENS` | null; 선택 모델의 보수적인 output 요금 |
| `AI_TIMEOUT_SECONDS` | 8, 범위 1~30초; 전체 응답 대기 상한은 이 값+1초 |
| `AI_MAX_INPUT_BYTES` | 8000, 최대 16000; 전체 provider HTTP JSON UTF-8 bytes |
| `AI_MAX_OUTPUT_TOKENS` | 256, 범위 64~1024 |
| `AI_MAX_DAILY_CALLS` | 20, 0이면 모델 요청 금지 |
| `AI_MAX_DAILY_TOKENS` | 20000, 0이면 모델 요청 금지 |
| `AI_RESERVED_CALL_MICROUSD` | 100000; 호출당 비용 예약의 최소값 |
| `AI_DAILY_BUDGET_MICROUSD` | 1000000; 1 USD = 1000000 microUSD |

전체 request body를 만드는 `request_bytes`를 바이트상한, 예산, 실제 HTTP 요청에서
공유한다. instructions와 JSON schema/fact enum도 크기에 포함한다. 예약 input token은
request byte 수+1024 protocol 여유분, output은 max_output_tokens 전부를 사용한다.
이는 text-only 요청의 보수적 내부 예약치이며 provider 실제 usage 측정값이 아니다.
예약 비용은 `ceil(input_tokens * input_rate / 1000000)` +
`ceil(output_tokens * output_rate / 1000000)`와 호출당 최소 예약 중 큰 값이다.
할인/캐시 적중을 가정해 예약 비용을 줄이지 않는다.

날짜는 DB의 UTC 날짜다. PostgreSQL 한 번의 조건부 UPDATE에서 호출·토큰·비용을 함께
검사하고 증가시켜 동시 요청과 프로세스 재시작이 한도를 초기화하지 못하게 한다.
원격 호출 실패/timeout에도 예약을 환불하지 않는다. provider가 요청을 실제 처리했을
가능성이 있기 때문이다. 모델 변경 시 단가 모델명이 일치하지 않으면 자동 fallback한다.

실제 청구액을 절대적으로 보증하는 결제 시스템은 아니다. 운영자가 잘못된 단가를
설정하거나 provider 가격이 바뀌면 보수적 비용 가정이 성립하지 않는다. 실서비스
활성화 전에 현재 공식 요금과 선택 모델의 지원 범위/요금 tier를 확인하고, 승인된 소량
요청의 실제 usage와 예약치를 비교해야 한다. 지금은 키·모델·단가가 미설정이므로
model 비용이나 품질이 검증됐다고 표시하면 안 된다.

## 검증과 후속 연결

`test_ai_foundation.py`는 원 fact 보존과 재배열, 허구/누락/추가문구 거절, 개인정보·키
비포함, 설정/입력상한/예산한도/예산장애 fallback, provider timeout·거절·불완전·크기상한,
GET의 모델/예산 무호출, POST 인증, at/as_of/mode 전달, 잘못된 시간대·31일 상한을
검사한다. 별도 PostgreSQL 테스트는 동시 8개 예약의 호출 한도 2개 보존, 토큰/비용
한도 0에서 모델 예약 거절, 모델 단가가 최소 호출 예약보다 비싼 경우의 정확한 예약을
검사한다. 외부 provider 대역 이외로 요청하지 않았다.

폐기 가능한 PostgreSQL 18 `pongdang_test` 전용 설정으로 backend에서 실행한다.

```text
python -m pytest -q tests/test_ai_foundation.py tests/test_feature_services.py
ruff check app/ai tests/test_ai_foundation.py
ruff format --check app/ai tests/test_ai_foundation.py
```

실제 LLM 사용을 원하면 서버 provider/model/key, 같은 model의 검증된 요금 설정,
기존 SSO 신뢰 경계를 준비한 뒤 승인된 소량 호출로 timeout·출력 계약·실제 usage를
확인한다. 그 전에도 결정적 설명과 제한 서비스 API는 실제 확보된 데이터 범위에서
사용할 수 있다. 새 UI는 프론트 담당자가 기존 API client와 전용 응답 DTO를 통해
연결하고 `data_status`, `reason_codes`, 원 evidence_refs를 함께 표시해야 한다.
