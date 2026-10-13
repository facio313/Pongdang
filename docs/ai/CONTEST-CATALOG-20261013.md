# 공모전 카탈로그·원문 언어·확인 배지 · 2026-10-13

- 범위: 외국어 TourAPI 수집→분류→추천을 연결하고, 최근 확인 배지의 읽기 계약을 제공한다. 이후 사용자 승인된 저장 자동번역의 읽기 소비와 상세 소개 표시까지 연결한다. 이 파일은 이 병렬 작업의 기록이며 기존 `CURRENT.md`를 덮어쓰지 않는다.
- 제약: 이름·좌표만으로 새 언어별 장소를 병합하지 않는다. 공식 외국어 후보를 우선하고, 후보가 없을 때만 한국어 카탈로그를 한 번 더 읽는다. 운영 DB·유료 모델을 호출하지 않고 커밋·푸시·배포하지 않는다.

## 구현

- 공식 영문 TourAPI v4.4 참고 ZIP의 `신분류체계정보 관광타입정보 연계 정의서.xlsx`를 확인했다. 국문/외국어 공통 분류 `NA010400` 계곡, `NA020100` 강, `NA020200` 호수, `NA020300` 저수지, `NA020900` 해변·해수욕장과 `FD050100` 카페를 해당 관광타입과 함께 해석한다. `EX050100`은 온천·사우나·스파의 통합 분류여서 온천으로 단정하지 않는다. 출처: <https://www.data.go.kr/data/15101753/openapi.do>의 참고문서.
- 새 수집은 공식 신분류를 기존 `kind`에 보존한다. 기존 수집본은 같은 원천 place ID에 연결된 활성 상세의 `lclsSystm3`를 읽는다. 원천 종류와 수정시각이 현재 카탈로그와 일치하는 상세만 사용하며 DB 보강 쓰기는 하지 않는다. `contenttypeid`와 원문 이름·좌표·공급자 ID는 보존한다.
- 외국어 카페 검색의 상호 배타적인 공급자 조건을 제거하고, 공식 카페 종류 또는 카카오의 명시적 카페 분류만 사용한다. 식당 요청에서는 카페를 제외한다.
- 공식 요청 언어의 후보가 없으면 한국어 카탈로그를 읽고 원문 상태를 명시한다. 같은 장소의 번역본이라는 추정 연결은 하지 않는다. `candidate_scope.language_fallback=korean_original`, 원천 `catalog_locale/source_locale=ko`를 보존한다.
- 번역은 별도 `place_translations` 패키지의 `read_place_translations`를 100개 단위로 읽는다. 현재 원문 해시가 일치하는 캐시 중 provider/source_id, 원문 name/address까지 일치할 때만 추천의 표시 이름·주소·소개를 바꾼다. 캐시 없음은 `translation_status=source_fallback`; 적용 시 `machine_translated`, `display_locale`, 원문 필드와 번역 모델·버전·시각을 제공한다. GET은 모델을 호출하거나 쓰지 않는다.
- 상세 API는 `GET /api/data/place-details?spot_ids=...&locale=en|ja|zh-CN`을 지원한다. 기존 확인 링크의 정확한 한국어 원천 ID 캐시만 이름·주소·소개에 적용한다. 운영시간·개방·시설·안전 정보는 원문을 유지한다. 지원하지 않는 `zh-TW`는 한국어 원문으로 남는다.
- 배지 필드: `/places`, `/livecams/preview/places`, `/places/nearby`, 추천 `confirmed`에 `catalog_recently_verified: boolean`, `catalog_verified_at: ISO|null`을 제공한다. 기본 일일 수집의 두 주기인 48시간 안의 **해당 항목을 실제 받은 시각**과 최신 관련 수집작업의 `succeeded` 완료를 함께 확인한다. 실패·부분 수집·진행 중·비활성·미확인·미래 시각·오래된 항목은 false/null이다. `last_success_at`은 부분 수집도 성공으로 갱신되므로 배지 근거로 사용하지 않는다. 원문 수정일도 배지 기준이 아니다. 관광 카탈로그 확인 배지이며 영업·수영·안전 인증이 아니다.

## 검증 상태

- 별도 PG18 임시 클러스터와 loopback 전용 포트 49902, `pongdang_test`를 생성했다. 기존 개발·운영 DB는 사용하지 않았다. 검증 후 임시 서버 종료를 확인하고 이 작업이 만든 임시 클러스터를 삭제했다.
- 최초 분류/배지 통합 17개 통과. 한국어·영어·일본어·간체 중국어 공식 종류, 카페 구별, 기존 상세 재사용, 원문 fallback, 배지 상태/시간 경계와 목록·상세 일관성을 확인했다.
- 번역 캐시 소비를 추가한 뒤 변경 7개 파일 Ruff·포맷 검사와 `git diff --check`를 통과했다. 관련 169개 검사 실행은 168개 통과·1개 실패(230.60초)였다. 실패는 신규 번역 소비 검사의 앱 시작 시 임시 PG 연결 3초 timeout이었고, 소스·설정을 바꾸지 않은 단독 재실행은 1개 통과(1.12초)했다. 카탈로그 및 상세 이름·주소·소개 캐시 적용, 다른 언어 캐시 없음, 원문 변경 후 캐시 무효화까지 확인했다. 전체 169개를 한 번에 성공한 것으로 보고하지 않는다.
- 실제 외국어 연결은 기존 로컬 키를 출력하지 않고 `EngService2/areaBasedList2`에 강릉 법정동 `51:150`, 해변 신분류 `NA020900`, 페이지 크기 1로 한 번만 읽어 확인했다. 응답 1건/제공처 총 12건, 공개 원천 ID `1891502`, 관광타입 `76`·신분류 `NA020900`을 수정한 `tourism_place`가 `beach`로 분류했다(약 6.76초). 응답 원문·인증 URL·키를 저장하지 않았고 DB 저장은 하지 않았다. 영어 외 다른 언어의 실제 HTTP 연결·실제 모델 번역 호출·운영 화면은 이 작업에서 검증하지 않았다.

## 통합 지점

- frontend 담당: 원문 fallback/자동번역 라벨, 상세 조회 locale 및 배지 bool 사용. 오래된 항목에는 배지를 그리지 않는다.
- 번역 패키지 담당: `app/place_translations`의 worker·추가형 명시 스키마·정확한 원문 캐시와 예산 관리. 이 작업은 해당 모듈을 소비한다.
- 소유 변경: `backend/app/ingestion/water_tour_extra.py`, `backend/app/livecams/{places,preview}.py`, `backend/app/travel/catalog.py`, `backend/app/place_details/api.py`, `backend/tests/test_catalog_locale_verification.py`, 기존 다국어 기대값 1곳인 `backend/tests/test_travel_integration.py`.
