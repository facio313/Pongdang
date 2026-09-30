# API 호출·공통 자료 저장 감사 및 코스 장소 캐시 · 2026-09-30

## 요청과 현재 결과

- 목표 5: 공통 자료를 백엔드 수집기에서 저장하고 화면은 저장 자료를 읽도록 하되, 현재 데이터·사용성을 해치지 않으며 CSS는 변경하지 않는다.
- 코드 조사 결과 대부분 이미 해당 구조다. 이번 변경은 이를 우회하던 저장 코스 장소 조회를 공통 캐시·요청 큐에 연결한다. 운영 DB·외부 제공자 API·배포 설정은 건드리지 않았다.
- 담당 변경 파일: `frontend/src/useResource.ts`, `frontend/src/usePlacesById.ts`, `frontend/tests/resourceReads.test.mjs`. 다른 작업자의 지도 화면·CSS·CURRENT.md 변경은 수정하지 않는다.

## 확인한 구조

| 자료 | 저장·조회 구조 | 주기·호출 제한 |
| --- | --- | --- |
| 점수·시간별 점수·목록 점수 | `condition_projection`이 결과를 저장하고 `/water-index/conditions`, `/summary`, `/series`는 `condition_storage`를 읽는다. 캐시 누락으로 계산·수집을 시작하지 않는다. | 계산 작업 10분. `read_condition_set`은 최대 200개 조건을 한 SELECT로 읽으며 프런트 목록은 25곳씩 최대 4묶음이다. 일반 화면 재조회는 30분. |
| 날씨·해양·수질 원시자료 | 독립 `app.ingestion.worker`가 공식 자료를 정규화하여 DB에 저장한다. | 예보는 최대 30분 간격, 빠른 관측·특보는 10분, 수질·정적 목록은 대체로 하루. worker의 30초는 예정 작업 확인 간격이며 전체 제공자를 30초마다 호출한다는 뜻이 아니다. 작업별 DB 잠금·예정 시각·실패 대기를 보존한다. |
| 장소 목록 | Kakao/TourAPI 수집 → DB → `/places`, `/datasets/spots` 읽기 | 기본 목록은 하루. 강원 TourAPI는 언어·시군별 페이지 진행을 저장하며 한 회차 최대 설정 페이지+재개 확인 2회로 제한한다. |
| 명소 상세 | `place_details.collector`가 Common/Intro/Info를 저장하고 `/place-details`는 DB만 읽는다. | 수집기가 10분마다 새 장소·원본 revision 변경·실패 재시도만 찾는다. 성공한 동일 revision을 반복 호출하지 않는다. 서비스별 하루 기본 500회 예산. |
| 대표 사진 | 저장 상세의 이미지 주소를 우선 사용, 없을 때만 `detailImage2` 호출. 허용된 공공누리 Type1/Type3 원본을 해시 파일로 저장하고 DB에 출처·이용조건·시각을 기록한다. 프런트는 최대 100곳 메타데이터를 한 번에 읽는다. | 이미 저장한 파일을 재사용하며 상세 revision이 바뀌거나 최초/실패 상태일 때만 다시 처리. HTTP 이미지 조회는 로컬 파일, `private,max-age=3600`. Compose는 collector에 사진 볼륨 쓰기, backend에 읽기 전용 연결. |
| 웹캠 목록·대표 썸네일 | 현재 코드는 첫 목록을 DB에 보존하며 이후 목록·필터·페이지·섞기를 DB에서 읽는다. 대표 썸네일도 카메라별 최초 저장 후 로컬 파일을 제공한다. | 일반 조회로 자동 만료·재수집하지 않으며 CLI만 명시적 목록 갱신. 별도 spot_id 주변 조회는 단기 캐시. 기본 일일 30회 예산과 2초 호출 간격을 DB에서 공유한다. |
| AI 추천·대화 및 개인 경로 | 사용자 취향·선택·출발점·이동수단·시각에 따라 달라지는 요청이다. 공통 수집자료와 분리해야 한다. | 통합 작업에서 추천의 원시자료 반복 계산을 저장 결과 묶음 읽기로 전환했다. 개인 경로의 실행 시각·필수 방문지에 대한 응답을 전 사용자 공통 30분 결과로 대체하지 않는다. |

근거: `backend/app/ingestion/jobs.py`, `worker.py`, `feature_jobs.py`, `place_details/collector.py`, `attachments/collector.py`, `attachments/api.py`, `livecams/catalog.py`, `livecams/thumbnails.py`, `water_index/condition_storage.py`; `frontend/src/resourceRefresh.ts`, `resourceQueue.ts`, `useConditionSummaries.ts`, `usePlacePhotos.ts`.

## 이번 수정

- 이전 `usePlacesById`는 저장 코스 최대 20곳을 `Promise.allSettled`로 동시에 보내며 공통 30분 캐시·동일 진행 요청 합치기·동시 3개 큐를 우회했다. 지도 재진입과 화면 폭 변경으로 같은 장소를 다시 조회했다.
- `useResource`의 기존 읽기를 `loadResource`로 공유하고 `usePlacesById`에서도 재사용한다. 한 장소의 진행 요청과 성공 결과를 다른 소비자와 함께 쓰며, 화면이 사라져도 공유 요청을 취소하지 않는다. 오래된 화면에는 결과를 반영하지 않는다.
- 수동 공통 새로고침을 구독해 저장 코스 장소도 다시 읽는다. 새로고침 이전에 시작한 요청이 새로운 캐시를 덮지 못하는 기존 보호를 유지했다. 실패는 빈 성공으로 저장하지 않고 부분 오류를 표시한다.
- `/places`는 수역 분류가 확인된 목록이다. 저장 코스의 식당·숙소·일반 관광지를 잃지 않도록 기존 일반 `datasets/spots` ID 조회 계약을 그대로 유지했다. 네트워크를 한 건의 새 batch API로 바꾸지는 않았다.
- CSS·새 의존성·운영 수집 주기 변경 없음.

## 주기·보관 정책 판단

- 모든 자료를 일괄 30분으로 바꾸지 않는다. 특보·관측을 늦추면 현재성에 영향을 주며, 하루 단위 목록·변경 없는 상세·사진을 30분마다 다시 받으면 호출이 증가한다. 현재의 자료별 주기와 revision 기반 재사용이 목적에 맞는다.
- 웹캠은 AGENTS.md의 임시 10분/DB 미사용 설명과 현재 구현이 다르다. `docs/ai/WINDY-CATALOG.md`는 9/21 사용자 요구로 영구 보관·최초 썸네일·수동 갱신을 도입한 과거 기록이며, 현재 코드와 관련 테스트도 해당 동작을 명시한다. 이번 작업은 이 충돌을 새 변경의 권한으로 취급하지 않고 보관 정책을 유지한다. 5개 분류를 매 30분 재수집하면 하루 240회로 기본 30회 예산도 초과한다.
- 본 감사에서는 운영 DB/수집기 현재 상태나 실제 API 호출량을 측정하지 않았다. 설명은 현재 소스·설정의 실행 계약이다.

## 실행한 검증

- Node 24.19.0으로 `ops/verify_local.py`에 변경 파일을 명시해 실행: 변경 TS ESLint 통과. 당시 전체 단위 233개 중 231개 통과, 2개 실패. 하나는 새 테스트의 선택적 `undefined` 필드 비교를 수정했고, 다른 하나는 동시 이동수단 작업의 `connectionErrors.test.mjs` 문구 기대값으로 담당자에게 전달했다. 당시 전체 검사 통과로 기록하지 않는다.
- 수정 뒤 `node --test tests/resourceReads.test.mjs tests/resourceQueue.test.mjs tests/dataRefresh.test.mjs`: **12개 통과**. 중복 요청 합치기, 동시 3개 상한, 식당/숙소 데이터 보존, 30분 만료, 수동 갱신, 이전 요청의 덮어쓰기 방지, 실패 재시도를 확인했다.
- `npm run typecheck`: **통과**. `git diff --check` 관련 파일 통과.
- Playwright CLI, 별도 Vite `127.0.0.1:5193`, 모든 API 응답은 브라우저 mock: 저장 코스 8곳 각각 1회, 동시 장소 조회 3개 이하, 데스크톱→390px 모바일→데스크톱 전환 추가 장소 요청 0회, 모바일 출발지에 식당·숙소 유지, pageerror 0회. 외부 요청을 차단했으므로 카카오 지도 타일·SDK 실제 연결은 이 검증 범위가 아니다.
- 브라우저 재현 코드와 화면: `output/playwright/api-cache/check.js`, `output/playwright/api-cache/course-cache-desktop.png`.

## 인수인계

- 추천 batch read와 이동수단/내륙 범위가 통합되었다. 앞서 실패했던 테스트 수정 뒤 이동수단 최종 검사에서 프런트 단위238개·변경TS lint·증분 typecheck가 통과했다. 추천 쪽은 관련 단위·통합118개, 분류 후속 변경의 여행 통합47개가 통과했다(중복 포함, 합산하지 않음).
- 운영 적용·실제 호출량 계측·웹캠 보관 계약 정리는 이 하위 작업에서 수행하지 않았다.
