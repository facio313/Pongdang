# R37 노트 겹침 · 카드 신호 · 태그 중복 수정

2026-09-21, `feature/connect-cursor`, 기준 HEAD `4a20c72`. 작업 시작 시 남아 있던 R37/R22/R60 및 다른 파일의 변경을 보존했다. 커밋·푸시·배포·.env·SSO·키·DB 스키마·점수 계산식 변경 없음.

## 변경 범위

- `frontend/src/appTabBar.css`: 1080px 미만 STEP 1 카드에 CTA 터치 높이만큼 하단 여유 공간을 예약하고 태그 그룹 간격을 기존 문단 간격인 8px로 맞췄다. 공용 sticky 위치와 `--pd-tabbar-clearance`는 유지한다. 데스크톱·다른 카드의 배치는 변경하지 않는다.
- `frontend/src/RecommendPage.tsx`: STEP 2는 로컬 선택과 카드 진행을 즉시 반영하고 `POST travel/signals`를 별도로 전송한다. 같은 카드의 중복 호출을 막고, 실패는 카드/요약 안에 안내한다. 실패를 성공으로 표시하지 않는다. 전면 fieldset을 제거해 탭이 busy 범위에 포함되지 않게 했다. 저장·후보·경로는 기존 `useAction`을 유지하고 저장·요약 편집·돌아가기·대안 버튼의 busy 비활성화를 명시했다.
- 같은 파일의 `requestFor`: ID 합집합을 카테고리별 `keyword_selection`으로 만든 뒤, 라벨 문자열에만 `Set`을 적용한다. PUT `preference.tags`와 추천 `request.preferred_tags`가 같은 중복 없는 배열을 사용한다. `hot_spring`과 `onsen`은 각각 남는다.
- `frontend/tests/browser/mobile-layout.spec.ts`: 기존 STEP 1 스크롤 0 검사를 확장해 실제 키워드 노트 하단과 sticky 슬롯 상단도 비교한다. 390/768/1079×844에서 CTA와 탭 간격 및 실제 포인터 클릭을 확인한다.
- `frontend/tests/browser/recommend-preferences.spec.ts`: 신호 지연·503에도 연속 선택/탭 이동, 같은 라벨의 서로 다른 ID 보존, PUT 대기 중 중복 제출 차단, PUT 성공 전후 안내 시점, 빈 후보 200 처리 검사를 추가했다. 기존 3/3 차단·실제 PUT200 검사는 유지했다.
- 상태 기록: 이 문서 및 `docs/ai/CURRENT.md`. `report.md`는 작업 시작 복사본과 바이트 단위로 동일하다. R37/R22/R60 완료 상태와 완료 23개 집계 유지.

## 실패와 수정 후 근거

1. 수정 전 신규 회귀 3개가 모두 실패했다. STEP 1 노트 bottom=734.921875 > 슬롯 top=724, 지연된 신호 요청 중 다음 카드로 넘어가지 못함, PUT tags=`["온천","온천","서핑"]`. 로그: `/tmp/pongdang-r37-residual-before.log`.
2. 첫 수정 후 요청한 4개 파일 중 23개가 통과했고, 추가한 빈 후보 단정 검사 1개가 실패했다. 원인은 테스트 카탈로그에 실제 후보가 1곳 있었는데 0곳이라고 가정한 것이었다. 제품 필터/후보를 변경하지 않고, 태그 중복 검사와 명시적인 빈 후보 HTTP 200 응답 검사를 분리했다. 로그: `/tmp/pongdang-r37-residual-targeted.log`.
3. 해당 보완 후 요청한 4개 파일 25개 통과(36.6초). 이후 768/1079px STEP 1 검사와 busy 편집 제어 보완을 포함해 전체 browser를 실행했다.
4. 최종 lint를 browser와 동시에 시작하면서 Playwright가 재생성하는 `test-results` 디렉터리를 ESLint가 읽어 ENOENT가 발생했다. 제품/ESLint 설정 변경 없이 browser 종료 후 순서대로 다시 검사했다. 최초 실행 로그: `/tmp/pongdang-r37-residual-lint-race.log`.
5. 전체 browser 명령을 처음 저장소 루트에서 실행해 package.json 부재로 시작하지 못했다. `frontend/`에서 다시 실행했다. 이 실행 오류는 테스트 실패나 통과로 세지 않는다.

## 실제 컴퓨터 유즈

Codex in-app browser, Vite `127.0.0.1:5173/pongdang/`, FastAPI `:8000`, 기존 실제 자료 복사본 `:51906/pongdang_test`. 백엔드 프로세스의 DB host/port/name과 실제 DB 이름·포트를 확인했다. 자동 테스트 fixture와 구분하며 운영 DB를 사용하지 않았다.

| 화면 / 클릭 | 실측 및 결과 |
|---|---|
| 390×844 `#recommend`, STEP 1, scrollY=0 | 키워드 노트 rect top=652.140625, bottom=710.921875; 슬롯 top=724, bottom=768; 탭 top=780. 노트/슬롯 간격 13.078125px, 겹침 0px. CTA/탭 간격 12px. |
| STEP 1 CTA 포인터 클릭 | (195, 746) 클릭 → `이건 어떠세요?` STEP 2. scrollY=0 유지. |
| STEP 2 좋아요 | `물 보며 쉬기` → `온천`; 즉시 `aria-busy=false`, `.rc-status` 없음, 비활성 탭 0개. |
| STEP 2 패스 및 탭 클릭 | `온천` → `서핑`; busy=false, 토스트 없음. `오늘` 링크 실제 클릭 → `#today`. |
| 장소 온천 + 활동 온천 + 휴식 + 서핑 | 두 온천을 각각 선택. 3/3 상태에서 추가 수영·래프팅 좋아요 비활성화 유지. STEP 1 노트/슬롯 측정값도 동일. |
| STEP 3 저장 클릭 | 저장 버튼 top=534.609375, bottom=578.609375, 탭 top=780. 실제 클릭 뒤 PUT preferences 200, POST recommendations 200. 후보 0곳에서도 `취향을 저장했습니다.` 표시. |
| 실제 저장값 재조회 | GET preferences의 tags=`["물 보며 쉬기","온천","서핑"]`, revision=7. 온천 1개. 검증 후 기존 취향을 PUT200으로 복구하고 GET 일치를 확인했다. |

실제 클릭의 HTTP 상태는 `/tmp/pongdang-cua-backend.log`로 확인했다. 실제 저장값은 `/tmp/pongdang-r37-residual-cua-saved-tags.json`에 기록했다. 컴퓨터 유즈에서는 클릭·화면·저장 후 GET을 확인했으며, 원래 PUT 본문과 추천 요청의 카테고리 ID는 아래 자동 검사에서 직접 확인했다.

```json
{
  "preference.tags": ["온천", "서핑"],
  "request.preferred_tags": ["온천", "서핑"],
  "request.keyword_selection": [
    {"category": "place_type", "values": ["hot_spring"]},
    {"category": "activity", "values": ["onsen", "surf"]}
  ]
}
```

기존 홈/오늘 마지막 문장, STEP 3 저장, 경로 CTA, 내 코스 저장, 데스크톱 `상태 일부 자료`, 활동 상한 및 PUT200도 자동 회귀에 포함했다. 실제 브라우저 뷰포트를 원복하고 임시 검증 탭은 닫았다.

## 최종 검증

| 검사 | 최종 결과 |
|---|---|
| frontend lint | 통과, exit 0 |
| frontend unit | 106 passed, exit 0 |
| frontend 전체 test:browser | 115 passed (1.7분), exit 0 |
| frontend build | TypeScript / Vite 통과, exit 0 |
| backend Ruff check / format --check | 통과 / 174 files already formatted |
| backend pytest | 1160 passed, 2 skipped, 2 warnings (68.18초), exit 0 |
| git diff --check | 통과 |

Node.js 24.21.0, Python 3.14.4, PostgreSQL 18.3. skip 2건은 Docker CLI가 필요한 Compose 검사이며 경고 2건은 기존 Starlette/httpx와 AnyIO deprecation이다. 마지막 UI 버튼 변경과 레이아웃 검사 확장 이후의 전체 browser 결과이며, 동시 실행 경합 뒤 lint/unit/build는 순서대로 재실행해 모두 통과했다.

자동 검사는 새 PostgreSQL 18 UTF8 클러스터의 `127.0.0.1:51907/pongdang_test`를 사용했다. 로컬 확인용 `51906`의 실제 자료는 자동 테스트 초기화 대상이 아니다. 로그 접두사 `/tmp/pongdang-r37-residual-`. 자동 검사 DB는 정상 종료했고 기존 5173/8000/51906 확인 환경은 유지했다.

명시적 제외 20개·범위 밖 17개·R23·R44·R25–R30 운영 SSO는 이번 세 잔여 문제의 승인 범위 밖이므로 그대로 유지한다.
