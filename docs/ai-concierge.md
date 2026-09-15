# Pongdang Luna AI 컨시어지

## 여행 추천 백엔드 연동

선택적인 `travel` 상태로 키워드·취향·기분·선택 후보와 후속 경로 요청을 받는다.
처음에는 장소·활동 목록을 반환하고 별도 요청에서만 카카오 길찾기를 계산한다.
프런트 연동은 [키워드·경로 계약](travel-frontend-contract.md), 개인 자료·일정·여행
세션 API는 [그룹 B 백엔드](group-b-backend.md)를 따른다.

## 구현 범위와 읽기 경로

브라우저의 `#ai` 화면은 기존 FastAPI의 `POST /api/data/ai/chat`을 호출한다.
기존 `require_principal`이 Bonifacio `access-pongdang`과 Origin을 검증한 뒤,
Luna가 명시적 함수 레지스트리에서 읽기를 선택한다. 도구는 같은 서버의 HTTP
API를 다시 호출하지 않고 기존 읽기 서비스와 매개변수화된 읽기 전용 SQL을 쓴다.
기존 `GET/POST /api/data/ai/explanation`의 사실 정렬 계약과 결정론적 응답도 유지한다.
구현의 상세 대응과 기존 화면 차이는 [AI 기능과 실제 자료 경로](ai-feature-matrix.md)를
함께 참고한다.

아래 표는 화면의 존재와 실제 자료의 존재를 구분한다. 등록 도구의 기준은
`backend/app/ai/tools.py::TOOL_REGISTRY`다. 운영 DB의 자료 보유 여부를 이 작업에서
확인한 것으로 해석하면 안 된다. 모든 값은 요청 시 실제 Pongdang 자료를 읽는다.

| 기능 → 기존 화면 | 실제 읽기 서비스 | 자료 존재·신선도 조건 | 등록 AI 도구와 지원 범위 |
|---|---|---|---|
| 기능·수집 범위 → 자료 정보 `#info`, 자료 탐색 `#data` | `DataReader.summary`, `collection_place`, 관측 snapshot 기간 집계 | 수집 상태·heartbeat와 장소별 자료 보유는 별개. 늦은 heartbeat는 실행 중으로 표시하지 않음 | `capabilities`: 기능·활동·지역·수집 기간·갱신 상태. 기능 소개만이면 DB 조회 생략 가능 |
| 지역·장소 찾기 → Water Index·지도 | `collection_place`와 `spots_waterspot`의 실제 등록 장소 조인 | 제공자 장소 ID·카탈로그 출처·수집시각 보존. 관측소 자체를 여행 후보로 검색하지 않음 | `search_places`: 강릉·경포 같은 이름/지역 조건, 최대 8개. 검색 순서는 적합도 순위가 아님 |
| 장소 현재 조건·수온 → Water Index·지도 | Water Twin `spatial_view`, 활동 조건 `read_conditions` | 대표 관측소/관측소 자체/공간 대표성 미확인 구분. 수온·단위·만료·특보 근거 재조회 | `place_conditions`: 최대 3개 비교, 활동 전환, 유효한 수온 확인 후보 필터. 미지원 시간·활동과 부족한 자료를 보존 |
| 평가·지원 여부 → Water Index `#water-index` | `read_projection`의 assessments/support와 공개 투영 `_public_rows` | 공개 가능 평가·지원·coverage만 제공. 미검증 수치 모델과 `score=null` 유지 | `assessment_support`: 평가 가능 범위와 자료 부족 이유. 임의 점수·안전 순위 생성 안 함 |
| 공식 예보·후보 비교 → Water Forecast `#water-forecast` | `select_forecasts`, `ForecastView` | 실제 예보 지평, 발표·수집·대상시각, revision·공간 매핑 보존 | `forecast_compare`: 최대 3개, 같은 대상 구간의 공개 공식 예보 비교. 내일 오후 등의 요청을 KST 구간으로 정규화 |
| 물때·운영 제한 → 물때 타이머 `#tide` | 공식 고저조 `select_forecasts`, `read_windows`, `tide_event` | 공식 물때와 등록 운영시간·제한 근거가 있어야 설명. 미등록을 개방으로 바꾸지 않음 | `tides`: 현재 조건과 물때를 함께 조회 가능. 안전한 입수 시간 판정은 제공하지 않음 |
| 수질 자료 차이 → 수질 교차검증 `#water-quality` | `read_analyses`, `ComparisonEnvelope` | 공식 채수 근거·공개 분석·자료 시각 필요. 서로 다른 장소·시각·단위를 합쳐 수치 생성 안 함 | `quality`: 공개 교차검증과 불일치/부족 근거. 개인 관찰 원문·소유자·이메일 제외 |
| 카메라 안내 → 라이브캠 `#livecam` | `read_cameras`, `CameraEnvelope` | 검토된 공식 등록·허용 URL·연결 검사 상태. 카메라 존재는 현재 영상 확인을 뜻하지 않음 | `livecams`: 등록 링크와 상태 안내. 영상 시청·분석·파도/혼잡 추정 없음 |
| 주변 장소 → 실제 장소 지도 `#water-index-map` | 등록 장소 좌표의 제한된 SQL 조회 | 실제 주소·종류·좌표가 있는 여행장소만. 범위와 결과 상한 표시 | `nearby_places`: 반경 최대 20km·최대 8개. 확인되지 않은 시설·주차·경로·영업 여부 생성 안 함 |
| 개인 알림 → 첫 입수 `#first-swim` | 인증된 본인 구독 조회 화면 안내만 | 알림 API의 본인 인증 계약 유지. AI는 개인 구독·토큰·이메일을 읽거나 모델로 보내지 않음 | `notifications_guide`: 알림 조회 화면 이동. 생성·변경·삭제·발송은 아직 실행하지 않았음을 표시 |

기존 화면에 시연 선택값·점수가 남아 있어도 AI 근거로 사용하지 않는다. 실제 장소
카드의 이동 링크는 서버가 만든 기존 해시 경로이며 `/pongdang/` base를 유지한다.
현재 DB에 없는 장소·편의시설·검증된 추천/과학 모델·개장/혼잡·경로는 답할 수 없다.
상한에 걸린 후보를 전국 또는 지역 전체의 최고라고 표현하지 않는다.

웹캠 목록 `#livecam`과 이전 별칭 `#livecam-test`는 기존 Windy 조회 화면을 유지한다.
이 화면의 한시적 공급자 캐시는 AI의 등록 카메라 읽기 도구와 별개이며,
AI는 Windy 조회 API를 호출하거나 해당 화면의 결과를 근거로 수신하지 않는다.

## 모델, 대화와 검증

기본 런타임 모델은 `gpt-5.6-luna`다. 이 코드를 개발하는 모델과 서비스가 호출하는
런타임 모델은 별개다. [공식 Luna 모델 문서](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
[함수 호출](https://developers.openai.com/api/docs/guides/function-calling),
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)를
2026-09-15 확인한 설정을 사용한다. 표준 입력 USD 0.20, 출력 USD 1.20 / 100만
토큰을 각각 **200000 / 1200000 microUSD**로 설정한다. 캐시 입력 할인을 가정하지 않는다.
명시적으로 모델을 바꾸면 `AI_PRICING_MODEL`과 양의 요금도 일치해야 하며, 자동으로
고가 모델로 바꾸지 않는다. 명시적 null·0·모델 불일치는 과금 호출을 차단한다.

네트워크 어댑터는 수명주기가 관리되는 `httpx.AsyncClient`다. 엔드포인트는 서버 코드의
`https://api.openai.com/v1/responses`로 고정한다. 리다이렉트·환경 프록시·자동 재시도를
사용하지 않는다. `store=false`와 strict JSON Schema를 사용하고, 모든 object의
`additionalProperties=false`, 전체 필드 `required`, nullable 필드를 명시한다.
현재 요청 안의 원본 응답/추론 항목과 `call_id`를 후속 `function_call_output`에
연결한다. 추론 항목은 사용자와 로그에 노출하지 않는다.

Luna는 자연어의 지역·장소·시간·활동을 해석하고 도구를 선택한 뒤, 이번 요청에서
확인된 후보/근거 ID로 설명·비교·출처·한계 섹션을 구성한다. 서버가 한국어 사실
문장, 수치·단위·시각·장소·URL·상태를 조립한다. 자유 문장으로 안전/입수 가능/새
점수를 주장하는 우회 경로는 없다. 필수 제한·주의 근거는 모델 선택에서 빠져도
포함한다. 위조 ID·알 수 없는 함수·반복 함수·변조된 역할은 거절한다.

대화는 사용자/AI 역할만 최대 최근 8개 발화, 발화당 2000자, 전체 요청 16000bytes로
제한한다. 클라이언트가 보내는 장소 ID·과거 답변·화면 수치는 근거가 아니며 재조회한다.
현재 시각은 서버 clock, 상대 날짜는 `Asia/Seoul`을 쓴다. 후속 대화의 날짜 지정은
서버가 정규화한 ISO 시작/종료 구간을 유지하며, 명시적인 새 날짜가 이를 대체한다.
활동을 고르지 않았으면 모델 입력에 임의의 수영 선택을 넣지 않는다. 사용자 지정 구간은 최대
7일, 현재 기준 과거/미래 31일 안이며 개별 서비스의 더 짧은 실제 예보 지평이
우선한다. 이번 주말 전체는 토요일 00시부터 월요일 00시까지이며, 일요일에는
진행 중인 주말을 뜻한다. 주말의 오전·오후·저녁은 날짜가 둘이므로
`weekend_day_required`로 토요일과 일요일 중 어느 날인지 확인한다.

`no_data`, `stale`, `partial`, `unknown`, `superseded`, 미지원 및 조회 실패를 구분한다.
특보 발표 이력을 현재 발효 상태로 단정하지 않고, 기록 없음은 특보 없음이나 안전을
뜻하지 않는다. 키 미설정/예산 소진/모델 장애 시 명확한 선택 장소·지역의 가능한
결정론적 조회를 제공하거나 필요한 확인 질문 하나와 기존 화면을 안내한다.
대체 응답은 `provider=deterministic`, `fallback=true`로 구분한다.

## 인증과 데이터 전달 경계

`POST /api/data/ai/chat`은 `require_principal`과 동일한 서버 전용 SSO 토큰,
`access-pongdang` grant, 허용 Origin, `Sec-Fetch-Site` 검사를 통과해야 한다.
검사 실패 전에 provider 호출·예약이 발생하지 않는다. `GET /api/data/ai/status`는
로컬 설정 상태만 알려주며 유료 ping을 하지 않는다. `ready_to_try`는 **호출 가능한
설정**이며 키/모델 접근권한/결제 상태의 실제 접속 성공을 증명하지 않는다.
키가 없어도 기본 조회·collector·health/readiness는 동작한다.

저장소에서 확인되는 전달 경로는 다음과 같다.

1. 운영 HTTPS `/pongdang/`의 `ops/nginx-location.conf`는 설치된
   `/etc/nginx/snippets/bonifacio-sso-authrequest.conf`를 include한다.
2. 해당 ingress가 성공한 auth_request의 신뢰할 수 있는 subject/grants와 서버 전용
   토큰으로 외부의 **모든** `X-Pongdang-SSO-*` 헤더를 덮어써야 한다. 사용자가
   보낸 동일 이름의 헤더를 신뢰하면 안 된다. 이메일은 검증된 SSO 응답만 허용한다.
3. loopback `127.0.0.1:5188`의 frontend nginx가 이를 비공개 backend로 전달한다.
   backend는 서버 토큰을 constant-time 비교하고 권한/Origin을 검사한다.

**운영 호스트의 실제 SSO snippet·환경·설치 상태는 이번 로컬 구현에서 읽거나
검증하지 않았다.** 기존 알림 문서도 이 경계의 검토·별도 설치가 필요하다고 적고 있다.
SSO 웹 로그인 화면이 된다는 사실만으로 인증된 AI API의 헤더 브리지가 완성된 것은
아니다. 이미 이 브리지가 정상인 운영 환경에서는 아래 API 키 한 줄이 추가 입력의
전부다. 미설정이면 `AUTH_NOT_CONFIGURED`, `SSO_ORIGINS_NOT_CONFIGURED` 등으로
닫힌 상태를 유지하며 인증을 끄거나 브라우저에 비밀을 넣지 않는다.

질문·최근의 제한된 대화·필요한 공개 근거를 OpenAI로 보낸다는 안내가 AI UI에 있다.
SSO 식별자·이메일·세션·토큰·DB 정보·provider 원문 payload·비공개 알림은 모델에
보내지 않는다. 대화/정확한 위치의 기본 로그·영구 대화 저장소·공유 캐시를 만들지
않는다. [OpenAI 데이터 처리 문서](https://developers.openai.com/api/docs/guides/your-data)에
따라 `store=false`는 Responses의 응답 저장 설정이며 제공자 측 모든 보관이 없다는
보장은 아니다. 별도 VectorDB/Redis/임베딩/GPU/외부 MCP는 필요 없다.

## 비용·동시성·실패 처리

| 설정 | 기본 상한 |
|---|---:|
| 요청당 모델 시도 / 도구 실행 | 3회 / 6회 |
| 전체 처리 / 모델 네트워크 timeout | 60초 / 20초 |
| 직렬화된 모델 요청 / 출력 | 65536bytes / 2048tokens |
| 전체 프로세스의 동시 AI 요청 | PostgreSQL lease 2개 |
| 본인 요청 빈도 | UTC 달력상 1분당 6회 |
| 하루 모델 시도 / 예약 토큰 | UTC 일자별 200회 / 4000000tokens |
| 최소 시도 예약 / 하루 예산 | 20000 / 1000000microUSD (USD 0.02 / 1.00) |

모든 모델 시도 직전에 기존 `ai_daily_budget`에 원자적으로 예약한다. 시스템 지시,
스키마, 대화, 이전 모델 항목, 도구 결과가 포함된 **실제 직렬화 body의 UTF-8 bytes
+ 1024 토큰 여유분 + 최대 출력 토큰**을 보수적 토큰 추정으로 사용한다. 이 추정의
요금과 최소 예약액 중 큰 값을 잡으며 최초/후속/실패한 시도 모두 횟수에 포함한다.
최대 크기 모델 요청 3개도 새 기본 일일 한도 내에서 처리 가능함을 DB 테스트한다.
소액 시도에서 최소 예약이 지배하면 하루 예산으로 최대 50회의 모델 시도를 허용한다.

`observed_calls`, `actual_input_tokens`, `actual_output_tokens`,
`actual_cost_microusd`는 API usage가 확인된 사용량이다. 예약과 별개로 기록하며 시도
UUID로 중복 반영을 막고 예약한 UTC 일자에 귀속시킨다. timeout/취소/연결 단절/usage
누락 시 실제 과금 여부가 불명확하므로 환불하지 않는다. 알려진 usage가 추정 예약을
넘으면 초과분도 예약 합계에 추가해 후속 호출 한도를 강화한다. `actual_cost_microusd`는
usage와 설정 단가로 계산한 비용이며 제공자의 확정 청구서를 뜻하지 않는다. 시도 식별 기록은
90일 후 정리하고 일일 집계는 유지한다. 예약 누적은 매일의 횟수·토큰·금액 상한으로
제한된다. 이것은 앱의 보수적 제어이며 제공자의 실제 결제 한도를 완전히 보장하지 않는다.

동시성은 DB의 짧은 advisory-lock 트랜잭션으로 모든 프로세스가 공유한다. lease는
정상 완료/오류/취소 시 해제하며 프로세스 중단 시 전체 요청 제한+5초 후 만료한다.
사용자 빈도는 SSO 서버 비밀로 만든 HMAC만 저장하고 2분 범위의 카운터만 유지한다.
DB 연결은 provider를 기다리기 전에 닫힌다. 예약/사용량 DB 오류는 과금 호출을
무한 재시도하지 않고 구분된 대체 응답/코드로 처리한다.

401/403/모델 미접근/429/quota/5xx/연결/timeout, refusal/incomplete/빈 출력/잘못된
JSON/출력 한도를 내부 이유 코드로 구분한다. 로그에는 request ID·코드·호출/도구
횟수·지연·예약량·사용량·대체 여부만 남고 원문 대화/키/원문 provider 오류는 없다.

## 환경과 기존 배포에 적용

운영 파일은 기존 배포 스크립트가 사용하는
**`/home/cks/.config/pongdang/production.env`**다. 코드가 CI를 통과해 기존 main 배포
경로로 설치되고 기존 DB/collector/SSO가 정상이라는 전제에서 마지막에 넣을 값은
다음 한 줄이다. 실제 값을 Git/채팅/브라우저 설정에 넣지 않는다.

```dotenv
AI_API_KEY=발급받은_OpenAI_API_키
```

`AI_API_KEY`만 지원하며 `OPENAI_API_KEY`를 같이 요구하거나 다른 도구의 키를 자동
차용하지 않는다. 공백 키는 미설정으로 처리한다. `AI_PROVIDER=auto`가 기본이고 키가
있으면 OpenAI, 없으면 비활성이다. 명시적 `AI_PROVIDER=disabled`는 키가 있어도
유지한다. 과거 템플릿의 비활성 값을 운영자가 의도적으로 넣었다면 검토해 `auto`로
바꿔야 하며 코드가 몰래 무시하지 않는다. 빈 모델/가격 모델은 Luna 기본으로
정규화하고 Compose의 빈 가격은 새 기본을 쓴다. **명시적 `null` 가격, 예전 8000bytes/
256tokens/20000dailytokens 같은 값은 덮어쓰지 않으므로 운영자가 기존 AI 옵션을
검토해 제거하거나 새 `.env.example`과 맞춰야 한다.** 이미 사용자가 지정한 값까지
키 하나로 자동 변경한다고 주장하지 않는다.

backend에만 키를 전달하며 frontend build args/VITE·collector·initialize에는 없다.
새 `schema.VERSION=7`은 기존 v6 예산 합계를 보존하며 명시적 `app.schema --initialize`
경로에서만 usage/lease/rate 테이블을 추가한다. HTTP/서버 시작에서 migration하지
않는다. 기존 볼륨·서비스 DNS·명시적 컨테이너 이름·비공개 DB/API 포트는 유지한다.

코드 변경은 기존 dev 통합→main CI 통과→자동 배포를 따른다. 새 코드를 main에 직접
밀거나 CI를 우회하는 배포 명령은 사용하지 않는다. **이미 CI를 통과해 배포된 현재
릴리스에서 환경 키만 반영**할 때는 서버 `cks` 계정으로 다음 명령을 실행한다.
이는 저장소 `ops/pongdang-deploy`의 env 경로·릴리스 SHA 이미지·rootless Docker
소켓을 그대로 사용하며 전체 env/compose secret을 출력하지 않는다.

```bash
export DOCKER_HOST=unix:///run/user/1001/docker.sock
pongdang_release_dir="$(readlink -f /home/cks/.local/share/pongdang-deploy/current)"
export RELEASE_SHA="$(basename "$pongdang_release_dir")"
docker compose --project-name pongdang \
  --env-file /home/cks/.config/pongdang/production.env \
  -f "$pongdang_release_dir/compose.yaml" config --quiet
docker compose --project-name pongdang \
  --env-file /home/cks/.config/pongdang/production.env \
  -f "$pongdang_release_dir/compose.yaml" \
  up -d --no-build --no-deps --force-recreate --wait --wait-timeout 180 backend
```

키는 컨테이너 환경이므로 `restart`만으로 반영되지 않는다. 위 명령은 현재 배포
릴리스 backend를 재생성하고 이미 정상 배포된 schema를 사용한다. schema가 아직
v7이 아니면 새 릴리스를 먼저 기존 CI 배포 경로로 배포한다. 운영 실행/권한을 이
로컬 작업에서 검증한 것은 아니다.

`ops/pongdang-deploy`의 설치용 소스는 초기화를 `initialize` 서비스로 실행해 AI 키가
전달되지 않게 수정했다. 배포가 설치된 `/usr/local/libexec/pongdang-deploy`나 nginx
snippet을 자동 갱신하지 않는다. 기존 설치본 변경은 별도의 검토된 호스트 설치로
적용한다. nginx 읽기 timeout 템플릿은 긴 대화를 위해 75초이며 frontend 이미지도
75초를 쓴다. 기존 host timeout이 30초라면 30초 초과 응답이 먼저 끊길 수 있다.

### 로컬 브라우저에서 직접 대화

운영 SSO가 없는 이 컴퓨터에서는 별도 로컬 실행 명령을 사용한다. 기존
`app.main:create_app` 서버를 종료한 뒤 backend 디렉터리에서 실행한다.

```bash
pongdang_session_dir="$(mktemp -d)"
uv run --frozen python -m app.ai.local \
  --session-file "$pongdang_session_dir/session.json"
```

별도 터미널에서 frontend를 정확한 loopback 주소와 포트로 실행한다.

```bash
APP_BASE_PATH=/ npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

서버가 알리는 세션 파일의 `bootstrap_url`을 같은 브라우저에서 연다. URL의
임시 교환권을 한 번 사용하면 AI 화면으로 이동하고, 이후
`http://127.0.0.1:5173/#ai`에서 실제 질문을 전송할 수 있다. 이 세션 파일은
0600 권한으로 새로 생성되며 API 키나 SSO 비밀을 포함하지 않는다. 임시 URL은
5분 이내 한 번만 사용할 수 있고 브라우저 세션은 최대 2시간 후 만료한다.
서버를 종료하면 세션도 폐기된다. 만료 후에는 명령을 새 세션 파일로 다시 실행한다.

이 모드는 일반 운영 앱의 환경변수로 켜지지 않는다. 별도 명령으로 실행한
loopback 서버에서만 임시 운영자 권한을 발급한다. 정확한 Host·Origin·요청 출처,
loopback 연결 및 HttpOnly/SameSite 쿠키를 검사한다. 브라우저에서 읽을 수 있는
API 키, SSO 공유 비밀, 위조 SSO 사용자·권한 헤더를 만들지 않는다. 개인 알림과
다른 사용자 API는 기존 SSO 인증을 계속 요구한다. DB는 loopback의 `pongdang`
또는 `pongdang_test`만 허용하며 초기화된 schema v7이 필요하다.

AI 화면에 로컬 테스트 세션임을 표시한다. 질문은 실제 OpenAI와 실제 Pongdang
읽기 서비스를 사용하며 기존 도구·시간·호출·전역 동시성·일일 비용 한도를
적용한다. 시작과 상태 확인은 유료 모델을 호출하지 않는다. 이 검증은 운영 SSO
로그인이나 배포 검증을 대신하지 않는다.

### 키 설정 후 선택적으로 실행할 유료 smoke

#### 로컬 개발 환경

저장소 루트의 Git에서 제외된 `.env`에 `AI_API_KEY`를 넣는다. 현재 로컬
`backend/.env`는 `../.env` 심볼릭 링크이므로 같은 값을 읽는다. 파일 내용을
로그나 채팅에 출력하지 않는다. backend를 이미 실행 중이었다면 환경 변경 후
재시작해야 한다. 브라우저 입력이나 `VITE_*` 환경변수에는 키를 넣지 않는다.

로컬 DB가 초기화된 loopback `pongdang`이고 schema v7이 준비된 상태에서:

```bash
cd /Users/cksmacbook/Desktop/Develop/Project/Pongdang/backend
uv run --frozen python -m app.ai.smoke --live --local
```

이 명령은 최대 2회의 유료 모델 시도와 1회의 capabilities 도구 실행으로
연결을 검증한다. `--local`은 `--live`와 함께 사용해야 하며, loopback의
`pongdang` 또는 `pongdang_test` DB만 허용한다. CLI 전용 운영자 빈도 제한과
기존 전역 동시성·일일 예산·usage 회계를 사용한다. SSO 사용자나 비밀을 생성하지
않으며 브라우저 인증을 활성화하지 않는다.

일반 `app.main:create_app` 서버는 로컬에서도 기존 SSO를 요구하므로 연결이
없으면 `AUTH_NOT_CONFIGURED`로 차단된다. 로컬 브라우저 확인에는 위의 명시적
임시 운영자 세션을 사용하고, 운영 브라우저 확인에는 검증된 사용자·권한을
전달하는 기존 Bonifacio SSO ingress를 사용한다. 기본 데이터 조회는 이 AI
인증 설정과 독립적으로 사용할 수 있다.

2026-09-15 사용자 키로 실제 Luna→capabilities→검증된 답변 연결은 통과했다.
호출 수·usage 및 브라우저 인증 검증의 경계는 [검증 기록](ai-validation.md)에 있다.

#### 기존 운영 서버

동일 서버·릴리스 변수로 다음 명령을 **명시적으로 실행할 때만** 최대 2회의 유료
모델 시도와 1회의 capabilities 읽기 도구, strict 최종 답변 연결을 검사한다.

```bash
docker compose --project-name pongdang \
  --env-file /home/cks/.config/pongdang/production.env \
  -f "$pongdang_release_dir/compose.yaml" \
  exec -T backend python -m app.ai.smoke --live
```

`--live` 없이 실행하면 호출하지 않고 종료한다. 출력은 성공/실패·request ID·provider·
기능명·이유 코드뿐이다. 키·원문 응답·실제 개인 질의를 출력하지 않는다. CLI smoke는
실제 모델→도구→답변 연결을 검사하므로 별도로 로그인된 `/pongdang/#ai`에서 질문,
후속 질문·응답 카드 이동을 확인해야 end-to-end ingress 인증도 확인된다.
기본 CI·health/readiness·화면 상태 조회는 이 smoke를 실행하지 않는다.

### 제한 안에서 최종 답변 마무리

이미 이번 요청의 도구 조회가 끝났고 다음 시도가 마지막 허용 모델 호출이면,
`tool_choice="none"`으로 최종 구조화 답변을 요청한다. 모델이 조회만 반복하다
3회 상한을 소진하는 경우를 줄이면서 기존 호출·비용 제한을 유지한다. 도구를
아직 실행하지 않은 자료 질문은 계속 실제 조회를 요구한다. 최종 응답의 근거 ID,
필수 경고와 미확인 상태 검증도 그대로 적용한다. 이 도구 선택 옵션은
[OpenAI 함수 호출 문서](https://developers.openai.com/api/docs/guides/function-calling)의
정의에 따른다.

## 검증의 경계

기본 테스트는 주입한 로컬 Responses 응답과 폐기 가능한 `pongdang_test` DB를 쓴다.
실제 OpenAI/기상/해양 API 호출·운영 DB 접속·시드가 없다. 구성, 실제 PostgreSQL
동시 예약/lease/rate, 버전 6→7 이전, 실제 읽기 fixture와 함수 인자/근거, 인증,
시간/실패/위조 응답 및 UI 상호작용 회귀를 검사한다. 프론트 lint/test/build와
백엔드 Ruff/pytest의 실행 결과는 작업 완료 보고를 기준으로 확인한다.
키 없는 로컬 검증과 CI 실행, 운영 배포, 모델 권한·실제 OpenAI 연결은 별도 상태다.

실행별 최종 검증 결과와 기존 미추적 프론트 파일의 빌드 제한은
[로컬 검증 기록](ai-validation.md)에 남겼다.
