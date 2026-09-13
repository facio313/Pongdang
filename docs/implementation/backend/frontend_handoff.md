# A 기능 프론트 인계

이번 변경은 기존 `FeatureData` 원본 표와 페이지·메뉴·CSS를 보존하고 결과 문구 영역만 연결한다. 경수의 백엔드 범위이며 지도/차트/구독 설정/리뷰 입력 UI는 추가하지 않았다.

## 파일별 연결

| 파일 | 연결과 최소 변경 |
|---|---|
| frontend/src/featureApi.ts | 기존 requestData 재사용. 기능 전용 DTO 런타임 검사·reason/status 문구 변환. 일반 자료표 Row로 강제 단언하지 않음 |
| frontend/src/api.ts | 기존 BASE_URL 경로 생성 보존. fetch 전후 AbortSignal 확인으로 취소 뒤 늦은 응답이 화면에 반영되지 않도록 보완 |
| frontend/src/useFeatureResult.ts | API 읽기·요청 취소·조건 키 비교. 이전 요청 결과는 다음 기능에 노출하지 않음 |
| WaterIndexHubPage.tsx | 기존 hub-note에 저장된 A1 평가 상태·입력 수·평가시각 바인딩; 공개 미검증 score는 거부 |
| WaterForecastPage.tsx | 기존 datebar/hero 문구에 A2 실제 범위/발표시각/대상시각 상태 표시; 7일 합성 없음 |
| WaterIndexMapPage.tsx | 기존 상세 문구에 A3 장소 및 A4 수온/관측소/측정시각 표시; 지도 구조 유지 |
| LivecamHubPage.tsx | 기존 빈 영상 영역에 A5 상태·조건부 공식 공개 페이지 링크. 자동 재생/새 임베드 UI 없음 |
| TideTimerPage.tsx | 기존 전환시각 pill에 A6 다음 고저조, note에 기준시각 표시; 활동창 임의 생성 없음 |
| FirstSwimPage.tsx | 기존 두 결과 영역에 본인 A7 이벤트·최초여부/발송 상태 또는 인증 오류 표시 |
| WaterQualityPage.tsx | 기존 결과 영역에 A8 저장 비교 상태 표시; 공인 등급/신뢰도 수치 생성 없음 |
| tsconfig.json | Node24 원본 TS 테스트와 번들러의 `.ts` import 검사를 위한 allowImportingTsExtensions(noEmit 유지) |
| tests/independence.test.mjs | transport가 취소를 무시해도 늦은 응답은 폐기하는 회귀 추가 |
| tests/featureApi.test.mjs | null/0/잘못된 숫자·계약·미검증 점수·발표시각·BASE_URL·취소 signal·503·인증 URL 회귀 |

기존 화면에는 장소 선택 UI가 없으므로 A1/A2/A3/A4/A6 연결은 `water-twin?page_size=1`의 첫 수집 지점을 사용하고 해당 지점명을 문구에 표시한다. 이는 추천이나 가까운 지점 추론이 아니다. 프론트에서 장소 선택을 구현하면 같은 `spot_id`를 각 API에 전달하고 아래 시간·활동 조건을 유지한다. A5/A8은 첫 페이지 결과, A7은 인증된 본인 이벤트만 요청한다.

## 요청 계약

모든 경로는 `requestData(import.meta.env.BASE_URL, relativePath, signal)`로 호출한다. 생산 BASE_URL=/pongdang/이면 URL은 `/pongdang/api/data/...`이며 API_ROOT_PATH=/pongdang을 보존한다. 예시는 데이터 존재를 보장하지 않는다.

```typescript
const query = new URLSearchParams({
  spot_id: String(selectedSpotId), activity: "swim", profile_id: "general",
  mode: "forecast", from: start.toISOString(), until: end.toISOString(), page_size: "100",
});
// 전용 DTO 검증 뒤 사용
const response = await requestData<unknown>(import.meta.env.BASE_URL,
  `water-index/assessments?${query}`, controller.signal);
```

| API | 쿼리/결과 |
|---|---|
| water-index/assessments, support, coverage | spot_id/activity/from/until; assessments profile_id=general/mode 필수. 최대31일, page_size<=100. A1 DTO water-assessment.v1-draft 유지 |
| water-forecast/forecasts | 같은 장소·활동·기간. 공식 provider target interval과 revision/issued_at/fetched_at. horizon의 최소·최대가 중간 무결측을 의미하지 않음 |
| water-twin, water-temperature | spot_id 또는 west/east/south/north bbox(최대20도씩), activity, at, as_of, mode, kind, page/page_size. 최상위/중첩 자료 상한 초과 시 범위를 좁혀 재요청 |
| livecams | spot_id/media_kind/page/page_size. media_kind=live/recording/image와 reachability 상태는 별개. 공개 페이지는 조건을 확인해 외부 링크 |
| tides/events | 장소/활동/from/until/reference_at. next_high/next_low nullable, reference_at과 event_at으로 countdown 재계산. 예보 정정 시 새 revision으로 교체 |
| tides/windows | 같은 장소/활동/기간. official_operating_window도 개인 입수 안전 보장이 아님 |
| notifications/subscriptions, events, subscriptions/{id}/evaluations | 기존 SSO 인증 필요, limit<=100/offset. 구독 create/update/cancel은 별도 API 문서 참고 |
| quality/comparisons | spot_id/as_of/page/page_size. 저장된 최근31일 비교 분석의 from/until·sample·reason·metric delta/비교 불가를 읽음 |
| quality/observations | 인증한 본인 GET 및 POST. 새 리뷰 UI 담당자에게 입력/revision/retraction 계약 인계 |
| ai/tools, ai/explanation | 제한 A 서비스 경로와 확인된 근거 설명. GET은 결정적 설명이며 호출예산/외부 API 쓰기 없음. 선택적 모델 POST는 인증·서버 설정 필요 |

## null, 오류, 미활성

`null`은 0·정상·안전으로 변환하지 않는다. `support_unknown`, `withheld`, `outside_forecast_horizon`, `missing_within_horizon`, `no_review_data`, `analysis_pending`, `stale`을 구별한다. 공급자 미제공 발표시각은 null이며 수집시각으로 바꾸지 않는다. 여러 수온이 상충하면 최댓값/평균으로 안전 판단하지 않는다.

HTTP200 빈 결과는 정상 자료 부재다. 401/403은 SSO 인증/권한, 503 AUTH_NOT_CONFIGURED는 서버 SSO 전달 설정 미완료, 422는 요청 범위/시간/계약 오류, 409는 revision/경합 충돌, 다른 503은 저장소·외부 서비스 처리 불가다. 오류 응답을 빈 정상 결과로 대체하지 않는다.

OpenAPI 원문은 실행 앱 `/api/openapi.json` (외부 배포 prefix를 포함하면 `/pongdang/api/openapi.json`)와 이 폴더 `openapi.json`을 확인한다. 사용자/세션 테이블, raw provider responses, arbitrary SQL, 임의 URL proxy는 공개하지 않는다.

최종 Node.js 24 검사: lint 통과, 테스트 20개 통과, TypeScript/Vite build 통과. 시작 상태 `baseline.json`에 기록된 CSS 8개와 App/DataPage/FeatureData/useResource/navigation은 동일 SHA-256을 유지했다. 과거 시점의 이름·좌표를 복원할 수 없으면 null이며, 이름은 지점 ID로 표시한다. 단위 미제공·평가 미실행도 각각 표시한다.
