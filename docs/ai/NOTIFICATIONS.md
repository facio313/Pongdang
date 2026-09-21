# 첫 입수 수온 알림 연결 · 2026-09-21

- 최신 배치 보정: 수온은 지역명이 아니라 해변 이름 바로 옆에 둔다. 데스크톱 이름 옆의 중복 「해변」 분류를 수온으로 대체했고 모바일도 이름과 같은 줄로 맞췄다. 지역명은 아래 줄에 별도로 표시한다. lint·타입/build·관련 브라우저 6개 통과, 390px/1440px 이름·수온 좌표와 스크린샷 확인. 로그 first-swim-name-{lint,build,browser}.log.

- 최신 요청: 반복되는 첫 입수 문구를 해변마다 붙이지 않는다. 홈 해변 명소 제목과 같은 줄에 첫 입수를 한 번만 두고, 각 해변에는 수온만 짧게 표시한다.
- 완료: 모바일·데스크톱 제목은 「해변 명소 · 첫 입수」이며 각 해변의 이름 바로 옆에는 「22°C」 같은 수온 값만 표시한다. 수온 조회 중·조회 실패·미확인·갱신 대기는 짧은 상태로 구분한다. 카드마다 반복되던 첫 입수 문구·수영 아이콘과 섹션의 중복 안내 문장을 제거했다. 기존 사진·이름 링크로 해당 해변의 상세 안내를 본다.
- 데이터: 기존 읽기 전용 `water-temperature?spot_id={id}&mode=observation&page_size=1`을 사용한다. 홈에 표시되는 최대 4개 해변만 조회하고 공유 공개 자료 캐시를 사용한다. 예보·다른 장소·여러 관측의 임의 선택이나 평균으로 수온을 채우지 않는다. 관측 및 대표 관측소 연결의 유효기간이 지나면 수온을 표시하지 않는다. 개인 구독 상태는 상세에서만 조회한다.
- 상세: 같은 해변의 관측 수온, 관측소·출처, 관측 시각, 수온 유효 시각과 첫 입수 알림 기준·현재 구독 상태를 보여준다. 분류가 확인된 해변·계곡에만 표시하며 기존 section=first-swim 직접 링크를 유지한다. 안전 판정이나 올해 최초 입수일을 생성하지 않는다.
- 디자인: pongdang.css의 기존 글꼴·색상·카드·버튼과 pongdangUi.tsx의 수영 아이콘을 재사용한다. 데스크톱은 pongdangDesktop.css의 별도 토큰·괘선·버튼 규칙을 따른다. 홈 요약과 상세는 같은 수온 조회 훅을 공유한다.
- 이번 변경 파일: frontend/src/{HomePage.tsx,HomeDesktop.tsx,FirstSwimGuide.tsx,firstSwimGuide.css,useFirstSwimTemperature.ts,locales/notifications.ts}, frontend/tests/browser/first-swim-placement.spec.ts.
- 검증: 제목 정리 후 Node 24 frontend lint, 단위 테스트 138개, 타입 검사/build 통과. 모든 API를 가로채는 오프라인 브라우저 테스트 13개 통과(첫 입수 6개 + 기존 명소 상세 7개). 390px/1440px에서 제목의 첫 입수 문구 1회, 카드 내 같은 문구 0회, 해변별 수온·자료 상태, 상세 이동을 확인했다. 홈 스크린샷을 시각 확인했고 이번 변경 파일 6개는 검증본과 SHA-256 일치한다. 로그 first-swim-heading-{lint,unit,build,browser}.log, 파일 검증 first-swim-heading-verification.json. 백엔드 변경 없음.
- 실제 미리보기: http://127.0.0.1:5177/pongdang/#home 에 각 해변별 문구가 보인다. 현재 첫 4개 해변은 사용 가능한 관측 수온이 확인되지 않아 수온 미확인으로 표시된다. 로컬 SSO 미설정으로 개인 알림 조회는 연동 설정 안내를 표시하며, 이는 운영 로그인·발송 검증이 아니다.
- 미리보기/검증본: /var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-first-swim-placement-ackqsjvz/. Vite 5177(exec session 26410)는 기존 backend 8000을 사용한다. 이번 검증 중 다른 작업의 새 WebcamThumbnail 의존성이 검증본에 빠진 문제는 실제 파일 동기화로 해결했고, lint와 브라우저 결과 디렉터리 정리가 충돌한 문제는 순차 실행으로 해결했다. 제품 코드·테스트 기준을 완화하지 않았다. 통과 로그 per-beach-{lint,build,browser}-retry.log, per-beach-unit-final.log, 파일 검증 per-beach-source-verification.json.
- 스크린샷: output/playwright/first-swim-placement-20260921/first-swim-{home,detail}-{390,1440}.png. 명시적인 OFFLINE TEST 자료이며 운영 자료가 아니다. 테스트 서버는 종료됐고 커밋·푸시·운영 배포·외부 알림 발송·DB 변경은 하지 않았다.

- 요청: 사용자가 결정할 제품 동작을 질문하고 첫 입수 알림을 구현한다.
- 사용자에게 질문한 항목(아직 답변 없음): 구독 후 첫 기준 충족 또는 미달→충족 전환, 이메일/Web Push/앱 내 수신, 기준 변경 시 재알림 또는 장소별 연 1회.
- 기존 서버 동작은 답변 전까지 보존한다. 현재 동작은 구독 후 첫 평가에서 이미 기준을 충족해도 알림 생성, 설정 revision별 재알림 허용, 프런트 신규 구독은 in_app이다. 외부 발송·운영 설정 변경·배포 승인은 받은 적 없다.
- 공통 구현: 알림 전용 화면의 구독 목록·수정·해지, 최신 평가의 사유·관측 근거, 발생 이벤트·발송 상태·페이지, 60초/화면 복귀 시 조회. 모바일/데스크톱 오늘 화면은 같은 알림 요약을 쓰며 고정된 트리거 미연결 문구를 제거했다. 개인정보 응답은 전용 컴포넌트 메모리에만 저장한다. 영어·중국어·일본어 번역 포함.
- 백엔드: 소유권 조건을 유지하며 구독 GET에 장소·연도 필터와 장소 이름을 추가했다. HTTP 조회는 여전히 읽기 전용이며 평가·이벤트 생성을 수행하지 않는다.
- 의미: 수온 기준은 사용자 선호이며 안전 판정이 아니다. 관측 연결 없음·만료·결측을 표시하고 연간 최초 여부는 확정하지 않는다. 메일 provider accepted와 실제 수신 완료를 구분한다.
- 관련 파일: backend/app/notifications/{api,models}.py, backend/tests/test_notifications_integration.py, frontend/src/Notification*.tsx, notificationApi.ts, useNotificationResource.ts, notifications.css, locales/notifications.ts, App.tsx, FeatureDataPage.tsx, TodayPage.tsx, TodayDesktop.tsx, i18n.ts, tests/browser/notifications-flow.spec.ts.
- 기존 변경 보존: 작업 시작 시 docs/ai/CURRENT.md와 .byeori/·.playwright-cli/·output/가 변경 상태였다. 작업 도중 장소 상세·자료 갱신·웹캠 등 다른 작업 변경이 들어왔다. 공통 CURRENT.md는 덮어쓰지 않고 이 작업 파일에 따로 기록한다.
- 검증 환경: 새 PostgreSQL 18, 127.0.0.1:51695의 폐기 가능한 pongdang_test. 운영/기존 확인 DB 미사용. 임시 위치 /var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-notifications-test-cl9ucxxn/.
- 파일 접근 지연 때문에 검증은 배포 기준 ebf073a + 알림 변경 17개를 적용한 notification-checkout에서 진행한다. 실제 합쳐진 변경의 타입/빌드는 통과했지만 진행 중인 다른 기능의 lint·테스트 실패가 있어 알림 변경과 분리했다.
- 완료한 검증: 알림 격리본 frontend lint, 단위 테스트 123개, 타입 검사/build 통과. backend Ruff lint/format 및 전체 테스트 1,267개 통과, Docker 환경을 요구하는 2개 건너뜀. 관련 브라우저 테스트 16개(새 회귀 시나리오 6개 포함) 통과. 마지막 모바일 표·접근성·온도 단위 표시 수정 후 frontend 검사와 관련 브라우저 테스트를 다시 통과했다. 실제 작업 파일 17개와 검증본의 SHA-256이 모두 일치한다. 전체 혼합 작업 트리가 검증 완료되었다는 의미는 아니다.
- 실제 API 흐름 확인: 명시적인 OFFLINE TEST 데이터로 브라우저에서 구독 저장 → 첫 평가 대기 → run_notifications 실행 → 수온 기준 충족과 앱 내 이벤트 표시를 확인했다. 작업 결과 succeeded, 외부 발송 attempted=0. 390px/1440px 화면도 확인했으며 스크린샷은 output/playwright/notifications-20260921/{mobile,desktop}.png에 저장했다. 운영 데이터 확인 자료가 아닌 테스트 화면이다.
- 검증 중 환경 문제: 다른 작업의 스키마가 남은 첫 테스트 DB는 이 작업의 폐기 가능한 DB만 다시 만든 후 통과했다. Vite 의존성 심볼릭 링크의 폰트 경로 차단은 검증본에 의존성을 로컬 복사해 해결했다. 최종 브라우저 재검증의 uv PATH 누락도 수정한 후 통과했다. 제품 코드나 테스트 기준을 완화하지 않았다.
- 정리: 이 작업의 수동 브라우저·테스트 서버·임시 PostgreSQL 클러스터를 종료했다. 로그는 임시 위치의 notification-final-*.log, notification-backend-clean-tests.log, manual-in-app-job.json, notification-source-verification.json에 보존했다. 커밋·푸시·운영 배포·외부 알림 발송은 하지 않았다.
- 남은 제품 선택: 위 세 가지 사용자 답변에 따라 트리거·채널·재알림 정책을 확정한다. 이메일은 기존 Resend 어댑터와 SSO 검증 주소를 연결하고, Web Push 선택 시 별도 구독·서비스워커·전송 채널이 필요하다. 실제 외부 수신 검증은 대상 수신자·설정이 정해진 후에 수행한다. 홈·상세 배치 및 디자인 일관성에 관한 후속 요청은 완료했다.
