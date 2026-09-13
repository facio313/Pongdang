# A7 조건 구독·이벤트·발송 백엔드 인계

경수 담당 백엔드 범위. 기존 프론트 화면·라우팅·스타일을 수정하지 않았다. 알림
설정 화면은 아직 없으며 아래 계약으로 연결한다. 구현된 이벤트는 **사용자가 직접
설정한 수온 선호 조건 충족**이다. 입수 가능, 안전, 올해 최초 입수일을 뜻하지 않는다.

## 근거와 현재 상태

| 항목 | 상태 | 근거/다음 검증 |
|---|---|---|
| 구독·소유권·연도·설정 변경·해지 | 구현 | 기존 SSO subject만 저장, 별도 계정 없음 |
| 실제 수온 관측 소비·조건 평가·이벤트 저장 | 구현 | `app.notifications.service`의 실제 `pongdang_data` SQL |
| worker 연결·중복 방지·재시도·취소 | 구현 | `condition_notifications` job, durable outbox와 DB lock |
| 실제 메일 provider adapter | 구현 | Resend HTTPS POST, 타임아웃, 응답 제한, idempotency header |
| 소프트웨어 검증 | 단위 29개 통과, PostgreSQL 통합 8개 포함 최종 결과는 `progress.md` 참조 | 모든 발송 테스트는 대역 |
| 실제 SSO 주체·검증 이메일 전달 | 운영 미활성 | 기존 host auth_request 응답 헤더를 검토해야 함 |
| 실제 메일 수신 확인 | 미실행 | 사용자에게 실제 발송하지 않았음 |
| 안전 임계온도·연중 최초 조건의 과학적 검증 | 미완료 | 수온 preference와 분리; 안전 unknown/올해 최초 null |
| 프론트 알림 설정 화면 | 인계 | 기존 화면 디자인 보존; 새 화면을 임의로 추가하지 않음 |

요구사항의 현재 기준은 `backend/BACKEND_GOAL.md` A7 및 5~8절이다. 읽기 전용으로
Multtara 루트 문서 목록과 `물따라_플랜.md` A7·API 표,
`물따라_기획서.md` A7을 확인했다. 기획서의 22~23℃와 “오늘부터 입수 가능” 문구는
검증된 안전 규칙으로 채택하지 않았다. 해당 폴더의 worktree 문서는 별도 과거 복제본으로
구분했고 코드·데이터베이스·네트워크·자격증명은 사용하지 않았다.

현재 외부 계약 확인(2026-09-14): [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email),
[Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
고정 endpoint `https://api.resend.com/emails`의 `from`, `to`, `subject`, `text`를 사용한다.
동일 요청은 동일 `Idempotency-Key`를 사용하며 provider의 키 보존 기간은 24시간이다.
키 보존 기간 바깥의 모호한 요청을 재발송하지 않도록 최초 시도 23시간 후 중단한다.

## 파일·DB·job

- `backend/app/auth.py`: 기존 SSO와 FastAPI 사이의 기본 닫힘 인증 계약.
- `backend/app/notifications/models.py`: 요청/응답 및 유한 숫자·시간대·단일 이메일 검증.
- `migrations.py`: 명시적·추가적 `migrate(connection)`; `app.schema --initialize`가 호출.
- `service.py`: 인증 소유권별 구독, 설정 revision, 관측 연결, 연간 조건 평가와 이벤트 생성.
- `delivery.py`: 전송 의도 선저장, 재시작, 재시도, 취소, provider accepted 처리.
- `provider.py`: redirect 금지, 10초 timeout, 16KiB 응답 상한, 오류 비밀정보 제거.
- `api.py`: `/api/data/notifications`에서 인증된 변경과 소유자 전용 읽기.

테이블은 `notification_subscription`, `notification_evaluation`, `notification_event`,
`notification_outbox`, `notification_delivery_attempt`이다. 사용자 subject·이메일·발송
message는 일반 `data_catalog.json`에 등록하지 않는다. 공개 자료표로 조회할 수 없다.
서버 시작과 GET은 migration·seed·수집·평가 저장·발송을 수행하지 않는다.

`run_notifications(settings, now=None)`는 `evaluate_subscriptions`와 `deliver_due`를
실행한다. root의 공통 feature job `condition_notifications`가 60초 주기로 기존
collector의 job lock·persisted due time·backoff·heartbeat를 재사용한다. 한 실행에서
평가 100개, 발송 100개 이하이며 오래 평가하지 않은 구독부터 순환한다.

## SSO 신뢰 경계와 활성화 설정

기존 Bonifacio `access-pongdang` gate를 유지한다. 알림/리뷰 인증 API는 다음 모든
조건이 충족되어야 한다.

1. 성공한 SSO `auth_request`가 **현재 로그인한 사용자의 안정적인 subject**와
   `access-pongdang` grant를 제공한다.
2. 운영 TLS ingress가 외부에서 들어온 아래 헤더를 모두 무조건 덮어쓴다.
   `X-Pongdang-SSO-Subject`, `X-Pongdang-SSO-Grants`, `X-Pongdang-SSO-Email`,
   `X-Pongdang-SSO-Token`.
3. Subject/Grants는 검증된 SSO 응답에서만, Email은 SSO가 소유권 검증을 완료한
   이메일에서만 가져온다. 이메일을 제공할 수 없으면 in_app 구독만 가능하다.
4. Token은 ingress와 backend가 공유하는 32자 이상 서버 전용 임의 비밀이다.
   클라이언트·브라우저 bundle·프론트 환경변수·응답·로그에 전달하지 않는다.
   앱의 공개 API/DB 포트 비공개 상태를 유지한다.
5. backend는 Token constant-time 비교 후 subject/grant를 신뢰한다. 이 서버 경계가
   검증되기 전에는 `SSO_PROXY_SECRET`을 설정하지 않아 API가 닫힌 상태를 유지한다.
6. 변경 요청은 `Origin`이 `SSO_ALLOWED_ORIGINS`의 쉼표 구분 origin과 정확히
   일치해야 한다. `Sec-Fetch-Site: cross-site`도 거절한다. 서버 전용 작업이라도
   이 API를 호출할 때는 허용 origin 계약을 준수한다.

직접 세션 쿠키를 해독하거나 새 로그인·사용자·패스워드 DB를 만들지 않는다. 현재
`ops/nginx-location.conf`의 기존 include만으로는 위 헤더 provenance가 검증된 것이
아니다. host snippet은 설치하지 않았으며 **실제 snippet 검토와 별도 설치 요청**이
남아 있다. 무검증 사용자 헤더를 신뢰하도록 proxy를 구성하면 안 된다.

| 서버 설정 | 기본/의미 |
|---|---|
| `SSO_PROXY_SECRET` | 빈 값, 인증 API 503; 최소 32자 |
| `SSO_ALLOWED_ORIGINS` | 빈 값, 변경 API 503; 실제 HTTPS origin만 설정 |
| `NOTIFICATIONS_PROVIDER` | `disabled`; 지원 provider `resend` |
| `NOTIFICATIONS_DELIVERY_ENABLED` | `false`, 외부 네트워크 발송 금지 |
| `NOTIFICATIONS_RESEND_API_KEY` | 빈 값, 서버에서만 읽음 |
| `NOTIFICATIONS_FROM_EMAIL` | 빈 값, provider 검증을 받은 발신 주소 |

개발과 격리 테스트는 실제 자격증명을 사용하지 않는다. 활성화에는 verified sender,
기존 SSO의 검증된 이메일 전달, 사용자의 명시적 실제 발송 요청과 승인된 수신자가
필요하다. 실제 발송 테스트가 허용되면 전용 승인 수신자 구독 1개로 요청/accepted/
provider 대시보드 수신 상태를 순서대로 확인한다. 로컬 `accepted`는 provider 요청
접수이며 실제 수신 완료(delivered)를 증명하지 않는다. 수신 확인 webhook은 이번
구현 범위에 포함하지 않았으므로 `delivered` 상태를 반환하지 않는다.

## 프론트 API 계약

배포에서는 기존 API client의 `/pongdang/` BASE_URL을 사용한다. 아래 경로에
`/pongdang`을 중복 연결하지 않는다. 인증 헤더와 비밀을 프론트에서 직접 만들지 않고,
기존 동일 origin SSO 쿠키 요청이 운영 ingress를 통과하도록 한다.

| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/data/notifications/subscriptions` | 자신의 구독, `limit=1..100`, `offset=0..10000` |
| POST | `/api/data/notifications/subscriptions` | 명시적인 구독 생성; 동일 내용 재요청은 같은 ID |
| PUT | `/api/data/notifications/subscriptions/{uuid}?expected_revision=N` | 전체 설정 교체, 낡은 revision 409 |
| DELETE | `/api/data/notifications/subscriptions/{uuid}` | 해지 204; 재해지도 204, 남의 ID 404 |
| GET | `/api/data/notifications/subscriptions/{uuid}/evaluations` | 자신의 평가 이력과 unknown 사유, 100행 상한 |
| GET | `/api/data/notifications/events` | 자신의 이벤트/발송 이력, optional `subscription_id`, 100행 상한 |

구독 요청:

```json
{
  "spot_id": 123,
  "year": 2026,
  "timezone": "Asia/Seoul",
  "minimum_temperature_c": 20,
  "channel": "in_app",
  "destination": null,
  "active": true
}
```

위 수치와 ID는 계약 설명용이며 운영 seed가 아니다. 프론트는 장소 API에서 실제
ID를 선택해야 한다. 수온 선호값은 필수이고 기본 안전 임계값은 없다. 연도는 해당
IANA 시간대의 현재 연도 또는 다음 연도다. 같은 사용자·장소·연도에 구독은 하나이며
내용이 다른 POST는 409다. 채널이 email이면 destination은 SSO의 검증된 email과
정확히 일치해야 하며 없거나 다르면 403이다. in_app destination은 반드시 null이다.

응답에는 `id`, 설정 필드, `revision`, `updated_at`, `condition_state`,
`last_evaluated_at`, `delivery_configuration`이 있다. `condition_state=unknown`은
수온 부족/만료/연도 밖/매핑 없음 등이며 안전하다는 뜻이 아니다. 구체적 사유는
평가 이력 endpoint의 `evidence.reason_codes`에서 읽는다. GET은 `private, no-store`다.

주요 오류: 401 `SSO_AUTHENTICATION_REQUIRED`, 403 `SSO_GRANT_REQUIRED`,
`ORIGIN_NOT_ALLOWED`, `SSO_VERIFIED_EMAIL_REQUIRED`, 404 `PLACE_NOT_FOUND` /
`SUBSCRIPTION_NOT_FOUND`, 409 `SUBSCRIPTION_REVISION_CONFLICT` /
`SUBSCRIPTION_ALREADY_EXISTS` / `SUBSCRIPTION_LIMIT_REACHED`, 422 입력 오류,
503 `AUTH_NOT_CONFIGURED` / `SSO_ORIGINS_NOT_CONFIGURED` / `NOTIFICATIONS_UNAVAILABLE`.
오류 응답에는 provider 응답 body·URL 자격증명·DB 접속문을 포함하지 않는다.

## 근거와 정확성 규칙

관측소 자체 spot은 `station_itself`, 검토된 `water_index_station_mapping`으로 연결한
여행장소는 `representative_station`이다. 후자는 해당 해변에서 직접 측정한 값처럼
표시하면 안 된다. 매핑 ID·공간범위·버전·검토근거를 이벤트에 보존한다. 매핑이 없거나
복수로 모호하면 unknown이다. 최근 관측은 실제 observation 모드, 원자료 revision,
관측/수집/만료 시각을 검증한다. 기존 `water_index.units.convert_exact`로 실제
marine/water adapter의 `°C`와 weather adapter의 `degC`를 같은 섭씨 단위로
정규화하고 원 단위·값·변환 버전을 남긴다. forecast나 비교 불가 단위는 대체하지 않는다.

`first_in_observed_history=true`는 확보된 동일 연도 관측 중 앞선 충족 자료가 없다는
뜻뿐이다. 앞선 충족 관측이 있으면 `first_in_year=false`; 없으면 연간 완전 coverage를
증명할 수 없어 `first_in_year=null`이다. `true`를 임의로 만들지 않는다.
`safety_status=unknown`, `preference_is_safety_threshold=false`는 명시적으로 유지한다.

평가는 근거 digest로 중복 저장을 막는다. 이벤트는 구독·설정 revision·연도·종류별로
active 상태 하나만 허용한다. 정정·만료·조건 해제로 취소된 이벤트에 외부 발송 시도가
전혀 없으면 원 이벤트와 근거를 이력으로 보존한 뒤 같은 해의 새 정상 충족 근거로
새 이벤트를 만들 수 있다. 이미 provider 접수, 접수 미확정 발송 시도, in_app 공개
이력이 있으면 해당 설정 revision의 시즌 재생성·재발송을 막는다. 설정 교체는
revision을 증가시키고 이전 대기 발송을 취소하며 내용이 동일한 PUT은 revision을
올리거나 이벤트를 다시 만들지 않는다.
제공처 정정은 이전 이벤트를 superseded로 보존한다. 발송 직전 현재 온도 조건,
구독 활성/revision, 원 관측의 만료·정정을 다시 확인한다. 기존 조건이 깨지거나
관측이 만료되면 대기 알림을 취소한다. 발송 시도가 이미 있었으나 접수 여부를
확인하지 못한 상태에서 해지·만료되면 `delivery_unknown`으로 남긴다.
이미 provider가 접수한 메시지는 회수하지
못하며 이력이 남는다.

구독 단위 advisory lock을 변경 API와 발송이 공유한다. 외부 발송 전에 상태
`sending`, 최초 시각, 시도 횟수, 고정 message body를 커밋한다. 프로세스가 접수 후
종료돼도 같은 event ID 기반 provider idempotency key와 body로 재시도한다. 429·5xx·
일시 네트워크 오류는 지수 backoff, 최대 8회다. 최초 시도 23시간 이후의 미확정 건은
`delivery_unknown`으로 멈춘다. 새 key로 무한 재발송하지 않는다. 기본 미설정은
`not_configured`이고 실제 발송을 수행하지 않는다. in_app 이벤트는 즉시
`available_in_app`으로 저장한다.

## 검증 재실행과 남은 검증

`tests/test_notifications.py`는 SSO·CSRF·페이지 상한·DTO·Resend 실제 요청 계약·
반환값·실패·미설정·연도 경계·만료·결측·단위·최초 여부를 검사한다.
`tests/test_notifications_integration.py`는 fixture SourceBatch → PostgreSQL → 평가
job → owner HTTP, 중복 평가/이벤트, read-only GET, 구독 소유권, 설정 충돌·취소,
제공처 revision, 미발송 오탐 정정·취소 후 정상 충족 재생성, 이미 발송/접수 미확정
이력의 재생성 차단, 429 후 같은 메시지 재시도, 키 보존 종료, 미설정 경로를 검사한다.
모든 fixture와 수신자는 테스트 대역이며 운영 데이터가 아니다.

root가 준비한 폐기 가능한 PostgreSQL 18 `pongdang_test` 설정을 사용하여 backend
디렉터리에서 다음 명령을 실행한다. production `.env`를 읽어 실행하지 않는다.

```text
python -m pytest -q tests/test_notifications.py tests/test_notifications_integration.py
ruff check app/auth.py app/notifications tests/test_notifications*.py
ruff format --check app/auth.py app/notifications tests/test_notifications*.py
```

실제 공식 관측에 대한 전체 연결 및 대표장소 mapping은 A1 공통 수집/매핑 검증 결과와
함께 판단한다. notification 테스트 대역 성공을 실제 데이터 또는 실제 발송 성공으로
보고하지 않는다. 연간 완전성 증명, 입수 안전 모델, SSO host header 설치, 실제 provider
수신 확인과 운영 활성화가 남아 있다. 필요한 자격증명이나 연간 검증자료가 제공되면
해당 단계만 별도로 검증한다.
