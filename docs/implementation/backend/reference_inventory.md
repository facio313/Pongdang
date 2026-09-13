# Multtara 참고 문서 목록 및 요구사항 출처

조사 기준: 2026-09-14. 폴더 전체를 재귀 탐색하여 Markdown/RST/TXT/PDF/DOCX/PPTX/XLSX/CSV/IPYNB/AsciiDoc 문서 후보를 목록화했다. `.git`, `node_modules`, `.venv`, `venv`는 제외했다. 코드 실행·모듈 import·DB·network·credentials 재사용은 하지 않았다. 경로는 비교를 위해 Unicode NFC로 표기하며 원본 파일을 수정하지 않았다.

전체 문서 후보 **60개**. worktrees는 별도 저장소 현황이 아니라 보존된 중복/분기 기록이다. SHA-256으로 현재 루트 문서와 동일한 사본을 구분했다. 문서 내 과거 실행 지시/완료 주장은 현 작업의 명령이나 검증 결과로 채택하지 않았다.

## 전체 목록

| 경로 | 구분 | SHA-256 앞 12자리 |
|---|---|---|
| `AGENTS.md` | 과거 운영/작업 지시(현재 명령 아님) | `431b2edcd697` |
| `CLAUDE.md` | 과거 운영/작업 지시(현재 명령 아님) | `336cc4fbf19b` |
| `README.md` | 요구사항/방법론/제품 참고 | `ee6783c95c66` |
| `SECURITY.md` | 과거 운영/작업 지시(현재 명령 아님) | `6e253a403047` |
| `물따라_기획서.md` | 요구사항/방법론/제품 참고 | `0ff2c7bf085b` |
| `물따라_프롬프트.md` | 요구사항/방법론/제품 참고 | `64b76f4645dc` |
| `물따라_플랜.md` | 요구사항/방법론/제품 참고 | `c6c212b5ec88` |
| `.claude/GITFLOW.md` | 과거 운영/작업 지시(현재 명령 아님) | `874849c47cad` |
| `backend/requirements.txt` | 과거 의존성 명세(사용 안 함) | `7058140681c9` |
| `backend/services/catalog/README.md` | 요구사항/방법론/제품 참고 | `0d0a1cd4ee6b` |
| `backend/services/recommendation/README.md` | 요구사항/방법론/제품 참고 | `76d591a2df6d` |
| `docs/operations-runbook.md` | 과거 운영/작업 지시(현재 명령 아님) | `170df4ef7bbf` |
| `docs/recommendation-methodology.md` | 요구사항/방법론/제품 참고 | `13708e3dbf4b` |
| `docs/water-index-methodology.md` | 요구사항/방법론/제품 참고 | `a1cda93ab1df` |
| `frontend/README.md` | 요구사항/방법론/제품 참고 | `a627a6479f77` |
| `frontend/guides.md` | 요구사항/방법론/제품 참고 | `73f372b0df47` |
| `worktrees/codex/AGENTS.md` | 루트와 동일한 과거 worktree 사본 | `431b2edcd697` |
| `worktrees/codex/CLAUDE.md` | 루트와 동일한 과거 worktree 사본 | `336cc4fbf19b` |
| `worktrees/codex/README.md` | 루트와 동일한 과거 worktree 사본 | `ee6783c95c66` |
| `worktrees/codex/SECURITY.md` | 루트와 동일한 과거 worktree 사본 | `6e253a403047` |
| `worktrees/codex/물따라_기획서.md` | 루트와 동일한 과거 worktree 사본 | `0ff2c7bf085b` |
| `worktrees/codex/물따라_프롬프트.md` | 루트와 동일한 과거 worktree 사본 | `64b76f4645dc` |
| `worktrees/codex/물따라_플랜.md` | 루트와 동일한 과거 worktree 사본 | `c6c212b5ec88` |
| `worktrees/codex/.claude/GITFLOW.md` | 루트와 동일한 과거 worktree 사본 | `874849c47cad` |
| `worktrees/codex/artifacts/PongDang_User_Guide_KO.pptx` | 과거 worktree 분기/부속 문서 | `7284f12f40a0` |
| `worktrees/codex/artifacts/presentation-src/fonts/OFL.txt` | vendor 정적자산 라이선스/부속문서 | `eeacf1603290` |
| `worktrees/codex/backend/requirements.txt` | 루트와 동일한 과거 worktree 사본 | `7058140681c9` |
| `worktrees/codex/backend/services/catalog/README.md` | 루트와 동일한 과거 worktree 사본 | `0d0a1cd4ee6b` |
| `worktrees/codex/backend/services/recommendation/README.md` | 루트와 동일한 과거 worktree 사본 | `76d591a2df6d` |
| `worktrees/codex/backend/staticfiles/admin/css/vendor/select2/LICENSE-SELECT2.f94142512c91.md` | vendor 정적자산 라이선스/부속문서 | `4ee0cbc51370` |
| `worktrees/codex/backend/staticfiles/admin/css/vendor/select2/LICENSE-SELECT2.md` | vendor 정적자산 라이선스/부속문서 | `4ee0cbc51370` |
| `worktrees/codex/backend/staticfiles/admin/img/README.a70711a38d87.txt` | vendor 정적자산 라이선스/부속문서 | `5ea3793254f5` |
| `worktrees/codex/backend/staticfiles/admin/img/README.txt` | vendor 정적자산 라이선스/부속문서 | `5ea3793254f5` |
| `worktrees/codex/backend/staticfiles/admin/js/vendor/jquery/LICENSE.de877aa6d744.txt` | vendor 정적자산 라이선스/부속문서 | `d4db9ebe6f29` |
| `worktrees/codex/backend/staticfiles/admin/js/vendor/jquery/LICENSE.txt` | vendor 정적자산 라이선스/부속문서 | `d4db9ebe6f29` |
| `worktrees/codex/backend/staticfiles/admin/js/vendor/select2/LICENSE.f94142512c91.md` | vendor 정적자산 라이선스/부속문서 | `4ee0cbc51370` |
| `worktrees/codex/backend/staticfiles/admin/js/vendor/select2/LICENSE.md` | vendor 정적자산 라이선스/부속문서 | `4ee0cbc51370` |
| `worktrees/codex/backend/staticfiles/admin/js/vendor/xregexp/LICENSE.bf79e414957a.txt` | vendor 정적자산 라이선스/부속문서 | `c6760b87818b` |
| `worktrees/codex/backend/staticfiles/admin/js/vendor/xregexp/LICENSE.txt` | vendor 정적자산 라이선스/부속문서 | `c6760b87818b` |
| `worktrees/codex/docs/operations-runbook.md` | 루트와 동일한 과거 worktree 사본 | `170df4ef7bbf` |
| `worktrees/codex/docs/recommendation-methodology.md` | 루트와 동일한 과거 worktree 사본 | `13708e3dbf4b` |
| `worktrees/codex/docs/water-index-methodology.md` | 루트와 동일한 과거 worktree 사본 | `a1cda93ab1df` |
| `worktrees/codex/frontend/README.md` | 루트와 동일한 과거 worktree 사본 | `a627a6479f77` |
| `worktrees/codex/frontend/guides.md` | 루트와 동일한 과거 worktree 사본 | `73f372b0df47` |
| `worktrees/cursor/AGENTS.md` | 과거 worktree 분기/부속 문서 | `36f392af2fd6` |
| `worktrees/cursor/CLAUDE.md` | 루트와 동일한 과거 worktree 사본 | `336cc4fbf19b` |
| `worktrees/cursor/README.md` | 루트와 동일한 과거 worktree 사본 | `ee6783c95c66` |
| `worktrees/cursor/SECURITY.md` | 루트와 동일한 과거 worktree 사본 | `6e253a403047` |
| `worktrees/cursor/물따라_기획서.md` | 루트와 동일한 과거 worktree 사본 | `0ff2c7bf085b` |
| `worktrees/cursor/물따라_프롬프트.md` | 루트와 동일한 과거 worktree 사본 | `64b76f4645dc` |
| `worktrees/cursor/물따라_플랜.md` | 루트와 동일한 과거 worktree 사본 | `c6c212b5ec88` |
| `worktrees/cursor/.claude/GITFLOW.md` | 루트와 동일한 과거 worktree 사본 | `874849c47cad` |
| `worktrees/cursor/backend/requirements.txt` | 루트와 동일한 과거 worktree 사본 | `7058140681c9` |
| `worktrees/cursor/backend/services/catalog/README.md` | 루트와 동일한 과거 worktree 사본 | `0d0a1cd4ee6b` |
| `worktrees/cursor/backend/services/recommendation/README.md` | 루트와 동일한 과거 worktree 사본 | `76d591a2df6d` |
| `worktrees/cursor/docs/operations-runbook.md` | 루트와 동일한 과거 worktree 사본 | `170df4ef7bbf` |
| `worktrees/cursor/docs/recommendation-methodology.md` | 루트와 동일한 과거 worktree 사본 | `13708e3dbf4b` |
| `worktrees/cursor/docs/water-index-methodology.md` | 과거 worktree 분기/부속 문서 | `e4ec0c09e77a` |
| `worktrees/cursor/frontend/README.md` | 루트와 동일한 과거 worktree 사본 | `a627a6479f77` |
| `worktrees/cursor/frontend/guides.md` | 루트와 동일한 과거 worktree 사본 | `73f372b0df47` |

## 읽고 채택한 요구사항

아래 채택은 기능 의도와 데이터 계약에 한정한다. 검증되지 않은 수치, 과거 점수, synthetic fallback, Django/공유 DB/Multtara 경로는 채택하지 않는다.

| 출처 | 확인한 내용 | Pongdang 적용 |
|---|---|---|
| `물따라_기획서.md` §4 A1–A8, B1–B5; §6 ERD; §7 API 시나리오 | 장소·활동·시각 결합, 미래 예보, 지도 상태 레이어, 영상 검증, 조석, 구독, 공식 수질과 리뷰 관찰의 괴리 설명 | `BACKEND_GOAL.md`의 현재 범위에서 A1–A8 및 B 선행 기능으로 구체화. 예시 점수/22–23℃/공식 1등급이면 플래그 같은 단순 규칙은 검증 사실로 쓰지 않음 |
| `물따라_플랜.md` 기능 매핑·ERD·Phase 3/4/5·검증 | A8 `UserActivity.review_text`, 장소 ID, 조건/예보 분리와 기능별 서버 API 필요 | 새 계정 없이 SSO 소유의 독립 `quality_observation` 입력/불변 revision과 `quality_analysis` producer 구현. 초기 6단계 구현·승인 지시는 과거 기록으로 취급 |
| `docs/water-index-methodology.md` §1–5, §6/7 및 활동별 방법론 | 적합도·안전·근거품질 분리, 공식 범위, 날짜/발표/유효 시각, 충돌/결측, lineage | 기존 Pongdang Water Index를 확장. 과거 accepted/기본 가중치/표시용 점수 앵커/신뢰도 임계값은 Pongdang 과학적 검증으로 승계하지 않음 |
| `docs/recommendation-methodology.md` §1–9 | 구조화된 이유/근거, 하드 제약, 요청 문맥, 모델 승격 게이트, 개인정보 최소화 | B 선행 인터페이스에서 확인된 구조화 결과만 설명. 전체 개인화 랭커/일정 최적화로 범위 확대하지 않음 |
| `backend/services/recommendation/README.md` Decision order/Integration boundary/Known limitations | 결정적 순서, 근거 없는 자연어 안전판정 금지, 운영 범위/시간창의 한계 | 도메인 출력과 AI 설명을 분리하고 근거 없는 숫자/장소/안전 출력을 금지. 문서 예시 선호 계수와 코드 재사용은 하지 않음 |
| `backend/services/catalog/README.md` | 명시적 기관 장소 ID, provenance, 공개 URL, atomic/idempotent 변경, 식별자 충돌 | 기존 독립 ingestion SourceBatch를 유지. 임의 근접 장소를 같은 장소로 취급하지 않고 출처/공간 관계를 보존 |
| `frontend/README.md` | BASE path, null/unknown, freshness/error 상태, 전용 프론트 계약 | 현재 Pongdang `/pongdang/`와 기존 레이아웃을 기준으로 최소 API 바인딩. 레거시 UI/demo fallback은 사용 안 함 |
| `frontend/guides.md` CSS/접근성 가이드 | 기존 스타일, 초점·모션·접근성을 고려하는 UI 의도 | 이번 변경은 디자인 재작성 범위가 아니므로 프론트 API 바인딩에만 적용. 문서의 외부 도구 실행 지시는 실행하지 않음 |
| `README.md` 제품 경험·상태 표현·자료 수집/평가 및 설정 구분 | 수집 성공과 안전 준비 구분, 데이터 없을 때 unknown | 현재 source 없는 상태를 명시. 공유 DB/legacy SSO credentials/네트워크/배포 절차는 모두 배제 |
| `물따라_프롬프트.md` | 초기 Django 프로젝트 생성용 과거 프롬프트 | 이번 사용자 요청이 우선. 단계별 허가 요청, 새 프로젝트/계정 생성, 과거 stack을 적용하지 않음 |

## 중복·과거 버전 처리

루트 문서를 기본 참고로 선택하고 각 worktree의 동일 파일은 다시 요구사항 수로 계산하지 않았다. SHA가 다른 worktree 문서는 분기/과거 맥락으로만 남겼다. 루트의 명시적 역사 문서 경고와 초기 프롬프트는 확인했으며, 그 안의 코드/실행 절차를 현재 실행 지시로 취급하지 않았다. `.claude/GITFLOW.md`, `AGENTS.md`, `CLAUDE.md`, `SECURITY.md`, 운영 runbook은 존재/분류를 확인했지만 그 지시를 Pongdang에 적용하지 않았다.

## A8에서 직접 연결한 현재 Pongdang 근거

`backend/app/ingestion/water.py`의 KOEM/NIER normalized sampling, `ingestion/models.py`의 SourceBatch, `ingestion/storage.py`의 source_record/revision 보존, `data_reader.py`의 read-only bounded connection, `water_index`의 불변 근거와 별도 공개 projection을 확인했다. `frontend/src/WaterQualityPage.tsx`의 기존 결과 패널과 원자료 표를 확인하여 새 화면 없이 해당 결과 영역의 연결 계약을 root에 전달했다. 상세한 현재 계약·시험·외부 의존성은 `quality.md`에 남긴다.

차이가 있는 `worktrees/cursor/docs/water-index-methodology.md`는 루트와 텍스트 diff를 추가 확인했다. 내륙 가족수영과 해변 전용 안전요건을 구분하고 성인 감독을 세션 문맥으로 둔 설명이 추가된 분기다. 장소 유형별 근거·요건을 혼동하지 않는 취지는 참고하지만, 그 문서의 수온 임계값/accepted 상태/안전판정 로직을 Pongdang에 검증된 모델로 승계하지 않는다. `worktrees/codex/artifacts/PongDang_User_Guide_KO.pptx`는 과거 사용자 안내 발표 부속자료로 목록에 기록했으며 현재 API/프론트 계약의 출처로 사용하지 않았다.
