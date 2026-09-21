# 백엔드 운영 복구 · 2026-09-21

- 요청: 점수·시간대 지표·수온·명소 상세가 정상적으로 표시되도록 운영 문제 해결. 프론트 수정 금지.
- 기준: 운영 및 원격 main/dev `0f824a9ccecbd7ed5332919c99b03920b769000c`. 별도 체크아웃 `fix/backend-operational-recovery`; 기존 `/home/cks/Pongdang` 및 운영 릴리스는 직접 수정하지 않는다.
- 확인: condition generation/snapshot 0건. 원자료 약 8만 snapshot/26만 metric에서 producer 여섯 번째 SELECT가 10초 statement timeout. 수온 API는 불필요한 평가/예보 조회에 결합. forecast projection 5000건 상한 실패. 새 명소 상세는 초기 10건만 수집됨.
- 작업 분담: condition producer SQL/규모 대응, forecast/twin 조회, place detail 초기 수집, root의 결과 게시·worker 연동·통합 검증.
- 제약: 프론트 변경 없음. 원자료·정정·결측·만료 의미 보존. 기존 호출 예산 유지. 테스트는 별도 컨테이너의 `pongdang_test`에만 수행. 운영 자료는 필요한 수집 테이블만 읽어 격리 복제해 규모 검증. SSO·키·사용자 데이터·타 서비스 변경 없음.
- 완료 조건: 필수 lint/tests/build와 운영 규모 검증 통과, main CI/자동배포, 실제 계산 결과 및 대표 API/화면 복구 확인. 사용자가 커밋·운영 배포를 승인하면서 dev 검증은 생략하고 main만 진행하도록 명시했다. main CI는 우회하지 않는다.
- 구현: condition SQL 선별·bounded memo·streaming COPY·UTF-8 JSON 전송·게시 직전 revision guard, 중요 계산 우선 스케줄, forecast 최신 유효 자료 선별, 수온 독립 조회, 명소 주요 장소 우선/60초 배치, 평가 만료 경계 savepoint 및 공정한 60초 이어받기.
- 실제 규모에서 3번째 generation 교체의 단일 DELETE가 10초 timeout으로 전체 rollback됨을 추가 확인했다. 보관 대상 2세대를 제외한 파생 snapshot만 2,000행씩 삭제하도록 수정했다. 108,490행 삭제는 총13.932초/각 statement10초 이내였고, rollback 후 원래 두 세대가 온전히 복원됐다. 원자료·generation metadata는 보존한다.
- 검증: backend 초기 통합 소스 전체 1,416 tests 통과(1,337.77초). 실행 중 후속 변경은 별도 관련 회귀 통과했으며 최종 통합 소스는 main CI에서 전체 재검증한다. Ruff213파일·diff 검사 통과. frontend lint/139 tests/build 통과, source/lock 변경 없음. 기존 확인 서버5177을 보존해 로컬 browser suite는 미실행이며 main CI가 수행한다.
- 운영 규모 평가: 60초 제한의 두 배치가 각각66.060초/28그룹/8,218artifact,61.307초/33그룹/9,984artifact를 commit. 완료한 현재 그룹 뒤에 중단하므로 약간 초과할 수 있다. 원자료 revision/count 불변. 무제한 진단 pass는100그룹/635.6초에서 의도적으로 중단·전체rollback했고 완료로 취급하지 않는다.
- 최종 condition 게시: 107,312건을204.95초에 계산·COPY·bounded GC까지 commit, peak RSS248,160KiB. 두 snapshot 세대만 유지되고 과거 metadata/원자료는 보존됐다. 경포 forecast 점수63.8와 기온23.1·최대풍속5.6·습도75를40ms readback에서 확인했다. 전체 재계산은 여전히 약3분25초이므로 입력 갱신 중에는 기존 revision guard에 따라 잠시 pending일 수 있다. 거짓 기본값이나 만료 자료로 가리지 않는다.
- 현재: 구현·격리 검증 완료, 아직 배포하지 않았다. 다른 작업의 frontend 커밋 `c8b4c75`를 보존해 최신 main 위에 통합한 뒤 main CI·자동배포한다.
