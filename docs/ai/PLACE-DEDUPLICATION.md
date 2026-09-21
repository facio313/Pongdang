# 명소 중복 연결 · 2026-09-21 완료

- 요청: 경포해수욕장·강문해변 등 출처별로 중복 표시되는 명소의 코드와 DB 수정.
- 구현: 원본 장소·관측·즐겨찾기 ID를 삭제하거나 옮기지 않는 추가형 `place_alias` 및 전체 초기화용 v14 마이그레이션. 공용 `/api/data/places`와 기존 preview 목록은 모든 출처의 이름·주소를 검색한 뒤 대표 ID로 묶고 건수·페이지를 계산한다. 명시적 기존 ID 조회는 그대로 유지한다.
- 판정: 이름 공백/NFKC 및 해수욕장↔해변 표기만 정규화, 동일 종류·확인된 강원 시군·모든 쌍이 500m 이내인 집합. 지역/좌표 불명, 괄호로 구분된 이름, 근접점의 연쇄는 자동 통합하지 않는다. 가장 오래된 한국어 카탈로그 ID 우선. 재수집/행정지역 확인 시 같은 트랜잭션에서 연결을 재계산한다.
- UI: 목록의 `alias_ids`로 기존 기본 장소 ID를 대표 ID에 연결하고, 상세 주변 명소에서 자기 자신의 다른 출처를 제외한다. 원본 ID의 상세 링크와 저장된 참조는 유지한다.
- 실제 적용: 로컬 확인 DB `127.0.0.1:51906/pongdang_test`에 `python -m app.schema --reconcile-places`로 이번 연결 테이블만 적용. 다른 작업의 미적용 마이그레이션을 섞지 않도록 기존 schema_version=10은 유지했다. 전체 배포 초기화는 v14까지 적용한다.
- 결과: 분류된 물놀이 목록 162건 → 151곳. 9개 명소의 중복 11행을 대표 ID에 연결. 경포 7←582/7728, 강문 9←7702. 원본 장소 7,900행과 출처·관측 지점·행정지역·즐겨찾기·저장 코스는 적용 전후 건수/해시 동일.
- 로컬 서버: `http://127.0.0.1:5173/pongdang/#spots`, API 8000(프로세스 6728). 이전 확인용 v10 런타임에서 이번 변경만 옮긴 `/var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-dedup-0g9kr6wj/runtime-candidate`를 실행한다. 기존 .env를 그대로 참조하고 기존 프로세스의 설정을 보존했다. 사용자 프로젝트 .env·운영 DB·외부 배포는 변경하지 않았다.
- 실제 검증: 후보 API readiness·경포/강문 각 1건·151곳·기존 582/7728/7702 ID 조회 모두 통과. 실제 브라우저에서 전체 151곳과 경포/강문 검색 각 1곳 표시 확인. 로컬 런타임의 장소/관측 지점 재수집 중복 방지도 별도 폐기용 DB에서 통과.
- 코드 검증: frontend lint / 138 tests / TypeScript+build 통과. backend Ruff lint/format 통과. 전체 backend 1,355 passed + 2 Docker skips 후, 복사본에서 빠진 근거 CSV 두 파일을 보완하여 실패했던 provenance 1개 재실행 통과(총 1,356개). 마지막 API alias_ids 변경 뒤 영향 범위 55개 재검증 통과. `git diff --check` 통과. 변경한 제품/테스트 파일은 검증 snapshot과 바이트 동일함을 확인했다.
- 격리: 자동 테스트는 새 `127.0.0.1:62463/pongdang_test`만 사용했고 완료 후 종료했다. 확인용 51906 DB는 테스트 데이터 입력이나 스키마 삭제 대상으로 사용하지 않았다.
- 증거/복구: `/var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-dedup-0g9kr6wj`의 `local-catalog-before.dump`(0600), `local-db-verification.json`, `local-api-verification.json`, `verified-source-hashes.json`, 테스트 로그 및 `live-before/`, `live-frontend-before/`. 위치 요약 `/tmp/pongdang-dedup-state.json`.
- 보존/범위: 동시 작업의 상세정보·알림·Windy·점수 변경 및 CURRENT.md를 보존했다. 커밋·푸시·운영 배포 없음. 명소 목록에 대한 요청 범위 완료.
