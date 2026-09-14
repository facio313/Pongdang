# 백엔드 Goal 진행 기록

2026-09-14 후속 사용자 요청으로 **A1 여섯 활동 선택·조회·명시 조건 종합 계산·허브 연결**을 구현했다. Backend 512개, Frontend 32개 검사와 격리 DB→실제 브라우저 연결을 검증했다. 사용자 범위의 조건 일치 산술과 과학적 환경 모델을 구분하며 후자의 미구현/미검증 상태는 유지한다. [최신 A1 작업과 한계](activity_conditions.md). 아래는 이전 전체 백엔드 Goal의 기록이다.

2026-09-14 KST 최종 갱신. 기준: `backend/BACKEND_GOAL.md`. 상세 상태표는 [README.md](README.md), 실행 증거는 [checks.md](checks.md)·[checks.json](checks.json), 시작 상태/HEAD/해시는 [baseline.json](baseline.json).

**이번 범위의 구현·로컬 통합·기존 프론트 연결·자동 검사·인계를 마쳤다.** 외부 데이터/과학적 모델/운영 활성화는 아래와 같이 별도이며 미완료를 완료로 전환하지 않았다. 운영 배포·main 변경·운영 DB 쓰기·실제 알림·실제 LLM 호출은 없다.

| 기능 | 구현/참고 근거 | 이번 검증/프론트 | 외부 의존성과 다음 작업 |
|---|---|---|---|
| A1 | 기존 water_index engine/registry/불변 저장 + sources/producer·5분 job; 기존 연구/설계 참조 | 실제 normalized 입력→평가/manifest→API, 정정 mapping 차단·과거 재현; 기존 hub 문구 연결 | 수치 환경모델 자체 unimplemented, 검증 not_evaluated. 확정 파라미터·지원/제한·대표성 근거 확보 후 수치 구현/검증 |
| A2 | 공식 SourceBatch→forecast_revision·5분 projection·범위/정정 API | KMA78/조석20→98 forecast revision; 구/new tide adapter 현재 중복 제외·과거 보존; 기존 예보문구 연결 | provider horizon 밖 자료 및 방문 추천 검증 미완료 |
| A3 | bounded 장소/bbox/활동/시각·station/metric DTO + 실제 A1/A2 소비 | 저장→GET, cutoff·상한·과거 metadata 미제공, A1/A2 같은시각 통합; 기존 상세영역 연결 | 여행지 mapping 검수·완전 역사 카탈로그 미확보; 새 지도 UI 인계 |
| A4 | A3 재사용 수온 전용 API·공간 관계·원단위/시각 | KHOA26실수신·저장·GET; null/0/정정 회귀; 기존 지도문구 연결 | 여행지 대표성·보간·안전 검증 없음 |
| A5 | reviewed camera catalogue/CLI·불변이력·HEAD 5분 job·조회 | no_data, HTTP실패구분,101camera순환·불변 통과; 기존 상태/공식링크 바인딩 | 실제 공개영상/사용조건 검수 없음, live_verified=false; 영상 실시간성 자동확인 미구현 |
| A6 | 공식 고저조 다음사건·reference/countdown·검수 운영창 CLI/API | KHOA20건/요청기간12행, midnight/revision; 기존 timer문구 연결 | 운영시간·통제 근거 확보 후 등록. 임의 안전 시간창 없음 |
| A7 | SSO bridge/owner CRUD·평가/event/outbox/attempt·Resend·1분 job | 단위29+DB8, 정정미발송재생성/이미시도재발송차단; 기존 본인event영역 연결 | SSO trusted headers·verified sender/recipient·provider설정 미활성, 연간coverage 미확보 |
| A8 | 별도 리뷰revision·부정/중복/철회·측정비교·저장·15분 job | 단위/API42 및 DB 연결통과; 실제 no_review_data3지점; 기존 결과영역 연결 | 실제 리뷰·비교공인검사·방법/단위/범위와 NLP 현장검증 필요 |
| B | 제한 Aregistry·근거fact 설명·fact ID집합 검증·Responses adapter·DB예산 | 단위24/DB4+통합, 허구/DB장애/토큰비용경쟁; 실수온 결정적 설명 | 모델/정확한 단가/키 미설정. 실제 모델 호출·품질/비용 실측 미완료; 새 AI UI는 인계 |

최종 Backend **413 passed**, Ruff check/format **92 files 통과**. Frontend **Node24 lint/20tests/build 통과**. `/pongdang/` 빌드 및 prefix HTTP 확인. PostgreSQL18 `127.0.0.1:55439/pongdang_test`의 명시 v4→v5 보존 migration·worker CLI 멱등/별도 프로세스 due/health 검증 통과. 실자료 HTTP18건 모두200. Docker없음으로 Compose smoke만 로컬 미실행, 기존 CI smoke 유지.

프론트 시작 기준 CSS8개·App/DataPage/FeatureData/useResource/navigation 보존. 검사 사본 source/test/config/lock37개 일치. iCloud runtime 읽기지연을 동일 Python3.14/Node24 및 lock버전으로 우회했으며 의존성/lock 변경 없음.

실자료 1차에서 발견한 같은날 고저조 code4 반복충돌은 실패로 기록한 후 `tide-event-slots.2`로 수정했다. 최종 공식확인 04:24 KST KMA78·수온26·조석20 수신, forecast98/평가관련artifact1800 생성, 재실행추가0건. 외부 성공을 생산 DB쓰기나 운영 활성화로 해석하지 않는다.

다음 작업은 외부 의존성별 자료/설정 확보 및 별도 승인된 CI/운영검증이다. 상세 재실행 방법·API·인계 대상은 README와 기능별 문서에 기록했다. 이번 범위에서 실행 가능한 미완료 구현 작업은 없으며, 수치 환경모델 미구현 및 영상 live 검증 등 남은 제품 기능을 위 표에 그대로 표시했다.
