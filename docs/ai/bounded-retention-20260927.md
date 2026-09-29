# 승인된 bounded retention 구현 — 2026-09-27

## 완료 · 9/28 02:45 KST

- 요청한 기존 누적분 정리와 승인된 일시중단/물리파일축소 완료. 다른 앱/공용SSO/
  Nginx/권한정책 변경 없음. TRUNCATE/전체초기화/대체자료/결측0처리 없음.
- 최종 main/origin-main/current/app3tag 모두
  `21c0782c2e69f0492f5b01a2623bd261f348af81`.
  CI36337623296 backend/frontend 성공, watcher outcome=success. 기존 main 빌드→
  자동배포만 사용했고 같은SHA 재배포/CI재실행 없음. dev두refs549c0b5보존.
- 최신 추가코드4파일: `backend/app/ingestion/retention.py`,
  `backend/app/feature_jobs.py`, `backend/tests/test_source_retention.py`,
  `backend/tests/test_feature_jobs.py`. 참조를각1만삭제마다5분재계산하던병목을
  같은transaction/잠금내참조1회+최대20개삭제묶음 재사용으로 수정.
  삭제단계20초 예산/묶음당1만snapshot 상한/후속실패전체rollback 유지.
  수정파일lint/format 및관련20tests 통과. 본인폐기용pongdang_test32778만 사용후제거.
- 신규 자동 evidence_retention17:38:28→17:43:28Z 정상성공,
  received398325/failures0/last_error없음/next_run18:43:28Z(1시간, pending=False).
  이전과 달리원자료phase까지운영에서완료확인. 조건결과창정리는16:32:15Z성공.
- collector 마지막정상종료뒤그loop의평가가만든소량불필요WI8163행을기존
  prune_water_index_history/기존잠금/동일보존규칙으로정리(pending=False).
  raw3표만추가FULL+ANALYZE, 최종검증후collector EXITtrap정상복구.
  maintenance session51038 exit0. 기존helper/temporaryjobgate도모두종료.
- 물리DB 최초48,531,535,551bytes→중간1,682,847,423bytes→새계산을포함한
  최종2,194,421,439bytes(02:44:40 KST), 약46.34GB/95.478%회수.
  02:45:32 재조회2,194,486,975bytes(새수집에따른정상변동). 파일크기는고정값아님.
  전체검증된2,315,351,270byte백업과체크섬은아래기록대로그대로보존.
  복구는별도DB로archive를복원해필요범위검토후수행;운영전체덮어쓰기금지.
- 02:44:41 최종읽기검증: evidence_pass_complete=true, condition_window_clean=true,
  WI5표obsolete=false, latest_reference_closure_intact=true.
  정확행수: production_run/read_manifest 각242, assessment/input_manifest/target각13936,
  condition_result185205, forecast7281, observation_snapshot17924, metric111001.
  알림subscription/event/evaluation은작업전후각0행; 삭제대상이아니었음.
- gen771 computed17:28:09Z, published17:35:29Z/111495행/점수작업성공.
  마지막실제브라우저17:45:29Z https://pongdang.site/ 추천200/gen771/ready,
  관측9월28일02:28/휴식60.5/수영65.2/서핑55.9 확인. 비로그인preferences401외
  API오류없음.4컨테이너healthy/health200/readiness200/heartbeatidle17:45:32Z.
  이전개인로그인후알림조회 미검증은 production-fixes 메모에그대로남김.
- 승인된정리작업미완료항목없음. 올해수온/수질31일/현재참조·revision가족 등
  필요한관측자료와알림이력은유지. 앞으로새자료와정상작업중사용공간은변동하지만
  불필요한계산이력은자동정리. 로컬은pull만으로프로세스·DB가갱신되지는않음;
  schema21 초기화와현재코드의backend/collector재시작 안내는이전답변참조.

아래는 진행 당시 기록이며 위 완료 상태를 우선한다.

## 후속 요청 진행 · 9/28 01:08 KST

- 02:38 KST CI36337623296 backend/frontend성공, watcher/current/app3tag
  `21c0782`success/healthy,health/ready200. 새collector가17:38:28Z evidence자동시작.
  현재최종script `/tmp/pongdang-finish-source-maintenance.sh` session51038 진행중:
  collector900초grace정상종료(현재sourcepass보존),필요하면normaljob잔여실행,
  종료loop뒤WI평가가만든소량obsolete만기존prune_water_index_history로정리,
  raw3tables만FULL,최종보존검증,EXITtrapcollectorstart.
  log `final-source-maintenance-20260928.log`; 아직최종완료판정전.

- 02:37 KST 새main `21c0782c2e69f0492f5b01a2623bd261f348af81` push완료.
  변경4파일 source_retention/feature_jobs+각관련테스트, lint/format+20tests통과.
  DB테스트container32778은본인신규tmpfs만사용후제거;prod테스트데이터없음.
  추가rootenv오류는위에기록;테스트자체실패없음.
  collector정상종료exit0 확인(session79688). 그전gen771 computed17:28:09Z,
  published17:35:29Z/111495행/conditionjob성공. 종료중구버전원자료재실행만
  session3274가기존jobadvisorylock으로잠시차단후해제완료. 강제종료없음.
  **현재collector중단상태이며 CI→자동배포가새컨테이너를기동할예정**.
  CI/배포실패시반드시기존collectorstart하여복구할것. 같은SHA수동재배포금지.

- 02:27 KST 9표 FULL+ANALYZE 완료. 최초48,531,535,551→1,682,847,423bytes
  (약46.85GB/96.53%감소), 호스트여유101→144GiB. 원자료3번째42,041행성공후
  helper정상종료, full검증은 expected `evidence_pass_complete=false` 때문에exit1;
  그 외보존창깨끗함/5WI표obsolete없음/최신referenceclosure온전함 모두true.
  collector는EXIT trap으로복귀,4컨테이너healthy,health/ready200.
  정확counts WIassessment/input/target각13650,read/run각242,condition164880,
  forecast7223,snapshot112263,metric406619. 남은원자료정리까지최종완료는아님.
- 새4파일패치완료. root가두권한환경오류(cache HOME,root소유interpreter)를
  해결하여root의기존venv로실행; DB는새로만든loopback32778 tmpfs만사용.
  lint/format통과,관련20tests실행중. 테스트용container는script EXIT에서제거.

- 02:21 KST WI누적분완료, source첫62532행/둘째41690행성공이나각10k스냅샷상한으로
  pending30s. 보존참조159k condition_result를각묶음마다5분30초재스캔하는실제병목확인.
  셋째sourcepass17:21:05Z시작. helperbackendPID1098에신원검증후SIGTERM예약(현재묶음
  완료후정상종료); shell94006은이후9tableFULL/verify/collector재시작예정.
  완전정리전이면verify는의도대로실패할것이며최종완료로판정하면안됨.
- main명시fetch ddd5aef변경없음/dev두refs보존확인. 후속브랜치
  `fix/source-retention-reference-reuse-20260928` 생성, source_retention max_batches
  기본1계약보존+동일transaction/참조lock내 bounded삭제여러묶음/누적counts·rollback
  테스트를projection_fix가구현중. job에서만max_batches20,삭제단계20초예산예정.
  root검증script `/tmp/pongdang-verify-source-retention.sh` (신규tmpfs32778,
  pongdang_test,임의테스트password출력없음,관련2테스트파일+lint). 아직테스트/커밋없음.

- 01:57 KST 유지보수 session94006 계속 실행 중. evidence60회 성공,
  input_manifest 추정1,001,232행(일시중단 전약334만). collector는 정상종료 상태,
  backend PID1098이 기존 run_due 경로로 catch-up. 실패/수동counterreset 없음.
  01:35 실제 pongdang.site Playwright 추천200/gen770(수영63.8/서핑55.8),
  비로그인preferences401 외 API오류없음. 최종소스정리/파일축소/참조검증은 아직.

- 01:32 KST condition_result_retention 잔여244,376행 삭제 후 caught_up.
  다음 KST자정 예약(failures0). 이후 evidence runner PID1098(backend)이
  첫40,000행/다음40,000행 성공하여 assessment 축소 후 keep_targets timeout 해소 확인.
  input_manifest 누적334만행 정리 단계이며 아직 전체 완료 아님.

- 01:29 KST collector 정상 종료(exit0). 승인된 assessment FULL+ANALYZE는
  10.89초에 성공, 실제 live17,184행 보존. 파일12,084,002,816→66,535,424bytes.
  DB전체48,531,535,551→36,514,068,159bytes(동시 통계 시점 차이 포함).
  maintenance shell session94006, 로그 `physical-compaction-20260928.log`.
  현재 collector 일시중단 상태에서 backend 기존 run_due로 남은 정리 중;
  shell EXIT trap이 성공/실패 모두 collector를 다시 시작함.

- 01:23 KST evidence runner가 keep_targets 임시표 작성 중 10초 timeout으로
  즉시 종료. DB 로그의 정확한 SQL은 최신 read selections와 보존 assessment의
  target_id UNION. DELETE 실패가 아니며 실패 transaction은 롤백됨.
  assessment는 약1.5만 행만 남았지만 파일11GB가 잔류하여 대량삭제 후 축소를
  먼저 적용하기로 함(사용자 물리축소/일시중단 승인 범위). timeout 변경 없음.
- 01:28 KST condition 보조runner PID294도 현재 batch 후 정상 종료(exit0).
  `/tmp/pongdang-finish-retention.sh`에 collector 정상중단→assessment FULL→
  backend의 기존 run_due로 condition/evidence 완료→지정9표 FULL→보존참조검증→
  EXIT trap collector 재시작 절차 준비. 아직 실행/완료로 간주하지 않음.
  gen770 정상게시16:25:37Z, condition_projection failures0 확인.

- 사용자 명시 요청: 기존 오래된 자료를 직접 끝까지 정리.
  앞서 승인한 보존 정책 밖의 데이터만 대상으로 하며 현재 결과/필요 근거/
  알림 설정·이력을 보존. 현재 main/current `ddd5aef` 일치 재확인.
  dev refs/사용자 문서는 보존, 코드 변경이나 재배포 없이 기존 작업 실행.
- 전체 백업 SHA256 재확인 일치(본문 기록과 동일), 크기2,315,351,270bytes,
  mode0600 유지. 호스트 여유101GB. 백업을 다시 만들거나 덮어쓰지 않음.
- 기존 helper `/tmp/pongdang-retention-drain.py`로 두 maintenance job을 독립 실행.
  `finish-evidence-20260928.jsonl`(containerPID288),
  `finish-condition-20260928.jsonl`(containerPID294).
  같은 작업은 기존 session lock으로 중복 방지, 실패 시 runner가 즉시 중단.
- 종료 판정은 succeeded만 보지 않음. evidence는 성공 + 다음 간격3600초가
  WI/source 두 단계 pending=False임을 뜻함. condition은 과거 보존창 밖 0행
  검증 및 다음 자정 예약으로 확인. 최종 현재 결과/참조/API를 재확인할 예정.
- 사용자 추가 승인: "일시 중단을 허용하고 파일도 축소".
  행 정리 완료 후 승인 대상 Pongdang 테이블만 VACUUM FULL로 파일 축소할 예정.
  collector 종료/보조runner 종료/관련 DB transaction 잠금 해제 확인 후 실행,
  실패 시에도 collector 재가동을 보장하고 실제 점수 API까지 복구 확인한다.
  다른 서비스·공용SSO·DB전체초기화·TRUNCATE는 여전히 범위 밖.
  PostgreSQL18 공식 VACUUM 문서 확인: FULL은 테이블별 AccessExclusive 잠금,
  새 파일을 위한 추가 여유 공간과 autocommit 필요. 여유101GB 확인.

## 현재 인계 상태 · 9/28 00:52 KST

- 정책·쿼리 수정과 운영 반영/관련 검증 완료. main/current/app SHA는
  `ddd5aef93748f051e332b903d94139f05fa9c0d0`, CI36330694283 성공.
- **기존 누적분 전체 삭제 완료는 아님.** 자동 분할 정리가 계속 중이다.
  원자료 삭제 phase는 선행 Water Index/과거 점수 정리가 끝난 뒤 도달하므로
  운영에서 원자료 정리 전체 완료/전체 보존창 밖 0행은 아직 확인하지 않았다.
  원자료 정리의 참조 보호·동시성·삭제 회귀는 폐기 DB에서 검증했다.
- 수동 가속 runner PID20/26만 신원 확인 후 SIGTERM으로 현재 묶음 완료까지
  기다려 정상 종료(exit0, stopped_after_batch). collector 서비스는 멈추지 않음.
- 이후 **상시 collector 자동 실행**이 condition_result_retention을
  15:52:01→15:52:06Z(1만 행), evidence_retention을15:52:06→15:52:28Z
  (9만 행) 성공. 둘 다 failures0/error없음, 다음 분할 작업30초예약.
- 마지막 주요 통계(15:51Z, 추정치): condition_result116.5만,
  assessment255.1만, input_manifest333.1만, read_manifest/production_run각242.
  최종 성능 수정 후 수동 evidence11회686,190행 성공; 이후 자동9만행도 성공.
- DB할당 파일 약45GB는 즉시 축소되지 않는다. 일반 vacuum/free-space 재사용과
  물리 압축은 별개이며 VACUUM FULL/전체초기화/TRUNCATE는 실행하지 않았다.
  전체 백업은 아래 경로에 보존, 원자료·알림설정/이력은 승인된 보존 규칙으로 보호.
- 추가 코드·호스트 변경 계획 없음. 다음 상태 확인 시 두 retention job의
  실패/next_run과 추정행수를 먼저 보고, 누적정리 완료 후에만 전체창외행수 및
  source phase 운영 완료를 확인한다. 같은 SHA CI/배포를 재실행하지 않는다.

## 구현·검증 이력

- 사용자 승인: 오늘~미래 7일의 최신 결과와 필요한 관측 근거만 보관하고
  불필요한 과거 계산본을 자동 정리. 알림 설정·이력, 정정/missing/conflict,
  최신 관측 근거를 보존한다. 현재 기능상 필요한 올해 수온·수질 31일은 예외.
- 시작 main/운영: `51b4a3c4aa5669033231e4bea47c90ff0cf53adf`.
  작업 브랜치 `fix/bounded-data-retention-20260927`; dev refs 변경 금지.
- DB는 약 44GiB. 대부분 immutable water_index input/assessment와
  condition_result의 과거 계산본. 실제 파일 축소(VACUUM FULL 등)는 범위 밖.
- 전체 custom/zstd 백업 완료·검증 성공:
  `/home/cks/.local/share/pongdang-deploy/backups/bounded-retention-20260927/pongdang-before-retention.dump`.
  크기 2,315,351,270 bytes, cks:0600, TOC406항목과 pg_restore 전체 SQL stream
  `/dev/null` 출력 검증 성공(실제 DB restore를 실행한 것은 아님).
  SHA256 `733b836a5cc984ff78776e1defc537e3d4cd12fae1324264b8422bb63c09bcda`.
  복구는 별도 DB로 restore하여 확인 후
  필요한 범위만 명시적으로 복원하며 운영 전체를 덮어쓰지 않는다.
- 구현 분담: water_index immutable 참조 폐쇄+8일 producer, raw/forecast 보존집합,
  프런트 날짜·캐시 범위, root condition_result/API·schema21·scheduler.
- 검증용 PostgreSQL 18 tmpfs `pongdang_test`는 root32770/index32772/UI32771.
  운영 환경·데이터를 테스트에 사용하지 않는다.
- 코드 커밋: `0894e27` (30파일), 아직 push하지 않음. schema21은 정책·인덱스만
  설치하며 실제 삭제는 `condition_result_retention`, `evidence_retention` 작업이 수행.
  실행 중 publisher는 건너뛰고, 기존 worker 잠금·예약·실패 기록을 그대로 사용.
- 검증: root 관련 138개 중 기존 어제 조회 기대 테스트 1개만 새 정책에 맞춰 수정;
  해당 API 89개 재검증 통과. bounded result/worker 잠금 추가 후 관련13개 통과.
  Water Index35개, source 신규8개·forecast13개·invalidation21개 통과.
  frontend lint/Node186/typecheck/관련 browser5개 통과. 전체 검증 체인 반복 안 함.
- 추가 concurrency 보완 `ec733c6`: 새 수집/게시 job이 정리의 data lock에서
  timeout/backoff되지 않도록 job 진입도 try lock으로 조정. 원자료10개,
  condition/WI15개 관련 테스트와 lint/format 통과. 두 커밋은 local main에만
  통합했고 백업 완료 전 push하지 않았다.
- 폐기용 테스트 DB 4개 모두 제거됨. 원자료 테스트는 추가 loopback32773 사용.
- 최종 local main `48efdef35bb96260fbfafc31cdcc1353445b6041`.
  원자료 reference 전체 스캔을 매 2천 행마다 반복하지 않도록 정리 job의
  batch_size만 기존 함수가 허용하는 1만 행으로 지정(각 SQL timeout 그대로).
  관련 스케줄러 단위 테스트·lint 통과. 첫 단위 실행은 test Settings의 필수
  password 환경 누락으로 실패했으며, 명시적 폐기용 설정으로 재실행했다.
  마지막 guard 검증용 tmpfs DB32774·32775도 모두 제거했다.
- 남은 항목: 실제 cleanup 수렴 및 최신 계산·사이트 조회 확인. 백업 검증과
  main push/CI/자동 배포는 아래와 같이 완료. 기존 인증 문제 작업은 별도
  `production-fixes-20260927.md`에 완료/미확인 범위를 기록했다.
- 9/28 00:15 KST: main push 완료. CI `36328610388` backend/frontend 모두 성공,
  호스트 watcher outcome=success, current/app3개 tag는 `48efdef`, health/readiness ok.
  자동 evidence_retention 첫 작업에서 110,000행 정리 성공. 정상 WI producer는
  새 8일 범위로 backfill 중이며 기존 job 잠금으로 직렬화한다.
- 운영 catch-up은 `/tmp/pongdang-retention-drain.py`가 배포 컨테이너 내부에서
  `run_due(...,force=True)`로 두 maintenance job만 호출. 동일 job은 동시 실행 안 됨.
  로그: 백업 디렉터리의 `retention-drain.jsonl`. 현재 정리·실사이트 최종확인 진행 중.
- 정리 전 통계(00시 전): input_manifest 약330.5만, assessment 약327.7만,
  condition_result 약208.5만, snapshot 약14.2만, metric 약50.1만.
  9/28 00:08 KST read-only COUNT에서 input_manifest 3,308,775행 확인;
  다음 assessment COUNT는 진단용10초 제한에 걸려 중단(운영 작업 실패 아님).
  같은 대형 집계를 반복하거나 제한을 늘리지 않고 이후 비교는 통계값으로 표기.
- 9/28 00:18 KST: catch-up evidence_retention이 assessment 1만행 DELETE에서
  DATABASE_STATEMENT_TIMEOUT으로 실패해 수동 runner 즉시 중단(실패한 transaction
  롤백, 이전 커밋은 유지). 실패 횟수 초기화/timeout 증가는 하지 않음.
  production_run 약10만→242, read_manifest 553까지 정리됨.
- 후속 브랜치 `fix/retention-catchup-cost-20260928`에서 실제 계획 기반 보완 중.
  운영 EXPLAIN(ANALYZE 없음): assessment DELETE는 후보 HashAntiJoin 후 PK를
  1만회 재조회(cost82521); CTID 1천행 후보는 TidScan(cost4323).
  projection_fix가 내부1천행 묶음과 CTID-array 삭제 및 예산 테스트 담당.
- 실사이트 root 새 asset `index-DjPB6B-g.js`, 추천 API200/gen766 확인했으나
  25지점 condition summary API503도 발견. 운영 SELECT 계획은 역방향PK scan
  후 origin HashJoin+Sort여서 LIMIT1 조기중단 불가. frontend_auth가 기존
  미게시/무효화/as_of fallback을 유지하는 읽기 쿼리 개선 담당.
- gen767은 2026-09-27T15:24:09Z 정상 게시, computed_at15:16:51Z,
  condition_projection failures0. 중복 계산은 실행하지 않음.
- 문제없는 condition_result_retention만 기존 run_due 경로로 별도 catch-up 재개.
  로그 `condition-retention-drain.jsonl`. evidence 작업은 보완 배포 전 재시도 안 함.
- `ca06b436dcaab255fb03a22633d42e0ca90f03fc` 보완 main/운영 일치,
  CI36329883762 두 이미지 성공, watcher success,4컨테이너healthy/health/ready200.
  관련 WI10개+summary10개 테스트와 lint 통과. tempDB32776/32777 제거 완료.
  실사이트 root에서 summary503 해소, 예상된 비로그인 preferences401만 남음.
  실제 수정 SELECT25지점 read-only EXPLAIN ANALYZE26.958ms(3초제한 그대로).
- 보완배포의 컨테이너교체로 첫 condition 수동runner는 exit137 종료;
  마지막 완료48회×1만행 유지. 새컨테이너에서 두 maintenance job 별도
  기존 run_due runner로 재개. `condition-retention-followup.jsonl`,
  `evidence-retention-followup.jsonl`; 같은 job session lock으로 중복방지.
  WI 삭제는timeout없지만 약20~30초에6천~1.2만행이라초기대량정리비용추가진단.
- 준비 keepinputs는 이미 13,799 PKlookup으로 확인되어 speculative 변경 안 함.
  실제병목: CTID후보1천행을 UUID PK MergeAntiJoin으로 찾으며 죽은행prefix와
  흩어진 heap를읽음. 운영 SELECT만 EXPLAIN ANALYZE 원본828.812ms/
  shared-read33,042blocks → NOT EXISTS OFFSET0 순차후보20.697ms/114blocks.
  이는후보탐색만측정(전체DELETE/TOAST비용단정아님). 보존판정/limit/잠금
  유지한 한줄수정+관련검증을후속브랜치에서진행.
- 기존ca06b43 후보탐색삭제는15:38:32Z1천행에서도timeout이발생해runner자동중단.
  마지막성공까지약10만행추가삭제됨; 실패묶음rollback/실패초기화없음.
  로컬후속 `ddd5aef`(OFFSET0+이유주석만)은기존10회귀/lint통과,
  전용tmpfs32778은제거. 실행중인condition_projection완료후push예정.
  운영원자료/권한정책/시간제한변경없음.
- `ddd5aef93748f051e332b903d94139f05fa9c0d0` 최종main/운영일치,
  CI36330694283 두이미지성공/watcher success/4컨테이너healthy/health-ready200.
  점수gen768는15:44:35Z게시성공(computed15:35:52Z),104923건.
  실제홈15:47Z추천API200/gen768/수영65.3/화면9월28일00:16(재사용근거시각),
  공개API오류없고비로그인preferences401만확인. 최신metadata와근거시각은구분함.
- 새버전기존worker경로의수동catch-up:
  `evidence-retention-sequential.jsonl`(컨테이너runnerPID20),
  `condition-retention-sequential.jsonl`(PID26). SIGTERM은현재묶음완료후종료하도록함.
  첫WI작업36190행→다음60000행→다음70000행성공,각SQL10초제한그대로.
  15:48Z통계condition_result약119.6만,assessment304.9만,input333.1만;
  초기누적분정리는아직진행중이며원자료정리phase에도달하지않음.
  WI평가도15:45:13Z succeeded/failures0로새범위backfill완료.
