# 이동 수단 지원 — 2026-09-30

목표: 추천 취향·추천 경로 폼·지도 경로 계산에서 자동차/도보/자전거/대중교통을 선택하고 실제 해당 수단의 카카오 응답을 사용한다. CSS 수정, 유료 실호출, 카카오 제품 활성화, 운영 설정·배포는 하지 않는다.

## 확인한 공식 계약

- https://developers.kakao.com/docs/ko/kakaomap/rest-api
  - GET `https://dapi.kakao.com/v2/routing/walk`, `bicycle`, `publictraffic`.
  - 서버 REST 키로 `KakaoAK` 인증. `start_x/start_y/end_x/end_y`, WGS84 경위도 사용.
  - 도보·자전거: `route.properties.totalDistance/totalTime`, `legs[].steps[].path.points`.
  - 대중교통: `routes[].properties.totalDistance/totalTime/fare`, `steps[].path.points`. 제공된 목록 중 소요시간이 가장 짧은 응답을 고름.
  - 거리 단위 m, 시간 단위 초. 출발시각 입력과 provider record ID는 문서에 없음. 따라서 `source_record_id=null`, `provider_estimate_without_departure_time`으로 보존하고 미래 운행시각을 검증했다고 주장하지 않음.
- https://apis.map.kakao.com/ios_v2/docs/getting-started/urlscheme/
  - 외부 카카오맵 링크: 자동차 car, 도보 foot, 자전거 bicycle, 대중교통 publictransit.
  - 대중교통 외부 링크는 경유지를 지원하지 않으므로 여러 정차지를 버리거나 자동차로 대체하지 않고 구간별 링크만 제공.
- https://developers.kakao.com/docs/ko/getting-started/quota
  - 2026-09-30 조회 시 도보·자전거·대중교통 각각 일 1,000건 무료 쿼터, 초과 사용 관련 별도 요금 정책. 제품 활성화·유료 쿼터 신청은 이번 로컬 작업에서 하지 않음.

## 구현

- `backend/app/travel/directions.py`: 선택한 수단만 official endpoint로 요청. 기존 키 우선순위와 자동차 adapter 유지. timeout, 크기 상한, 좌표·시간 검증, 인증·쿼터 오류 유지. 다른 수단으로 fallback하지 않음.
- 신규 3모드는 API가 항상 주는 geometry를 요청 안에서 재사용. 후보 비교 summary 뒤 당선 구간 geometry를 다시 외부 조회하지 않음. 호출 상한 36, 동시 외부 요청 3 유지.
- `keywords.py` transport 카테고리/`models.py` 7개 카테고리 계약. 취향에는 한 수단 선택만 허용. 프런트는 이후 경로 폼 선택이 기존 transport 키워드보다 우선하도록 두 필드를 함께 갱신.
- `routing.py`: 자동차 전용 거절 제거, 요청 수단·시간 한계·알려진 대중교통 인원별 요금 유지. 저장 plan request와 서명된 snapshot에도 계산 수단 포함. 기존 snapshot은 선택 수단 부재 시 기존 자동차 기본값과 호환.
- `mobility.py`: 등록 좌표 직선거리 기준의 명시적 제안. 합 4km/최대구간 2km 이내 도보, 합 20km/최대구간 10km 이내 자전거, 그 이상 선택한 자동차·대중교통 또는 대중교통 경로 확인 제안. 이는 여행 정책이며 과학적 안전 점수나 실제 경로·수단별 시간 비교가 아님. 좌표가 없으면 제안 미확인. `route_verified=false`, `alternatives_compared=false`를 응답·문구로 유지.
- `TransportSelect.tsx`와 기존 추천/지도 폼 연결, 이동 수단별 외부 길찾기 링크, 추천 이유/수단 제안 표시. 기존 CSS 클래스만 사용.

## 검증 현황

- `ops/verify_local.py` 백엔드 대상 dry-run 확인. wrapper는 순수 mock pytest에도 DB 환경을 요구하므로 출력된 Ruff/pytest 명령을 직접 실행. Python 3.14.4에서 DB에 접속하지 않는 httpx/monkeypatch 테스트 **33건 통과**: `test_travel_directions_settings.py` 5건, `test_travel_route_order.py` 12건, `test_travel_multimodal.py` 16건. 관련 8파일 Ruff check/format-check 통과. 이후 백엔드 변경 없음.
- Node 24.19.0 bundled runtime으로 `ops/verify_local.py` 명시 프런트 파일 실행: 이동수단 변경 11개 TS/TSX 파일 ESLint, Node 단위 테스트 **238건**, 증분 TypeScript 검사 통과. 지도 select에 기존 `.rt-form` 스타일 범위를 추가한 최종 변경 뒤 `MapDesktop.tsx`/`MapPage.tsx`를 wrapper로 다시 검사해 세 검증 모두 통과(8.3초, 2026-09-30 KST). CSS 변경 없음.
- Playwright CLI: 포트 5199 Vite, backend target loopback port 1, API 전부 interception, 외부 HTTPS 차단. 데스크톱 1440×1000·모바일 390×844에서 취향의 네 수단 선택, 자전거 추천 요청, 추천 폼에서 도보 변경, 지도에서 대중교통 코스 생성/저장, 저장 코스를 자전거로 다시 계산하는 흐름을 확인. 각 요청의 `transport`와 `keyword_selection.transport`가 함께 바뀌며 계산 표시·외부 링크 mode가 일치함.
- 대중교통은 여러 정차지 전체 링크를 생략하고 `by=publictransit` 구간 링크를 제공. 도보 `by=foot`, 자전거 `by=bicycle` 링크 확인. 수단을 바꾸면 이전 경로를 재사용하지 않고 다시 추천/경로 요청함.
- 부모 추천 정책 확인용 문구 “같은 활동의 저장된 조건 참고 점수 90점을 비교했어요. 입수 안전 판정은 아니에요.”를 desktop/mobile 후보에서 확인. 선택 수단·거리 기준 제안과 출발시각 미반영 설명 표시도 확인.
- 브라우저 mock fixture의 초기 계획 GET/PUT 응답 누락을 고쳐 저장·재계산 흐름을 끝까지 확인. 실제 저장소 결함으로 판단하지 않음. 지도 SDK도 차단했으므로 지도 배경은 연결 불가 상태이고, 실제 카카오 경로선 렌더링 성공을 주장하지 않음.
- 브라우저 근거: `output/playwright/mobility-fixture.js`, `mobility-desktop-recommend.png`, `mobility-mobile-recommend.png`, `mobility-desktop-map.png`, `mobility-mobile-map.png`. 화면 파일을 직접 열어 기존 스타일·폭·문구 확인. 테스트 자료는 앱 데이터나 DB에 들어가지 않음.

## 남은 확인

- 이동수단 범위의 로컬 구현/검증은 완료. 추천 엔진 통합과 저장 snapshot 전체 통합 검증은 부모 담당.
- 서버 키는 기존 `KAKAO_REST_API_KEY`, 없으면 `KAKAO_REST_KEY` 우선순위를 유지. `TRAVEL_ROUTE_PROVIDER=disabled` 설정도 유지. 실환경 키의 카카오맵 신규 API 권한과 실제 커버리지는 이번 작업에서 확인하지 않음. 서버가 401/403/429/경로 없음 응답을 받으면 정직한 미계산 상태로 노출. 제품 활성화·쿼터/결제 변경은 하지 않음.
- 적용한 실제 코드, 테스트 결과와 부모의 통합 검증이 최종 근거다. 이 메모만으로 운영 배포 또는 실호출 성공을 주장하지 않는다.
