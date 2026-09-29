# 명소 첫 입수 자료 표시·운영 반영 · 2026-09-30

- 사용자 승인: 명소 목록에 첫 입수 자료 여부를 추가하고, 이 대화에서 완료한 홈·추천·명소 UI 변경을 운영에 반영한다. 현재 작업 브랜치 `fix/finale`에서 직접 `main`으로 통합한다. `dev`/`origin/dev`는 `0f824a9ccecbd7ed5332919c99b03920b769000c`를 보존한다.
- 목록의 점수 아래에 첫 입수 자료 상태를 표시한다. 기존 상세의 `useFirstSwimTemperature`를 재사용하며 현재 장소/대표 관측 자료 있음, 주변 자료, 이전 자료, 주변 이전 자료, 없음, 조회 중, 조회 실패를 구별한다. 주변 자료를 장소의 현재 알림 기준으로 표현하지 않는다. 현재 페이지 10곳만 기존 조회 큐·캐시로 읽는다.
- 검증: 변경 파일 ESLint·Node 227개·증분 TypeScript 및 `git diff --check` 통과. 기존 데이터 선택 시험에 실제/대표/주변/오래된 자료와 실패·조회 중 상태 표기 회귀 검증 2건 추가. 실제 격리 로컬 IAB에서 가진해변 주변 이전 자료, 갯마을해변/고원통계곡 자료 없음, 데스크톱·390px 모바일 10행·가로 넘침 없음·콘솔 오류 없음 확인. 로그 `.local/spots-first-swim-checks-20260930.log`, 화면 `output/playwright/spots-list-20260930/first-swim-{desktop,mobile}.png`.
- 원격 최신 `main`은 작업 브랜치 HEAD `1c59529`와 동일하며 기존 main worktree는 clean이다. 앞선 홈·추천·목록·상세의 통과한 검증을 재사용한다. 운영은 `main`의 두 이미지 빌드 성공 후 기존 호스트 watcher/gate로 반영하며, 임의 중복 배포나 수집 설정/DB 변경은 하지 않는다. 다음 단계는 정확한 배포 커밋·CI·운영 자산 및 화면 확인이다.

# 명소 상세 근거 보존·카드 UI · 2026-09-30

- 가진해변(5477)의 점수 공란과 상세 UI 9개 의견을 `fix/finale`에 반영했다. 추천 활동이 없는 경우 `best?.data`만 읽던 화면이 정상 응답의 근거도 버리고 ‘자료를 읽지 못했습니다’라고 표시하던 오류를 수정했다. `spotConditionDisplay`와 공용 `SpotConditionsCard`로 데스크톱·모바일을 함께 처리한다.
- 실제 로컬 응답은 `choice=null`, 수영·서핑의 필수 파고 없음으로 추천 제외 상태였다. 근처 고성 가진 관측소의 이전 수온 22.9°C만 있으며 기온·풍속·파고는 없다. 원응답의 76.8은 1/4개 근거로 산출한 수영 부분 점수라 대표 점수로 승격하지 않는다. 같은 시각의 예보 조회에도 표시할 추천 점수가 없었다. 조회 근거 `.local/spot-detail-recommendation-5477{,-forecast}.json`. 실제 자료 부족 자체는 UI 수정으로 해소되지 않았고 추가 수집·DB 변경은 하지 않았다.
- 점수가 유효하면 숫자·등급·게이지를 유지하고, 없으면 빈 게이지 대신 산정 보류/갱신 대기와 확보·결측 항목을 표시한다. ‘근거 보기’와 ‘퐁당 점수란?’은 오른쪽 한 줄로 배치하고 펼치면 원래 근거 전문을 읽는다. 공식 제한은 기존처럼 접지 않는다.
- 사진·조건 요약 아래에 넓은 정보 영역을 만들었다. 첫 입수 안내는 데스크톱 4열 카드(알림은 2칸), 모바일 2열로 정리했고 설명은 해당 카드에 넣었다. 운영부터 홈페이지까지 8개 정보도 4열/2열 카드로 바꿨다. 중복 수온 안전 안내는 별도 알림 하단에서 제거하고 ‘내 수온 기준’ 카드에 한 번만 남겼다.
- 검증: 지정 파일 ESLint·Node 225개·증분 TypeScript 통과, `git diff --check` 통과. 회귀 테스트는 추천 없음에도 근거 보존·제외된 부분 점수 미표시·유효한 0점 보존을 확인한다. 실제 IAB에서 가진해변의 산정 보류·22.9°C·결측 항목·설명 펼침, 경포해수욕장(7)의 64.7점과 게이지, 1440px 4열과 390px 2열·가로 넘침 없음·콘솔 오류 없음을 확인했다.
- 검증 로그 `.local/spot-detail-{cards-checks,cards-final-checks,mobile-checks}-20260930.log`, 화면 `output/playwright/spots-detail-20260930/{desktop-detail,mobile-detail,scored-place}.png`. 임시 검증 탭을 닫고 뷰포트 제한을 해제했다. 이전 미커밋 변경은 보존했고 이번 커밋·푸시·운영 배포는 하지 않았다.
- 후속 요청: 상세 사진과 점수 카드를 같은 그리드 행에 놓아 너비·위끝·아래끝이 일치하도록 수정했고 액션은 별도 행으로 옮겼다. 공공누리 1유형 사진은 비율을 유지하며 프레임을 채우고, 원본 유지가 필요한 사진의 contain 규칙은 유지한다. 실제 1280px에서 두 영역 모두 596×596.9px, 설명을 펼쳐도 동일 높이, 1180px에서는 세로 배치·가로 넘침 없음을 확인했다. 지정 파일 검사·Node 225개·증분 TypeScript 통과; `.local/spot-detail-alignment-checks-20260930.log`, 화면 `output/playwright/spots-detail-20260930/aligned-photo.png`.
- 첫 입수 안내의 장소별 차이는 읽기 전용으로 확인했다. 현재 해변·계곡에만 노출되며, 고원통계곡(5289)은 실제 수온 관측 없음 안내와 기준/알림 카드만 표시하고 관측 메타데이터 카드는 생략한다. 카페 테일(5408)은 첫 입수 안내가 없다. 화면 `output/playwright/spots-detail-20260930/valley-guide.png`. 이 분기와 수온 조회 동작은 변경하지 않았다.

# 명소 목록 10개 페이징·표시 정리 · 2026-09-30

- 후속 점수 표시 요청: 데스크톱·모바일 목록의 화살표 옆에 `SpotListScore`를 추가했다. 현재 10행만 기존 `useRecommendation` 캐시·동시 조회 제한으로 읽고 상세와 같은 `spotConditionDisplay`의 선택된 유효 활동 점수를 표시한다. 숫자와 활동 기준·이전 자료 여부, 점수 없음·조회 중·실패를 구별하며 항목 전체 링크의 접근성 설명에도 연결했다. 목록에 점수를 싣지 않는다는 기존 안내는 갱신했다.
- 점수 표시 검증: 지정 파일 ESLint·Node 225개·증분 TypeScript 및 `git diff --check` 통과. 실제 격리 로컬 IAB에서 가진해변 점수 없음·감추해변 51.3점과 상세 일치·이전 자료 표시·10행·390px 가로 넘침 없음·콘솔 오류 없음 확인. 로그 `.local/spots-list-score-{checks,style-checks}-20260930.log`, 화면 `output/playwright/spots-list-20260930/list-scores-{desktop,mobile}.png`. 검증 탭 종료·뷰포트 복원. 수집 설정/DB·커밋·푸시·배포는 변경하지 않았다.
- 사용자 요청 4항목을 `fix/finale`에 반영했다. 명소 목록은 실제 `/places?page_size=10`으로 조회하며 데스크톱·모바일 모두 10곳씩 표시한다. 기존 페이지 컨트롤을 유지하고 목록/지도 사이 페이지 크기가 달라도 보던 장소 범위가 어긋나지 않도록 저장된 페이지 크기로 환산한다. 다른 목록 조회의 기본 100행 상한은 유지한다.
- 목록 오른쪽의 빈 점수·‘상세에서 조회’·‘상세’ 중복 표시를 제거했다. 후속 요청으로 데스크톱·모바일의 항목 전체를 장소명이 포함된 접근성 이름을 가진 단일 상세 링크로 바꾸고 화살표는 장식으로 유지했다. 사진·본문·여백 클릭 및 키보드 진입을 지원한다. 좌표는 유효한 실제 위도·경도를 목록에서 소수점 2자리로 표시하며 원본 좌표는 유지한다. 모바일의 주소·운영 안내·좌표는 서로 다른 줄로 정리했다.
- 명소 목록 사진 누락/로딩 실패에는 기존 공용 바다 또는 새 공용 계곡 이미지를 표시한다. 실제 사진 우선·공용 이미지 라벨을 유지한다. 계곡 생성 경위·프롬프트: [이미지 기록](../design/common-valley-image.md).
- 로컬 검증: 지정 변경 파일의 ESLint·증분 TypeScript와 Node 223개 테스트 통과. 후속 모바일 CSS 수정은 전용 검증 및 실제 390px 화면 확인 완료. `git diff --check` 통과. 기존 브라우저 회귀 명세를 10행 계약으로 갱신했으나 Playwright 테스트 러너는 실행하지 않았다.
- 전체 항목 링크·좌표 2자리 후속 변경도 지정 파일 ESLint·Node 223개·증분 TypeScript 및 `git diff --check` 통과. 실제 IAB에서 본문 클릭→상세→뒤로가기, 모바일 Enter 진입, 데스크톱 Tab 초점과 중첩 링크 없음·좌표 `38.37, 128.51`을 확인했다. 검증 로그 `.local/spots-row-link-checks-20260930.log`.
- 후속 시각 요청: 명소 행 hover에 둥근 파란 테두리·은은한 네온 그림자·180ms 전환을 적용했다. 사진과 선이 겹치지 않도록 좌우 안쪽 여백을 데스크톱 14px·모바일 8px로 확보했다. 실제 IAB에서 hover 행만 강조·높이 유지·390px 가로 넘침 없음 확인. CSS 지정 검증 Node 223개·`git diff --check` 통과; 로그 `.local/spots-neon-hover-checks-20260930.log`, 화면 `output/playwright/spots-list-20260930/row-neon-hover.png`.
- 실제 IAB: 1/16페이지 10곳, 2페이지 이동, 화살표 상세 진입·뒤로가기 시 2페이지 유지, 16/16페이지 1곳·다음 비활성, 지역/분류/검색 변경 시 1페이지, 390px 목록 10곳·가로 넘침 없음, 거진1리해변 공용 바다·대산계곡 공용 계곡 이미지 실제 로딩 확인. 증빙 `output/playwright/spots-list-20260930/`. 기존 격리 로컬 API만 사용하고 운영/로컬 취향·코스 저장은 하지 않았다. 검증 탭을 닫고 뷰포트 제한을 해제했다.
- 직전 단순 후속 요청으로 `RouteCandidatesForm.tsx`의 계산 버튼 위 제목·출발지 설명을 제거했다. 해당 변경도 지정 파일 검사·Node 221개·TypeScript 통과 상태이다.
- 앞선 홈·추천 수정 및 기존 작업을 보존했다. 커밋·푸시·운영 배포는 아직 하지 않았다.

# 홈·추천 취향 흐름 수정 · 2026-09-30

- 사용자 요청 5항목을 로컬 `fix/finale`에 반영했다. 비로그인 홈 취향 CTA는 기존 로그인 팝업을 여는 ‘로그인’ 버튼이며, 로그인 후 취향 유무에 맞는 링크로 갱신된다. 데스크톱·모바일 모두 적용했다.
- 홈 해변 사진은 실제 등록 사진을 우선하고, 메타데이터 누락·이미지 요청 실패 때 생성한 공용 바다 WebP로 대체한다. 화면에 ‘공용 바다 이미지’를 표시한다. 생성 도구·최종 프롬프트는 [이미지 기록](../design/common-beach-image.md)에 보존했다.
- 취향이 없으면 추천 첫 선택 단계로 바로 진입한다. 암묵적인 이전 코스가 취향 선택을 건너뛰지 않으며 명시적 plan_id 코스 링크는 유지한다. 추천 지역 선택은 ‘시작’에만 남겼고 마지막 ‘고른 항목’은 여백·구분선·작은 요약 태그로 구별했다.
- 검증: 변경 파일 대상 `ops/verify_local.py`의 ESLint, Node 단위 테스트 221개, 증분 TypeScript 통과. `git diff --check` 통과. 회귀용 브라우저 명세 7건을 추가하고 기존 진입 기대값을 수정했으며 브라우저 테스트 러너 자체는 실행하지 않았다.
- 실제 IAB 검증: 익명 홈 팝업·취소, 격리 테스트 로그인 후 CTA 갱신, 390px/데스크톱 취향 미설정 첫 단계, 저장 취향 재선택 및 유지, 지역 선택 1개, 5단계 요약 간격 28px·구분선, 사진 없음·404 대체·정상 원본 유지. 실제 홈의 사진 없는 순개울해변도 대체 표시를 확인했다. 증빙 `output/playwright/home-preference-20260930/`.
- 테스트는 기존 loopback/명시적 폐기용 `pongdang_test`만 사용했다. 취향은 보호된 로컬 API로 백업 후 비웠다가 원본과 동일하게 복원했고 로컬 로그인도 복원했다. 운영 계정·DB·원래 브라우저 탭은 변경하지 않았다. 임시 사진 검증 페이지 2개를 제거하고 뷰포트 제한을 해제했다.
- 이 변경의 커밋·푸시·운영 배포는 아직 하지 않았다. 기존 로컬 운영 기록과 `.byeori/`, `.playwright-cli/`, `output/`을 보존했다. 제품 코드 변경 후 위 검증을 통과했으므로 배포 시 관련 변경이 없으면 같은 검사를 반복하지 않는다.

# 지도 안정화·로그인 팝업 운영 반영 확인 · 2026-09-29

- 사용자 후속 승인: 커밋·푸시를 마친 ab3df2e5c89d3921efcf3eaa864ad5f0767dc950을 운영까지 배포한다. 원격 main 13544e4 및 기존 main worktree의 clean 상태를 확인하고 해당 worktree에서 fast-forward 후 main만 push했다. fix/finale·main이 같은 커밋이며 dev 0f824a9ccecbd7ed5332919c99b03920b769000c는 보존했다.
- 제품 코드 추가 변경 없이 이미 통과한 ESLint·Node 221개·증분 TypeScript·격리 로컬 UI 검증을 재사용했다. 이번 배포로 로그인 팝업, 편집 중 점수 유지, 지도·마커 재사용과 편집 시 위치/확대 유지가 함께 반영된다.
- CI https://github.com/facio313/Pongdang/actions/runs/36552020749 에서 정확한 ab3df2e SHA의 backend/frontend 이미지가 모두 success(18:53 KST)였다. 기존 호스트 watcher/gate 경로만 사용했고 중복 수동 배포나 호스트 설정 변경은 하지 않았다.
- 운영 확인(18:55 KST): https://pongdang.site/ 의 프런트 JS가 index-D55ckEj3.js에서 index-BTWsXv_M.js로 바뀌었다. 새 번들의 preserveViewport/hasFitted/boundsKey, 코스 인증 확인 요청, 저장된 점수 기준 문구를 확인했다. 프런트·JS/CSS·health·ready 모두 HTTP 200, health/ready는 status ok였다.
- 실제 운영 IAB에서 비로그인 상태로 ‘코스 경로’를 눌러 기존 로그인 팝업이 자동으로 열리는 것을 확인했다. 운영 계정 로그인·코스 생성·수정은 하지 않았고 원래 로컬 편집 화면을 보존했다. 화면 output/playwright/map-stability-release/production-login-popup.png, 기계 증빙 .local/release-map-stability-20260929/{before,public-verification,state}.json.
- 검증 범위는 정확한 CI 커밋 및 공개 운영의 새 자산·동작·상태 API이다. 서버 내부 current 링크·컨테이너 SHA·watcher 상태를 직접 조회한 것으로 보고하지 않는다. 배포 후 이 기록은 추가 문서 전용 CI 없이 로컬에 보존한다.

# 서버 운영 기록 main 통합 · 2026-09-29

- 사용자 요청: 남은 Pongdang 변경을 커밋하고 main에 푸시한다.
- 원격 main `ab3df2e`까지 fast-forward하고 이 파일의 로컬 추가 기록 331줄과
  운영 작업 문서 3개를 함께 보존했다. 변경 범위는 문서 4개이며 제품 코드 변경은 없다.
- 검증: 명시한 4파일의 `ops/verify_local.py`는 문서 전용으로 실행할 코드 검사가
  없음을 확인했다. `git diff --check`, 문서 링크 17개, 원격 기록 보존 검사를 통과했다.
- 통합 전 로컬 원본은 stash `bda5019f6fccf1664aed6c36b3503887e65e33a1`에 보존한다.
  dev 및 origin/dev는 `549c0b5`를 유지하며 main의 기존 CI·자동 배포 경로를 따른다.

# 코스 재계산 Origin 오류 · 운영 설정 교정 완료 · 2026-09-29

- 재계산 시 `ORIGIN_NOT_ALLOWED` 원인 확인: `/home/cks/.config/pongdang/production.env:20`과
  실행 중 backend의 `SSO_ALLOWED_ORIGINS`가 `https://bonifacio.work,https://pongdang.sit`였다.
  실제 서비스 주소 `https://pongdang.site`의 마지막 `e`가 누락됐다. GET은 이 검사를
  생략하므로 저장 코스 조회와 POST/PUT 재계산·저장의 결과가 달라진다.
- 사용자 승인 후 해당 값만 `https://bonifacio.work,https://pongdang.site`로 교정했다.
  배포 잠금 안에서 원격 main/current 일치, 다른 설정 불변, 기존 이미지 ID 일치를 확인하고
  backend만 `--no-deps --no-build --pull never`로 재생성했다. 실행 중 설정 반영 확인 완료.
- 기존 설정 백업: `/home/cks/.local/share/pongdang-deploy/backups/origin-fix-20260929-VU2x9c/production.env`.
  원본과 백업 모두 cks:cks 0600 유지. frontend·collector·DB 컨테이너 ID는 전후 동일하다.
- 운영 비밀·DB·네트워크를 쓰지 않는 인증 의존성 검사 10건 통과: 기존 오류 재현,
  정상 주소 POST/PUT 허용, 기존 보조 주소 유지, 오타·외부·누락 Origin과 cross-site·미인증 차단.
  실제 로그인 후 경로 재계산은 미검증이다.
- 적용 후: release/main `13544e4fac84e50bf4fc1147732035323b8096a6` 유지, 앱 4컨테이너 healthy,
  로컬 readiness ok·공개 홈/ready HTTP200·비로그인 코스 조회 HTTP401 확인.
  로컬 main·기존 변경·dev refs 보존, 코드 수정·커밋·push·CI 실행·이미지 빌드 없음.
  공용 SSO와 운영 DB·볼륨은 변경하지 않았으며 아래 기존 기록을 유지한다.

# Pongdang SSO 통신 복구 · 2026-09-29

- 사용자 연결 복구 요청에 따라 Pongdang 전용 OAuth의 내부 HTTP 주소 고정 설정을
  제거하고 토큰·공개키·사용자 정보 주소를 기존 SSO의 공개 HTTPS로 전환했다.
  호스트 설정 두 파일 백업 후 `pongdang-oauth2`만 같은 이미지로 재생성했다.
- 설정 검사, 실제 OAuth→SSO 토큰 요청 도달 및 기존 클라이언트 인증, 공개키 응답,
  앱 readiness/홈200·비로그인 개인 API401을 확인했다. 앱4컨테이너와 domain-auth는
  재시작하지 않았고 healthy 유지. 앱 release `d18bebc`와 dev refs도 그대로다.
- 13:45 KST 사용자가 새로 제공한 정상 계정으로 Chromium 실제 로그인 성공.
  login200, 팝업 닫힘, auth/state200·authenticated=true 및 로그인 후 알림 구독·이력
  GET200을 확인했다. 연결 복구와 실제 로그인·개인자료 재조회까지 검증 완료했다.
  백업·적용·검증 상세는 [기존 SSO 작업 기록의 9/29 후속 절](livecam-inline-sso-20260928.md)을 참조한다.
  공용 SSO·계정·권한·운영 DB 변경 및 커밋·push·앱 재배포는 하지 않았다.

# 라이브캠·페이지 내 SSO 로그인 진행 · 2026-09-28

- 현재 요청과 진행: [livecam-inline-sso-20260928.md](livecam-inline-sso-20260928.md).
  라이브캠26개 이미지 저장, 운영 홈3/3·목록26/26 표시 확인. 로그인은 기존 아이디/비밀번호
  모달과 비동기 SSO 경로를 main/운영 `fc463e6`에 배포(CI36383684822 성공)했다.
  실제390/1440 모달·취소 확인. 제공 계정 중앙1FA401로 실제 로그인 성공·개인자료 재조회는
  사용자 정상계정 확인 대기 중이며 아직 전체 목표 완료로 처리하지 않는다.
  9/28 15:03 KST 같은 차단 조건 연속3회 확인 후 목표 blocked로 전환했다.
  오늘 데이터·미래7일 및 아래 기존 작업 기록을 보존한다.

# bounded retention 운영 적용 · 2026-09-28

- 사용자 승인 범위와 현재 상태: [bounded-retention-20260927.md](bounded-retention-20260927.md).
  오늘~미래 7일 최신 결과와 필요한 근거를 보존하며 무한 계산 이력 누적을 정리한다.
  **9/28 02:45 KST 누적분 정리·승인된 물리 파일 축소·실사이트 확인 완료.**
  main/운영 `21c0782c2e69f0492f5b01a2623bd261f348af81`, CI36337623296 두 이미지와
  watcher 배포 성공. 후속4파일 lint/format·폐기용DB 관련20tests 통과.
  파일48,531,535,551→2,194,421,439bytes(약46.34GB/95.48%회수; 새계산 포함).
  전체 검증된 백업 보존. collector 정상복구,4컨테이너healthy,health/ready200.
  evidence 자동작업17:43:28Z 성공/398325행/다음1시간/failures0. 최종보존검증
  evidence완료·condition창외0·WI5표obsolete없음·최신참조온전함 모두통과.
  실제 pongdang.site 추천200/gen771/관측9월28일02:28/휴식60.5 확인.
  비로그인preferences401 외 API오류없음. 인증 후 개인조회 미검증은 아래 기존 기록 유지.
  아래 기존 작업 기록은 보존한다.

# 운영 수정·배포 완료 · 점수 갱신·OAuth 연결 · 2026-09-27

- 결과: [production-fixes-20260927.md](production-fixes-20260927.md).
  main/운영 `51b4a3c`, CI·자동 배포 성공. 점수 generation756 게시 및 실제 홈
  9월27일20:35/휴식69.4 확인. 로그인 연결·취소·실패 확인; 제공 계정은 중앙 SSO
  1차인증401로 로그인 후 개인조회 미검증. 기존 아래 기록은 보존한다.

# 운영 DB 메모리·성장 진단과 조치 — 2026-09-24

- 요청에 따라 origin의 main만 명시적으로 fetch하고 local main을
  `308070dd848f6d5a369e5c3c061f902ca7f58696`까지 fast-forward했다.
  main/origin-main은 0/0이다. 기존 이 파일의 로컬 기록은
  `/home/cks/backups/pongdang-main-update-20260924/CURRENT.local.md`에도 보존한
  뒤 최신 main의 기록과 함께 유지했다. dev ref, commit, push, CI dispatch는
  건드리지 않았다. 해당 SHA의 Actions `35864993519`와 자동 배포는 이미
  성공했고 운영 앱 세 컨테이너는 같은 SHA로 healthy다.

## 운영 반영 결과

- 원인 완화 6파일을 `217e39a6ddb25087552fc669d8652e7aed8d97e1`
  (`fix: bound condition refresh and water index history`)로 main에 push했다.
  Actions `35905089085`의 frontend/backend 이미지 빌드와 자동 deploy가 모두
  성공했다. current는 이 SHA, previous는 `308070d`이며 두 릴리스 모두 schema
  v20과 `condition_result` reader다. 실행 중인 frontend/backend/collector 태그도
  새 SHA이고 Pongdang 네 컨테이너와 `/api/ready`가 healthy/ok다.
- 폐기 전 `condition_snapshot` 251,660행, 최대 generation572, 2,939,174,912
  bytes를 확인했다. 최신 게시 generation619/108,286행과 nonempty
  `condition_result`가 있어 명시적 안전조건을 통과했다.
- 레거시 테이블만 custom-format zstd archive로 백업했다. 경로는
  `/home/cks/.local/share/pongdang-deploy/backups/condition-snapshot-20260923T185142Z/condition_snapshot.dump`이고
  cks 소유 0600, 33,724,808 bytes다. TABLE/TABLE DATA TOC, 전체 pg_restore
  stream, SHA-256 재검증이 모두 성공했다.
- 첫 retirement 시도는 새 배포 직후 정상 `condition_projection`이 결과 advisory
  lock을 보유해 SQLSTATE55P03으로 전부 rollback됐다. 해당 게시가 generation619로
  성공하고 잠금이 해제된 뒤 같은 검증 CLI를 다시 실행해 정확히 251,660행을
  truncate했다. 이후 legacy는 0행/16KiB이고 `condition_result`는
  425,685행/약2.94GB로 유지된다.
- 같은 spot7/swim/observation 고정 as_of의 전후 응답은 화면·점수·근거·게시 결과가
  동일하다. 동시 수집으로 `latest_source_revision` 메타만 197769에서197778로
  증가했다. readiness와 컨테이너 health, archive checksum을 다시 확인했다.

## 확인된 원인

- 호스트 디스크는 235GiB 중 약45% 사용, 약125GiB 가용이고 inode도 약17%
  사용이라 현재 디스크 부족이 아니다. 호스트 메모리도 약5.3GiB available,
  활성 memory PSI 거의0, DB OOM/OOM-kill 0이다.
- DB cgroup의 raw `memory.current`는 2GiB 상한에 붙지만 anon은 약16MiB이고
  약2.06GB가 관계·임시파일 page cache다. Monitor의 inactive-file 보정 working
  set은 최근 약63--65%였다. 즉 host RAM 고갈이나 heap leak은 아니지만,
  2GiB cgroup 안에서 반복 reclaim이 발생하는 실제 cache 압력이다. 3GiB 증설은
  임시 완화일 뿐 근본 해결이 아니므로 적용하지 않았다.
- routine source revision마다 600초 예약을 우회해 약5--6분 걸리는 전체 조건
  세대(약10만--13만 wide JSON)를 끝난 직후 다시 임시 COPY/비교했다. 최근
  세대의 80--90%가 재사용인데도 전체 stage를 매번 만들기 때문에 temp I/O,
  page cache와 checkpoint/WAL 압력을 만든다.
- `water_index_input_manifest`와 `water_index_assessment`는 합계 약19GB의 immutable
  이력이다. 평가 fingerprint가 실제 계산에 쓰지 않는 `collection_station`의
  `fetched_at` heartbeat까지 포함해, 같은 원자료 재수집도 새 manifest와
  assessment를 계속 만들었다. 이 경로에는 retention이 없다.
- v20이 더 쓰지 않는 `condition_snapshot`은 진단 당시 약2.94GB/251,660행이었다. 운영은
  schema20, legacy max generation572, 최신 result generation은 그보다 새롭고
  nonempty라 소스의 명시적 retirement 안전조건을 모두 충족했다. 승인 전에는
  변경하지 않았고, 위 백업·배포·검증 뒤 명시적 retirement로 회수했다.

## 구현과 검증

- `projection_urgent`를 분리했다. routine source 변경과 KST 날짜 전환은 기존
  durable 600초 일정까지 합치고, 현재 모델의 게시 결과가 전혀 없거나 hard
  revoke/correction이 최신 게시 revision보다 새로울 때만 즉시 우회한다.
  manual force/refresh, 실패 backoff, 원자적 publish는 유지한다.
- Water Index 평가 fingerprint를 실제 의존값인 group identity, snapshot, 해당
  mode metric, mapping, activity authority, model provenance로 한정했다. station
  heartbeat와 반대 mode metric은 제외하고 실제 값·mapping·authority 변경은
  계속 새 이력을 만든다. 배포 첫 실행에는 기존 digest 형식과 달라 active
  group별 전환 이력 1회가 생길 수 있고 이후 동일자료 poll부터 안정된다.
- 별도 loopback `127.0.0.1:55439/pongdang_test`, PG18 tmpfs에서 변경6파일을
  명시한 `ops/verify_local.py`를 실행했다. Ruff check/format과 관련 통합
  47개가 통과했다(기존 deprecation warning2개). 폐기용 컨테이너와 데이터는
  제거했고 포트 해제를 확인했다. 운영 DB·볼륨·컨테이너는 변경하지 않았다.

## 완료 상태와 후속 범위

- 코드 push·CI·자동 배포와 legacy snapshot 백업·회수·대표 GET 검증까지 완료했다.
  `docs/ai/CURRENT.md`의 기존 로컬 기록은 의도적으로 커밋하지 않았다. dev와
  origin/dev는 기존 `549c0b5`를 유지한다.
- immutable Water Index의 장기 보존기간/partition·archive·payload 정규화는
  임의 DELETE가 아니라 제품 이력 계약을 먼저 정한 후 후속 작업한다.

---

# 지도 코스 순서 편집 시 지도 재생성 제거 · 2026-09-29

- 후속 Git 요청: 사용자가 로그인 팝업·점수 유지·지도 재생성 제거 변경의 커밋과 푸시를 승인했다. 대상은 현재 fix/finale 및 origin/fix/finale이며 main/dev 통합·운영 배포는 이번 요청에 포함하지 않는다. 아래 검증 이후 제품 코드 변경이 없어 통과한 결과를 재사용한다. 커밋 범위는 관련 프런트·회귀 테스트 5파일과 이 상태 기록으로 한정한다.
- 요청: 방문 순서를 바꿀 때 지도가 리프레시되는 현상 제거. 원인은 KakaoMapCanvas가 markers/paths 변경마다 기존 지도와 자식 DOM을 제거하고 SDK Map을 새로 만들던 수명 관리였다.
- 구현: kakaoMapScene이 지도 인스턴스를 유지하며 장소 ID별 마커 DOM·오버레이를 재사용한다. 좌표가 바뀐 마커만 이동하고, 제외된 마커와 변경된 도로선만 정리한다. 지도는 화면 이탈·명시적 재시도에서 정리한다. MapDesktop은 코스 편집 중 preserveViewport로 위치·확대와 자동 화면 맞춤을 유지한다. 지점/코스 보기 전환은 별도 key로 새 화면에 맞게 초기화한다. 이전 로그인 팝업·점수 유지 수정 보존.
- 검증: 지정 4파일 ops/verify_local.py의 ESLint·Node 221개(새 회귀 4개 포함)·증분 TypeScript 통과, 최종 4.9초. diff --check 통과. 로그 /tmp/pongdang-map-preserve-view-checks.log. 회귀는 지도/마커/도로 재사용, 좌표 변경·제외 처리, 유효 도로선·패널 여백, 정리를 검증한다.
- 실제 IAB: 50m로 확대 후 방향키 순서 변경 전후 배경 타일 URL·화면 좌표가 정확히 동일했다. 저장된 5구간 경로의 첫 편집도 타일과 50m 축척 유지, 이전 도로선만 5→0. 체크 제외 시 위치·점수 유지, 지점 보기 100마커·확대 버튼 8km→4km, 편집 코스 복귀 후 4곳+출발 마커·100m 화면 맞춤 확인. 마우스/터치 순서 제스처 성공을 새로 검증한 것은 아니다.
- 원래 사용자 편집 순서 경포→강문→사근진→순개울·4곳 포함 상태로 복원했다. 실제 코스 계산·저장·DB 변경·커밋·push·운영 배포 없음. 증빙 .local/map-preserve-view-verification.json 및 output/playwright/map-preserve-view/{reordered-zoom-retained,final-course,course-editor}.png. 변경 파일은 KakaoMapCanvas.tsx, kakaoMapScene.ts, MapDesktop.tsx, kakaoMapScene.test.mjs와 이 기록이다.

# 지도 코스 로그인 팝업·점수 영역 유지 · 2026-09-29

- 요청: 비로그인 상태에서 ‘코스 경로’를 누르면 기존 로그인 팝업을 열고, 코스 순서를 편집해도 상단 휴식 적합도 영역을 유지한다.
- 구현: MapDesktop의 코스 전환 클릭에서 인증이 필요한 코스 목록을 1건 조회하여 현재 세션을 확인한다. 401은 기존 useAction 로그인 팝업으로 연결하고, 그 밖의 오류는 패널에 표시한다. 로그인 확인과 경로 계산의 진행 상태를 분리하여 인증 조회 중 ‘계산 중’으로 바뀌지 않게 했다. 새로운 인증 방식이나 백엔드 변경 없음.
- 점수: 편집 중에도 저장 코스의 첫 장소·점수·예보 시각을 유지하며 기준 문구를 ‘저장된 첫 장소’로 바꾼다. 새 경로 저장 성공 후에만 새 장소·시각 기준으로 갱신한다. 순서 변경에 따른 이전 경로선·이동 시각의 초기화는 그대로 유지한다. 영어·중국어·일본어 문구 포함.
- 검증: 명시한 MapDesktop.tsx·locales/places.ts의 ops/verify_local.py에서 ESLint·Node 217개·증분 TypeScript 통과(최종 7.0초). git diff --check 통과. 로그 /tmp/pongdang-map-login-score-checks.log.
- 실제 IAB: 로그인 상태의 코스 버튼은 팝업 없이 유지. 격리 DB 127.0.0.1:62022/pongdang_test의 표식과 isolated-local-test 응답을 확인한 뒤 테스트 세션만 만료시켰다. 기존 선택 코스와 지점 보기에서 코스 버튼을 각각 눌러 로그인 팝업 자동 열림·닫기·재열림을 확인하고, 기존 격리 계정으로 로그인하여 같은 코스 URL로 복귀했다. 방향키로 강문을 두 번째로 옮겨도 강문 45점·16:05 예보와 점수 영역 높이 77.546875px가 유지됐다. 전체 체크 해제에도 점수 유지·빈 선택 계산 불가 확인. 이 작업에서는 마우스·터치 제스처 검증을 주장하지 않는다.
- 원래 로그인 상태와 저장 코스 c7517cce8c37496aa7ede9ac3adabc18을 새로고침으로 복원했다. 코스 계산·저장·DB 변경·커밋·push·추가 운영 배포 없음. 기존 배포는 아래 13544e4 기록을 따른다. 근거 output/playwright/map-login-score/{reordered-score,login-popup}.png. 변경은 프런트 2파일과 이 기록이며 기존 사용자 변경·산출물을 보존했다.

# 지도 코스 편집 운영 반영 확인 · 2026-09-29

- 사용자 승인: 방금 완료한 지도 코스 방문 선택·순서 편집·동일 코스 저장 기능을 운영에 배포한다. 제품7파일과 이 상태 기록만 커밋하며 .env·.local·.byeori·.playwright-cli·output은 제외한다.
- 원격 main을 명시 fetch한 결과 직전 배포 da88667e81d0c4f8737461f8e38dffeceda27595와 동일하다. 기존 main worktree도 같은 SHA·clean이며 fast-forward 통합한다. dev의 로컬·원격 참조0f824a9ccecbd7ed5332919c99b03920b769000c는 보존한다.
- 로컬 구현 이후 코드 변경이 없어 아래의 ESLint·Node217개·증분 TypeScript·실제 카카오 계산/저장/새로고침 결과를 재사용한다. 운영 전 프런트는 index-L5UE0_oV.js/index-DM4wCVr7.css이며 health/ready는HTTP200/status ok. 근거 .local/release-course-editor-20260929/before.json.
- 8파일을 13544e4fac84e50bf4fc1147732035323b8096a6으로 커밋하고 기존 main worktree에서 fast-forward 후 main만 push했다. staged 전체 내용에서 로컬 실제 API 키·비밀번호 일치0건 확인. GitHub 원격 main 동일SHA·dev 기존SHA 보존 확인. CI https://github.com/facio313/Pongdang/actions/runs/36536864960 에서 정확한 SHA의 backend/frontend 이미지가 모두 success(16:29 KST)였다.
- 운영 확인(16:31 KST): https://pongdang.site/ 가 index-D55ckEj3.js/index-CVYEVlqj.css를 제공한다. 새 JS의 코스 편집·선택·손잡이 및 CSS의 순서 이동 스타일, 기존 출발지 select 제거를 확인했다. 프런트/두 자산/health/ready 모두HTTP200, health/ready는status ok. 근거 .local/release-course-editor-20260929/{before,public-verification,state}.json.
- 기존 호스트 watcher/gate의 자동 경로만 사용했고 수동 중복 배포·호스트 설정 변경은 하지 않았다. 운영 코스 데이터를 생성·수정하거나 로컬 테스트 자료를 이관하지 않았다. 서버 내부 current·컨테이너 SHA·watcher 상태는 직접 조회하지 않았으며 공개 운영에서 확인한 새 코드와 상태 API를 검증 근거로 삼는다. 배포 후 이 기록은 추가 문서 전용 CI 없이 로컬에 보존한다.

# 지도 코스 방문 목록 편집 · 2026-09-29

- 사용자 요청: 오른쪽의 출발지 드롭다운과 경로 설정 제목을 제거하고, 추천 화면처럼 방문 번호 토글·전체 선택·손잡이 순서 변경으로 편집. 기존 재계산 버튼으로 편집 결과를 같은 코스에 저장하고 왼쪽 목록에도 반영한다.
- 구현: MapDesktop의 편집 상태는 저장된 코스 ID·revision에 묶는다. 체크한 첫 장소를 출발지로 삼고 서버 후보 rank를 사용자의 순서에 맞춰 preserve_order=true로 전달한다. 추천의 useCandidateReorder 포인터·방향키 동작을 재사용하며 CSS는 지도 패널에 맞춘다. 편집 중에는 이전 도착 시각·도로선·예상 시간·점수를 숨긴다. 빈 선택은 계산 불가. 제외한 장소는 저장 전까지 다시 체크할 수 있고 저장 성공 후 방문 목록에서 빠진다.
- 저장: 계산과 기존 plan_id PUT이 모두 성공한 후에만 세션과 목록을 갱신한다. 계산 실패·저장 실패 시 기존 저장 코스를 덮어쓰지 않는다. 기존 revision 충돌 검사 유지. 모바일은 기존 방문 순서 최적화 방식을 유지한다.
- 검증: 명시한 수정 파일 ops/verify_local.py의 ESLint·Node217개(새 회귀5개 포함)·증분 TypeScript 통과(8.3초), diff --check 통과. 로그 /tmp/pongdang-map-course-edit-checks.log. 첫 검사에서 ref를 포함한 객체의 전달을 lint가 거부하여 핸들러와 ref를 분리한 뒤 통과했다.
- 실제 IAB: 전체 선택/해제와 빈 선택 비활성화, 순개울 제외, 방향키로 사근진을 첫 장소로 이동, 이전 경로선·시각 숨김 확인. 명시적 격리 DB127.0.0.1:62022/pongdang_test 표식을 검증한 뒤 기존 실제 코스를 임시 복사하여 카카오 경로 계산·동일 ID 저장·새로고침을 확인했다. 사근진→강문→경포3곳, revision1→2, 출발지 사근진, 이동18분·도로선3구간 저장 및 왼쪽 목록 반영. 원본 c7517cce8c37496aa7ede9ac3adabc18의 전체 payload 해시가 그대로임을 확인했고 임시 코스는 삭제했다. 기존4코스 보존. 근거 .local/map-course-edit-test.json 및 output/playwright/course-editor/recalculated-and-reloaded.png.
- 제한: 마우스 드래그 자동화는 이번에도 화면에 이동 결과를 만들지 못했다. 방향키 이동과 기존 포인터 처리 재사용은 확인했으나 실제 마우스·터치 제스처 성공으로 보고하지 않는다. 최종 화면 output/playwright/course-editor/updated-course-editor.png. 이번 후속 수정은 로컬 미커밋 상태이며 커밋·push·운영 배포 없음. 직전 배포 기록·미추적 사용자 파일 보존.

# 저장 경로·코스 지도 운영 반영 확인 · 2026-09-29

- 사용자 승인: 현재 완성된 변경을 그대로 운영까지 배포. 제품 코드·관련 테스트·개발 도구·기록20파일을 9afdf3f로 커밋했다. .env·.local·.byeori·.playwright-cli·output은 제외했으며 staged diff에서 로컬의 실제 API 키·비밀번호와 일치하는 값은 없었다.
- 원격 main은 기존 ab30772에서 d18bebc까지 모바일 관련3커밋이 진행됐다. fix/finale에 병합하면서 RecommendPage 충돌1곳을 해결했다. 저장 직후 후보를 보존하는 loadedPlanId 가드와 저장 route_snapshot 복원을 모두 유지했다. 기존 main worktree는 clean이며 dev refs는0f824a9로 보존한다.
- 재검증: 병합된 MapPage·RecommendPage 명시 검사에서 ESLint·Node212개·증분 TypeScript 통과(10.5초, /tmp/pongdang-course-release-merge-checks.log). 변경 없는 백엔드는 기존49개 경로 테스트·21개 개발 도구 격리 테스트 결과를 사용한다. 실제 IAB390px에서 저장 지도 새로고침 후 도로선5/5·22분·저장 시각, 추천에서 다른 저장 코스를 연 뒤 도착/출발 시각·도로 경로·21분 복원을 확인했다. viewport와 사용자의 원래 코스 c7517cce8c37496aa7ede9ac3adabc18 화면을 복원했다.
- 병합 커밋 da88667e81d0c4f8737461f8e38dffeceda27595를 기존 main worktree에 fast-forward하고 main만 push했다. GitHub 원격 main 동일SHA, dev 원격0f824a9 유지 확인. CI https://github.com/facio313/Pongdang/actions/runs/36533742581 의 정확한 SHA에서 backend/frontend 이미지가 모두 success(15:57 KST)였다. 호스트의 기존 자동 배포 경로를 사용했고 중복 수동 배포·설정 변경은 하지 않았다.
- 운영 읽기 확인(15:59 KST): https://pongdang.site/ 프런트·/pongdang/api/health·ready·openapi.json 모두HTTP200, health/ready는status ok. 프런트 JS/CSS가 index-CCg_EOO6/index-DWEIaL1s에서 index-L5UE0_oV/index-DM4wCVr7로 교체됐고 새 패널·간격·route_snapshot 코드가 포함됐다. 배포 전 없던 TripPlan.route_snapshot·PlanInput.route_token 계약도 실제 OpenAPI에 나타났다. 전환 중15:58:02에 관측한502는 후속 확인에서 해소됐다.
- 실제 운영 IAB에서 카카오 지도 로드와 왼쪽 내 코스 목록/오른쪽 선택한 코스 배치를 확인했다. 운영 계정의 저장 코스 생성·수정 테스트는 수행하지 않았고 로컬 테스트 데이터는 이관하지 않았다. 원래 로컬 코스 화면을 보존했다. 화면 output/playwright/kakao-route/production-course-panels.png, 기계 증빙 .local/release-map-course-20260929/{before,public-verification,state}.json.
- 확인 범위: 운영 새 프런트·백엔드 계약 및 공개 health/readiness를 확인했으며, 서버 내부 current 링크·컨테이너 이미지 SHA·watcher 상태 파일은 직접 조회하지 않았다. 배포 후 이 기록은 중복 문서 전용 CI를 만들지 않고 로컬에 보존한다. 제품 코드 미커밋 변경 없음, 기존 미추적 산출물 유지.

# 지도 코스 목록·선택 상세 패널 분리 · 2026-09-29

- 사용자 요청: 왼쪽에는 코스 목록을 항상 유지하고, 선택한 코스의 모든 내용은 오른쪽에 표시. 코스 목록으로 버튼 제거, 중복 방문 목록 정리, 긴 상태 안내 축약, 점수 대상과 버튼 간격 명확화.
- 구현: MapDesktop 왼쪽은 저장 코스 목록과 선택 표시, 오른쪽은 첫 장소의 활동별 예보 점수·방문 순서·저장 경로 상태·경로 설정·이동/귀가 예상·액션으로 구성. 코스 변경 시 출발지 선택을 해당 저장 코스로 초기화하고, 생성/재계산 저장 후 목록 캐시를 갱신한다. 기존 100행 조회 경계 유지.
- 표시: 현재 88.3은 경포해수욕장/휴식/9월29일15:07 예보 점수임을 함께 표기. 긴 내부 상태 대신 저장된 예상 경로·도로선 4/4구간을 표시하고, 미확인 항목은 한국어 설명의 기본 접힘으로 이동했다. 액션 위 여백20px, 버튼 사이12px. 모바일 레이아웃은 변경하지 않았다.
- 검증: 명시5파일 ops/verify_local.py로 수정 파일 ESLint·Node212개·증분 TypeScript 통과(9.0초, /tmp/pongdang-course-panel-final-checks.log). 실제 IAB에서 저장4개 목록 유지, 3곳 코스 선택 후 상세/출발지/점수 변경, 원래4곳 코스 복귀 후 도로선4/4·이동21분·귀가19:28 복원, 확인 항목 펼침/접힘 및 간격을 확인했다. 화면 output/playwright/kakao-route/course-list-and-detail.png.
- 현재 fix/finale 미커밋 변경. 코스 전환 검증은 읽기만 수행했고 추가 경로 계산·DB 갱신·키 변경·커밋·push·배포 없음. 기존 저장 경로 수정과 사용자 변경 보존. 필수 미완료 없음.

# 저장 코스 지도 경로 복원 · 2026-09-29

- 사용자 요청: 저장 코스 지도에서 장소 마커만 보이고 도로 경로가 없는 문제 수정. 원인은 코스 저장이 장소·순서만 보존하고, 지도 재조회가 세션 경로도 초기화한 것이다.
- 구현: 서버가 계산한 도로선·구간 근거·도착/출발/귀가 예상 시각을 서명된 route_token으로 명시적 저장에 전달한다. 소유자·일정 일치, 30분 유효기간, 압축 해제/입력 크기를 검사하며 저장된 JSONB에 route_snapshot을 보존한다. 조회는 외부 길찾기를 호출하지 않는다. 동일 일정 PUT은 기존 경로를 보존하고 일정 변경 시 버린다. 새 스키마/의존성 없음.
- 데스크톱·모바일 지도와 추천의 저장 코스 열기가 스냅샷을 복원한다. 저장된 출발지를 기본 선택하고, 명시적 재계산은 이전 결과를 재사용하지 않는다. 출발지=첫 장소인 0분 구간은 실제 도로선 누락 집계에서 제외한다. 화면에 저장된 예상값임을 명시했다.
- 현재 코스 a6948dc067e24a4799dabf3d3a3bcf99를 같은 격리 테스트 DB에서 revision1→2로 갱신했다. 경포→강문→사근진→순개울 및 각 60분 체류를 보존했다. 지나간 출발 시각은 15:07로 갱신했고 실제 카카오 응답은 이동21분/귀가19:28, 도로선4구간·178좌표였다. PUT 후 GET 결과가 원래 계산 결과와 동일함을 확인했다. 이전 payload는 비공개 local-testing 폴더의 course-a6948dc-before-route.json에 보관했다.
- 검증: 명시 백엔드7파일 Ruff/format 및 관련49개 테스트 통과(기존 TestClient 의존성 경고2개). 장거리 크기, POST→GET, 동일 일정 PUT 보존/수정 시 초기화, 서명·소유자·만료·압축 경계, 선택 날짜 계약을 확인했다. 프런트 명시 파일 ESLint·Node212개·증분 TypeScript 통과, 모바일 출발지 표시 추가 수정 후 해당 파일 검사도 통과했다. 로그 /tmp/pongdang-saved-route-backend-checks.log, /tmp/pongdang-saved-route-frontend-checks.log, /tmp/pongdang-saved-route-frontend-final.log.
- 실제 IAB: 저장 코스 새로고침 후 도로선4/4·21분·도착 시각·경포 출발지 표시 확인. 모바일390×844에서도 도로선/시각/출발지를 확인하고 뷰포트를 원복했다. 화면 output/playwright/kakao-route/restored-saved-course.png 및 restored-saved-course-mobile.png. DB/API 응답을 가짜로 대체하지 않았다.
- 실행: 테스트 backend18000만 PID79814로 재시작, frontend5173 PID65420 유지, test DB127.0.0.1:62022/pongdang_test 표식/격리 유지. readiness는 요구된 Host를 보내는 프런트 경유로200 확인했고 비공개 runtime.json 갱신. 최초 경로 조회는 query_failed였으나 공식 제공자 단일 진단 요청200과 후속 실제 계산 성공을 확인했다. 실패 응답으로 코스를 덮어쓰지 않았다.
- 기존 사용자 변경·원본 backend8000·collector·운영·dev refs를 보존했고 키 파일 변경·커밋·push·배포 없음. 필수 미완료 없음.

# 로컬 추천 지도·실제 카카오 경로 복구 · 2026-09-29

- 사용자 요청: 추천 하단 지도가 안 보이고 경로 계산이 비활성 상태인 문제를 실제로 복구하고, 후보가 AI인지 규칙 기반인지 설명. 기존 테스트 DB·계정과 운영 격리를 유지한다.
- 원인: 프런트 실행 환경의 빈 VITE_KAKAO_MAP_KEY가 저장된 frontend/.env.local 값을 덮었고, backend/dev/local_preview.py는 모든 외부 호출과 길찾기를 기본 차단했다. 실제 키 파일은 변경하지 않았다.
- 구현: local_preview.py에 명시적 --kakao-env 옵션을 추가했다. 해당 파일에서 길찾기 REST 키 하나만 읽으며, 공식 apis-navi.kakaomobility.com을 시작 시 해석한 공개 IP의 HTTPS443만 허용한다. 다른 API 키·운영 DB·SSO 설정은 가져오지 않고 기본 실행은 계속 외부 차단이다. README에 지도/길찾기 선택 실행 방법과 DNS 변경 시 재시작 조건을 기록했다.
- 실행: frontend5173 PID65420의 빈 키 덮어쓰기를 제거하고 테스트 backend18000 PID65419를 위 옵션으로 재시작했다. 기존 pongdang_test62022 및 표식 검증 유지, readiness200/isolated-local-test 확인. 기존 로컬 테스트 계정 재로그인 후 강릉시·기존 취향4개·첫4곳 선택을 화면에 복원했다. 원본 backend8000·collector·운영 서버는 변경하지 않았다. 비공개 runtime.json에도 PID·선택적 카카오 모드를 기록했다.
- 실제 화면 검증: 경포→강문→사근진→순개울의 선택 순서로 카카오 경로 계산 성공. 당시 응답은 총 이동19분/14:25 출발/18:44 귀가, 구간별 도착·출발 시각과 실제 도로선4구간 표시. 첫 장소와 출발지가 같아 생기는 0분 구간을 지도 누락 집계에서 제외하여 잘못된 4/5 안내를 수정했다. 가짜 지도·경로 응답은 사용하지 않았다. 캡처 output/playwright/kakao-route/restored-recommendation.png.
- 추천 설명 근거: backend/app/travel/recommend.py의 결정적 취향 가중치·조건 제외·동점 순서·선택적 환경 선호 비교로 상위5곳을 반환한다. AI 대화 호출과 별개이며 행의 환경 점수는 RecommendDesktop.tsx에서 conditions API로 따로 읽는다. 추천·환경 점수 계산식은 변경하지 않았다.
- 검증: 백엔드 명시2파일 Ruff/format·격리 경계21개 테스트 통과(2.4초), 프런트 수정파일 ESLint·Node212개·증분 TypeScript 통과(5.9초). 로그 /tmp/pongdang-kakao-preview-checks-20260929.log 및 /tmp/pongdang-kakao-map-ui-checks-20260929.log. 최초 검사 환경 변수 누락과 Ruff1건은 올바른 테스트DB 변수 지정 및 해당 파일 포맷 후 해결했다. 실제 UI는 현재 성공 결과를 유지하며 필수 미완료 없음. 커밋·push·운영 배포 없음, 기존 CURRENT 변경·미추적 파일 보존.

# main 통합·운영 반영 확인 · 2026-09-29

- 사용자 승인: GitHub main의 새 변경 수신, 지금까지 작업한 제품 코드·관련 테스트·문서 커밋·push·운영 배포. 원격 main을 명시 fetch했고 기준 f2a471e와 동일하여 추가 병합 변경은 없었다. 38파일을 ab307728266cd5602f51191adbb8e3813dcd0953으로 커밋, 기존의 깨끗한 main worktree로 fast-forward하고 main만 push했다. 원격 main 같은 SHA 확인. dev/원격 dev는 0f824a9에 보존했다.
- 범위: 외부 기온 상세 접힘, 다른 지역의 서로 다른 값 비교와 모드 일치, 예보 대기 표시·높이 및 로그인/알림 버튼, 후보 번호 선택·전체 선택·애니메이션 정렬과 선택한 순서의 경로 계약. 운영 이미지에 포함되지 않는 backend/dev 로컬 테스트 도구와 경계 테스트도 보관한다. .env·비밀 설정·DB·.local·.byeori·.playwright-cli·output은 포함하지 않는다.
- 검증 근거: 기존 수정 파일 검사 결과를 로그와 대조했다. 최종 프런트 lint/212개 Node/증분 TypeScript, 경로 회귀7개, 로컬 테스트 격리17개, disposable DB 비교 API8개 통과. 원격과 내용 병합이 없어 동일 검증을 반복하지 않는다. 실제 마우스·아이폰 터치 드래그 검증 제한은 아래 기록과 같다.
- CI https://github.com/facio313/Pongdang/actions/runs/36466952449 에서 정확히 ab30772의 backend/frontend 이미지 빌드 모두 success(03:42KST). 기존 호스트 watcher/local gate의 자동 경로를 사용했으며 수동 중복 배포·host 설정 변경은 없다.
- 공개 운영 읽기 검증: 프런트 자산이 index-Ba7DRlie.js/index-WfQ6MQbf.css에서 index-Xed7ScNK.js/index-aFGg9Hic.css로 교체됐고 새 JS에서 --rd-reorder-y, rd-step-toggle, preserve_order를 확인했다. 기존422이던 조건 요약 mode=forecast가200/mode forecast/경포470 한 행/누락0으로 응답한다. health와readiness 모두200/status ok. 근거 .local/release-20260929/public-verification.json.
- 확인 범위: 기본 SSH 키와 bonifacio_deploy 키 모두 거부되어 서버 내부 current SHA·컨테이너 health·watcher outcome은 직접 읽지 못했다. CI 성공과 실제 운영의 새 프런트/API·공개 health는 확인했으며 이를 내부 SHA 검증과 혼동하지 않는다. 이 배포 후 기록은 추가 문서 전용 빌드 없이 로컬에 남긴다. 원본 로컬 테스트 환경과 미추적 .byeori/.playwright-cli/output은 보존했다.

# 추천 후보 자연스러운 순서 이동 · 2026-09-29

- 후속 요청: 아이폰 목록 정렬처럼 드래그하는 행이 따라오고 주변 행이 부드럽게 자리를 비키도록 변경. RecommendDesktop의 native drag/drop과 터치 분기를 공통 pointer capture로 교체했다. 기존 행 DOM을 유지한 채 transform으로 미리 배치하고, 놓을 때220ms 정착 후 순서를 확정한다. 그림자·약한 확대, 화면 끝 자동 스크롤, Escape/포인터 취소 시 원위치, 목록 갱신·화면 이탈 시 정리, 동작 감소 설정을 포함한다. 방향키 이동도 같은 정착 애니메이션을 쓴다.
- 구현: useCandidateReorder.ts가 제스처와 정리를 담당하고 candidateReorder.ts가 높이가 다른 행의 중간 지점 통과·끝 경계·정착 위치를 계산한다. 선택 spot_id/서명 rank/저장 계약은 기존 candidateCourse를 유지한다. 새 의존성·백엔드·DB·운영 변경 없음.
- 검증: 명시 파일 ESLint·Node212개(위치 계산 회귀4개 포함)·증분 TypeScript·diff --check 통과. 로그 /tmp/pongdang-animated-reorder-checks-20260929.log. 실제 IAB 방향키 아래/위 이동, 이동 도중 화면, 정착 후 출발지·번호·지도 목록 갱신 및 임시 스타일 정리를 확인했다. 기존 강문→사근진→순긋→경포→순개울 순서와 마지막 제외 상태로 되돌려 유지. 화면 output/playwright/animated-reorder/moving.jpg 및 updated-recommendation.jpg.
- 검증 제한: IAB 자동화의 native drag는 스크린샷 좌표와 DOM 좌표 모두에서 실제 제스처 결과가 나오지 않아 마우스 드래그 성공으로 보고하지 않는다. 실제 아이폰 터치·화면 끝 자동 스크롤·제스처 취소는 실기기 검증이 남는다. 키보드 이동과 위치 계산만 실제 실행으로 확인했다. 커밋·push·배포 없음.

# 추천 후보 번호 토글·전체 선택 · 2026-09-29

- 후속 요청 완료: 별도 체크박스를 제거하고 번호 원을 누르면 포함/제외 전환. 제외해도 1~5 번호를 유지하며 흰 배경·테두리로 표시한다. 드래그 손잡이는 행 맨 오른쪽, 안내 오른쪽에 전체 체크/전체 체크 해제 버튼 하나를 둔다.
- 새 데스크톱 후보 목록은 마지막 항목만 기본 제외한다. 이후 사용자 선택·순서 변경은 보존하며, 첫 선택 장소에 출발 표시와 지도 목록/번호를 맞춘다. 현재 사용자 목록은 강문→사근진→순긋→경포→순개울 순서를 유지하고 마지막 순개울만 해제했다.
- 검증: 명시한 프런트4파일의 ESLint·Node208개·증분 TypeScript 통과. 로그 /tmp/pongdang-candidate-toggles-checks-20260929.log. 실제 IAB 별도 탭에서 새 목록 4개 선택/마지막 제외, 번호 on/off, 전체 선택/해제, 빈 코스 저장·계산 비활성화, 첫 장소 해제 시 출발지·지도 번호 반영 확인 후 임시 탭을 닫았다. 화면 output/playwright/candidate-toggles/updated-recommendation.jpg.
- 기존 격리 로컬 테스트 환경만 사용. 이번 변경은 RecommendDesktop.tsx, recommendDesktop.css, useTravelConcierge.ts, locales/travel.ts와 이 기록이며, 드래그 이벤트 처리·백엔드·DB·운영 설정·커밋·push·배포는 변경하지 않았다.

# 추천 후보에서 방문 포함·순서 편집 · 2026-09-29

- 사용자 요청: 데스크톱 추천의 위 후보 목록에서 체크박스로 방문 여부를 정하고, 드래그로 1~5 순서를 바꾼다. 아래의 출발지/방문 후보/방문 수 중복 폼은 제거한다. 운영에 영향 없는 기존 로컬 테스트 환경 유지.
- 구현: RecommendDesktop 행마다 체크박스·드래그 손잡이·선택 순번, 첫 선택 장소에 출발 표시. 마우스는 native drag/drop, 터치/펜은 pointer capture, 키보드는 손잡이 위·아래 방향키. candidateCourse.ts가 실제 spot_id와 원본 서명 rank를 보존하며 화면 순서/선택과 PlanInput을 맞춘다. 전부 해제하면 저장/계산 불가. 수동 변경 시 낡은 경로·시각·저장 성공 표시를 초기화한다. 지도 목록도 선택한 순서만 반영한다.
- 경로 계약: RouteCandidatesForm은 첫 선택 장소와 전체 선택 순서로 preserve_order=true를 보낸다. routing.py의 기본 최적화는 그대로, 명시 모드만 순열 없이 해당 순서 전체를 검증/계산한다. 자료가 부족한 장소를 임의로 빼거나 다른 장소로 교체하지 않는다. 첫 등록 장소=출발지인 구간은 same_registered_place로 명시하고 외부 도로 요청/가짜 제공자 근거 없이 처리한다. 원본 rank/토큰을 바꾸지 않으며, 토큰 만료 재조회도 선택 순서를 유지한다.
- 로컬 검증: 수정 파일 ESLint·증분 TypeScript·Node208개, Ruff/format·외부 DB/네트워크를 사용하지 않는 경로 회귀7개 통과. 처음 전체 로그 /tmp/pongdang-candidate-order-checks-20260929.log, 최종 프런트 재검증 /tmp/pongdang-candidate-order-final-checks-20260929.log. 전체 릴리스 빌드/전체 DB suite 미실행.
- 실제 내장 브라우저: 체크 해제→번호/지도 목록 반영, 전부 해제→계산/저장 비활성화, 방향키 순서 변경→출발지 변경, 경로 제공자 disabled 응답 뒤에도 선택 보존, 사근진해변→경포해수욕장→순긋해변3곳 저장 및 별도 IAB탭 재열기 확인. 저장 plan_id a432e181745248d89f26ab650bc14dde, DB는 기존 격리127.0.0.1:62022/pongdang_test. 임시 재조회 탭은 닫았고 원래 편집 화면 유지.
- 검증 제한: IAB의 마우스 drag 호출은 화면에 이벤트 결과를 만들지 못해 실제 마우스 드래그 성공으로 보고하지 않는다. Codex 네이티브 앱 직접 제어는 도구 안전 정책으로 거부되었으며 우회하지 않았다. 새 마우스 drag/drop 핸들러와 터치 동작은 실제 포인터 검증이 남는다. 방향키·체크·저장·재조회는 실제 UI에서 검증했다. 외부 지도/도로 제공자는 계속 꺼져 있어 실제 도로 시간/경로는 단위 테스트 경계만 검증했다.
- 실행: 테스트 backend18000만 PID21003으로 재시작하여 readiness200/isolated-local-test 확인, 다시 로컬 테스트 계정으로 로그인. 원본 backend8000·collector·운영 서버/DB·SSO 설정, dev refs, 커밋·push·배포 변경 없음. fix/finale의 이전 사용자 변경 전부 보존.

# 운영 영향 없는 로컬 로그인·추천·코스 테스트 · 2026-09-29

- 사용자 요청: 현재 로컬에서 로그인→추천→코스 등록까지 테스트하되 운영에 영향을 주지 않는다. 운영 SSO 검증 요청과 구분하여 별도 테스트 계정·DB로 구성했다.
- 새 개발 전용 진입점 `backend/dev/local_preview.py` 및 경계 테스트 `backend/tests/test_local_preview.py`. 운영 Dockerfile은 app/만 복사하여 dev/를 포함하지 않고, 일반 create_app에는 로그인 테스트 경로가 없다. 기존 require_principal 인증 검사를 그대로 거치며, 유효한 로컬 HttpOnly/SameSite=Strict 쿠키에만 local-test-user 주체를 전달한다. 요청 peer/Host/Origin·위조 헤더·만료를 검사한다. 세션12시간, 재시작 시 재로그인 필요.
- 기존 5432/pongdang은 로컬 postgres PID909 소유임을 재확인하고 읽기 전용 repeatable-read snapshot으로 복사했다. 새 소유 클러스터 `127.0.0.1:62022/pongdang_test`, 자료6,673장소/condition_result178,256행/약1.57GB. condition_result는 KST오늘 이후 target_end만 복사해 불필요한 과거 결과를 제외하고 시각·점수는 보존했다. travel/notification/ai 개인·예산 자료는 복사하지 않았다.
- 준비·설정·운영정보: `/Users/cksmacbook/.local/share/pongdang/local-testing/20260929-014003/`의 config.json(0600), LOCAL-LOGIN.txt(0600), runtime.json, snapshot-report.json, verification.json. 비밀번호는 채팅/로그/문서에 기록하지 않는다. 설정 포인터 `.local/login-preview-config-path`, 재준비 스크립트 `.local/setup-login-preview.py`는 ignored. 실행 설명 backend/dev/README.md.
- 현재 frontend5173 PID7832→테스트 backend18000 PID5921→test PG62022 PID4355로 연결, 모두 loopback만 listen. 기존 원본 backend8000 PID78413와 로컬 collector는 유지. 앱 시작 시 테스트 DB 표식 검증, 모든 외부 제공자 키는 기본 빈 값/AI·Kakao경로·발송 disabled, Python 외부 DNS/접속도 차단. 초기 추천 확인에서 기존 frontend 지도 SDK 키 로드를 발견하여 VITE_KAKAO_MAP_KEY도 빈 값으로 재시작했으며 최종 검증은 지도 키 없이 수행했다.
- 검증: 명시2파일 ops/verify_local.py의 Ruff/format/17개 경계 테스트 통과(2.2초, 기존 의존성 경고2개). 로그 /tmp/pongdang-local-preview-checks-20260929.log. 실제 내장 브라우저에서 생성한 로컬 계정 로그인→취향4개 저장→강릉 해변5곳 추천→코스 저장→새로고침 후 저장 코스 재조회 완료. snapshot 가짜 값·mock API를 쓰지 않았다. 최종 화면 output/playwright/local-login-preview/saved-course.jpg.
- 저장 코스 `9c5968c9c3b24a4e91257917f50744bc`, 소유자local-test-user, 테스트 취향1개가62022의 DB에만 존재함을 확인. 원본5432/pongdang에는 해당 코스가 없다. 브라우저는 로그인 상태의 저장 코스 화면을 유지한다.
- 제한: 실제 운영 SSO 인증, AI 대화, 실시간 도로 경로·지도·메일 발송은 이 테스트 범위에서 검증하지 않는다. 수집 데이터는 복사 시점 스냅샷이며 자동 갱신하지 않는다. 운영 서버·운영 DB·계정 설정 변경·커밋·push·배포 없음. 기존 사용자/화면 변경 보존.

# 오늘 다른 지역 비교 표시 · 2026-09-29

- 사용자 요청: 가까운 곳의 중복 값을 제외하자 기준 장소만 남으므로, 다른 지역의 같은 유형 장소를 비교하도록 변경. 아래의 거리순 비교 기록을 대체한다.
- 완료: 거리 기준 대신 수집 장소 목록에서 다른 시·군을 우선하고, 확보된 근거가 많은 순서로 최대2곳 선택. 기준 장소와 후보 사이의 동일 표시 점수·수온 조합, 중복 ID/별칭, 점수 미확인은 제외한다. 기준 장소는 상단 Conditions를 계속 공유하며, 후보는 같은 관측/예보 모드의 요약을 읽는다.
- 조회는 기존100행 장소 목록과 최대4개의25개 요약 묶음으로 제한하고, 모든 묶음이 끝난 뒤 선정한다. 현재 해변93곳은 모두 포함되며, 목록이100곳을 넘으면 조회한 개수 기준이라는 안내를 표시한다. 데스크톱·모바일에 지역명·근거 수, 부분 점수 간 단순 우열 비교가 어렵다는 설명을 추가했다. 다른 장소의 전체 조건은 모바일에서 선택할 때만 읽는다.
- 실제 내장 브라우저 확인: 경포해수욕장(강릉64.7/23.7°C/4개), 감추해변(동해62.3/23.9°C/3개), 가진해변(고성76.8/22.9°C/1개)3행 표시. 데스크톱·390px 모바일 확인, 감추 상세에서 실제 관측 근거·62.3점·3/4개 자료 로드 및 접힘 확인. viewport 원복, 오늘 화면 유지. 화면 output/playwright/regional-comparison/today-{desktop,mobile}.jpg.
- 검증: 명시8파일 ops/verify_local.py의 수정 파일 ESLint·Node204개·증분 TypeScript 통과(6.4초), diff --check 통과. 로그 /tmp/pongdang-regional-comparison-checks-20260929.log. browser fixture는 갱신 후 lint/typecheck만 수행했고 CLI browser suite는 실행하지 않았다.
- fix/finale의 미커밋 로컬 변경. 기존 사용자·외부 기온·예보·로그인 변경을 보존했고, 이번 요청에서 backend/DB·커밋·push·운영 배포는 변경하지 않았다. 남은 필수 작업 없음.

# 오늘 마지막 예보·로그인 버튼 · 2026-09-29

- 사용자 요청: 10월5일 주간 예보 점수를 표시하고, 오늘 알림 영역에 로그인 버튼 추가.
- 원인 확인: 경포7/swim의 마지막 날짜 API는 condition_projection_unavailable_for_target, forecast 결과 구간이 그 날짜 정오를 덮지 않는다. 10월4일은 KHOA 수온20.1°C 근거의 부분 점수55.8, 10월5일은 실제 근거 없음. khoa_beach 수집이00:14에 HTTP_503으로 실패했고 condition_projection 자체는 정상 게시 중이었다.
- 확인된 로컬127.0.0.1:5432/pongdang에서 기존 run_due 잠금을 이용해 khoa_beach만 한 차례 force 재수집했으나 HTTP_503/received0/inserted0. 전날 reqDate의 첫1건 읽기 진단도HTTP_503. 성공 처리·가짜 예보·유효기간 연장·재시도 횟수 초기화 없음. 정상 수집기의 기존 backoff 재시도 경로 유지.
- 완료한 코드: forecastAwaitingData와 useConditionDays로 게시된 예보가 없는 타깃을 구분, 오늘 데스크톱·모바일에서 대기/예보 자료 대기 및 날짜별 사유를 표시. 숫자 점수의 원값과 계산은 바꾸지 않았다. NotificationSummary의 AUTH_NOT_CONFIGURED 안내에도 로그인 버튼 추가, 기존 SSO 팝업 연결. 로컬 미설정 오류·재확인·이력 링크와403 권한 처리 유지.
- 검증: 명시7파일 ops/verify_local.py의 ESLint·Node201개·증분TypeScript 통과(8.3초), 마지막 대기 번역 추가 후 해당 파일 ESLint 통과. 로그 /tmp/pongdang-forecast-login-checks-20260929.log. 내장 브라우저 실제 desktop 및390px mobile에서10월5일 예보 자료 대기, 로그인 버튼 표시 확인. 버튼 Enter로 로그인 팝업/아이디·비밀번호 입력란 열림, 입력란 Escape로 닫힘 확인. 실제 자격 증명 제출 없음. viewport 원복, today 유지. 화면 output/playwright/forecast-login/.
- 미해결: 10월5일의 실제 숫자 복구는 외부 KHOA API503 장애 해소와 성공한 수집·게시가 필요. 로컬 SSO bridge는 미설정이며 실제 인증 성공은 검증하지 않았다. 운영 서비스·설정은 수정하지 않았다.
- 모든 이번 UI 변경은 fix/finale 미커밋 작업본. 이전 비교 목록·외부 기온 수정 및 기존 사용자 변경 보존. 커밋·push·운영 배포 없음.

# 오늘 비교 목록의 동일 값 제외 · 2026-09-29

- 사용자 요청: 오늘 지점 비교에 다른 값만 표시. 기준 장소는 상단 추천 Conditions를 공유하고, 가까운 동일 유형 후보 최대25곳 중 표시 점수·수온 조합이 다른 최대2곳만 거리순으로 선택한다. 후보 간 같은 조합·중복 ID와 점수 미확인/계산 불가 항목도 제외한다. 모두 같거나 자료가 없으면 기준 장소와 안내만 표시한다.
- 공통 comparisonPlaces.ts/useComparisonPlaces.ts를 데스크톱·모바일에 적용. 후보별 전체 조건 조회 대신 요약 API1회 사용, 모바일 다른 장소 상세만 선택 시 조회한다. nearby의 선택적 limit은 기본2/최대25로 기존 계약을 유지했고, 요약은 기본 관측을 유지하면서 명시적 forecast를 지원해 기준 모드와 맞춘다. DB 수정·migration 없음.
- 검증: Node24.19.0으로 명시 파일 ops/verify_local.py의 ESLint·Node200개·증분TypeScript 통과(9.9초). 백엔드5파일 Ruff/format 및 관련8개 테스트 통과(6.4초, 기존 의존성 deprecation경고2개). 본 작업에서 새로 만든 loopback51849/pongdang_test만 사용했고 검증 후 임시 PostgreSQL을 정상 종료했다. 로그 /tmp/pongdang-comparison-{frontend,backend}-20260929.log. 변경한 browser fixture는 lint/typecheck만 확인했고 CLI 브라우저 suite는 실행하지 않았다.
- 로컬 backend만 PID78413으로 재시작, /api/ready200. 실행 cwd는 이 checkout의 backend, DB는127.0.0.1:5432/pongdang. frontend5173은 기존 Vite 유지. 새 실행 기록 .local/comparison-backend-20260929.json 및 동명.log.
- 내장 브라우저 실제 오늘: 경포 주변25곳 중14곳은 기준과 같은64.7점/23.7°C, 나머지11곳은 점수 미확인임을 API와 화면에서 확인. 데스크톱·390px 모바일 모두 기준1행+중복 제외 안내. 모바일 선택 상세도 상단과64.7점 일치, Enter로 펼침/접힘 확인. 임시 viewport override 복원, 오늘 탭 유지. 화면 output/playwright/distinct-comparison/today-{desktop,mobile}.jpg.
- fix/finale 작업 트리에 미커밋 상태. 이전 외부 기온 접힘 수정과 기존 문서/사용자 변경 보존. 이 요청에서는 커밋·push·운영 배포를 하지 않았다. 남은 필수 작업 없음.

# 홈·오늘 외부 기온 상세 기본 접힘 수정 · 2026-09-29

- 사용자 요청: 두 화면에서 외부 기온 설명은 제목을 눌렀을 때만 표시. 검증에는 사용자가 열어 둔 내장 브라우저를 사용한다.
- 공통 ComponentBars의 0점 상시 노출 예외를 제거하고, 전체 설명을 감싸는 부모에 hidden과 aria-controls 대상을 모았다. 자식 pd-explainer-body의 display:grid가 hidden을 덮어쓰던 문제가 부모 숨김으로 해소된다. 제품 변경은 frontend/src/pongdangUi.tsx 한 파일, 미커밋.
- Node24.19.0으로 ops/verify_local.py 명시 파일 검사: ESLint, Node193개, 증분 TypeScript 모두 통과(8.0초). 로그 /tmp/pongdang-air-temperature-checks-20260929.log. 기존 테스트 코드와 DB는 변경하지 않았다.
- 내장 브라우저 실제 홈·오늘에서 기본 aria-expanded=false/panel display:none, Enter로 설명 전체 펼침·다시 접힘 확인. 마우스 자동 입력은 내장 브라우저에서 상태 변화를 만들지 못해 키보드로 확인했으며 실제 마우스 동작의 자동 검증 성공으로 보고하지 않는다. 홈 접힘 상태로 복귀. 화면은 output/playwright/air-temperature/에 저장. 별도로 시작했던 Playwright 브라우저 세션 daemon은 종료했다.

# 보존 작업 배치 제한 운영 반영 완료 · 2026-09-28

- 사용자 승인: 검토한 condition_storage.py 및 test_condition_result_storage.py 두 파일의 안전성 확인 후 커밋·push·운영 반영까지. 다른 작업물·dev 보존.
- 최신 원격 main fc463e6(로그인 복구)과 겹치는 backend 변경 없음 확인 후 fix/finale에 fast-forward. 기존20개 관련 테스트/Ruff 통과 코드 그대로 두 파일만 f2a471e0f14d6cce0deea07cc3dabb4de7067662로 커밋하고 기존 main worktree도 fast-forward, main push 완료. 원격 main 동일SHA 확인, dev/origin/dev/원격dev0f824a9 그대로.
- CI36390565426 backend/frontend 이미지 빌드 모두 success(16:14KST): https://github.com/facio313/Pongdang/actions/runs/36390565426 . 기존 호스트 watcher/local gate가 같은SHA/run_attempt1을 outcome=success로 배포했다. 중복 수동 배포 없음. 운영 current와 frontend/backend/collector 이미지 모두 f2a471e, previous는fc463e6.
- 16:31KST 직접 확인: frontend/backend/collector/db 모두 running/healthy, 호스트5188의 /api/health와 /api/ready HTTP200. backend와 collector의 condition_storage.py SHA256 모두04846827dcd710cb1dd5dc662d1683dc7089296739c4a45da2341034eac3e118로 커밋 파일과 일치. DB pongdang/schema21을 명시적 read-only 연결로 조회했고 운영 DB 수정·강제 정리 실행 없음.
- 배포 후 condition_projection이16:25:46KST succeeded/연속실패0, generation818/result_published=true/125237개 결과 게시. 정상 게시 경로에서 변경된 _prune_result_history도 실행된다. 기본 장소·경포470/swim 관측 API HTTP200, projection ready/generation818. 실제 운영 브라우저 로그인 흐름은 이번 DB 패치 확인 범위에 포함하지 않았다.
- 자동 정리 상태: condition_result_retention 최근9월28일01:32KST 성공/실패0/다음9월29일00:00KST, evidence_retention 최근15:37:57KST 성공/실패0/다음16:37:57KST. 이 두 최근 성공은 배포 전 기록이며 새 버전 독립 정리 작업을 수동 실행한 것은 아니다. collector heartbeat8.98초/idle, 실제 컨테이너 실행과 함께 확인.
- 접속 방식 정정: 이전 기록에서 cks@192.168.75.98:22022의 비밀번호 인증 성공을 확인했고 기존 사용자 제공 인증을 재사용하여 독립 SSH 연결 성공. 저장 배포키는 이전에도 거부됐으며 외부 주소 실패만으로 서버 접속 불가라고 판단한 것은 잘못이었다. 비밀번호는 출력·파일 저장하지 않았다. iTerm 접근 제한을 우회하지 않았다.
- 상세 상태/패치: `/Users/cksmacbook/.local/share/pongdang/releases/20260928-bounded-retention/state.json`, `production-verification.json`, `release.patch`. 기존 로컬 DB 유지보수 기록은 아래에 당시 이력으로 보존. 운영 반영·확인 미완료 단계 없음.

# 로컬 DB 보존 정책 정리 완료 · 2026-09-28

- 사용자 스크린샷 범위의 전체 백업→기존 retention→실제 파일 축소→backend/collector 복구→로컬 홈·오늘 확인 완료. 운영·다른 서비스·dev·커밋/push는 변경하지 않았다.
- 실제 로컬 Homebrew PostgreSQL18.3 PID909, datadir `/opt/homebrew/var/postgresql@18`, system_identifier7614899680775525797. 웹과 설치 collector 모두 `127.0.0.1:5432/pongdang` 동일 연결, 터널 아님. schema20→21 명시적 migration 완료.
- `fix/finale`은 원격 main `1824fa0`까지 fast-forward, 요청한21c0782 포함. dev/origin/dev는0f824a9 그대로. 기존 문서·미추적 파일 보존. 제품 수정2파일은 미커밋.
- DB 파일32,125,884,095→4,066,260,671bytes(32.13→4.07GB), 28,059,623,424bytes/87.34% 감소. 수집기 재개 직전 측정이며 이후 정상 수집·계산에 따른 증가는 별도. 보존 정책을 기준으로 정리했으며 운영 DB 크기에 맞추는 추가 삭제 없음.
- 점수 결과2,130,055→589,877행, 기간 밖1,540,178행 삭제. 겹친9,572행은 시간 경계만 조정. 평가·입력 각각1,753,334→13,404, 생산·읽기 각각46,860→242, 대상112,637→13,404. 관측 snapshot121,603→20,828/metric465,120→120,025/예보revision25,086→8,649. 기존 잠금과 참조 보호로 두 retention 작업의 pending까지 모두 소진했다.
- 보존 확인: KST 오늘~D+7 결과589,877개 내용 지문 동일, 최신 생산/읽기242묶음 및 평가/입력/대상각13,404개 ID 집합 동일·누락참조0. 올해 수온9,805개/최근31일 수질·조석 snapshot68개 및 무관한56테이블 행수·내용 지문 동일. 대상9테이블 VACUUM FULL/ANALYZE 전후 전체69테이블 행수·보존 지문 동일.
- 백업: `~/.local/share/pongdang/backups/before-local-retention21-20260928-133644.dump`, 3,055,775,554bytes/0600/SHA256 `553182b37c5825a60232d59ece39a6273568e8437a2e4ba52ab74dc612295d6a`. archive411항목 전체 디코딩 및 자체50862/pongdang_test의 전체69테이블 스키마·대표2테이블 데이터 복원 통과. 모든 데이터의 전체 실복원 시험은 아님. 테스트 PG 종료.
- 실행 중 발견한 무제한 경계 clipping UPDATE 타임아웃을 수정: `condition_storage._prune_result_history`의 과거/미래 삭제·경계 조정을 전체10,000행/statement2,000행 예산으로 제한하고 시작/끝 조건을 분리하여 기존 인덱스 사용. batch_size1의 실제4행 변경을 실패로 먼저 재현. 대량 삭제 후 오래된 통계로 인한 전체 스캔은 대상 ANALYZE로 해결. 시간 제한 확대·실패 이력 삭제·실패횟수 직접 초기화 없음.
- 검증: 최종2파일 Ruff/format과 별도 폐기용 DB 관련20개 테스트 통과. 원격 변경의 frontend lint/Node186개/증분TypeScript와 원자료 보존 관련 테스트도 앞 단계에서 통과. 전체 릴리스 빌드·전체 suite 반복 없음.
- 복구: backend8000 PID75515, frontend5173 PID47547, collector LaunchAgent PID75486/release218bb5bfa44f19bf. 설치 app139파일이 checkout과 일치하고 실제 cwd/최근 heartbeat 확인. backend health/ready·프런트 경유 ready·홈페이지HTTP200, 대표 conditions API와20개 catalog 확인. 브라우저 홈·오늘에서 경포 수영92.7/수온23.92°C, 시간대/주간예보/주변 비교/물때/사진/상시개방·연중무휴 표시 확인.
- 자동 정리 활성: condition_result_retention succeeded/연속실패0/다음9월29일00:00KST, evidence_retention succeeded/연속실패0/다음9월28일15:38KST. 정리 전 condition_projection에는13:33 DATABASE_STATEMENT_TIMEOUT1회 기록이 있었고, 복구 후14:46부터 새 계산 실행 중(14:49확인, heartbeat23초 이내). 현재 표시되는 유지 결과는12:38 관측 기준이며 신규 계산 완료와 구분한다. 로컬 알림 SSO 미설정 안내도 남아 있으며 이번 DB 정리와 별도다.
- 상세 결과·복구 절차·기계 검증: `/Users/cksmacbook/.local/share/pongdang/local-maintenance/20260928-133644/REPORT.md`, `RECOVERY.md`, `state.json`, `before.json`, `after-retention.json`, `after-vacuum.json`, `preservation-checks.json`, `vacuum-checks.json`, `runtime-checks.json`. 요청한 DB 유지보수의 미완료 단계는 없다.

# 원격 main 수신·로컬 서버 재시작 완료 · 2026-09-28

- 사용자 요청에 따라 원격 main만 fetch하고 `fix/finale`에 fast-forward 병합했다. `4149b54` → `ddd5aef93748f051e332b903d94139f05fa9c0d0`, 새 커밋 6개/49파일. HEAD와 origin/main 차이 0/0, 충돌 없음. 기존 미커밋 문서 2개와 미추적 산출물을 보존했다. 로컬 main과 dev refs, 원격 refs는 변경하지 않았다.
- 로컬 웹 서버 재시작: backend `127.0.0.1:8000` PID47543, frontend `http://127.0.0.1:5173/pongdang/` PID47547. Python3.14/기존 Node24.19.0과 `/pongdang/` base를 유지했다. 로그는 `.local/dev-server-20260928-010808/`.
- 확인: 페이지·backend health/ready·frontend 경유 ready 모두 HTTP200. 실제 브라우저 홈에서 경포 수영67.3/수온23.5°C와 시간대별 점수·장소 사진·물때 표시를 확인했다.
- 검증: 변경 프런트 파일 ESLint, Node186개, 증분 TypeScript 통과. 변경 백엔드18파일 Ruff/format과 DB 연결 없는 날짜 범위·retention 스케줄 관련6개 테스트 통과(의존성 deprecation 경고2개). 병합 후 diff --check 통과. 전체 빌드·DB 통합 suite는 실행하지 않았다.
- 로컬 DB는 읽기 전용 연결로 `5432/pongdang`, schema v20을 확인했다. 최신 코드의 v21 유지보수 migration과 수집기 재설치·재시작은 이번 웹 서버 재시작에서 실행하지 않았다. 운영 서버 접속·배포·push 없음.

# main 병합·GitHub 푸시·운영 배포 완료 · 2026-09-27

- 후속 실제 도메인 검토: 사용자가 지정한 https://pongdang.site/를 브라우저로 직접 확인. JS index-P8D2jWzU.js/CSS index-BieM4Bn9.css가4149b54 실행 컨테이너와 일치하며 장소 팝업·오늘 운영시간 상시 개방/연중무휴도 반영됨. 커밋 누락은 없음. 일반 urllib의403과 실제 브라우저 접근 결과를 혼동하면 안 됨.
- 운영 미해결2건(읽기 전용 확인): condition_projection이 DATABASE_STATEMENT_TIMEOUT으로9회 연속 실패, 최근 성공2026-09-25T10:40:20Z/다음시도2026-09-27T16:52:15Z. 실제 화면의 관측 기준9/25 19:28·서핑64.8이 로컬과 다름. nifs_risa 수집 자체는9/27T10:54Z succeeded. 별도 점수 계산 timeout 조사가 필요하며 이번 확인에서 작업 재실행/DB 변경 안 함.
- 인증 미해결: pongdang.site Nginx는 owner API에 auth_request 및401→/oauth2/start302를 적용한다. 브라우저 알림·취향은 Failed to fetch. 현 폼의 /sso/api/state는 해당 도메인에서200 text/html(앱 fallback)이라 로그인API가 아니다. 실제 domain OAuth 경로와 폼의 Authelia 경로가 불일치. 도메인/SSO 연동 수정이 필요하며 이번 검토에서 설정/코드 수정 안 함. 서버 세션 종료.
- 사용자 승인 범위: 완료된 홈/오늘 화면, 실제 수온 연결, 로그인·알림 및 운영시간 표시 변경의 main 통합·push·배포. 제품/설정 템플릿/관련 테스트·문서58파일을 4149b54088b248b70fa2e1792a6931ffe7aecdf3으로 커밋했다. 기존 원격 main의 호스트 pull 배포 전환705bd65를 먼저 fast-forward하여 보존했다.
- fix/finale → 기존 main worktree를 fast-forward하고 GitHub main에 push 완료. 최종 fix/finale/main/origin/main/원격 main은4149b54. dev/origin/dev/원격dev는0f824a9 그대로. 로컬 인수인계2개와 .byeori/.playwright-cli/output 산출물은 미커밋 상태로 보존, 비밀 설정은 커밋하지 않았다.
- CI https://github.com/facio313/Pongdang/actions/runs/36313935051 : backend/frontend 이미지 빌드 모두 success. 직전 로컬 Node184개·lint·증분TypeScript 및 각 기능별 기존 검증 결과를 사용, 통과한 전체 검증을 반복하지 않았다. staged diff --check와 로컬 비밀값/개인키 미포함 검사 통과.
- 운영 서버 직접 읽기: deploy-watch-state.json의 동일SHA/run36313935051/attempt1/outcome success, current release4149b54 확인. frontend/backend/collector의 이미지 태그가 모두4149b54이며 DB 포함 Healthy. health/ready200(status ok), 기본 장소470 경포와 상세의 상시 개방·연중무휴 확인. 프런트 자산 index-P8D2jWzU.js / index-BieM4Bn9.css. 운영 NIFS 키 설정 유무만 true 확인(값 출력 없음).
- 감시기가 자연스럽게 배포했으며 수동 중복 배포·서버 설정 변경 없음. previous release705bd65 보존, 감시기 정상 종료상태0. 외부 비로그인 /pongdang 및 health/ready는 배포 전403이어서 운영 검증은 서버 loopback에서 수행했다. SSH 세션 종료. 이 완료 기록은 추가 문서 전용 배포 없이 로컬에 남긴다.

# 오늘 기본 운영시간 연결 · 2026-09-27

- 요청: 오늘 물때 아래 운영시간 영역에 기존 기본 시간 정보도 연결. 선택 장소의 저장된 TourAPI 상세를 기존 usePlaceDetails로 읽어 이용시간·개장 기간·휴무일과 추가 활동 시간 안내를 표시한다. 이전 수집 안내도 유지하며 출처·원천 수정일·수집일은 기본 안내 tooltip에 보존한다.
- 기존의 항상 비어 있던 래프팅·튜브 행은 자료가 있을 때 표시한다. 별도 공식 운영시간/제한은 그대로 구분하며, 장소의 상시 개방 안내를 개별 활동의 운영 허가로 대입하지 않는다. 제목은 운영시간 안내. 변경 범위는 오늘 데스크톱 해당 영역과 데이터 표시 helper·번역·테스트.
- 실제 경포(spot_id=7) 저장 자료에서 이용시간 상시 개방·휴무일 연중무휴 확인, 로컬 오늘 화면에 두 값이 표시되는 것과 배치 확인. 해당 장소의 별도 래프팅/튜브 시간은 현재 자료 없음. DB·수집기 변경 없음.
- 검증: 수정 파일 ESLint, Node184개(시간 안내 관련3개 추가), 증분 TypeScript, diff --check 통과. 로그 /tmp/pongdang-operating-hours-verify.log. 기존 WIP 보존, 커밋·push·배포 없음.

# 오늘 로그인 폼 · 2026-09-27

- 요청: 로그인 버튼의 안내 팝업을 실제 로그인 폼과 X 닫기로 교체하고, 로그인 후 저장된 알림을 표시. 오늘 물때 설명의 내부 제공자 코드 제거.
- 구현: 공통 loginPopover에 아이디/비밀번호 폼, 대기·실패·취소·포커스 복원 적용. 기존 same-origin Authelia `/sso/api/state` 확인 후 `/sso/api/firstfactor` 호출. 서버가 요청한 auth/continue callback을 승인한 경우에만 팝업을 닫고 invalidateResources로 알림 구독/평가/이벤트를 재조회한다. 추가 인증/정책 확인은 기존 SSO 화면으로 이어진다. 비밀번호는 저장/로그하지 않고 제출 종료·닫기에 입력 제거. 새 계정 체계, 서버 설정, 권한, DB 변경 없음.
- 확인된 운영 읽기: bonifacio.work의 /sso/는 frame 삽입 차단, /sso/api/state는 기존 Authelia JSON 계약 제공, /pongdang/auth/continue는 SSO로302. 실제 자격증명 제출/로그인은 하지 않음. 로컬5173에는 /sso/가 연결되지 않아 실제 계정 인증은 불가하며 preflight 실패 시 비밀번호를 전송하지 않는다.
- 검증: 수정 파일 ESLint·증분 TypeScript·Node181개(SSO 경계5개 추가) 통과. DB/외부 API 없는 별도57522 격리 UI에서 로그인 실패→성공→팝업 닫힘→구독 수온24°C/최근 알림/설정 링크 자동 표시 확인. 실제2370px 화면의 폼·X·키보드 순환·실패 후 비밀번호 포커스·제공자 코드 제거 확인. 최초 임시 검증 화면의 React import 경로 오류를 수정한 뒤 통합 흐름 통과. 격리 서버/탭은 검증 후 종료. 커밋·push·배포 없음.
- 관련: frontend/src/loginPopover.tsx, loginPopover.css, ssoLogin.ts, locales/common.ts, TodayDesktop.tsx, frontend/tests/ssoLogin.test.mjs.

# 홈 상단 장소 말풍선 · 2026-09-27

- 후속2건: 홈의 중복 적합도/등급 칩을 데스크톱·모바일에서 제거. 파도는 실제 반복되지 않던 곡선과 잘못된 이동 거리(960/720px 등), 넓은 화면에서 고정 SVG 끝 노출이 원인이었다. 높이·접선·곡률이 이어지는1440주기를 두 번 그리고 SVG 폭을 컨테이너의2배 이상으로 확보해 정확히 -50%만 이동하도록 홈/공통 푸터에 적용. 수정 파일 lint·증분TypeScript·Node176개(곡선 연결/반복 동일성2개 추가) 통과,2370/390px 실제 화면과 최종 이동 시점의 폭 충족·가로 넘침 없음을 확인. 초기 lint의 미사용 테스트 변수2개를 제거한 뒤 통과. 관련 브라우저 기대값 갱신, 자동 브라우저 suite 미실행.
- 홈 본문의 별도 기준 시각과 데스크톱 ‘강원도 물놀이’ 문구를 제거. 상단 장소명 옆에 표시 중인 조건의 computed_at → retained_at → at 순서로 날짜·시간을 표시하며 KST 표기는 생략한다.
- 한국어 옆 장소 이름을 누르면 검색·지역·페이지·기준 장소 선택을 담은 말풍선이 열린다. 선택/기본 장소 복원 후 닫힘, Esc·바깥 클릭·키보드 포커스 이탈로 닫힘, 검색 초안 보존. 기존 오늘 화면의 selector는 유지한다. 모바일도 상단 장소명에서 같은 말풍선을 사용하며 배경만 잘라 팝업 하단이 가려지지 않도록 수정했다.
- 검증: 변경 파일 ESLint·증분 TypeScript·Node174개 통과. 실제 로컬2370/1080/390px에서 표시·장소 변경/복원·Esc/바깥 클릭·초안 보존·모바일 팝업 잘림/가로 넘침 없음을 확인. 관련 브라우저 회귀 기대값과 팝업 동작 검사를 갱신했으며 자동 브라우저 suite는 미실행. 기본 경포 장소와 브라우저 기본 폭으로 복원. 기존 WIP 보존, 커밋·push·운영 배포 없음.

# 국립수산과학원 RISA 수온 연결 · 2026-09-27

- 제공받은 인증키는 ignored backend/.env의 NIFS_API_KEY에만 저장(0600). 실제 인증 성공. 최종 공식 HTTPS /api/OpenAPI_json 직접 호출로 문서 URL의302 리디렉션을 해소했으며 인증 URL·키·원본 응답은 로그/저장소에 남기지 않았다.
- nifs_risa를30분 주기·수동 갱신·조건 결과 생성 전 수집 작업으로 등록. 기본 고성 가진 fggo3/양양 byy87/강릉 bgna3/삼척 bsc87의 표층만 수집하고 관측소 좌표·KST 시각·측정 수심5m·층을 보존. 점검/불명/결측 값은 missing, 상충 배치는 거부. 관측 시각부터60분인 앱 신선도 창을 재조회로 연장하지 않음. 기존10km 주변 경로에 연결, 대표 매핑/스키마 변경 없음. 상세에 관측 범위 표시.
- 검증: 변경 파일 Ruff/lint/증분TypeScript와 Node174개 통과. 백엔드 최종 어댑터31개+저장/조건 원본·게시 계산 경로 통합11개=42개 통과, 앞선 refresh9개 통과. 초기 통합 테스트의 필수 쿼리 필드 누락을 수정한 뒤 통과. 폐기용57519/pongdang_test 종료. git diff --check 및 diff/새 소스의 키 미포함 확인.
- 로컬 실행: 17:30 관측 강릉23.7/삼척24.1/양양23.3/고성 가진22.9°C 저장 성공(관측소4+관측4). backend8000 PID11506으로 재시작, health/ready200. 원본 조건 읽기에서 가진해변→고성 가진1.49km22.9°C, 낙산→양양7.08km23.3°C 확인.
- 완료: 새 조건 결과114,238건 생성·게시 성공 후 LaunchAgent bootstrap 재개. 실제 API/홈에서 새 수온 확인: 순개울23.7°C·도직24.4°C·잔교리23.3°C·반암22.9°C, 중복 없이4곳. 반암 상세에서 고성 가진8.0km·17:30 관측·18:30 유효·표층 수심5m 표시 확인 후 홈으로 복귀. frontend5173/backend8000/자동 수집기 실행 유지. 커밋·push·운영 배포 없음.

# 홈 해변 수온 기준 무작위 선택 · 2026-09-27

- 최신 요청: 중복 수온을 완전히 제외한다. 동일한 표시 수온은 무작위 해변 한 곳만 선택하고, 서로 다른 값이4종 미만이면 확인된 개수만 보여준다. 아래의 부족분 중복 채우기 정책을 대체한다. 수정 파일 lint·Node174개·증분TypeScript·diff --check 통과, 실제 홈에서 안목23.53°C·증산24.4°C 두 카드만 표시 확인.
- 추가 자료 조사(읽기 전용): NIFS RISA 공식 목록에 고성 가진·양양·강릉·삼척이 있고, 인증키 기반 risaList(30분 수온/관측 시각/층/점검 상태)와 risaCode(위경도/측정 수심)를 제공한다. https://www.nifs.go.kr/openApi/actionOpenapiInfoList.do 및 https://www.nifs.go.kr/risa/risa/risaZ/actionRisaBookMark.do 참조. 실제 인증 API 응답은 아직 확인하지 않았다. 기존 KHOA 설정은 DT_0006/TW_0089 각각 한 곳이며 KMA 부이는 코드에서22105 한 곳·좌표 미수집이어서 기존 관측소 범위 확대도 필요. 새 수집기·설정·DB 변경은 하지 않았다.
- 후속 요청: 서로 다른 수온을 우선 선별하고, 서로 다른 값이4종 미만일 때만 남은 무작위 후보로4곳을 채운다. 같은 해변은 중복하지 않는다. 4종 이상/3종/2종 및 기존 랜덤 유지 회귀를 포함한 Node174개·lint·증분TypeScript 통과. 실제 홈에서23.53°C·24.4°C가 우선 배치되고 나머지 카드만 중복 수온으로 채워지는 것 확인.
- 후속 요청: 홈 해변 카드의 ‘주변’·‘이전 관측’을 제거해 ‘수온 24.3°C’ 형태로 단순화. 관측소·거리·시각 tooltip 및 상세의 출처/이전 관측 구분은 유지. 변경 파일 lint·Node171개·증분TypeScript 통과, 실제 홈 카드 표시 확인.
- 기존 이름순 앞4곳을 수온 관측이 확인되는 해변 중 최대4곳 무작위 선택으로 교체. 현재 강원 해변93곳은 kind=beach 100행 페이지에 모두 포함되며, 기존 요약 API를25개씩 최대4묶음으로 읽는다. 모든 묶음이 끝난 뒤 선별해 먼저 응답한 이름순 후보의 편향을 막는다. 선택된4곳만 사진을 읽고 카드별 수온 추가요청은 제거.
- 직접·대표·주변 관측 수온만 포함하고 미확인·예보·상충·잘못된 단위/관측 근거·서버 무효화 자료는 제외. 오래된 실제 값은 이전 관측으로 표시. 후보가4곳 미만이면 확인된 곳만 표시한다.
- 브라우저 페이지별 시드와 ID 정렬 후 Fisher–Yates 추첨으로 일반 재렌더·홈 왕복·데스크톱/모바일 전환 때 선택 유지, 페이지 새로고침 때 새 추첨. 웹캠 추첨과는 별개다.
- 검증: 수정 파일 ESLint, Node171개(추첨 회귀7개 추가), 증분TypeScript, diff --check 통과. 기존 브라우저 fixture/기대값을 묶음조회·무작위 순서·미관측 제외에 맞춰 갱신하고 lint 통과; 자동 브라우저 suite 미실행. 실제 로컬 홈에서4개 전부 수온 표시,390px 가로 넘침 없음, 최종 코드 reload 후 모바일↔데스크톱 동일한4개 유지 확인.
- 주요 파일: useHomeBeaches.ts, homeBeachPicks.ts, HomeDesktop/HomePage, FirstSwimGuide, firstSwimTemperature, useConditionSummaries 및 테스트. 백엔드·DB·수집 정책 변경 없음. 기존 WIP 보존, 커밋·push·운영 배포 없음.

# 해변 카드 직접·주변 수온 구분 · 2026-09-27

- 사용자 승인한 표시 방식 반영 완료. 장소 관측은 우선 사용하고, 관측이 없는 해변만 기존 observation 조건 응답의 nearby_station_context를 읽는다. 직접 관측 지점은 ‘수온’, 대표·주변 관측소는 ‘주변 수온’으로 구분. 관측값 오류·상충을 주변 값으로 가리지 않고 예보·임의 평균·DB 매핑 변경은 사용하지 않는다.
- 카드에는 값과 ‘이전 관측’을 간단히 표시하며 모바일에서는 자연스럽게 줄바꿈한다. 상세에는 관측소 이름·직선거리·관측 시각·유효 시각·출처를 표시. 기존 useExpired 타이머로 유효기간이 지나면 이전 관측으로 전환한다. 주변 참고값은 알림 판정에 사용하지 않으며 상세에 이를 안내한다.
- 실제 화면 확인 당시 감추→묵호 24.3°C·4.1km·15:30 관측, 강문→경포대해수욕장23.62°C·1.9km·15:20 관측(이전 관측). 가진·갯마을은 주변 자료도 없어 미확인 유지. 수집 중이므로 값은 계속 갱신된다.
- 검증: 변경 TS/TSX ESLint, Node164개(새 수온 선택 회귀10개 포함), 증분 TypeScript, git diff --check 통과. 데스크톱 상세와 모바일390px 홈/상세에서 실제 자료·출처·만료 표시·가로 넘침 없음 확인. 기존 브라우저 회귀 기대값과 주변 자료/만료 시나리오를 갱신하고 lint 통과; 자동 브라우저 suite는 미실행.
- 주요 파일: frontend/src/firstSwimTemperature.ts, useFirstSwimTemperature.ts, FirstSwimGuide.tsx, firstSwimGuide.css, locales/notifications.ts 및 관련 테스트. 기존 WIP 보존, 커밋·push·운영 배포 없음. 로컬 frontend5173/backend8000 계속 실행.

# 홈 브라우저 피드백 8건 · 2026-09-27

- 후속4건: 취향 영역 제목을 ‘이제 어디로 떠나볼까요?’로 재수정. 홈 상단 안내는 작게, 활동명은 크게 분리하고 중복 등급 문장을 데스크톱·모바일에서 제거. 변경 파일 ESLint/증분TypeScript/Node154개 통과, 실제2370px·390px 화면 및 가로 넘침 없음 확인.
- 수온 질문 추가 조사(읽기 전용): 네 해변 모두 검증된 station_mapping은 없다. 다만 저장 조건 응답의 context_metrics에는 감추→묵호 약4.06km(24.3°C,9/27 15:00 관측), 강문→경포대해수욕장 약1.93km(23.58°C,9/27 14:50 관측)의 주변 수온이 있다. 가진·갯마을은 해당 응답도 비어 있다. 현재 카드의 water-temperature 조회는 이 주변 context를 읽지 않는다. ‘주변 관측 수온’으로 출처·거리·관측시각/오래된 값 표시를 붙여 활용하는 방안과 나머지 지역의 수집 범위 확대를 설명했으며, 아직 데이터 연결·수집 정책은 변경하지 않았다.
- `fix/finale`에 GitHub main `217e39a`를 fast-forward한 뒤 홈 피드백을 로컬 반영했다. 기존 두 인수인계 문서 수정과 미추적 파일을 보존했으며 커밋·push·운영 배포·dev 변경은 없다.
- 홈 해변 제목의 첫 입수 문구와 공통 하단 설명(데스크톱·모바일)을 제거. 외부 기온 제목 버튼으로 기존 점수 기준·출처를 펼치고 접으며, 별도 기준 summary는 제거. 만조·간조 시각을 확대·굵게 표시. 취향 제목은 ‘취향에 맞는 하루를 찾아보세요’로 변경.
- 수온 미확인 원인: 실제 로컬 API에서 가진5477/감추2916/강문9/갯마을5609 모두 stations/layers가 비어 있고 `no_mapped_measurements`였다. 임의 관측소 연결이나 값 대입 없이 미확인을 유지하고 tooltip에 조회 사유를 표시한다.
- 썸네일 원인: 공식 API가 `imgproxy.windy.com/_/thumbnail/plain/current/{camera_id}/original.jpg` 서명 URL을 반환하지만 기존 허용 목록은 옛 이미지 호스트만 수용했다. 정확한 신규 호스트·경로를 추가하고 unavailable만 명시적 refresh에서 최초 저장 가능하게 수정. 저장 성공 파일과 실패·중단 기록은 재다운로드하지 않는다. 서명 URL은 저장·응답·로그에 남기지 않았다.
- 로컬 CLI 목록 refresh 완료: 현재 카탈로그27개, 썸네일27개 저장. 과거 카탈로그의 unavailable1개는 그대로 유지. 프록시 경유 대표 이미지3개 HTTP200/image/jpeg와 브라우저 실제 이미지 로딩을 확인했다. 운영에는 적용하지 않았다.
- 검증: 변경 파일 ESLint/증분 TypeScript/Node154개, Ruff와 신규 폐기용 PostgreSQL18 `pongdang_test`에서 썸네일42개 통과. 관련 브라우저 회귀 기대값을 갱신했고 자동 브라우저 suite는 실행하지 않았다. 실제 로컬 브라우저 데스크톱2370px·모바일390px에서 클릭/Enter 접기·펼치기, 문구 제거, 물때 시각 강조, 이미지 표시 및 모바일 가로 넘침 없음을 확인. 임시 PG는 종료했다.
- 로컬 실행 유지: frontend5173(PID69751), 최신 backend8000(PID76903), readiness200. 변경 파일은 HomeDesktop/HomePage/AppShell/pongdangUi/pongdangDesktop/FirstSwimGuide 및 관련 스타일·번역, backend/app/livecams/thumbnails.py와 관련 테스트, docs/webcams.md.

# main 릴리스 완료 · 2026-09-23 22:20 KST

- 사용자 승인에 따라 `fix/finale`의 백엔드 결과 저장 변경을 커밋하고 main에 병합·GitHub push·운영 배포 완료. 최종 main/origin/main/fix/finale은 `308070dd848f6d5a369e5c3c061f902ca7f58696`. dev/origin/dev/원격 dev는 기존 `0f824a9ccecbd7ed5332919c99b03920b769000c` 유지. frontend 제품 소스와 로컬 미추적 산출물은 변경하지 않았다.
- 복구 호환 릴리스 `86c0460`을 Actions `35864038830`으로 먼저 배포했다. v20 DB 수용과 legacy snapshot이 있는 세대만 읽는 v19 복구 경로를 관련 7개 검사로 검증했다. 본 변경 `66ed89a`는 main 병합 `f29afb9`에 포함됐다.
- `f29afb9`의 두 이미지 빌드는 성공했으나 Actions `35864259207` 배포가 초기화 약 5초 뒤 실패했다. 트랜잭션 rollback, 앱 교체 전 중단했으며 기존 운영 점수 표시를 확인했다. 당시 로그에 오류 종류가 없어 3초 DDL 잠금 경합은 유력 가설로 남는다.
- 후속 `308070d`: v20 이관에서 세 관련 테이블의 NOWAIT 잠금을 savepoint 안에서 모두 확보하고, 경합 시 부분 잠금을 풀어 최대 600초 기다린다. 초기화 전용 lock timeout 60초 / statement timeout 300초, CLI 오류 로그는 예외 종류와 SQLSTATE만 포함한다. 폐기 가능한 별도 DB에서 잠금 경합 4개 + 기존 이관 6개, 초기화·진단 6개 및 Ruff 통과.
- 최종 Actions `35864993519` 성공: backend/frontend 이미지 빌드, 스키마 초기화, backend/frontend/collector/db Healthy, readiness `{"status":"ok"}`, 로그의 배포 SHA `308070dd848f6d5a369e5c3c061f902ca7f58696` 확인. 운영 초기화는 약 11분 5초 걸렸고 배포 완료는 22:20:16 KST. https://github.com/facio313/Pongdang/actions/runs/35864993519
- 이관 중 운영 홈 점수 조회의 일시 오류를 직접 확인했다. 완료 후 컴퓨터 유즈로 운영 홈의 경포 수영 66.2, 수온 23.71°C, 09/12/15/18시 55.7/86.8/91.2/74.5, 명소 사진 복구를 확인했다. 오늘 화면에도 수영 66.2 / 서핑 58.3 / 휴식 62와 이전 값 유지 표시가 나왔다. 자료 없는 온천·래프팅은 결측을 유지한다. 별도의 운영 부하 시험이나 새 수집 주기 전체 완료 검증은 하지 않았다.
- 운영의 옛 결과 snapshot은 복구용으로 보존하며 retirement는 실행하지 않았다. 로컬에서 이미 확인한 추천 활동 불일치·지도 행 수온 누락·물때 표 중복 key는 이번 범위에 포함하지 않은 기존 미해결 사항이다.
- 상세 로그/실행 결과: `/Users/cksmacbook/.local/share/pongdang/releases/20260923-condition-results/`. 이 완료 메모는 로컬 인수인계용으로만 갱신하며 문서 전용 재배포를 유발하는 추가 push는 하지 않는다. 아래 항목은 당시 작업 이력이다.

# 조건 결과 백그라운드 갱신 · 2026-09-23

- 최신 작업: [CONDITION-REFRESH.md](CONDITION-REFRESH.md). 프론트 변경 없이 완료 결과 SELECT, 갱신/실패 중 이전 점수 유지, 독립 지표 보완 및 미래 예보30분 수집을 구현하고 **실제 로컬 적용·화면 확인까지 완료**했다. v20 migration과 새 generation330 게시, 과거23790행 복원, 현재/미래130003행 불변 및 옛 결과258770행 정리를 확인했다. 최종 관련54+6테스트/Ruff 통과. DB약22.64→12.85GB, 새 결과약1.11GB. 전체 사전백업 보관. frontend5173(PID69751)/backend8000(PID78366)/collector(PID78637,release1a3509d0e88e6646) 실행 유지. 운영·커밋·푸시 없음. 아래 기록은 이전 이력으로 보존한다.

# 데이터 유지·운영 반영 검토 · 2026-09-22

- 사용자 요청은 확인/검토이므로 제품 코드·배포·실제 DB 변경 없이 읽기 전용 점검. 기존 인수인계에 결과만 기록. cks-platform-ops 적용.
- main e3d29443e59a5a68221100529b1608c071ae6016 최신 확인. Actions35692900255 frontend/backend3shards/browser2shards/smoke/deploy 성공; 배포 로그15:05:47 KST에 같은SHA, 초기화 및 모든 컨테이너healthy/ready 성공 확인. 이는 당시 CI 관측이며 현재 운영 직접 관측은 아님. SSH22022 connection refused, 공개 health/ready/conditions 모두403으로 현 운영 데이터 검증 불가. 로컬WIP(v19/30초재조회/지점비교 등)는 아직 미커밋이라 해당배포에 포함되지 않음.
- 로컬 실제읽기: schema19, generation174=115640건15:24:16 게시완료, projection job succeeded/연속실패0, heartbeat최근. API 경포swim72.3/추천surf81.9, refreshing/retained=true, default-place preferred 정상. 새 자료 갱신 중 기존게시값 유지.
- 별도57519 pongdang_test에서 현재main schema.py를 git show로 로드하여 진짜v18 초기화→자료/게시→로컬v19마이그레이션→재게시→9일 수집중단 시점 조회 재현. 점수25.0 일관유지, 이전결과 표시true. 기존 관련49/154프런트/18브라우저 통과 결과도 검토. 테스트스키마 제거 및 테스트PG종료, 실서버유지.
- 확인된 배포차단위험: v19DB에서 이전main v18 initialize를 실행하면 ValueError(Unrecognized Pongdang schema version) 재현. ops/pongdang-deploy64는 이전compose 전체up으로롤백하고 initialize 의존성도 재실행하므로 v19배포후실패시 자동복구막힘가능. 현재배포main18 자체의새데이터유지 실패를관측한것은아님. 운영승격전에 구버전앱/신규스키마호환성 및 초기화롤백전략보완필요.
- 검증공백: ready는SELECT1, collector health는heartbeat만확인; 새점수게시/대표장소 응답 유지 보장은없음. CI성공만으로실제갱신완주단정불가. 서버측 제한된 읽기로 배포SHA/schema/projection job·게시상태/대표API확인이 추가로 필요. 제품코드수정/푸시/운영조작안함.

# 최신 main 반영 및 서버 재기동 · 2026-09-22 15:18 KST

- 요청: main 풀 후 서버 재기동. fix/finale a3cb8fb→e3d2944(4커밋) fast-forward, origin/main과0/0, 미해결 충돌0. stash0d60b9b175eae8316a94fc86bf646de6899f28f6 및 ~/.cache/pongdang-main-merge-20260922-151447/wip.patch 보존. 사용자 WIP는 unstaged, dev/커밋/푸시/운영 배포 없음.
- 통합 결정: main의 영속 점수 보존이 이전 로컬 관측소별 무효화 구현을 대체하므로 condition_storage는 새 main을 채택. 상충하는 로컬 과거 점수 테스트는 새 main의 유지/제한 회귀로 대체. 코스/가까운 지점 비교·계산 대기 재조회는 보존. main18과 로컬18 구분 위해 통합19로 마이그레이션; 로컬 잔여 TRUNCATE 트리거 제거 및 기존 게시 유지/재계산 예약. 이전 소스는 stash에 남아 있음.
- 검증: 프런트lint/154단위/typecheck 통과. 백엔드49관련 중 초기3실패(불필요한 옛 버전 revision 증가2, upstream 테스트의 UTC/KST 문자열 비교1)를 수정, 영향35 재실행 통과 및 나머지14 앞선 통과. 브라우저18(핵심8/점수 갱신/데스크톱 코스/주변비교) 통과. 시간 비교는 UTC 정규화로 의미 유지. 테스트DB 종료.
- 로컬 DB5432/pongdang만 schema backup ~/.local/share/pongdang/backups/before-local-schema19-20260922-151735.sql(0600) 후18→19 적용. frontend5173 PID23756/backend8000 PID23755/collector PID23762 최신 코드 실행. 로그 /var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-dev-server-cazlqq91/. 페이지/health/ready/실제 조건API HTTP200. 경포 swim83.8, generation173, refreshing/retained=true로 이전 점수 유지하며 갱신 확인.

# 로컬 서버 재기동 · 2026-09-22

- 사용자 요청으로 병합된 코드 실행. localhost5432/pongdang v17 확인 후 schema-only 백업 ~/.local/share/pongdang/backups/before-local-schema18-20260922-103626.sql(0600), app.schema.initialize로 v18 적용 완료.
- frontend5173 PID33015, backend8000 PID33014, 최신 소스로 재설치한 collector launchd PID33027 실행. 로그 /var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-dev-server-hzw1a2oi/.
- /pongdang/, /api/health, /api/ready 및 경포 nearby API 모두 HTTP200. 강문·사근진 비교 후보 확인. DB 전환으로 이전 게시 무효화, 수집기 새 점수 계산 대기 상태는 실제 API로 별도 확인. 운영 배포·Git 커밋/푸시 없음.

# GitHub main 재병합 · 2026-09-22

- 요청: 최신 main을 현재 fix/finale에 병합. origin/main만 fetch 후 1409368→a3cb8fb(8커밋) fast-forward 완료. dev 변경·커밋·푸시·배포 없음.
- 미커밋 작업은 stash 45e25271b409863323363a2b347a5a98aa2dd97b 및 ~/.cache/pongdang-main-merge-20260922-100010/ 패치로 보존 후 복원. stash는 복구용으로 유지. 9파일 충돌 해소, 모든 수정은 원래처럼 unstaged.
- 통합: main의 v17과 로컬 v17을 기존 통합 v18로 수용. 원격 retained/retention_allowed/latest_source_revision과 로컬 관측소 무효화를 결합해 무효화된 점수를 프런트가 보존하지 않게 함. 원격 30분 기본 갱신·실패/빈 응답 이전값 유지와 로컬 계산 중30초/서버 refresh_after 재조회를 함께 보존. 코스 경로·가까운 지점 비교 유지.
- 검증: lint/format/typecheck, 프런트151단위, 백엔드44관련(최종 invalidation/storage43 및 앞선 feature migration1), 브라우저22 모두 통과. 첫 백엔드 검사는 이전 테스트DB 잔여 fixture와 구버전16 기대값으로2실패; fixture 정리 및 새 main17 기대값 수정 후 관련43 재실행 통과. diff --check/미해결 충돌0 및 HEAD...origin/main 0/0 확인.
- 검증용57519 PostgreSQL과57520/57521 웹서버 종료. 개발5173/8000·collector는 재시작하지 않았고 실제5432 DB 마이그레이션도 하지 않음.

# 로컬 서버 종료 · 2026-09-22

- 사용자 요청으로 Pongdang Vite5173(PID72312), backend8000(PID9260), collector(PID5258), 작업용 Playwright daemon/browser(PID67344/67345) 종료. collector launchd 서비스를 bootout하여 현재 세션 자동 재시작도 중지. 해당 PID 소멸 및 5173/8000/57519/57520/57521 리스너 없음 확인.
- 기존 Homebrew PostgreSQL5432와 Redis6379는 프로젝트 개발 서버와 별도 서비스로 유지. 코드·DB 데이터 변경 없음. 아래 실행 중이라는 과거 기록은 이 종료 상태로 대체됨.

# 현재 작업 · GitHub main 병합과 충돌 해소 · 2026-09-21

- 요청: GitHub 최신 main을 가져와 현재 작업 브랜치에 병합하고 충돌 확인. origin/main만 명시적으로 fetch했고 fix/finale을50a9e72→1409368(9커밋) fast-forward. 로컬 main/dev 및 origin/dev 갱신·커밋·푸시·배포 없음.
- 보존: 수정/신규 코드28개를 ~/.cache/pongdang-main-merge-20260921-204800/에 파일·패치·SHA로 백업. 보존 stash d3cda702804a0f87f53a51793e0bac7e98303562를 적용 후 남겨둠. .byeori/.playwright-cli/output/.env는 건드리지 않음. 원래 미커밋·unstaged 상태로 복원.
- 충돌: stash 복원 시 backend/app/schema.py와 backend/tests/test_feature_migration.py 2개 발생, 해소 완료. 원격v16의 무변경 수집/미래·NULL timestamp 처리와 NOWAIT 잠금 재시도, 로컬v17의 관측소별 무효화를 함께 보존하도록 v18 마이그레이션으로 통합. v16 statement trigger를 정리 후 scoped row trigger만 설치하여 중복 실행 방지. 실제main v16→18과 로컬17→18 경로 회귀 추가.
- 검증: backend 관련47개 범위 중46개 통과, 첫1개는 이전 브라우저 테스트DB 잔여 fixture 때문에 실패. 정리된 동일 disposable DB에서 해당 invalidation 파일18개 재실행 모두 통과. Ruff, 병합된 프런트12파일 ESLint/141단위/증분typecheck 통과. git unmerged0, HEAD...origin/main 0/0, dev refs 전후 동일 확인. 코스 경로·점수 갱신·지점 비교·조회 중복 방지·핵심 흐름 브라우저20개 모두 통과(46.8초).
- 실행 환경: 테스트는 별도57519/pongdang_test만 사용하고 검증 후 해당 PostgreSQL 종료 확인. 현재 실행 중인 로컬 backend9260/collector5258은 아직 기존v17 코드·DB를 유지하며 이번 Git 병합 중 재시작/원자료DB 변경은 하지 않음. 통합 코드를 서버에 다시 띄울 때 app.schema --initialize로v18 적용 및 collector 소스 갱신을 함께 해야 함. 운영 적용은 별도 승인 범위.

# 현재 작업 · 기준 장소와 가까운 동일 유형 두 곳 비교 · 2026-09-21

- 요청: 오늘의 지점 비교를 선택한 장소 + 주변에서 가장 가까운 동일 유형 장소2곳으로 구성. CSS 변경 금지, 기존 변경 보존.
- 구현: GET /api/data/places/nearby?spot_id=...에서 전체 수집 카탈로그의 정규 장소를 대상으로 같은 place_kind만 직선거리(haversine) 순으로2곳 반환. 선택 장소와 그 별칭 제외, 다른 후보 별칭도 제거 후 LIMIT. 좌표 없으면 명시적 상태/빈 후보, 부족한 후보를 다른 유형으로 채우지 않는다. 읽기 전용, 새 DB 마이그레이션/외부 호출 없음.
- 프런트: useComparisonPlaces 공통 훅으로 기준 장소를 첫 행에 유지하고 두 후보를 이어 표시. 모바일/데스크톱 공통 적용, 해변 전용 필터 제거. 장소 전환 중 이전 장소의 후보 제거, 로딩/좌표 없음 안내와 직선거리 기준 문구 추가. 각 행 점수는 해당 ID의 기존 조건 API를 사용.
- 검증: 변경 파일 Ruff/ESLint,141프런트단위/증분typecheck 통과. 백엔드 장소/지역 기존14개 + 신규7개 통과(초기 fixture import가 lint 자동정리로 제거된 테스트 설정 오류를 수정 후7개 통과). 전체카탈로그105건 초과·유형·거리순·별칭·좌표누락·동거리·부족후보 검사. 브라우저 신규3 + 이전 갱신 유지2 + 핵심8 =13개 통과. CSS diff 없음.
- 실제 적용: 로컬 backend8000 PID9260으로 재시작, frontend5173 유지. 오늘 경포해수욕장→강문해변(약1.238km)→사근진해변(약1.589km) 표시 확인. 이 세 장소는 현재 같은 주변 관측 근거를 써 같은 점수가 나올 수 있다. collector/DB/운영 배포 변경 없음. 별도57519 테스트DB 종료, 커밋·푸시 없음.
- 관련: backend/app/livecams/places.py, backend/tests/test_nearby_places.py, frontend/src/useComparisonPlaces.ts, TodayDesktop.tsx, TodayPage.tsx, locales/conditions.ts, frontend/tests/browser/today-comparison.spec.ts.

# 현재 작업 · 오늘 지점 중복과 반복 점수 공백 · 2026-09-21

- 사용자 재현: 오늘 비교 목록이 경포 3건이고, 대기 중 점수가 없어졌다 복구된다. 직전 v16 수정과 한 시점 화면 확인만으로는 반복 갱신 문제를 해결하지 못했다.
- 실제 원인: default-place 후보가 place_alias를 무시해 582·7·7728(모두 canonical 7)을 각각 반환했다. 조위(khoa_tide_level) 기록 정정까지 전역 invalidated_revision을 올렸고, 게시에 약3분 걸리는 동안 전부 pending이 됐다. 계산 시작 기준 10분 제한도 근거 유효기간과 무관한 공백을 만들었다.
- 구현: 기존 장소 정규화 CTE로 후보를 중복 제거한 뒤 정렬·제한. v17은 관측소별 무효화 revision을 저장하여 해당 metrics/context_metrics를 쓰는 봉투만 차단한다. 제한·위치·매핑 변경의 기존 차단은 유지. 임의10분 표시 종료를 제거하고 저장된 대상 시간 구간/원자료 유효기간을 준수한다. 재계산은 refreshing 표시/30초 재조회. GET 계산·가짜 자료·CSS 변경 없음.
- 검증: backend 관련80개 중77개 통과, 대량 결측 수집3개가 이전값 조회의 정렬 비용으로 timeout. 최신값 탐색 인덱스와 동일 순서를 추가 후 영향받는 storage20 + projection_scope10 모두 통과(19.58초). v15/v16 마이그레이션·관련/무관 관측소·정정·실제 만료·늦은 게시·중복 장소 회귀 포함. frontend lint/141단위/typecheck 통과. 모바일/데스크톱 재계산 중 값 유지·교체2 + 핵심8 browser 모두 통과.
- 로컬 적용: 기존 전체 원자료 백업 보존, 추가 schema 백업 ~/.local/share/pongdang/backups/before-local-schema17-20260921.sql(0600). 기존 게시 완료 후 로컬5432/pongdang만 v17 적용 완료. backend8000 PID5262/frontend5173 PID72312/collector releasea3b089d5622c981f PID5258. 기존 수집기89974 종료 확인. 오늘 화면 경포·송정·주문진 61.8/61.8/64.3, 오늘 예보72.1 및 refreshing 문구 확인. 실제20:35:32~20:38:03 KST 30초 간격6회 API에서 세 지점 점수와 오늘12시 예보를 확인했고 빈 값0회. generation14/refreshing → generation15/ready 교체 및 새로고침 없이 브라우저의 갱신 중 문구 제거 확인. 관측소14의 같은 주변 자료를 쓰는 경포·송정은 점수가 같으며 각 해변 직접 실측으로 간주하지 않는다. 증거는 /var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-dev-server-qe5g2l82/continuity-live-check.jsonl. 별도57519 테스트DB 종료. 커밋·푸시·운영 배포 없음.

# 현재 작업 · 수집 갱신 중 빈 화면 복구 · 2026-09-21

- 사용자 요청: 시간대 예보를 수정했는데도 홈 전체 값이 다시 비는 문제를 실제 수집 갱신 과정까지 해결한다. CSS 수정·커밋·푸시·운영 배포 금지 유지.
- 확인: 원자료 갱신 때 모든 기존 condition_generation을 즉시 무효화하고, 새 계산 게시에는 약3분이 걸렸다. pending 빈 응답이 프런트10분 캐시에 남으며, 홈 추천 활동이 없어져 시간대 조회도 중단됐다. 값이 잠깐 나온 것만으로 완료라고 판단한 이전 검증은 불충분했다.
- 서버 변경: schema v16의 invalidated_revision으로 일반 관측 추가와 정정/충돌/제한/위치/매핑 변경을 구분한다. 일반 갱신에서는 최대10분 내의 유효한 기존 계산을 refreshing으로 반환하고 원래 근거 유효기간은 연장하지 않는다. 실제 정정·사용하던 값의 결측 전환은 즉시 차단한다. 점수에 안 쓰는 필드와 이미 없던 값의 반복 수집, 실제 변화 없는 metadata UPDATE/0행 UPDATE는 전체 표시를 무효화하지 않는다. GET 계산·시딩 없음.
- 프런트 변경: pending/refreshing 계산 응답만30초 간격으로 다시 읽는다. 완료된 계산은 서버 refresh_after에 맞춰 재조회하여 응답 수신 때마다10분이 다시 늘어나지 않게 했다. 실패/실제 자료 없음은 기존10분 간격. 이전 결과에는 ‘새 자료 반영 중 · 이전 계산 결과’ 표시. 과거 시간대 예보 유지 수정은 보존.
- 검증: 프런트 최종 수정lint/141단위/증분typecheck 통과. 백엔드 관련33개 통과 후 충돌/마이그레이션 보완43개, 미사용필드 보완26개, 반복결측 보완 최종storage16개 통과. 브라우저 기존 핵심8개 포함19개 통과 후 최종재조회조건 영향4개 재통과. 실제 홈62.6점/수온23.51°C/파고0.8m, 시간대81.7/48.3/55.8/55.8 표시 확인; 최종 실제 홈 수영62.5점/23.52°C/0.7m, 09/12/15/18시94/72.9/72.9/72.9 및 오늘 주간72.9점 확인. 새 계산 대기→자동복구와 서버 재조회기한 회귀를 포함한 최종 data-refresh 브라우저10개 통과.
- 로컬 적용: 스키마 백업 ~/.local/share/pongdang/backups/before-local-schema16-20260921.sql(0600), 기존 전체v15전 백업도 보존. backend8000 PID88702/frontend5173 PID72312. 수집기 최종release70616dd8ee2a2322/PID89974 및 최종 DB트리거 반영 완료. generation10/source_revision3606 게시 확인. 본래 데이터 유효기간과 결측은 유지한다. 별도57519 검증DB는 종료하고 로컬 미리보기/수집기는 유지한다.
- 첫 트리거 갱신은 게시 트랜잭션과 DDL잠금이 겹쳐 lock timeout으로 rollback됐다. 45초 대기도 후속 게시와 겹쳐 실패한 한 차례가 있었다. 이미 추가된 v16 테이블을 다시 잠그지 않고 최종 함수 본문만 교체하여 완료했다. 제품 연결의 timeout은 변경하지 않았다. 검증은 별도57519 pongdang_test에만 수행.

# 현재 작업 · 지난 시간대와 오늘 예보 표시 · 2026-09-21

- 사용자 요청: 시간이 지나도 홈의 오늘 09/12/15/18시 예보와 오늘 메뉴의 주간 예보 중 오늘 평가값을 표시한다. CSS 수정 금지.
- 원인: 실제 경포 예보 API에 오늘12시 72.9점/근거3/4가 있는데, useHourlyScores/useConditionDays가 예보 근거의 valid_until을 현재 시각과 비교해 숨겼다. 앞서 로컬 복구에서 오늘 시간대의 빈칸을 자료 부족으로 본 설명을 정정했다.
- 변경: 고정 대상 시각의 예보는 서버의 해당 시각 평가 결과를 표시하고 브라우저 현재 시각에 따른 만료 필터를 제거했다. 현재 관측·추천의 만료 처리, 데이터 갱신 및 오류·근거 없음 처리는 유지한다. 모바일과 데스크톱 공통 적용. CSS·백엔드 변경 없음.
- 검증: 수정3파일 lint, Node24 단위139개, 증분 typecheck 통과. 21:30 KST에 지난 시간대와 오늘 점수가 남고 실제 결측 칸은 –인 모바일/데스크톱 회귀2개, 현재 관측 만료/날짜 매핑/오류·부분 점수와 핵심8개 포함 브라우저14개 통과. 실제 로컬 오늘 화면의 주간 오늘72.9점/근거3/4 표시 확인. 릴리스 빌드·커밋·푸시·배포 없음.
- 별도 남은 현상: 원자료 수집 갱신 시 기존 condition_generation을 즉시 무효화하여 재계산 중 모든 점수가 잠시 비는 서버 동작은 이번 예보 시간 만료 수정과 별개이며 변경하지 않았다.
- 관련: frontend/src/useHourlyScores.ts, frontend/src/useConditionDays.ts, frontend/tests/browser/data-refresh.spec.ts. 로컬5173/8000은 유지하고 별도57519 테스트DB는 검증 후 종료한다.

# 현재 작업 · 로컬 미리보기 데이터 복구 · 2026-09-21

- 사용자 요청: 실행한 로컬 서버에서 어느 화면에도 데이터가 표시되지 않는 문제 조치. 원인: 127.0.0.1:5432/pongdang은 실제 원자료가 있으나 schema v10, 현재 앱은 v15. health/readiness의 SELECT 1만 성공하고 places/default-place/summary는 503이었다. 내 코스 rows=[]는 로컬 저장 코스 0건인 별도 상태.
- 로컬 DB를 ~/.local/share/pongdang/backups/before-local-schema15-20260921-191624.dump(479,040,695 bytes, 0600)에 백업하고 pg_restore --list 확인 후 기존 app.schema --initialize로 v15 적용. collection_place 6,665건·spots_waterspot 7,900건 보존. 장소 API200/강원151곳, 기본장소API200, summary200 및 실제 브라우저 명소151곳 표시 확인.
- 화면용 condition_generation이 없고 기존 LaunchAgent는 3b353d94ca36a90b 소스여서 새 condition_projection이 없었다. 첫 별도 생성은 기존 수집기 원자료 갱신으로 CONDITION_INPUT_CHANGED가 나 취소됐다. 기존 수집기를 멈춘 후 129,338건 게시 성공. 가짜 자료를 생성하거나 실패를 성공으로 처리하지 않았다.
- 수집기 plist를 ~/.local/share/pongdang/backups/collector-before-schema15-20260921.plist에 보존하고 ops/install-local-collector.py --python /Users/cksmacbook/.local/share/pongdang/runtime/bin/python으로 현재 소스의 LaunchAgent를 재설치·재기동했다. 새 release 2d84266c0e912532, PID75750, 로그 ~/Library/Logs/Pongdang/collector.log. 재기동 후 실제 최신 수집 데이터로 다시 계산하여 19:25:35 KST generation3/129,340건 게시 성공, source_revision1060 일치 확인.
- 실제 브라우저 검증 완료: 명소151곳, 지도 첫 페이지100곳과 경포69.4점/수온23.52°C/파고0.7m, 오늘 활동별 점수와 물때, 홈69.4점/23.52°C/사진/라이브캠 링크 표시. 자료가 없는 일부 지점·시간대의 –와 저장 코스0건은 별도 실제 상태로 남는다. health 응답만으로 데이터 정상 여부를 판단하지 않는다.
- 실행 중 미리보기: frontend127.0.0.1:5173/pongdang/, backend127.0.0.1:8000. PID frontend72312/backend72311, 로그 /var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-dev-server-qe5g2l82/. 새 코드·CSS·.env·운영 서버·dev 변경 없음. 실제 기존 로컬 수집 데이터로 확인하며 가짜 장소/저장 코스를 만들지 않는다.

# 현재 작업 · 내 코스 지도에서 경로 계산 · 2026-09-21

- 요청: 데스크톱 내 코스의 경로 계산 버튼이 모바일 화면으로 넘어가지 않도록 하고, 버튼 위 코스 상세 목록에 방문 순서·이동 소요시간과 카카오 도로 경로선을 표시한다. 프런트 CSS 수정 금지.
- 구현: CoursesDesktop에서 기존 카카오 경로 API를 include_geometry=true로 호출한다. 같은 패널에서 출발지·시각·체류 조건을 입력하고, 반환된 순서·도착 시각·구간별/전체 이동시간·복귀와 출발/순번 핀·Polyline을 표시한다. CSS 파일과 백엔드는 변경하지 않았다. RouteRequestForm의 데스크톱 모드에서 기존 버튼 클래스를 재사용한다.
- 상태 처리: 요청 중 중복 계산 방지, 코스 전환 시 취소, 저장 코스 revision별 결과 분리, 실패한 재계산에서 이전 경로 제거, 누락 구간은 임의 직선으로 대체하지 않음. 기존 저장 코스를 자동으로 덮어쓰지 않는다. 기존 다른 화면의 #map?view=course 흐름은 이번 버튼 수정 범위 밖이다.
- 검증: 수정 파일 ESLint, Node 24 프런트 단위 테스트 139개, 증분 TypeScript 검사 통과. 브라우저 핵심 8개 + 빈 코스 1개 + 신규 경로 회귀 3개(12개) 통과. 마지막 버튼 보완 후 영향받는 신규 3개와 기존 모바일 경로 계산 1개(4개) 재검증 통과. 화면 캡처로 상세 패널·순서·시간·버튼 표시 확인. git diff --check 통과, CSS 변경 없음.
- 검증 환경/한계: 별도 PostgreSQL 18 disposable pongdang_test(57519), 브라우저 서버 57520/57521. 신규 테스트는 카카오 응답·SDK 로더를 페이지 내부 fixture로 대체하고 실제 KakaoMapCanvas에 전달된 선 좌표·정리 동작을 확인했다. 외부 카카오 실호출 및 운영 화면/배포는 미검증. 전체 빌드는 CI 소관으로 실행하지 않았다.
- 상태: 로컬 구현 완료. 커밋·푸시·배포 없음, dev 변경 없음. 기존 CURRENT 내용과 .byeori/, .playwright-cli/, output/ 보존. 검증 서버·DB는 검증 후 종료했다.
- 관련: frontend/src/CoursesDesktop.tsx, frontend/src/RouteRequestForm.tsx, frontend/src/locales/travel.ts, frontend/tests/browser/course-route-inline.spec.ts.

# 현재 상태 · 빠른 검증 CI main 배포 완료 · 2026-09-21

- 사용자 승인에 따라 Python 3.12 호환성 수정, 최신 main 통합, 커밋·main push·CI·자동배포 확인을 완료했다. dev 커밋·병합·동기화·push·배포는 실행하지 않았다.
- 작업 커밋 d6d532c, 최신 main 249718f 통합 커밋/운영 SHA 50a9e72ddb2917dd301add3689c318d73be8db98. CURRENT 충돌은 양쪽 기록을 보존했으며 제품 코드는 자동 통합됐다.
- CI/배포: https://github.com/facio313/Pongdang/actions/runs/35570256712 전체 성공. Python 3.12 실제 실행 관련 21개 테스트/actionlint 통과. CI frontend 139 단위/lint, backend 1421 테스트/Ruff, browser 88+79=167, Docker 캐시 빌드·스택·볼륨 검사 통과. 전체 로컬 애플리케이션 검증은 반복하지 않았다.
- 운영 로그 2026-09-21 15:59:14 KST: 같은 SHA Deployed, frontend/backend/db/collector Healthy, readiness {"status":"ok"}. 워크플로 총 7분 58초, backend 테스트 5분 58초, browser 약3분씩 병렬, deploy 작업 1분 13초. 이번은 인프라 변경으로 full이며 일반 UI 변경의 fast CI 총시간은 아직 미측정이다.
- iCloud 원본 위치 유지. 52개 관련 경로를 백업·동시변경 비교 후 통합했고 원본 fix/finale을 같은 커밋으로 전진시켰다. 운영 확인 전 tracked 상태 clean을 확인했다. 이 최종 배포 결과 메모만 배포 후 로컬에 추가했으며 추가 CI/재배포를 만들지 않았다.
- 남은 별도 서버 작업: ci-watch/timer 실제 설치본과 서버 사용자의 Codex 전역 지침/스킬 적용 여부 확인·반영. 이번 앱 배포가 해당 설치본을 갱신하지는 않는다. 소스의 main 전용 CI와 프로젝트 지침은 원격 main에 반영 완료다.
- 증거: ~/.cache/pongdang-main-only-ci-backup/deploy-50a9e72.log 및 release-50a9e72.json. 소스/스테이징 백업과 기존 미추적 파일은 보존한다.
# GitHub Actions 이미지 빌드 전용 전환 · 배포 완료 · 2026-09-23

- 요청: GitHub Actions의 반복 오류와 긴 대기를 없애고 frontend/backend 운영 이미지가 빌드되는지만 확인한 뒤 바로 자동 배포. dev refs·다른 앱·공용 SSO·운영 DB/볼륨은 변경하지 않는다.
- 기준/원인: 서버 main을 origin/main `77af9abdfbafc8f1c4c93bffe0cd71d8ff091896`로 fast-forward했다. 해당 run 35811908787은 deploy가 성공했지만 browser(2)가 최근 3회 연속 실패했고, 마지막 실행은 runner 대기만 약 56분이라 전체 상태가 failure였다.
- 구현: `.github/workflows/ci.yml`의 scope/frontend/backend/browser/smoke를 제거하고 backend/frontend Dockerfile 빌드 두 개를 병렬 matrix로 구성했다. 두 빌드 성공만 main deploy gate로 사용한다. PR은 빌드만 하고 dev는 계속 차단한다. 최신 main 확인, production 직렬화, 서버측 운영 인자/아키텍처 재빌드, 스키마 초기화, health/readiness, 실패 복구는 유지한다. 현재 정책 문서와 로컬 검증 안내도 build-only Actions에 맞췄다.
- 로컬 확인: PyYAML 구조 assertion, actionlint 1.7.12, `git diff --check`, `ops/test_verify_local.py` 6개 통과. 전체 로컬 Docker/브라우저/backend 검사는 실행하지 않았다. 기존 미커밋 CURRENT 기록은 커밋에서 제외해 보존했다.
- main: `65a74c62681ae9f7e7d70bef2649437cf1989d16` (`ci: deploy after production image builds`)으로 7파일 커밋·push. [Actions run 35817274855](https://github.com/facio313/Pongdang/actions/runs/35817274855)은 backend 26초/frontend 27초 병렬 빌드와 deploy 41초가 모두 성공했다. 추가 dispatch·수동 compose/SSH 배포는 실행하지 않았다.
- 운영 확인: current release와 frontend/backend/collector 태그가 `65a74c6…`로 일치하고 Pongdang 네 컨테이너가 모두 healthy/running이다. `/api/ready` status=ok·HTTP 200, `/pongdang/`과 `/api/data/summary`도 HTTP 200이다. dev와 origin/dev는 기존 `549c0b55242539be59252ac2c89ab6ab47fa55ea`를 유지한다.

# 운영 전역 SSO 해제·개인 기능 선택 인증 · 2026-09-23

- 사용자 요청으로 `bonifacio.work/pongdang/`와 `pongdang.site/`의 사이트 전체 SSO 게이트를 제거했다. 정적 앱과 공개 조회는 익명 접근을 허용하고, 프런트 로그인 유도가 실제로 동작하도록 `/auth/continue`와 owner-scoped travel·notifications·quality observations·refresh·AI 경로만 기존 SSO 브리지를 유지한다.
- 운영 전용 nginx 파일 6개를 설치/갱신했다. 공개 프록시는 브라우저의 `X-Pongdang-SSO-*`, Remote-*, Authorization, Cookie를 제거하며, 보호 프록시는 기존 서버 전용 token include와 검증된 subject/grants/email로 덮어쓴다. `ai/explanation`은 GET/HEAD 공개·그 외 메서드 인증으로 분리하고 원래 메서드·본문을 보존한다. 공용 SSO와 다른 앱은 변경하지 않았다.
- 백업: `/home/cks/.local/share/pongdang-nginx-backups/20260923T121331+0900/`. `nginx -t` 성공 후 reload했고 nginx active, 배포 SHA `77af9ab`, Pongdang 4컨테이너 healthy, `/api/ready` 200을 확인했다. 두 도메인의 앱·catalog·travel keywords는 익명 200, 공개 AI explanation 무인자 GET은 backend 422까지 도달, 개인 GET과 explanation POST는 SSO 302, 위조 헤더도 302였다.
- 제품 소스·DB·컨테이너·CI는 변경하지 않았다. 최신 main의 `ops/nginx-location.conf`는 보호 경로와 헤더 브리지가 일부 누락돼 운영본을 그대로 역복사하지 않았다. 호스트 설치본은 유지되지만 향후 템플릿 정합화가 필요하며, 앞선 점검 출력에 노출된 SSO bridge token은 별도 승인된 회전이 남아 있다.

# 활동·지표·점수 DB 보존 및 부분 오류 격리 · 배포 완료 · 2026-09-22

- 요청/승인: 만료·갱신·503 때문에 홈/오늘의 활동·지표·점수가 사라지는 문제 수정, DB 보존, main 커밋·push·자동 배포까지 승인. 기준 main a3cb8fb. 기존 이 파일의 사용자 기록을 보존하며 dev refs 549c0b5는 변경하지 않는다.
- 확인: 원자료와 계산 결과는 DB에 있으나 원자료 revision 정정 시 전체 게시 결과를 숨기며, 미래 만료 구간은 지표·점수가 비어 있는 스냅샷으로 저장한다. 기존 테스트도 만료 시 score=null을 기대했다. 2026-09-22 14시대의 대표 운영 GET 3건은 200/점수 표시로 복귀해 있었고 이 단일 확인을 재발 해결로 보지 않는다.
- 구현 완료: 다음 publication에 마지막 값·점수·근거를 함께 이어 저장하고 원래 계산/대상 시각을 표시한다. 일반 원자료 정정은 갱신으로 처리하며 공식 제한/매핑 철회는 유지한다. 추천의 부가 조회 실패 격리와 첫 추천 503 시 독립 조건 조회도 적용했다.
- 검증 환경: 이번에 만든 rootless tmpfs 컨테이너 pongdang-durable-snapshots-test-20260922, loopback 32782의 pongdang_test만 사용한다. 운영 DB·환경 파일·볼륨은 테스트에 사용하지 않는다. Git은 cks, 로컬 Python 검증은 root, 프런트는 기존 Node24 바이너리로 명령별 PATH를 지정한다.
- 구현: 기존 condition_snapshot에 원래 값·점수·근거를 다음 세대에도 이어 저장한다. 보존 시각 retained_at/원래 computed_at 유지, 정상 하락 점수 교체, 같은 예보 구간만 보존한다. v18은 일반 원자료·관측소 유효시간 변경을 재계산으로 분류하고 제한/매핑 철회는 유지한다. 추천 부가 조회는 savepoint 및 전체 5초 예산으로 격리한다. 첫 추천 실패 시 독립 조건 조회, 기존 미지원 종목으로 전체 캐시가 버려지던 경로도 수정했다.
- 검증: 프런트 lint·152 단위·타입, API mock 모바일/데스크톱 관련 12개 통과. 백엔드 최초 관련 53개 중 예보 미래 대상에 관측 시각 규칙을 적용한 1건 실패를 수정했고 다음 43개 중 기존 만료 null 기대 1건을 요청된 보존 계약에 맞게 수정했다. 이어 점수·producer·원자료 회귀 147개 통과. DB 반복 갱신·이전 세대 정리·새 접속·9일 collector 공백·부분 자료·낮은 새 점수·v17→18 보존·관측소 유효기간 갱신·예보 구간 회귀도 통과. 무DB 추천 오류 12개 포함 추천 규칙 26개, 예보 경계 누적 회귀 2개 통과. 마지막 구간 병합 수정 후 관련 단위 2개·DB 회귀 5개도 재확인해 모두 통과했다.
- 통합: 작업 중 추가된 원격 main의 지도 변경 37784f4/67694ec를 파일 충돌 없이 fast-forward해 보존했다. 제품 22파일만 커밋 준비했고 기존 CURRENT 변경은 제외한다.
- main: 59ef4bd9f688df72b21989cd6bec8866a08a7e35로 22파일 커밋·push 완료. [CI 35692352639](https://github.com/facio313/Pongdang/actions/runs/35692352639)는 frontend/backend 3 shards/smoke 성공, browser에서 5건 실패해 배포를 건너뛰었다. 4건은 통합된 원격 지도 변경에 기존 모바일 선택자를 기대하던 코스 검사, 1건은 추천503만으로 모든 baseline이 실패해야 한다던 기존 기대다. 최신 지도 동작을 보존해 선택자를 맞추고 baseline 오류 검사는 독립 조건조회도 실패한 경우로 명확히 하는 중이다. CURRENT 기존 기록은 미커밋 보존. dev 두 refs는 549c0b5 유지. 같은 SHA 추가 dispatch·수동 빌드/배포 없음.
- 자원 정리: 이번 폐기용 tmpfs DB 컨테이너는 테스트 완료 후 종료·제거했다. 테스트용 데이터만 폐기되어 복구 불가하며 운영 데이터·볼륨과 무관하다.
- CI 보완용 브라우저 검증: 새 폐기용 tmpfs pongdang-ci-course-tests-20260922, 127.0.0.1:32783/pongdang_test를 별도 생성했다. frontend agent만 사용하며 운영 DB/환경파일은 사용하지 않는다.
- CI 보완 검증 완료: 지도 코스 3건·장소 상세 4건·오늘 정직한 상태 4건, 총 11개 브라우저 통과(55.9초). 실제 제품 UI 코드는 변경하지 않고 테스트 선택자·현재 동작 기대만 맞췄다. 변경 파일 lint와 Node152/타입도 통과. 후속 main e3d29443e59a5a68221100529b1608c071ae6016 커밋·push 완료, [새 CI 35692900255](https://github.com/facio313/Pongdang/actions/runs/35692900255)를 따른다. CI 보완용 폐기 DB도 종료·제거했으며 테스트 서버는 종료됐다.
- 최종 SHA 검증: 새 CI의 frontend/backend 3 shards/browser 2 shards/smoke 및 deploy job 106634410408이 모두 성공했다. 최종 배포 main e3d29443e59a5a68221100529b1608c071ae6016. current release 및 frontend/backend/collector 태그가 일치하며 4개 컨테이너 healthy, /api/ready status=ok, /pongdang/ HTTP200 확인. 앱 이미지 ID는 frontend 2b6050e707a3…/backend·collector e5490d300fd1…이다.
- 운영 API: 경포 장소7·470 조건, 장소7 추천 및 두 장소 요약 모두 HTTP200(개별 0.041~0.254초). 재계산 중 generation281/source92953 < latest93034에서도 수영70.4/서핑80.0, 수온24.39°C·기온24.1°C·파고1.4m·풍속3.5m/s를 유지했다. collector는 재시작0/healthy, summary heartbeat는 condition_projection 실행을 확인했다.
- 새 DB 게시 확인(15:11:45 KST): generation282/source93034가 새로 게시된 뒤에도 같은 점수·지표를 유지했다. 실제 만료 보존 결과 retained=true, retained_at/computed_at=15:05:45.672222 KST이며 원래 계산 시각을 노출한다. 다음 DB 세대까지 값을 이어 저장하고 새 접속에도 제공함을 운영 GET으로 확인했다. 로그인 후 운영 브라우저 직접 조작은 이번 작업에서 하지 않았으며 화면 검증은 로컬/CI 브라우저 근거다.
- 완료: 요청된 수정·main push·자동 배포·새 스냅샷 게시 확인 완료. 추가 CI dispatch/수동 빌드·배포/다른 앱·SSO·운영 원자료 수동 변경 없음. 두 폐기 DB와 테스트 서버 정리 완료, dev refs 보존, 기존 CURRENT 기록만 미커밋으로 남는다.

# 전체 화면 헤더 새로고침 제거 · 배포 완료 · 2026-09-22

- 요청/범위: 모든 화면 로고 옆 데이터 새로고침을 제거하고 사이드 메뉴 기능은 유지. 모바일 AppHeader·DesktopNav와 홈 예외 prop만 변경했다.
- 검증: Node 24에서 명시한 TSX 3파일 verify_local.py의 lint·149개 단위 테스트·타입 검사 통과. API mock을 사용한 모바일 390px/데스크톱 1440px 주요 6화면에서 헤더 버튼 부재와 사이드 메뉴 버튼 표시 확인(12건). 기본 Node 18에서는 버전 불일치로 실행 실패 후 Node 24로 해결했다. 운영 DB 테스트 없음.
- 사용자 승인으로 main a3cb8fbe4d65b1f3244dcc9b265f07d15702312b 커밋·push 완료. [자동 CI 및 배포](https://github.com/facio313/Pongdang/actions/runs/35671725711) 성공. CI 이력 조회 실패로 전체 브라우저 2 shards가 선택되었고 모두 통과했다. 기존 작업 메모 변경은 커밋에서 제외하고 보존했다. dev refs와 다른 앱은 변경하지 않았다.
- 운영 확인: current가 해당 SHA release를 가리키고 frontend/backend/collector 이미지 태그도 일치. Pongdang 4컨테이너 모두 healthy, /api/ready는 status=ok, /pongdang/ GET 성공. 사용자 cks의 Docker로 확인했다. 추가 수동 빌드·배포·CI 재실행 없음. 요청 완료.

# 마지막 UI 변경 되돌림 · 배포 및 점수 API 복귀 확인 완료 · 2026-09-22

- 요청: ‘그냥 전으로 돌려줘. 또 점수가 안 나오기 시작했어.’ 마지막 UI72cd559만 되돌리며 이전 점수 장애 수정과 DB2GiB는 유지한다. 사용자 기록과 dev refs를 보존한다.
- 구현/검증: UI4파일만 revert했고 제품 tree가 배포 직전5a8d53f와 완전히 동일함을 확인했다. 명시한4파일 verify_local.py의 ESLint·Node149개·증분 타입 검사 통과. 이전 버전의 화면 회귀는 CI에서 실행하며 새 운영 DB 테스트는 하지 않는다.
- main: 8cf2e0f01b2571f918831faab8561927e2a8c101 커밋·push 완료. 자동 [CI35670745123](https://github.com/facio313/Pongdang/actions/runs/35670745123)가 실행 중이다. 같은 SHA의 push35670742401은 cancelled, workflow_dispatch35670745123은 진행 중임을 확인했다. 이번 작업에서 dispatch/re-run/cancel을 호출하지 않았다.
- 점수 읽기 확인(되돌림 배포 전09:08:59 KST): current는 여전히72cd559였으나 장소7 수영 점수51.7로 복귀했다(수온23.79/83.4점, 파고1.5/20점). 기온·풍속은 measurement_expired로 비어 있다. 기온 근거는07:00관측/08:14:28수집/09:00만료이며, 실제 backend/collector 재시작은09:04:47이었다. 만료가 재시작보다 먼저다. UI 되돌림만으로 수집·만료 공백을 해결했다고 보고하지 않는다.
- 읽기 전용 진단: 배포 게이트는 모든 앱을 SHA태그로 compose up하며 UI만 바뀌어도 backend/collector를 교체했다. backend image ID는5a8d53f와72cd559에서 동일하다. 실제 갱신 공백과 재시작의 지연 기여를 구분하여 확인 중이며 수집 설정·DB데이터·배포 게이트를 임의로 수정하지 않는다.
- 확인된 만료 공백: weather.py의 _issue(nowcast)는 KST 현재시각에서1시간을 뺀 뒤 정시로 내리며, 관측 valid_until은 관측시각+2시간이다. 따라서08:58에도07시 자료를 요청하고09:00에 만료시킨다. collection_job/ingestionrun의 READ ONLY·3초제한 SELECT에서 kma_nowcast08:58:01성공→09:09:39성공, condition_projection08:58:04~09:01:20 및09:04:55~09:08:04성공을 확인했다. 새 시간 자료의 다음 수집까지 공백과 약3분 재계산이 발생한다. 실제 UI배포 재시작09:04:47보다 먼저 만료됐으므로 이번 UI 변경이 점수 데이터를 지웠다고 볼 근거는 없다. 재시작이 공백에 더한 정확한 시간은 미확인이다. 이 구조 수정은 이번 ‘되돌림’ 범위에 임의로 포함하지 않았다.
- 되돌림 배포: CI35670745123의 전체 선택 검증·deploy 성공. current와 앱3개 태그가8cf2e0f…이며 네 컨테이너 healthy, readiness ok, DB RAM2GiB/RAM+swap3GiB 유지. 제품 Git tree는5a8d53f와 동일하다. 운영 JS GET에서 이전 기온 설명/summary 복귀 및 pd-cbar-toggle 제거를 확인했다.
- 배포 직후09:14:51 GET: 장소7/470 점수는 다시pending/retention_allowed=false. READ ONLY 확인에서 schema17 유지(초기화는 재마이그레이션하지 않음), source revision77768/invalidated77753 > 마지막 완성 generation206/source77697였다. 직전 점수는09:12:52 게시 완료, 새 점수는09:14:09 계산 중이다. KHOA 수집5건이09:14:03~05 성공한 시점과 겹치지만, 어떤 원자료 수정이77753 철회를 유발했는지는 감사 이력이 없어 아직 확정하지 않았다. 만료 공백뿐 아니라 기존 점수 철회→재게시 동안의 공백도 여전히 있다. 되돌림을 점수 공백의 근본 해결로 보고하지 않는다.
- 최종09:17:41 KST: 자동 게시generation207/source77768/ready 완료 후 대표 GET에서 장소7·470 수영52.8/evaluated, 홈 추천서핑65.9/evaluated 복귀 확인. 장소7 수온23.87°C·기온20.4°C·풍속1.9m/s·파고1.4m 모두 evaluated이다(기온0점은 유효값). 원복 UI·CI/자동배포·컨테이너/ready·대표 GET 확인 완료. 브라우저 로그인 재검증은 이번 턴에 하지 않았고 현재 숫자는 API 근거다. 기존 점수 장애수정·DB2GiB·dev refs 유지, 운영 데이터/수집 설정/배포 게이트 추가 수정 없음. 요청한 마지막 UI 되돌림은 완료했으나 관측 만료·철회/재계산 공백의 재발 위험은 남는다고 사용자에게 알린다.

# 항목명으로 점수 기준 펼치기 · 배포 완료 / 점수 API 만료 상태 발견 · 2026-09-22

- 요청: 외부 기온 아래의 고정 설명을 없애고 수온·외부 기온·풍속 등 값 옆 항목명을 누르면 점수 기준·미보정 참고값이 아래에 펼쳐지도록 변경.
- 구현: 공용 ComponentBars에서 기준이 있는 항목명을 접기/펼치기 버튼으로 변경했다. 기본은 접힘이며 각 항목의 기준·인용 출처가 해당 줄 아래에 독립적으로 열린다. aria-expanded/controls와 키보드 Enter/Space를 지원한다. 기온 0점 고정 설명과 별도 기온 기준 summary를 제거했다. 원래 값·0점·미평가 사유·점수 계산/API는 유지한다.
- 파일: frontend/src/pongdangUi.tsx, frontend/src/pongdang.css, frontend/src/locales/conditions.ts, frontend/tests/browser/home-tides.spec.ts. 기존 CURRENT 기록은 그대로 보존한다.
- 검증: 명시한 4파일의 verify_local.py에서 ESLint·Node24 단위149개·증분 타입 검사 통과. home-tides 브라우저3개 통과(390/1440 화면에서 기본 접힘·항목별 펼침/닫힘·출처·0점·키보드·가로 넘침 없음·기존 간조/만조 표시). 접힘/펼침 캡처를 직접 확인했다. 스크린샷은 frontend/test-results/home-criteria-collapsed-{390,1440}.png 및 home-tides-{390,1440}.png.
- 격리: 이번 작업에서 새로 만든 tmpfs pongdang-score-disclosure-test-20260922 / loopback32781 / pongdang_test만 사용했다. 검증 후 정확한 컨테이너 ID·작업 label·tmpfs·볼륨 없음 확인 후 종료·제거했다(임시 데이터만 복구 불가 폐기). 테스트 서버5189/8109 종료도 확인했다. 운영 DB·환경 파일·볼륨은 테스트에 사용하지 않았다. 전체 빌드·전체 backend/browser/Docker 검사는 실행하지 않았다.
- 반영 상태: 사용자가 ‘응 배포까지 진행해’로 승인했다. 최신 main 정책과 원격5a8d53f를 확인하고 검증된 위4파일만 72cd5599048ea5c19d90b3f71578652097a505f6로 main 커밋·push했다. 기존 CURRENT 기록은 커밋에서 제외해 보존했다. 동일 코드의 통과한 로컬 검사는 반복하지 않았다. dev refs549c0b5 및 다른 앱/SSO는 변경하지 않았다. 추가 CI dispatch·수동 빌드/배포 없음.
- CI·배포: [35669990987](https://github.com/facio313/Pongdang/actions/runs/35669990987)의 scope/frontend/smoke/browser2묶음/deploy 모두 성공. backend 검사는 UI 범위라 생략됐다. 운영 current 릴리스 경로·앱3개 이미지 태그가72cd559…와 일치하며 태그별 image ID도 실행 컨테이너와 일치한다. 네 컨테이너 모두 healthy, /api/ready는 ok. 운영 index 및 해당 JS GET에서 pd-cbar-toggle/criterion 존재와 기존 기온0점 설명 제거를 확인했다. 이번 턴에는 운영 로그인 브라우저를 추가 실행하지 않았다.
- 별도 발견(09:06 KST): 대표 GET에서 장소7 recommendation choice=null, 장소7/470 수영 conditions score=null/status=unavailable. 장소7은 모든 항목에 measurement_expired를 명시하고 retained=true이다. 따라서 현재 점수 표시까지 정상이라고 보고하지 않는다. 원관측 만료/갱신 경위는 아직 조사하지 않았으며 이번 배포의 backend image ID는 이전5a8d53f와 동일하다. UI 배포는 완료했으나 점수 API 상태는 별도 점검이 필요하다고 사용자에게 알렸다. 만료값을 강제 복원하거나 DB·수집 설정을 변경하지 않았다.

# 점수 갱신 공백·조석 조회 병목 수정 및 운영 배포 완료 · 2026-09-22

- 요청: 간조·만조 처리 이후 다시 점수가 보이지 않는 현상의 원인 확인과 확실한 조치. TCP 진단은 보류. 후속 ‘응 진행하도록 해’로 조석 병목까지 수정·main 커밋/push·자동배포·실제 로그인 화면 재확인을 승인받았다. 기존 compose 2GiB 변경과 CURRENT의 다른 기록을 보존한다.
- 운영 재현(07:57 KST): 경포470·강문472·순개울474의 현재 점수/요약 API가 HTTP200이지만 `condition_projection_pending`, score=null. DB 원자료 revision=76953인데 마지막 완성 점수 generation188/revision76881이라 전부 배제됐다. 해당 generation은 07:50:51 계산 시작, 07:54:00 게시 완료/106912행. 워커는 정상 계산 중이며 네 컨테이너 healthy. 간조·만조 커밋 `0a3eb35`는 프런트 13파일만 바꿨고 점수 저장·조회 서버 경로는 변경하지 않았다. DB 2GiB 조정은 재시작 없이 적용되어 점수 행을 변경하지 않았다.
- 원인: 새 관측 추가도 전체 source revision을 변경하며 API가 정확히 같은 revision의 generation만 허용한다. 약 3분 재계산 동안 모든 저장 점수를 숨긴다. 기존 프런트 보존은 같은 브라우저 세션에만 있어 새 접속/새로고침 공백을 막지 못했다.
- 로컬 수정: schema v17에 `invalidated_revision` 추가. 일반 원자료 추가 중에는 마지막 유효한 완성 결과를 `refreshing`/`retained`와 원래 계산 시각으로 제공한다. 기존 원자료 수정·삭제, 관측소/장소 변경, 매핑·공식 제한 추가는 즉시 철회하며 `retention_allowed=false`로 브라우저 캐시와 예보 fallback의 복원을 막는다. 원자료·점수 계산식·유효기간을 바꾸지 않는다. v16의 미분류 변경은 migration 시 현재 revision까지 철회하여 오래된 값을 부활시키지 않는다.
- 범위: backend schema/condition_invalidation/condition_storage/conditions 및 관련 테스트, frontend productData/retainConditionData/useConditions 및 보존·브라우저 테스트. 기존 producer 통합 fixture의 구형 v15 trigger 재설치를 제거했다. migration은 진행 중 게시 작업의 revision 테이블 읽기도 NOWAIT로 대기하여 서비스 읽기를 장시간 막지 않는다.
- 검증 상태: 수정 파일 lint/타입 검사 및 Node24 프런트148개, backend 관련 고유50개 통과. migration 잠금 보완 이후 영향받은20개를 재확인했다. 첫 검사는 브라우저 fixture 잔존으로 잘못된 관측소 행을 읽어 실패했으며, 나머지19개 통과 후 schema가 비워진 것을 확인하고 해당1개를 다시 통과했다(검증문 완화 없음). 모바일390/데스크톱1440 새로고침·재게시·철회 및 기존 간조·만조 브라우저14개 통과. 이 검사는 아래 운영 규모 SQL 병목을 재현한 검사가 아니다.
- 검증 환경: 이번에 만든 tmpfs `pongdang-score-retention-test-20260922`, loopback32779, `pongdang_test`만 사용. 브라우저 테스트 포트5189/8109. 운영 DB에는 제한된 SELECT만 실행했다. 최초 복합 통계 SELECT는 5초 timeout으로 취소되어 300행 한정 집계로 축소했다. 로컬 첫 검증은 기본 Node18의 TS 미지원으로 실패했고 Node24로 재검증했다. cks가 기존 root 경로의 Python3.14 venv를 실행할 수 없어 검증은 root로 실행했고 Git은 cks로 실행한다.
- 자원 정리: 위 폐기용 DB 컨테이너를 종료·제거하여 tmpfs 테스트 데이터만 폐기했다(복구 불가, 운영 데이터 무관). 테스트 서버5189/8109도 종료됐다.
- 운영 브라우저 확인(08:17~08:20 KST): 사용자가 제공한 계정으로 실제 https://bonifacio.work/pongdang/ 로그인. Chromium으로 데스크톱 홈·오늘·명소 상세와 모바일 홈을 확인했다. 기본 선택은 강릉 경포대 해수욕장7이며 앞서 직접 조회한 경포해수욕장470과 ID가 달랐다. 홈 대표/활동별 점수와 기온·수온·파고가 비어 있었고 추천 및 조석 API가503이었다. 오늘의 비교 점수49.8과 일부 주간 예보는 표시됐으며, 경포470 상세는 HTTP200이지만 choice=null이었다. 명소 목록의 ‘상세에서 조회’는 기존 설계이므로 목록 자체 장애로 세지 않는다.
- 추가 확인된 원인: `/water-index/recommendation`이 `read_tide`를 동기적으로 기다리고, 공통 `select_forecasts` 조회 시간 초과가 추천 전체503으로 이어진다. DB 로그23:17:50Z/23:17:58Z에 조석 forecast_revision 요약 SELECT의 statement timeout이 기록됐다. 읽기 전용 EXPLAIN에서 forecast_revision 전체 순차 검색과 행별 매핑 하위 질의를 확인했다(장소 인덱스는 존재하나 OR 조건 때문에 사용하지 않음). 이후 같은 장소7의 conditions는376ms/49.8점, recommendation은4956ms/65.7점으로 일시 성공하여 점수 데이터 삭제가 아닌 응답 경로 문제도 입증됐다. 간조·만조 UI 커밋이 서버 코드를 바꾸지 않았다는 사실만으로 조석 조회와 무관하다고 볼 수 없다. 추가 UI 호출의 지연 기여 정도는 미확인.
- 브라우저 증거: `/tmp/pongdang-production-browser.SvwA1f/`의 home-desktop.png, today-desktop.png, spot-470-desktop.png, home-mobile.png. 비밀번호·쿠키를 파일에 저장하지 않았으며 브라우저 세션 종료. 사용자 데이터 변경·운영 테스트 시드·설정 변경 없음.
- 추가 수정: select_forecasts에서 장소·활동별 현재 매핑을 MATERIALIZED CTE로 한 번 선택해 행별 원본 매핑 재탐색을 제거했다. 추천의 조석 조회는 2초 제한과 savepoint로 격리하며 statement timeout/cancellation 시 해당 조회만 rollback한다. 기존 점수·공식 제한·대안은 보존하고 tide_lookup_unavailable 사유 및 4개 언어의 명시적 화면 안내를 추가했다. 조석 실패를 성공이나 안전 판정으로 바꾸지 않는다.
- 추가 검증: 새 tmpfs `pongdang-tide-query-test-20260922`(loopback32780, pongdang_test)에서 관련 backend20개 통과. 무관 예보2만 건에서도 조석 조회가1초 statement 제한 안에 응답했으며 실제 DB statement timeout과 비동기 제한을 각각 재현하여 점수·추가 조회·수온 제한 보존을 검증했다. Node24 frontend149개·변경 lint·증분 타입 검사 통과. 브라우저는 기존14개 통과 후 새2개가 홈 lead 모드의 경고 생략을 발견했다. RecommendationReason에서 실패 안내는 요약에도 표시하도록 수정하고 영향받은 모바일/데스크톱2개를 재통과했다(고유16개 통과). 테스트 서버 종료 및 이 폐기용 DB 종료·제거 완료(임시 tmpfs 데이터만 폐기, 복구 불가).
- main 반영: 요청 범위21파일과 compose2GiB를 `20976acc056eb3516a4549b97e1d1617643a4e69`로 커밋·push했다. CURRENT의 기존 사용자 기록은 커밋에서 제외해 보존했다. [CI/자동배포35668024041](https://github.com/facio313/Pongdang/actions/runs/35668024041) 실행 중이며 추가 dispatch/수동 빌드·배포 없음. dev refs는 기존549c0b5를 유지한다.
- CI 보완: 첫 CI의 Docker 이미지 빌드·전체 스택 health는 통과했으나 DB 자원 한도 검사가 이전1GiB 기대값 때문에 실패했다. `.github/workflows/ci.yml`의 DB 기대값만 RAM2147483648/RAM+swap3221225472로 갱신했다. 환경 파일 없는 Compose config에서 실제2GiB/3GiB·CPU1.5·pids256과 일치 확인, 해당 bash 문법·diff 검사 통과. `verify_local.py`에서 YAML 대상 검사0개임을 구분한다. 이를 `5a8d53fc2058c28e5d59dc64f23ee61d75bc06c0`로 추가 커밋/push했으며 새 SHA의 자동 CI를 따른다(실패 커밋 재실행 없음).
- 최종 SHA CI: [35668267321](https://github.com/facio313/Pongdang/actions/runs/35668267321)의 scope/frontend/backend3shards/smoke/browser2shards/deploy 모두 성공. 운영 current 및 frontend/backend/collector 태그가 `5a8d53f…`와 일치하고 네 컨테이너 healthy, readiness ok. DB RAM2147483648, RAM+swap3221225472 확인. 추가 dispatch·수동 빌드/배포 없이 완료했다.
- 운영 실제 재검증: 새 Chromium 세션으로 제공된 계정 로그인. 배포 직후 v17의 미분류 과거 근거 철회로 초기 점수는 pending이었으나, 정상 워커의 첫107488행 게시(generation199,08:41:29계산) 완료 후 화면을 새로고침해 점수 표시를 확인했다. 이후 원자료 revision77386 > 게시 revision77369인 실제 재계산 구간에서도 수영47.8/서핑60.5/휴식59와 retained=true/status=refreshing, 원래 계산 시각을 유지했다. 정상 갱신 중 새 접속/새로고침 공백을 막는 동작을 운영에서도 확인했다.
- 화면 확인: 데스크톱 홈·오늘(활동별/비교/주간 예보)·경포470 명소 상세 및 모바일 홈 새 진입에서 숫자와 근거를 확인했다. 간조19:10 KST/만조11:11 KST도 표시된다. 모바일 새 진입에서 추천550ms·조석366ms/둘 다HTTP200(단일 관측이며 장기 지연 보장은 아님). 근거 없는 온천·래프팅은 계속 추천 제외로 표시된다.
- 증거/정리: `/tmp/pongdang-production-browser.SvwA1f/after-home-desktop.png`, `after-today-desktop.png`, `after-spot-470-desktop.png`, `after-home-mobile.png`. 화면 캡처 직접 확인, 로그인 세션 종료, 비밀번호/쿠키 파일 저장 없음. 작업용 DB와 테스트 서버 정리 완료. 제품 소스는 모두 커밋됐고 기존 기록을 보존한 CURRENT만 미커밋. dev refs549c0b5 유지. TCP 설정·다른 앱·SSO·운영 데이터/볼륨 수동 변경 없음. 요청한 수정·배포·실제 화면 확인 완료이며 장기 무장애를 보장하는 주장은 하지 않는다.

# 운영 DB 메모리 2GiB 적용 · 2026-09-22

- 요청: Pongdang DB 메모리 한도를 2GB로 증가. 운영 자원 변경은 승인됐으며 커밋·push는 요청되지 않았다. 기존 CURRENT 기록과 dev refs를 보존했다.
- 변경: `compose.yaml`의 db `mem_limit` 1g→2g, `memswap_limit` 2g→3g. 기존 스왑 한도 1GiB를 유지하기 위한 총 RAM+swap 설정이다. PostgreSQL 내부 설정·데이터·볼륨은 변경하지 않았다.
- 운영 적용: 07:51 KST 기존 배포 잠금을 확보한 후 `docker update --memory 2g --memory-swap 3g pongdang-db` 성공. 컨테이너 ID `b0235e353b91…`와 StartedAt `2026-09-20T10:38:05.35699355Z` 유지, 재시작 0회. 빌드·재배포는 하지 않았다.
- 검증: 비밀 설정 없이 Compose config 검사 및 git diff --check 통과. `ops/verify_local.py compose.yaml`은 적용 대상 로컬 검사 0개로 종료했다. 실제 cgroup memory.max=2147483648, memory.swap.max=1073741824, DB healthy/OOM 0, `/api/ready` status=ok 확인. 즉시 관측 사용량 약 1.42GiB이며 장기 성능 개선은 아직 검증하지 않았다.
- 남은 사항: 로컬 compose 변경은 미커밋·미push. 원격 main은 여전히 1GiB이므로 향후 컨테이너 재생성에도 2GiB를 유지하려면 이 변경을 승인된 main 반영에 포함해야 한다. 기존 현재 배포 SHA `0a3eb35…`는 그대로다.
- TCP는 해결 방법 설명 요청으로 취급하여 설정을 변경하지 않았다. 앞선 진단에서 특정 SSH 연결에 고정된 중복 보정 식별자가 현재 연결과 불일치했고, 20초 관측에서 SSH 재전송·DSACK·호스트 TLP가 각각 3회 증가했다. 당시 구간의 중복 전송 근거이며 전체 과거 손실 원인을 확정한 것은 아니다.

# 배포 완료 · 홈 버튼 제거·기온 점수 근거·조석 표시 · 2026-09-21

- 요청/완료 조건: 홈 로고 옆 데이터 새로고침 제거, 19.9°C의 0점 기준·근거 확인, 연결된 간조·만조 표시, 운영 배포까지. 사용자 요청에 main 커밋·push·자동배포 포함. 기준 main `8ca7432`; 기존 CURRENT 미커밋 기록과 dev refs 보존.
- 확인: 해변 기온 곡선은 `21→0,25→100,30→100,33→0`, 범위 밖 끝점 적용. Rutty & Scott 2016 출판사 PDF §4.2 직접 확인(HTML 429, urllib 403 이후 curl로 PDF 수신·메모리 해석): 캐나다 국내 해변 선호25–30°C 및 <21°C 추위 응답이 근거이나 0/100 환산·시간별 한국 적용은 제품 가정. 수치 함수는 수정하지 않고 기온 항목에 API의 criterion/source_ids/sources를 직접 연결한다.
- 운영 읽기: 경포470의 `tides/events` available, 2일8건, 묵호DT_0006/33.4887km 주변자료. 다음 만조9/22 02:52 KST/25cm, 간조9/22 05:44 KST/24cm를 실제 GET에서 확인. 해변 직접 예측·안전/조류 판단으로 표시하지 않는다.
- 구현: 모바일 홈 showRefresh=false/데스크톱 active=home에서 상단 버튼 제거, 메뉴 수동 갱신 유지. 공통 HomeTides를 양쪽 홈에 연결하고 날짜·KST·조위·관측소·거리 및 누락/실패 구분 표시. 30분 자료 조회와 분 단위 표시 시각으로 지난 사건을 제외하고 시간순 정렬. 기온0점 설명과 펼쳐보는 산정 기준·출처 추가, 다국어 문구와 관련 테스트 보완.
- 검증 완료: 변경 파일 지정 verify_local의 lint/147 unit/증분 typecheck 통과. 최초 nullable 배열 타입 오류는 null 필터 분리로 수정했다. 관련 브라우저5개 통과(390/1440px 버튼·메뉴 갱신·19.9°C/0점 출처·조석 순서/자정/거리·시간경과·결측/실패/만료), 스크린샷에서 가로 넘침 없음 확인. 테스트 자료는 이번에 만든 rootless tmpfs `pongdang-home-tides-test-20260921`, loopback32778 `pongdang_test`만 사용했다. 운영 DB·환경 파일·볼륨 미사용.
- API 연결 상태 추가 확인: `khoa_tide_extrema` 13:27:53 UTC 최근 수집 성공/27건/연속실패0. `khoa_tide_level`·`khoa_tide_recent`도 성공. 별도 `khoa_tide_timeseries`는 HTTP504/연속실패1로 재시도 대기이며 이번 간만조 시각 표시는 이 작업에 의존하지 않는다. 배포는 이제 main에 반영 후 자동 CI만 따른다.
- 반영: 요청 범위 frontend13파일을 `0a3eb35d73e02ece9f78427151ab9e24140ab667`로 main 커밋·push했다. 기존 메모를 포함한 CURRENT는 커밋에서 제외했다. [CI/자동배포35606369108](https://github.com/facio313/Pongdang/actions/runs/35606369108) 진행 중. 별도 CI dispatch/수동 빌드·배포 없음. 테스트 서버는 종료됐고 이번 폐기용 DB 컨테이너를 제거하여 tmpfs 테스트 데이터만 폐기했다(복구 불가, 운영 데이터 무관).
- 최종 CI/자동배포: 위 run의 scope/frontend/smoke/browser 2 shards/deploy 모두 성공. backend는 선택 정책에 따라 생략(백엔드 코드 변경 없음). 중복 dispatch·수동 배포 없이 완료했다. 실제 곡선 직접 실행도 19.9→0,21→0,23→50,25/30→100,33→0을 확인했다.
- 운영 확인: current symlink와 frontend/backend/collector 태그 모두 `0a3eb35…`, 네 컨테이너 healthy, `/api/ready` status=ok, `/pongdang/` 새 정적 자산 HTML 정상. 경포470의 간만조 GET available/8건 및 묵호33.5km/9월22일02:52만조25cm·05:44간조24cm 유지 확인. 조건 GET projection ready/총점64.3/외부기온18.5°C·0점으로 기준 일치. UI는 로컬 격리 브라우저에서 확인했으며 배포 후 인증 브라우저 클릭으로 표현하지 않는다.
- 완료/한계: 요청한 구현·근거 검토·API 연결 확인·main 반영·운영 배포 및 제한된 운영 검증 완료. 0점의 수치 자체는 기존 미보정 모델로 유지하며 검증된 한국 물놀이 기준이라고 주장하지 않는다. 별도 조위 시계열 API504는 간만조 표시에 영향을 주지 않는 외부 상태로 남아 있다. 기존 기록을 보존한 CURRENT만 미커밋이며 dev·다른 앱·SSO·운영 DB 데이터/볼륨을 직접 변경하지 않았다.

# 커밋·CI·자동배포 완료 · 조건 표시 유지·30분 갱신·기온 선택 수정 · 2026-09-21

- 요청: 홈/오늘/명소의 값·점수를 만료만으로 지우지 않고 30분 자동 갱신, 자료 부족·충돌·실패 시 이전 결과 유지, 고정 시간대/주간 예보 유지, 명시적인 ‘데이터 새로고침’ 버튼, 외부 기온 점수 기준 확인과 조치. 기준 main `1409368`; 기존 CURRENT 기록 보존. 후속 사용자 요청으로 커밋·main push·자동배포 승인됨.
- 구현: 공통 공개 조건 캐시에서 동일 장소·활동·대상 시각의 이전 결과를 보존하며 점수와 계산 근거는 한 묶음으로 유지한다. 낮아진 정상 점수 및 새 공식 제한은 수신 즉시 반영한다. 시간대/주간의 현재 시각 기반 삭제 제거, 모바일/데스크톱 헤더와 메뉴의 데이터 새로고침 연결, 30분 화면 재조회 및 수동 갱신 시작/완료 재조회. 개인 데이터에는 조건 보존 규칙을 적용하지 않는다. 유지는 현재 브라우저 세션의 공유 캐시이며 탭·레이아웃 전환을 지원한다. 처음부터 받은 값이 없는 항목은 생성하지 않는다.
- 기온: 기상청 격자 우선순위를 관측시각 비교보다 먼저 적용하여, 시각은 더 최근이지만 만료된 해양 관측 때문에 유효한 기온·풍속이 누락되던 경로 수정. 기존 기온 곡선은 임의 변경하지 않았으며 0점이 실제 평균에 포함되고 결측(null)과 구분됨을 회귀 검증했다.
- 최종 검증: 변경 파일 지정 verify_local의 frontend lint/146 unit/typecheck, backend Ruff/관련 57 tests 통과. 공개 장소 조회 실패 시 유지 및 현재 예보의 안정된 조회 키까지 검증했다. 관련 브라우저 고유 13개 통과(12개 성공 뒤 기존 삭제 기대값 1개를 유지 요구사항으로 수정; 상태 문구 배치 보완 후 영향받는 4개 재통과). 기온 선택, 추운 기온의 0점 평균 반영, 낮아진 새 점수 수용, 공식 제한, 부족한 응답/네트워크 오류, 시간대/주간, 입력·탭 전환 보존, 390/1440px 버튼을 포함한다.
- 중간 실패: 첫 브라우저 실행은 root 브라우저 부재로 불가하여 설치된 cks 브라우저 경로를 지정했다(root 1243도 다운로드 완료). 긴 유지 문구를 숫자 옆에 추가했을 때 모바일 배치가 밀려 별도 안내 줄로 조정했고 스크린샷과 가로 넘침 회귀로 확인했다. 증거 `frontend/test-results/product-a-current-score-su-b8b38-cient-thirty-minute-refresh/retained-today.png`.
- 격리 환경 정리: 이번에 만든 `pongdang-retention-test-20260921`(tmpfs, loopback 32776 `pongdang_test`)을 종료·제거했다. 폐기용 테스트 자료만 소멸한다. 브라우저 서버 5189/8109는 테스트 완료 시 종료했다. 운영 환경·DB·볼륨 미변경.
- 첫 push: 요청 범위 29파일만 `9c0010eb5fe6cc8373b19ad0e2a225b2b0d5f6c5`로 커밋·main push. 기존 CURRENT 변경은 미커밋 보존. [CI 35603101497](https://github.com/facio313/Pongdang/actions/runs/35603101497)은 아래 알림 검사 실패로 배포되지 않았다. dev refs와 운영 DB/볼륨/호스트 스크립트 미변경.
- 첫 CI 결과: frontend/backend 3 shards/smoke/browser (2)는 성공, browser (1)의 알림 자동조회 1개가 실패하여 배포 생략. 공통 interval 변경이 개인 알림 목록까지 30분으로 늘린 부작용을 확인했고 `useNotificationResource.ts`의 알림 주기를 기존 10분으로 분리했다. 점수·조건 화면은 요청대로 30분 유지. 관련 2파일 verify_local lint/146 unit/typecheck 및 알림 브라우저 2개 통과. 별도 tmpfs `pongdang-refresh-ci-test-20260921` loopback 32777 `pongdang_test`는 종료·제거했다.
- 최종 반영: 알림 수정 2파일만 `8ca7432350060efb0d931d7daffc7a9f2ccf5081`로 커밋·main push. [CI/자동배포 35603759905](https://github.com/facio313/Pongdang/actions/runs/35603759905) frontend/backend 3 shards/browser 2 shards/smoke/deploy 모두 성공. 13:09:10→13:16:37 UTC, 총 7분27초(브라우저 runner 대기 포함). 동일 SHA 재실행·수동 배포는 하지 않았다.
- 운영 확인 완료: current 및 frontend/backend/collector 이미지 태그 모두 최종 `8ca7432…`, 앱 3개와 DB 모두 healthy, `/api/ready` ok, 실제 Pongdang DB와 collector heartbeat age 5초 확인. 대표 경포 GET은 점수63.3·수온23.51°C·기온19.9°C·파고0.6m, 09/12/15/18시 시리즈 ready 및94/73.9/73.9/73.9를 반환했다. 이 조회의 저장 계산 시각은13:12:15 UTC로 배포 전 게시 결과이며, 새 기온 선택 로직의 운영 재계산 결과로 혼동하지 않는다. 인증 후 실제 운영 브라우저 클릭은 이번 배포에서 미실행이며 로컬 격리 브라우저 검증과 구분한다.
- 완료: 요청한 커밋·main push·자동배포 및 제한된 운영 검증까지 완료. 원격과 로컬 main 일치, 기존 기록을 보존한 CURRENT만 미커밋으로 남았다. 운영 DB 데이터/볼륨·SSO·다른 앱·호스트 배포 게이트는 직접 변경하지 않았다.

# 적용·CI·자동배포 실측 완료 · 백엔드 CI 병렬 분할 · 2026-09-21

- 요청: 전체 검사를 유지하면서 7~9분 배포 대기를 줄이는 백엔드 병렬 분할 적용 및 실제 CI·자동배포 시간 비교. 기준 main `cd68c68`, 기존 CURRENT 미커밋 기록과 dev refs 보존. 운영 앱 코드·DB·호스트 배포 게이트는 변경하지 않는다.
- 구현: full backend를 독립 runner/PostgreSQL 3 shards로 분할, fast 관련 테스트는 1 shard 유지. 실제 pytest 수집 결과를 파일 단위로 배정하며 기존 실행 순서/fixture 경계를 유지한다. 과거 CI 파일 완료 시각 간격을 추정 가중치로 사용하고 신규 파일은 수집 테스트 수로 자동 배정한다. 모든 shard의 성공을 기존 deploy gate가 요구하며 실패·빈 수집 exit code를 숨기지 않는다.
- 로컬 확인: ops 단위 검사 27개 통과, 프로젝트 Ruff/format 통과. 전체 테스트는 실행하지 않고 수집 목록만 대조하여 1,439개 = 544+487+408, 누락/중복 0과 동일 수집 해시를 확인했다. 콘솔 출력이 도구에서 잘린 첫 비교는 폐기하고 subprocess 내부에서 원문 전체 목록을 비교했다. 변경 파일 지정 `ops/verify_local.py`는 ops/workflow 파일에 앱 검사를 선택하지 않으므로 별도 단위·lint·workflow 검사로 검증한다.
- 대표 실행 확인은 직접 만든 tmpfs `pongdang-ci-shard-test-20260921`, loopback 32775 `pongdang_test`만 사용한다. 가중치 기준 CI는 [35590477900](https://github.com/facio313/Pongdang/actions/runs/35590477900): 전체 9분32초, backend job 6분54초/실행 단계6분34초, browser 최대4분23초, deploy1분47초. 더 오래된 일반 full CI는7분58초, fast UI CI는2분47초였다.
- 추가 검증: 분할 실행기의 대표 DB/health/migration 테스트 7+2+1개 모두 통과(13.13/2.61/2.12초), actionlint 1.7.12 통과. 첫 Ruff 호출은 저장소 밖 기본 설정으로 기존 SIM117 경고를 냈으며, 프로젝트 backend/pyproject.toml 규칙으로 변경 Python 4파일 lint/format을 명시적으로 통과했다. 임시 DB는 종료·제거했으며 운영 데이터에는 손대지 않았다.
- 반영: 요청 범위 7파일만 `1409368269baaf08a18032a71fcb7dc4bb227117`로 커밋·main push했다. 기존 CURRENT 변경은 커밋에서 제외하고 로컬 보존했다.
- 최종 CI [35594071100](https://github.com/facio313/Pongdang/actions/runs/35594071100) 모든 검사와 자동배포 성공. 11:26:34→11:31:27 UTC, 총 4분53초. 세 backend job은 동시에 시작하여 2분12초/2분36초/2분21초에 성공했다. 실제 pytest는 각각107.70/132.53/107.08초, 544+487+408=1,439개 모두 통과했고 세 수집 해시는 로컬 원본과 동일하다. 브라우저 2개 job도 모두 성공, 최대4분04초이며 이제 전체 완료 시간을 결정하는 단계다. deploy job31초.
- 비교: 직전 backend job6분54초→최대2분36초(약62% 단축). 전체 CI·배포9분32초→4분53초. 직전에는 runner 대기·마이그레이션 잠금 대기도 있었으므로 총 단축분 전부를 분할 효과로 보지 않는다. 매 실행의 runner/DB/배포 상태에 따라 시간은 달라진다.
- 운영 확인: current와 앱 이미지 태그 `1409368269baaf08a18032a71fcb7dc4bb227117`, frontend/backend/collector/db 모두 healthy, `/api/ready` ok, summary의 Pongdang DB·실제 자료·collector running 확인. 앱 이미지 ID는 직전 배포와 같아 제품 코드 변경이 없음을 함께 확인했다. 설치된 배포 게이트·CI 감시기·다른 앱·공용 SSO·운영 데이터/볼륨은 변경하지 않았다.
- 완료: 검사를 줄이지 않고 백엔드 분할 적용과 실측까지 완료했다. 추가 CI dispatch·수동 재배포·전체 로컬 테스트는 하지 않았다. 기존 기록이 포함된 CURRENT만 미커밋으로 보존하며 요청 범위 미완료 작업은 없다.

# 수정·CI·자동배포·운영 화면 확인 완료 · 홈/오늘 조건 자료 누락 · 2026-09-21

- 요청: 브라우저로 로그인하여 홈/오늘의 데이터 누락 원인을 확인하고 수정. 이후 사용자가 main 커밋·push·자동배포(DB 트리거 수정 포함)를 승인했다. 자격 증명은 문서·파일에 저장하지 않는다. 기존 CURRENT 기록과 dev refs를 보존한다.
- 기준: 서버 main을 origin/main `1f70013`으로 fast-forward했으며 기존 CURRENT 미커밋 변경을 유지했다. 데스크톱·모바일 실제 브라우저 확인에서 홈/오늘의 조건 점수·수온·기온이 모두 비고, HTTP 200 응답에 `condition_projection_pending`이 있었다. 조석·수질은 별도 조회로 표시되었다. 로그인·JS 오류 문제는 확인되지 않았다.
- 원인: v15의 모든 statement 무효화 트리거가 중복 INSERT, 0행 UPDATE/DELETE, 관측소 재확인 시각 갱신에도 전역 revision을 증가시킨다. 운영 게시 129,332건의 재계산은 약 4분이며, 직후 다음 중복 수집이 결과를 다시 가린다. 격리 재현에서 새 자료 0건인 동일 배치 재수집만으로 revision 5→8, ready→pending, 기존 점수 소실을 확인했다. 운영에서는 읽기 전용 상태 조회만 수행했다.
- 구현: `backend/app/water_index/condition_invalidation.py`에 transition table을 이용한 실제 변경 판별, v16 명시적 마이그레이션을 추가했다. 이미 알려진 관측소/장소의 재확인 시각만 달라진 경우는 무효화하지 않으며, 원관측 fetch/만료·값·좌표·지점 매핑·안전 제한 변경은 유지한다. 원자료와 기존 게시 결과를 삭제/재작성하지 않는다. 실제 새 입력이 생겼을 때 재계산 동안 pending인 기존 정책은 유지한다.
- 검증: 수정 전 중복 수집 회귀 실패를 확인했다. 최종 `ops/verify_local.py` 수정 5파일 Ruff/format, condition invalidation·producer·publication·storage·refresh 관련 49개 통과(161.02초). 신규 16개에는 중복 수집, 무변경 SQL, 실제 관측/좌표/유효기간 수정, 안전 제한 추가, v15→v16 무손실·반복 초기화가 포함된다. 모바일 홈→오늘/데스크톱 오늘 브라우저 2개 통과(22.3초). 처음 브라우저 실행은 Node 18로 설치된 선택 의존성 누락 및 브라우저 버전 부재로 실행 불가였고, Node 24에서 lockfile대로 재설치하고 해당 Chromium을 설치한 뒤 통과했다. 전체 로컬 빌드·전체 테스트는 실행하지 않았다.
- 검증 환경: 이 작업에서 만든 `pongdang-today-test-yuae3t`의 loopback 32772 `pongdang_test`(tmpfs)와 5189/8109 테스트 서버만 사용했다. 운영 DB·환경 파일·볼륨을 테스트에 사용하지 않았다. 브라우저 테스트 서버 및 운영 확인용 브라우저를 종료했으며 폐기용 DB 컨테이너도 종료·제거했다. 폐기용 테스트 데이터만 소멸하며 운영 자료에는 변경이 없다.
- 관련 파일: `backend/app/schema.py`, `backend/app/water_index/condition_invalidation.py`, `backend/tests/test_condition_invalidation.py`, `backend/tests/test_condition_storage_integration.py`, `backend/tests/test_condition_publication_recovery.py`. 운영 브라우저 화면 증거: `/tmp/pongdang-today-browser.yUAe3T/`(인증 상태 파일 없음).
- 반영: 새 원격 main `51d7025`의 frontend lint 수정을 fast-forward로 보존하고, 검증한 backend 5파일만 `4f7699575b102c416d01f3173212a8377b8d3675`로 커밋·main push했다. 기존 서버 메모가 섞인 CURRENT는 커밋에서 제외하고 로컬에 보존했다.
- 첫 CI [35588550855](https://github.com/facio313/Pongdang/actions/runs/35588550855)는 backend 1 failed/1436 passed, browser 3 failed/164 passed로 배포를 건너뛰었다. v4 재현 fixture에서 새 v16 마이그레이션을 제외하도록 보완했다. 기존 main이 숨긴 푸터 목록을 찾던 두 검사는 실제 남아 있는 화면별 안전/값 설명을 확인하도록 수정했고, 탭 왕복 검사는 명소 상세의 지연 응답을 홈 재요청으로 오인하지 않도록 먼저 응답 완료를 기다린다. 제품 UI는 변경하지 않았다.
- 후속 로컬 검증: `ops/verify_local.py`의 수정 browser 파일 ESLint·139 unit·증분 typecheck 통과. 관련 브라우저 3개 및 v4 업그레이드 테스트 1개 통과, backend Ruff/format 통과. 테스트에서 추천 화면의 안전 문구 기대값이 다른 것을 확인해 실제 문구로 정정한 뒤 해당 검사를 다시 통과했다. 추가 검증은 별도 tmpfs `pongdang-today-ci-test-20260921`의 loopback 32773 `pongdang_test`만 사용했다.
- 후속 반영: 테스트 4파일만 `cf3848048d45a893c32d4c5136864c98833850fc`로 커밋·main push했다. 추가 검사용 DB도 종료·제거했으며 폐기용 데이터 외 운영 데이터에는 조작이 없다.
- 두 번째 CI [35589458447](https://github.com/facio313/Pongdang/actions/runs/35589458447)는 모든 검증 job이 성공했지만 deploy 초기화가 실패했다. 운영 DB 로그는 `spots_waterspot`의 DROP TRIGGER에서 3초 lock timeout을 명시한다. 트랜잭션 전체 롤백으로 current는 `51d7025`이며 기존 4개 컨테이너 healthy·ready ok를 확인했다. 수동 배포나 동일 SHA CI 재실행을 하지 않았다.
- 배포 경합 보완: v16 마이그레이션은 6개 대상 테이블의 잠금을 NOWAIT로 함께 확보하며, 실패한 시도의 잠금을 savepoint 롤백으로 모두 풀고 최대 300초 동안 0.5초 간격으로 재시도한다. 조회 뒤에 배타 잠금을 대기시켜 다른 조회를 막지 않는다. 실제 읽기 트랜잭션 경합·다른 읽기 허용·시간 제한 시 무변경 회귀를 추가했다. 별도 tmpfs `pongdang-today-lock-test-20260921`의 loopback 32774 `pongdang_test`로만 검증한다.
- 최종 로컬 Ruff/format 및 condition invalidation·v4 migration 19개 통과(35.21초). 잠금 관련 2파일만 `cd68c685e5873f2c046cb43d8f05a3d5d92f8092`로 main 커밋·push했다. 임시 DB는 종료·제거했다. CI [35590477900](https://github.com/facio313/Pongdang/actions/runs/35590477900) 전체 성공: backend 1,439개, browser 88+79개 통과.
- 배포: 위 CI의 scope·backend·browser 2묶음·smoke·frontend·deploy 모두 성공했다. current release와 frontend/backend/collector 이미지 태그는 `cd68c685e5873f2c046cb43d8f05a3d5d92f8092`이며 앱 3개와 DB 모두 healthy, `/api/ready`는 ok. 배포 직후 대표 조건 GET은 source_revision 52997/pending으로 자동 수집·게시 완료를 기다리는 중이다.
- 운영 최종 확인: 2026-09-21 20:04 KST 대표 조건 GET이 generation 47 / revision 54415 / ready로 전환됐다. 경포 수영 62.5, 서핑 58.8, 휴식 46.3 및 수온 23.52°C·기온 21.1°C·파고 0.7m·풍속 3.2m/s를 확인했다. 실제 로그인 브라우저에서 데스크톱 오늘·홈·모바일 오늘의 값, 근거, 주간 예보 표시와 pageerror 없음 확인. 화면 증거는 `/tmp/pongdang-today-browser.yUAe3T/today-after.png`, `today-mobile-after.png`이며 인증 상태 파일은 없다.
- 범위/한계: 실제 새 관측 유입 시 기존 정책대로 계산 동안 잠시 pending이 된다(첫 게시 후 11:00 UTC 새 기상/해류 입력 사례 확인). 자료가 없는 당일 지난 12시 예보·시설 근거 없는 온천/래프팅 등은 여전히 –이며 값을 임의로 만들지 않았다. 중복/무변경 수집으로 불필요하게 무효화하던 결함을 해결한 것이며 실제 변경 시 안전성 무효화는 유지한다.
- 완료: 사용자 승인 범위의 수정·main 커밋/push·자동배포·운영 읽기/화면 확인 완료. dev refs·다른 앱·공용 SSO·운영 원자료/볼륨은 변경하지 않았다. 전체 테스트는 CI에서만 실행했고 추가 CI dispatch·동일 SHA 수동 재빌드/재배포는 하지 않았다. 기존 기록을 포함한 CURRENT만 미커밋으로 보존한다.

# 서버 반영 완료 · main 전용 작업·CI 감시 정책 · 2026-09-21

- 서버 checkout `/home/cks/Pongdang`은 미커밋 변경이 없는 main `549c0b5`에서 원격 main `58a9f89e220223a74cd11688ec8f71b436ae96bb`로 fast-forward했다. `AGENTS.md`, `docs/ci.md`, `ops/verify_local.py`와 관련 ops/CI 설정은 origin/main과 일치한다. local dev와 origin/dev는 모두 기존 `549c0b55242539be59252ac2c89ab6ab47fa55ea`를 보존했다. 다른 브랜치·worktree는 정리하지 않았다.
- 서버 Codex 전역 `/root/.codex/AGENTS.md`에 Pongdang 전용 정책을 추가했다. 서버에는 활성 전용 배포·Git 스킬이 없어 `/root/.codex/skills/pongdang-server-ops/SKILL.md`를 설치했다. 과거 기록의 dev 통합·전체 검증 관행보다 main 전용·수정 범위 검증 정책을 우선한다. 다른 앱의 지침은 바꾸지 않았다.
- 설치 `/usr/local/libexec/pongdang-ci-watch`는 main만 조회하며 해당 SHA의 CI 실행이 하나라도 있으면 추가 dispatch하지 않는다. `/etc/systemd/system/pongdang-ci-watch.timer`도 main 전용 설명으로 갱신했다. `.service`는 템플릿과 이미 동일해 유지했다. 변경 전 백업: `/home/cks/.local/share/pongdang-deploy/backups/main-only-20260921.2KASsV/`.
- `/usr/local/libexec/pongdang-deploy`는 백업과 바이트 단위 동일하게 유지했다. 최신 main SHA 확인·flock·실패 시 이전 앱 이미지 복구가 있다. 현재 main 템플릿과는 초기화 호출 차이가 있지만 이번 정책 갱신에서 DB 초기화 경로는 교체하거나 실행하지 않았다. `current`는 `58a9f89`, `previous`는 `50a9e72`로 그대로다.
- 실제 검사: ops 관련 unittest 21개, gh를 mock한 감시기 7개 시나리오(기존 CI/no CI/오류 시 중단), bash 문법, systemd unit 검증, skill validator 통과. frontend/backend 로컬 검증 명령은 `--dry-run`으로 선택 범위만 확인했으며 해당 앱 테스트를 실행한 것으로 계산하지 않는다. 전체 빌드·browser·backend·DB 테스트는 실행하지 않았다.
- systemd daemon-reload 후 기존 timer만 재개했다. 17:36:11–17:36:12 KST 실제 service는 exit 0, timer는 enabled/active/waiting. 해당 main SHA의 CI는 전후 동일한 1건: [35571129306](https://github.com/facio313/Pongdang/actions/runs/35571129306), CI와 deploy 모두 성공. 추가 CI·커밋·push·앱 재빌드·재배포를 실행하지 않았다.
- 운영 읽기 확인: frontend/backend/collector/db 모두 healthy, 앱 이미지 태그와 current release가 `58a9f89`, frontend 컨테이너 image ID와 해당 태그 image ID 일치. `/api/ready`는 `status=ok`, `/` HTTP 200, `/api/data/summary` 정상 JSON 객체. frontend OCI revision label은 앱 SHA와 다르므로 릴리스 판정에 사용하지 않았다(현재 Dockerfile에는 앱 revision label 설정 없음).
- 다른 앱·공용 SSO·운영 DB 데이터·볼륨 변경 없음. 이 서버 완료 기록만 checkout에 미커밋으로 남긴다. 요청 범위의 미완료 작업 없음. 아래 기록은 기존 작업 이력으로 보존하며 실행 권한으로 해석하지 않는다.

# 이전 작업 · 빠른 로컬 검증 및 main 전용 CI · 2026-09-21

- 요청/제약: iCloud 안의 원본 저장소 위치 유지. dev 커밋·병합·동기화·push·배포 금지, 기존 dev refs 보존. 로컬→CI→운영에서 전체 검증 체인을 반복하지 않는다.
- 구현: ops/verify_local.py에 수정 파일을 명시하면 해당 lint, 짧은 Node 단위 검사, 필요한 증분 타입 검사/명시한 backend 테스트만 실행한다. Git 전체 스캔·자동 저장소 복제·전체 빌드는 하지 않는다. backend 동작 변경은 관련 --test를 요구하고 DB 테스트에는 명시적인 disposable loopback pongdang_test 환경을 요구한다.
- CI: main push/PR만, dev 수동/PR 차단. 마지막 성공한 main push CI 이후 변경을 비교한다. 평소 UI는 기존 browser 핵심 8개(@smoke), backend 표시 문구/테스트 변경은 관련 테스트+core. 인증·DB·수집·점수·공용 API·인프라·미분류·수동은 전체 관련 검사를 유지하며 전체 browser는 독립 DB 2 shards. 이전 테스트 167개와 실패 시 배포 차단은 유지한다.
- 빌드: frontend job의 중복 production build 제거, Docker 이미지에서 typecheck+Vite build. frontend/backend별 GHA v2 layer cache, npm/uv cache mount. 기본 Docker health/readiness/초기화/collector 확인 유지; 초기화 반복/볼륨 재생성 검사는 full에서 실행. 운영은 기존 SHA/health/readiness와 실패 복구 유지, 서버 아키텍처/환경 인자에 맞춰 기존 서버 빌드 유지. CI 산출물의 운영 직접 재사용은 구현하지 않았다.
- 지침: ~/.codex/AGENTS.md, cks-gitflow 및 cks-platform-ops 지침(관련 참조 포함), 프로젝트 AGENTS/README/docs/ci.md 갱신. 일상 작업에 all-worktree audit/전체 로컬 검증을 강제하지 않는다.
- 실제 검증: scope/local 안전 조건 단위 테스트 21개 (Python 3.12 문법 호환 회귀 포함), Ruff/ESLint, actionlint 1.7.12, 두 스킬 validator 통과. 새 로컬 명령으로 frontend 139 단위+증분 typecheck 5.3초, backend 관련 133 테스트+Ruff 13.7초(테스트 자체 12.54초). 브라우저 mobile/desktop 핵심 8개 실제 통과 17.8초. 변경 전 지침/파일 백업을 보존했다.
- 검증 환경/한계: 같은 소스의 기존 ~/.cache/pongdang-all-release-20260921-131615 검증 복사본을 재사용, 원본 iCloud 파일을 비교 후 반영했다. 기존 임시 PG 디렉터리는 없어 새 disposable DB 49289/별도 browser 5181·8098을 사용하고 검증 후 종료했다. Docker CLI 부재로 새 이미지 빌드/컨테이너 검사는 로컬 미실행. 새 Actions/운영 배포는 미실행이며 위 시간은 로컬 검증 복사본 실측이다. 평소 CI 2~5분은 목표일 뿐 보장하지 않는다.
- 반영 상태: 사용자에게 main 커밋·push·CI·자동배포 승인을 받았다. 작업 커밋 d6d532c에 최신 main 249718f를 통합했다. CURRENT 충돌은 양쪽 기록을 보존했으며 제품 코드는 자동 통합됐다. Python 3.12 호환성 및 관련 21개 테스트/actionlint 통과. main push 후 CI/배포 확인을 진행한다. dev refs는 갱신하지 않는다. ci-watch/timer는 설치용 템플릿만 변경했고 운영 호스트 설치본은 별도 적용이 필요하다.
- 관련: docs/ci.md, .github/workflows/ci.yml, ops/ci_scope.py, ops/verify_local.py. 검증 복사본 branch codex/main-only-ci, 백업 ~/.cache/pongdang-main-only-ci-backup. 다음 승인된 릴리스에서는 최신 main 통합 후 새 CI 자체(full, 배포 구성 변경)를 한 번 확인한다.

# 이전 작업 · 전체 변경 통합 및 운영 배포 완료 · 2026-09-21

- 사용자 승인: 다른 작업의 변경도 모두 커밋하고 최신 원격 main 통합·충돌 조정·main/dev push·운영 배포. 비공개 환경과 .byeori/, .playwright-cli/, output/는 보존했다.
- 전체 작업 커밋 183c473(154개 파일). 최신 main의 헤더·지도 패널·홈 취향·추천 화면·설명 문구 변경을 포함했다. HomePage.tsx와 useResource.ts 충돌은 첫 입수 수온, 취향 칩, 저장 직후 무효화와 주기적 갱신을 모두 유지하도록 해결했다.
- 운영 배포 SHA: 0f824a9ccecbd7ed5332919c99b03920b769000c. main/dev 원격이 동일 SHA임을 확인했다. CI 및 배포: https://github.com/facio313/Pongdang/actions/runs/35564313621
- 검증: 최종 CI frontend lint/139 unit/build, backend Ruff/1398 tests, browser 167 tests, Docker smoke 모두 통과. 2026-09-21 14:38:43 KST 배포 로그에서 frontend/backend/db/collector Healthy, API readiness status=ok, 동일 SHA 적용을 확인했다. 인증 후 운영 UI 직접 조작은 미실행이다.
- 중간 실패 해결: 웹캠 테스트의 고정 DB 비밀번호 제거(실제 비밀번호 인증 DB에서 재현 후 66개 통과), CI backend 작업 10분 제한을 20분으로 조정, 최신 공용 버튼 스타일과 상세 버튼 폭 충돌 수정 및 새 홈 취향 API fixture 보완(실패 7개 재현 후 관련 browser 19개 통과). 검사를 삭제하거나 우회하지 않았다.
- 통합 체크아웃: /Users/cksmacbook/.cache/pongdang-all-release-20260921-131615. 증거·백업: 같은 경로에 -evidence 접미사를 붙인 디렉터리. 원본 iCloud Git mmap 시간 초과는 파일 비교와 별도 객체 디렉터리로 대응했고 Git 기록을 보존했다. 원본 제품 파일과 로컬 fix/finale·main·dev·origin/main·origin/dev를 배포 SHA로 동기화했다. 상세 상태는 release-state.json에 기록했다.
- 이 배포 결과 기록은 배포 후 작성한 로컬 인수인계 메모다.

# 동시 작업 · 백엔드 운영 복구 · 2026-09-21

- 사용자 요청: 점수·시간별 지표·수온·명소 상세가 정상 운영되도록 조치. 프론트 수정 금지. 커밋·운영 배포 승인 완료. 사용자 지시에 따라 dev 검증은 생략하고 main CI·자동배포만 진행한다.
- 운영 기준 `0f824a9`, 별도 체크아웃 `/home/cks/.local/share/pongdang-repair.lIgOzy/repo`, 브랜치 `fix/backend-operational-recovery`.
- 새 계산 SQL timeout, 예보 범위 초과, 수온의 불필요한 파생 조회, 명소 초기 수집 지연을 수정했다. 실제 자료를 복제한 격리 `pongdang_test`에서 추가로 발견한 게시 GC timeout과 평가 장기 실행도 bounded 처리로 보완했다. 운영 DB에는 테스트를 실행하지 않는다.
- 검증: 로컬 backend 전체 1,416개 통과(후속 변경은 관련 회귀 별도 검증), frontend lint/139 tests/build 통과. 최종 main CI가 통합 소스 전체를 다시 검증한다. 원자료 SELECT 약2초, 예보2,184건 투영, 수온12동시요청200, 평가2batch 28+33그룹 commit, condition GC108,490행 삭제·rollback 복원 통과. 최종 condition107,312건/204.95초/peak242MiB 게시 및40ms readback도 성공했다. main 통합·배포를 진행한다.
- 작업 중 원격 main에 별도 frontend 변경 `c8b4c75`가 추가됐다. 해당 변경을 보존하고 최신 main 위에 백엔드 수정만 통합한다.
- 세부 상태/완료 조건: [BACKEND-OPERATIONAL-RECOVERY.md](BACKEND-OPERATIONAL-RECOVERY.md). 기존 작업 기록은 아래에 보존한다.

# 이전 작업 · 명소 상세 영구 저장 및 정적 API 중복 조회 제거 · 2026-09-21

- 요청: 기존 명소의 운영·개장·주차·시설·문의·소개를 보강해 DB에 저장하고, 신규 장소 및 제공처 수정일 변경 시에만 상세 API를 호출한다. 화면은 읽기 전용 DB 조회. 거리 값은 출발점 좌표에 따른 직선거리로 계산한다.
- 구현: TourAPI 공통/소개/반복정보 수집, 추가형 v11 저장, 최대 100개 DB 조회 API, 데이터 목록, 모바일/데스크톱 및 여행 조회 연결 완료. 기존 행 최초 보강·신규 행·원본 수정 시만 요청하며 자료 없음도 기억한다. 사진의 7일 재조회와 같은 좌표의 행정구역 빈 응답 재조회를 제거했다. 상세: [PLACE-DETAILS.md](PLACE-DETAILS.md).
- 제약: 기존 사용자 CURRENT.md 기록과 .byeori/, .playwright-cli/, output/ 보존. 커밋·푸시·운영 배포 승인 없음. 테스트는 새 disposable pongdang_test에서만 수행한다. 기존 확인 서버·DB와 운영 DB는 테스트 대상으로 사용하지 않는다.
- 확인: 주소/좌표/장소목록은 이미 DB 조회. 사진은 DB+파일 저장이나 collector의 정기 재요청이 있었음. 날씨·교통·Windy livecam preview는 동적 자료로 기존 의미 유지.
- 최종 검증: Node 24 frontend lint/136 unit/type/build, 명소 브라우저 7개 항목 통과. 고정한 소스 복사본의 backend 1,355개 통과(전체 1,354개 + 복사본 누락 증빙 CSV 보충 후 해당 1개 재검증), Docker 부재 2 skips. 최신 작업 폴더 Ruff check/format 207개 및 git diff --check 통과. 동시 편집 중 실행의 실패, 브라우저 세션 종료 1건과 동일 코드 재검증 경위는 상세 문서에 구분해 기록했다.
- 실제 응답: 현재 로컬 목록 162곳 중 TourAPI 직접 원본 146곳 확인. 가진해변 실제 detail API에서 운영 09:00~18:00, 주차 가능, 화장실 있음, 추가 11개 항목을 확인했다. 이 실호출은 읽기 검증이며 실제 확인 DB/운영 DB에 전체 목록 보강을 실행한 것은 아니다. 배포 후 collector가 기존 미수집 행을 한도 안에서 보강한다.
- 동시 작업: 별도 세션에서 livecam 저장·점수 projection/갱신·알림·장소 중복 정리와 후속 v12~v14 스키마를 수정 중이다. 해당 변경은 보존하며 이 작업의 구현이나 전체 통과 결과로 주장하지 않는다.
- 정리: 이 작업의 49418 검증 DB 종료. 기존 5173/8000/51906 확인 환경과 사용자 변경은 유지했다. 소스 구현·관련 검증 완료이며 운영 반영은 아직 실행하지 않았다.

# 이전 작업 · 강원도 확대 main 통합 및 운영 배포 완료 · 2026-09-21

- 사용자 요청 완료: 최신 운영 main `281f4e5`와 강원도 확대를 통합했다. 28개 파일 충돌을 해결하며 최신 로고·파비콘·푸터·전체 화면 지도/내 코스·다국어 UI를 보존했다. 기존 main의 레이아웃 CSS를 바꾸지 않고 지역·장소 선택을 연결했다.
- 배포 커밋: `ebf073a1d345cd7e4034fae22e8fc8867d74a48a`. dev CI [35536916016](https://github.com/facio313/Pongdang/actions/runs/35536916016) 성공 후 동일 커밋을 main에 push했으며 main CI·배포 [35537506824](https://github.com/facio313/Pongdang/actions/runs/35537506824)도 모두 성공했다.
- 운영 로그: 2026-09-21 06:14:20 KST `Deployed Pongdang ebf073a1d345cd7e4034fae22e8fc8867d74a48a`. 추가형 스키마 초기화 성공, frontend/backend/db/collector 모두 Healthy, `/api/ready`는 `{"status":"ok"}`.
- 실제 브라우저로 `https://bonifacio.work/pongdang/` → 기존 Authelia SSO 로그인 화면 연결을 확인했다. 비인증 Python HTTP 요청은 Cloudflare 1010으로 차단되므로 운영 UI 장애 근거로 취급하지 않는다. 인증 후 운영 UI 직접 조작은 미실행이다.
- 검증: frontend lint/123 unit/type/build, backend Ruff 및 CI 1,268개, browser 140개 모두 통과. dev/main의 Docker smoke도 모두 통과했다. 로컬 backend는 1,266 passed/2 Docker skips. 지도 선택자 정정 후 지역·페이지 회귀 4개를 통과했고 최종 CI에서 전체 browser를 다시 통과했다.
- 원본 `fix/finale`, 로컬 main/dev 및 origin/main/dev가 모두 배포 SHA다. iCloud mmap 시간 초과로 중단된 원본 파일 갱신은 동일 해시의 검증 체크아웃 객체를 명령 실행 동안만 사용해 완료했다. Git 설정·비공개 환경·개인 파일을 변경하지 않았다.
- 소스/이력 백업과 검증 증거: `/Users/cksmacbook/.codex/backups/pongdang-gangwon-release-20260921-053525/`의 Git bundles, `release-verification.json`, `main-ci-result.json`, `main-deploy.log`. 통합 체크아웃은 `/Users/cksmacbook/.cache/pongdang-gangwon-release-20260921`이다.
- 기존 로컬 미리보기 `http://127.0.0.1:5173/pongdang/`도 배포 커밋의 frontend 161개 파일로 갱신·해시 검증했다. 비공개 설정과 backend 8000/실제 확인 DB 51906은 유지했다. 검사용 55469 DB와 임시 5179 서버·브라우저는 종료했다.
- 범위와 한계: 기본 검색·추천/관광 수집은 강원도 18개 시군으로 확장했다. 실시간 관측·안전 근거는 제공처별 기존 공간 범위의 제한을 유지하고, 미확인 값은 unknown/null로 둔다. 상세: [GANGWON-EXPANSION.md](GANGWON-EXPANSION.md).
- 이 완료 기록은 배포 후 작성한 로컬 인수인계 메모이며 미커밋 상태다. 배포된 제품 소스와 로컬 제품 소스에는 차이가 없다. 요청 범위의 미완료 작업 없음.

# 이전 작업 · 언어 전환 main 통합 및 운영 배포 완료 · 2026-09-21

- 사용자 요청 완료: 최신 main `a047dce`의 전체 화면 지도·내 코스, 로고·파비콘·푸터를 보존하고 화면 언어 전환을 통합했다. 언어 변경 커밋은 `281f4e5927d36e76fb3b78935bb75e37be571554`이며 원격 main/dev 모두 같은 SHA다.
- dev CI [35534550705](https://github.com/facio313/Pongdang/actions/runs/35534550705) 전체 성공 후 동일 커밋을 main에 push했다. main CI·운영 배포 [35535120595](https://github.com/facio313/Pongdang/actions/runs/35535120595)도 전체 성공했다.
- 서버 로그: 2026-09-21 05:27 KST `Deployed Pongdang 281f4e5927d36e76fb3b78935bb75e37be571554`, frontend/backend/db/collector Healthy, `/api/ready`는 `{"status":"ok"}`. 운영 URL은 `https://bonifacio.work/pongdang/`이며 기존 SSO 로그인 화면 연결을 확인했다. 인증 후 운영 UI 직접 클릭은 미검증이다.
- 로컬 검증: frontend lint/111 unit/type/build, backend Ruff/1,170 tests(로컬 Docker 관련 2 skips), 전체 browser 134개 통과. dev/main CI의 Docker smoke도 모두 성공했다. 별도 `59355/pongdang_test`는 종료했고 기존 5173/8000/51906 확인 환경은 유지했다.
- 원본 Git 명령의 정체로 별도 `codex/ui-language-release` 체크아웃에서 통합·커밋했다. 경로: `/Users/cksmacbook/.codex/backups/pongdang-language-release-20260921-044626/release-checkout`. 원본에 받아진 커밋의 존재와 조상 관계를 확인해 로컬 main/dev 및 원격 추적 refs도 같은 SHA로 갱신했다. 현재 체크아웃 `fix/finale`과 미커밋 작업 파일은 그대로 보존한다.
- 강원 지역 확대·필터·마이그레이션은 이번 언어 커밋에서 제외했다. 기존 변경 116개 백업은 위 부모 경로 `working-files/`, 해시 목록은 `manifest.json`, 배포 증거는 `release-verification.json`과 `main-deploy.log`다. `.byeori/`, `output/`, 비공개 환경·SSO·키·실제 DB를 변경하지 않았다.
- 배포한 구현 상세: [UI-LANGUAGE.md](https://github.com/facio313/Pongdang/blob/281f4e5927d36e76fb3b78935bb75e37be571554/docs/ai/UI-LANGUAGE.md). 기존 강원 확대 기록은 [GANGWON-EXPANSION.md](GANGWON-EXPANSION.md), 최초 로컬 언어 작업 기록은 [UI-LANGUAGE.md](UI-LANGUAGE.md)다.

# 이전 작업 · 화면 전체 언어 전환 · 2026-09-21

- 사용자 후속 요청으로 기존 자료 조회용 토글을 화면 메뉴·버튼·설명 전체에 확장했다. 한국어/영어/중국어 간체/일본어 지원. 제공처·사용자 원문과 기존 대화·저장 코스의 내용은 보존한다.
- 언어 변경은 같은 화면을 다시 마운트하지 않으며 선택한 장소·입력값·펼친 설명을 유지한다. 새 추천과 여행 안내에는 선택 locale을 적용한다.
- 브랜치 `fix/finale`, 기존 `.byeori/`와 강원 지역 확장 동시 변경 보존. 이 언어 작업에서 커밋·푸시·배포·운영 DB·.env 변경을 실행하지 않았다.
- 언어 전환 구현·검증 완료. 상세: [UI-LANGUAGE.md](UI-LANGUAGE.md). 프런트 lint/115 unit/type/build, 전체 browser 134개와 마지막 영향 범위 12개, backend Ruff 및 관련 29개 테스트 통과. 전체 backend 실행·환경 재실행 결과는 상세 문서에 기록했다.
- 사용자 미리보기 `http://127.0.0.1:5173/pongdang/#spots?spot_id=9` 유지. 실제 화면에서 세 외국어 메뉴·설명·버튼 전환을 확인했고 영어 점수 설명을 펼쳐 두었다. 검사는 별도의 `50139/pongdang_test`에서 수행했으며 해당 검사용 DB는 종료했다. 최종 관련 소스 349개가 검증 snapshot과 일치함을 확인했다.

# 이전 작업 · 브랜치 통합·정리 및 운영 배포 · 2026-09-21

- 사용자 승인: 수정 커밋, 도구 브랜치 통합·삭제, main 머지·push·운영 배포. 유지할 이름: main, dev, feature/connect, feature/today-page, feature/api. .env·SSO·키·DB 스키마 변경 없음.
- 수정 커밋 68648ca와 main 9e6055f를 dev에 통합한 뒤 새 main 3e5bf9e도 충돌 없이 받았다. 최신 카테고리별 UI/공용 조회/지도 배치 API와 R37/R22/R60 등 검증된 수정 모두 유지한다. report.md 완료 23개는 백업과 바이트 동일하다.
- 로컬 검증: frontend lint/106 unit/build, Ruff lint/format, backend 1170 passed/2 Docker skips. main 추가 통합 후 전체 browser 117 통과, 상세 설명 이동에 따른 선택자/조회 대기 수정 후 영향받는 29개 전부 통과. 이전 후보 액션 6개도 통과. 전체 122개는 CI에서 재실행한다. 390×844 실제 클릭·노트 간격·신호 비차단·중복 없는 저장 확인과 원래 취향 복구 완료.
- 외부 bundle 및 번호 복사본 120개 보존: `/Users/cksmacbook/.codex/backups/pongdang-branches-2026-09-21-e66k67t8/`. `.byeori/`, 기존 stash, feature/connect worktree의 로컬 의존성은 보존한다.
- Cursor d86cee2의 대체된 실험은 파일 변경 없는 ours merge로 이력을 보존한다. 이후 dev CI → 동일 SHA main CI/자동 배포 → 불필요 브랜치/깨끗한 report worktree 정리 순서다. 최종 Actions URL·배포 SHA·브랜치/health 결과는 백업 디렉터리 `release-verification.json`에 기록한다.
- 상세 결정·검증: [BRANCH-CONSOLIDATION-2026-09-21.md](BRANCH-CONSOLIDATION-2026-09-21.md). 자동 검사 DB 51907은 검증 뒤 종료하며 기존 확인 서버 5173/8000/51906은 유지한다.

# 이전 작업 · R37 노트 겹침 / 카드 신호 / 태그 중복 · 2026-09-21

- 범위: STEP 1 노트와 sticky CTA 겹침, STEP 2 신호의 전면 busy 차단, 서로 다른 카테고리의 같은 라벨 중복 전송만 수정. 기존 변경과 R37/R22/R60 완료 상태·23개 집계 유지. 커밋·푸시·배포·.env·SSO·키·스키마 변경 없음.
- 구현: STEP 1 태그 간격과 CTA 높이 여유 공간, 카드 진행과 POST signals 분리 및 인라인 실패 안내, 전송 태그 문자열 Set 중복 제거. 카테고리 ID와 저장/후보/경로 액션의 busy·중복 제출 방지는 유지.
- 검증 완료: 수정 전 신규 회귀 3개 실패 재현. 최종 frontend lint/106 unit/build, 전체 browser 115개 통과. backend Ruff/format 및 pytest 1160 passed, 2 skipped, 2 warnings. lint/browser 동시 실행의 test-results 경합은 종료 후 순차 검사로 해소했다.
- 컴퓨터 유즈: 390×844 #recommend scrollY=0, note bottom=710.92, slot top=724, CTA bottom=768, tab top=780. CTA 실제 클릭→STEP 2. 좋아요/패스→다음 카드·busy=false·토스트 없음·오늘 탭 클릭 성공. 장소 온천+활동 온천 포함 저장 PUT200, GET tags=[물 보며 쉬기, 온천, 서핑], 빈 후보에서도 저장 안내 확인. 검증 후 원래 취향 복구·재조회 완료.
- 격리: 실제 화면 5173/8000/51906 pongdang_test 유지; 자동 검사용 새 51907 pongdang_test는 종료. 운영 DB 접근 없음. 로그 `/tmp/pongdang-r37-residual-*`; 상세 [REPORT-R37-RESIDUALS-2026-09-21.md](REPORT-R37-RESIDUALS-2026-09-21.md).
- 요청한 세 잔여 수정·검증 완료. report.md는 작업 시작 복사본과 바이트 단위로 동일하다. 명시적 제외 항목은 그대로 유지한다.

# 이전 작업 · R37 / R22 / R60 완료 기준 수정

- 목표: 추천 핵심 CTA의 하단 탭 겹침, 제품 문장의 원본 자료 상태 코드, 취향 마법사의 서버 선택 한도 불일치만 수정한다.
- 브랜치 `feature/connect-cursor`, 기준 `4a20c72`. 커밋·푸시·배포·.env·SSO·키·DB 스키마·점수 계산식 변경 없음. 기존 사용자 `report.md`는 세 항목의 상태 행만 최종 결과로 갱신했고 `.byeori/`는 보존했다.
- 구현과 컴퓨터 유즈 확인 완료. frontend lint/106 unit/build, backend Ruff/1160 pytest 통과. 전체 browser 110개 통과(기존 예보 테스트 응답 종료 경쟁 보완).
- 로컬 실제 클릭은 5173/8000/51906 `pongdang_test`, 자동 검사는 별도 51907 `pongdang_test`를 사용하고 종료했다. 기존 확인 서버는 유지했으며 운영 DB는 사용하지 않았다.
- 상세 근거: [REPORT-COMPLETION-FIXES-2026-09-20.md](REPORT-COMPLETION-FIXES-2026-09-20.md). 요청한 세 항목의 잔여 작업 없음. Docker CLI가 없어 Compose 검사 2건은 skip이다.

# 이전 작업 · report.md 선별 결함 수정

- 최종 구현·검증: [REPORT-FIXES-2026-09-20.md](REPORT-FIXES-2026-09-20.md). 지정한 29개 항목과 컴퓨터 유즈에서 추가 재현한 R04 빈 region 422 / R04·R05 실제 해변 station 404를 수정했다. 실제 송정해수욕장 즐겨찾기·초안·코스 저장 및 재조회, 송정해변 초안 추가를 로컬 실제 데이터 복사본(pongdang_test)에서 확인했다.
- 최종 검사: 프론트 lint / 106 tests / build, 브라우저 101 tests, 백엔드 Ruff lint/format / 1,160 tests 통과. Docker CLI 부재 Compose 2 skips, 기존 deprecation 2 warnings. 자동 검증은 별도 pongdang_test(51907)에서 수행했다.
- 사용자 후속 요청에 따라 커밋 대상에 포함한다. 사용자 원본 report.md·.byeori/는 제외. 푸시·운영 배포·SSO·.env 변경 없음. 명시적 제외 항목은 그대로 유지했다.
- 확인용 로컬 서버 5173/8000 및 실제 데이터 테스트 복사본 51906은 실행 중이다. 구독의 로컬 SSO 미설정 503과 운영 세션·Origin 미검증을 정상 동작으로 포장하지 않는다. 유료 AI·실제 외부 경로 호출은 미실행이며 관련 동시성/오류 처리는 자동 회귀로 검증했다.
- 아래는 이전 예보 복구 작업의 기록이다.

# 이번 주 예보 복구 · 2026-09-20

- 최신 상태: 이후 main e1d5328 통합 및 사진·루나 추천 관련 다른 세션/Cursor 커밋을 포함했다. 사용자가 전체 main 푸시를 명시적으로 요청하여 dev CI 검증 후 main 자동 배포 흐름으로 진행 중이다. 이전 작업 시점의 커밋·배포 상태와 구분하며 상세 이력은 [MAIN-INTEGRATION-2026-09-20.md](MAIN-INTEGRATION-2026-09-20.md)를 참조한다.
- 후속 확인 완료: 16:10:05 KST에 실제 7일 forecast가 모두 HTTP 200이고 값·coverage가 유지됨을 확인했다. 자동 확인 pongdang은 PAUSED이며 추가 실행하지 않는다. 운영 반영 여부는 main CI·배포 결과로 별도 확인한다.

- 요청: main pull, 예보 미표시 원인 확인·계획·조치·정상 확인 후 알림.
- 브랜치: feature/connect-cursor. 깨끗한 1798dd9에서 origin/main 377b20e로 fast-forward 완료. 이 작업에서는 커밋·푸시·운영 배포를 실행하지 않았다.
- 완료 기준: 실제 수집 자료로 7일 조건 API와 로컬 오늘 화면이 표시되고 이력·결측·실패 의미를 보존한다.
- 원인: condition_api.py의 revisions/slots 조인에서 COALESCE 원자료 ID 비교가 잔여 필터로 남아 약 5,645만 행을 비교했다. 실제 실행 5.5~6.8초로 읽기 전용 API의 statement_timeout=3초를 초과했고 7일 모두 HTTP 503이었다. 수집 자체는 성공하고 있었다.
- 수정: known CTE에서 source_key를 한 번 계산해 조인에 재사용. 제한 시간·DB 스키마·저장 데이터는 변경하지 않음. 데스크톱/모바일 주간 예보의 조회 중·실패·자료 없음 표시를 구분.
- 로컬 적용: 기존 개발 백엔드를 같은 app.main:create_app, 127.0.0.1:8000으로 재시작. frontend 127.0.0.1:5173/pongdang/#today에서 실제 표시 확인.
- 실제 확인: 로컬 pongdang DB 경포해수욕장 spot_id=582, 수영, 9/20~9/26 각 12:00 KST. 7개 HTTP 200, 응답 0.296~0.368초. 화면/API 값 일치: 65.7, 74, 68.2, 81.7, 79.2, 80.2, 50.7. 9/20은 3/4, 9/21~23은 4/4, 9/24~26은 2/4 근거의 참고 점수이며 안전 판정이 아니다.
- 검증: Node 24.21.0으로 frontend lint / 단위 테스트 / build 통과. backend Ruff lint/format 통과. 전체 pytest 1,087개 통과(52.54초), 이 중 이력 4,704건으로 7일 조회하는 회귀 포함. 예보 관련 Playwright 4개 통과(데스크톱 실제 서버값, 로딩/실패/결측 구분, 모바일 날짜 전환, 모바일 조회 실패).
- 테스트 격리: 새 PostgreSQL 18 클러스터 /tmp/pongdang-forecast-test.Pg5A4N, 127.0.0.1:55439, pongdang_test 사용. 초기 SQL_ASCII로 만든 테스트 DB에서 bytes 관련 실패가 나 UTF8 DB로 다시 만든 뒤 통과했다. 실제 수집 DB에 테스트 데이터를 쓰지 않음. 전체 결과 로그는 해당 임시 경로 backend-tests.log.
- 동시 작업: 사진/첨부 기능 관련 다른 작업의 파일 변경이 작업 중 들어왔다. 그대로 보존하며 본 작업의 검증을 그 기능 전체 검증으로 해석하지 않는다. 예보 변경 파일은 condition_api.py, test_condition_score_integration.py, TodayDesktop.tsx, TodayPage.tsx, desktop-screens.spec.ts, product.spec.ts.
- 후속: 이 작업에 heartbeat 자동 확인 `pongdang`(Pongdang 예보 복구 후속 확인)을 생성했다. 15분 뒤 로컬 7일 API/가능하면 화면을 읽기 전용으로 재확인하고, 성공 유지 또는 필요한 조치를 한 번 알린 뒤 PAUSED로 전환한다.
- 운영: 최신 main 377b20e의 기존 CI/deploy 성공은 확인했지만 이 수정은 운영에 배포되지 않았다. 운영 URL은 미인증 요청에 302. 사용자에게 로컬/운영 중 대상 확인 질문을 남겼으며 답변 전에는 로컬 복구와 운영 복구를 혼동하지 않는다.
## 2026-09-27 host-pull deployment completed

- Replaced Pongdang's inbound GitHub Actions SSH deployment with a main-only
  host watcher while retaining the existing local deployment gate.
- Pushed `6e65e56400c97e29a6541c3194ab344f7247bdb2` and the Buildx sandbox fix
  `705bd653f9ab1482f7bcbce82097d9aa10d1b8bf` to `main`.
- GitHub Actions run `36301381990` completed both production image jobs
  successfully. The host then deployed `705bd653f9ab1482f7bcbce82097d9aa10d1b8bf`.
- The first host attempt failed before container replacement because
  `ProtectHome=read-only` also blocked Buildx state. The unit now grants write
  access only to `/home/cks/.docker/buildx`; the failed run attempt remains
  recorded and was not retried.
- Verified the installed watcher unit and timer, exact current/main SHA, healthy
  backend/frontend/collector/database containers, `/api/ready`, and the root
  HTTP 200 response. Host installation backups are under
  `/home/cks/.local/share/pongdang-deploy/backups/host-pull-20260927.YUPeDx`.
- The pre-existing edits in this file remain intentionally unstaged.
