# 물 여행 적합도 지수 근거 연구

2026-09-14 KST. 제품 구현 전의 연구 산출물이다. 코드·프론트엔드·DB·배포를 수정하지 않았다. 현재 근거는 활동별 설계 원칙과 보정 과제를 제공하며, 여섯 활동의 공통0–100 점수를 검증한 것은 아니다.

| 문서 | 용도 |
|---|---|
| [synthesis.md](synthesis.md) | 먼저 읽을 활동별 종합, 상충 결과, 네 가지 설계 결정, 후속 조사안 |
| [legacy_audit.md](legacy_audit.md) | Pongdang 실제 계약, Multtara L-01–L-20 규칙·수치·출처와 유지/수정/폐기/보류 판단 |
| [research_protocol.md](research_protocol.md) | 검색 전 계획, 수행 변경 기록, 종료 기준, 접근 한계와 실제 집계 |
| [search_log.csv](search_log.csv) | 52검색식/49호출묶음의800반환과95접근·14서지조회,909행 |
| [evidence_matrix.csv](evidence_matrix.csv) | 36출처에서47개 주장을31필드로 추출; 원문 위치·조건·한계·중복표본 포함 |
| [references.bib](references.bib) | 36근거 출처와3추적용 항목의 검증된 서지; 추적용 항목은 근거 수에 미포함 |

추적 순서: 본문의 **evidence_id → evidence_matrix.csv의 동일 행 → study_id와 URL/DOI/원문 위치 → references.bib의 같은 study_id**. 검색 경로는 행의 `search_ids`로 search_log의 `query_id`와 연결한다. 동일 논문의 여러 주장과 여러 검색 반환을 독립 연구로 합산하지 않는다. 상세 정의는 프로토콜을 따른다.

`search_records/`는 실제 검색에서 나온 제목·URL·검색식·반환 ID·선정 정보와 열람 메타데이터다. 원문 전문이나 긴 검색 스니펫을 재배포하지 않는다. `working/`에는 분야별 추출, 검토 파일 목록/해시, 합성·검사 스크립트와 QA 결과가 있다. **최종 판단은 이 디렉터리의 여섯 산출물이 우선**하며, 작업 단계 메모는 이력을 설명한다.

- [기존 파일 시작 상태](working/baseline.json)
- [Pongdang 확인 파일](working/reviewed_pongdang_files.json), [Multtara 확인 파일](working/reviewed_legacy_files.json)
- [검색·출처 집계](working/research_stats.json), [최종 무결성 검사](working/validation.json)

재생성은 `python3 working/build_artifacts.py`, 검사 기록은 `python3 working/validate_artifacts.py`로 수행한다. 이 스크립트들은 이 연구 산출물만 읽고 합성/검사하며 제품을 import하거나 DB·API에 접속하지 않는다. 통계적 메타분석 코드는 아니다. 검색 종료 후 새로운 검색을 자동 수행하지 않는다.
