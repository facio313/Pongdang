# 점수 저장·10분 갱신 프런트 작업

2026-09-21. 프런트 구현 완료. 전체 백엔드·DB 계약 브라우저 통합 검증은 상위 작업에서 진행한다.

- `useResource`의 성공 응답 캐시와 자동 조회를 600,000ms로 통일했다. 같은 요청은 공유하고, 실패 뒤에도 10분을 기다린다. 수동 완료 시 `resourceRefresh` 세대가 바뀌어 활성 조회를 다시 읽으며, 이전 세대의 늦은 응답은 새 캐시를 채우지 못한다. 페이지를 재마운트하지 않아 화면 선택·입력 상태를 유지한다.
- `useExpiry`는 근거 만료 표시만 갱신한다. 만료에 따른 짧은 주기 API 요청은 제거했다. `projection.refresh_after`는 원자료의 유효기간을 대신하지 않는다.
- 주간 7일과 하루 4개 시간대는 각각 `water-index/conditions/series` 1회로 조회한다. 응답 행은 요청 대상 시각과 `Date.parse`로 대응해 순서와 UTC/KST 표현에 의존하지 않는다.
- 사이드 메뉴 맨 아래 새로고침 버튼은 `POST refresh {}` 접수 후 `GET refresh/{request_id}`의 실제 완료를 확인한다. 진행 중 중복 요청을 막고, 메뉴를 닫아도 추적한다. 부분 실패·실패를 표시하며 상태 조회 실패는 같은 작업 ID로 재개한다. 완료된 일부 데이터도 반영하도록 모든 terminal 상태에서 공통 캐시를 무효화한다.
- 데이터 관리 화면의 기존 읽기 버튼은 `조회 다시하기`로 명확히 표시했다. 새 projection pending/unavailable 사유를 표시 문구와 번역에 연결했다.
- `useNotificationResource`의 owner-only 로컬 상태·인증·취소 처리를 보존하면서 자동 조회를 10분으로 변경했다. visibilitychange마다 강제 조회하는 동작은 없앴고, 수동 갱신 완료 신호에 연결했다. 웹캠 별도 캐시의 같은 신호 연결은 상위 작업에서 반영했다.

## 검증

실제 workspace 읽기/복사가 iCloud 파일 처리에서 지연되어, 별도 `/Users/cksmacbook/.cache/pongdang-refresh-frontend-20260921`에 최신 파일을 복사하고 SHA256을 대조한 후 Node.js 24.19.0으로 검증했다. 기존 읽기 참고 snapshot은 수정하지 않았다.

- 전체 프런트 `npm run lint`: 통과.
- 전체 단위 테스트 `npm test`: 136개 통과.
- TypeScript + Vite build: 통과. 기존 500kB chunk 크기 경고만 남는다.
- 알림 훅 추가 후 관련 lint와 TypeScript + Vite build 재검증: 통과.
- 실제 앱 UI를 사용하고 모든 API를 local fixture로 가로챈 브라우저 회귀 6개: 통과. 10분 주기, 즉시 만료 표시, 실패 후 요청 폭주 방지, 주간 묶음 조회·날짜 대응, 수동 완료 후 재조회·입력 유지, 부분 실패·동일 작업 상태 재개, owner-only 알림 주기를 확인했다.
- 알림 회귀의 초기 요청 1회 가정은 개발 StrictMode/상태 polling 진행과 경쟁할 수 있어, fixture 완료 시점을 제어하고 마운트 직후 횟수를 기준으로 후속 조회 증가를 검증하도록 수정했다.
- 스크린샷 `output/playwright/score-refresh-sidebar-20260921.png`를 직접 확인했다. 390×844 화면에서 하단 버튼·완료 안내·패널 불투명도가 정상이다.

검증 서버 5184는 각 검사 종료 후 정지했다. 배포·커밋·푸시 및 실제 외부 제공처 호출은 하지 않았다. 기존 DB 계약 브라우저의 단건 조건 API mock은 series 계약에 맞춰 필요한 부분을 갱신했으며, 전체 실행 결과는 상위 작업에서 합친다.
