# 강원도 확대 선행 작업 · 2026-09-21

- 목표: 현재 서비스의 기본 검색·추천 범위를 강원도 전체로 변경하고 시군 필터·공식 장소 자료 수집을 연결한다. 사용자 답변으로 기본 범위 변경이 확정됐다.
- 완료 기준: 지역 동의어·시군·다국어 범위 일치, 100행 이하 페이지 탐색, 18시군 공식 자료 수집·재조회, 기존 장소 ID 보존, 관련 회귀와 필수 검사. 운영 배포는 포함하지 않는다.
- 보존: `fix/finale`의 다른 작업 i18n 변경을 유지했다. 커밋·푸시·운영 DB 접근 없음. 안전 판단이나 내륙 수질 지원을 임의로 만들지 않았다.

## 구현 및 실제 반영

- 지역 정규화: 강원도/강원특별자치도/Gangwon 및 18시군, TourAPI 법정동 51:xxx와 기존 32:n 지원. 경남 고성과 혼동하지 않으며 원본 주소·지역 필드를 보존한다.
- `/api/data/places`는 지역/시군/종류/검색과 최대 100행 페이지·실제 전체 건수 제공. `/api/data/regions`는 18시군 제공. 기존 장소 ID 단건 조회를 유지한다.
- 추천은 강원 전체 요청에서 시군별로 후보를 분산해 최대 300개를 고른다. 선호도를 우선하고 동점에서 분산 순서를 유지해 환경 후보 30개·최종 결과가 다시 앞쪽 강릉 ID에 몰리지 않는다.
- TourAPI는 현재 공식 계약 `lDongRegnCd=51`와 시군 법정동 코드를 사용한다. 한국어/영어/일본어/간체 72개 독립 작업, 승인되지 않은 번체 18개는 비활성. 한 번 최대 5페이지, DB 커서와 장소 저장 원자적 처리, 미완료는 60초 후 재개하고 완료 후 일간 갱신한다.
- 명시적 additive schema v9→v10: `collection_scope_cursor`, 검증된 지역 메타 `collection_place_region`, `collection_place(spot_id)` 인덱스. 좌표가 바뀌면 이전 지역 검증을 사용하지 않는다.
- 로컬 primary `127.0.0.1:5432/pongdang` 및 기존 화면용 실제 자료 복사본 `127.0.0.1:51906/pongdang_test`를 먼저 백업하고 migration 적용. 양쪽 기존 장소 식별자 722개 모두 유지. 화면 복사본에는 제공처별 원본 수집·생성·수정 시각을 유지해 5,943개 추가 장소를 반영했다.
- 현재 관광 레코드: 한국어 4,741 / 영어 618 / 일본어 639 / 간체 592, 합계 6,590. 기존 Kakao 75개는 유지. 한국어 자료는 18시군 모두 존재한다. 물 장소 조회는 162개 레코드(제공처별 중복 포함), 1페이지 100/2페이지 62개. 강릉33·속초5·양양27·춘천2·홍천2·고성23 조회 확인. 주소 없는 기존 해변3개는 Kakao 법정동 조회로만 검증하여 별도 metadata 저장.
- 실제 규모 조회에서 발견한 병목: 인덱스 전 count는 15초 후 시간 초과, 인덱스 후 0.081초. 실제 목록 API 0.1~0.2초(초기 호출0.49초), 한국어 추천 후보300개 조회1.535초. 제한 시간은 늘리지 않았다.
- 로컬 LaunchAgent collector를 현재 소스 snapshot으로 갱신했다. 새 시군 작업71개 성공/1개 실패/번체18개 disabled 및 최근20초 heartbeat 확인. 운영 배포는 하지 않았다.
- 화면 백엔드8000을 외부 소스 snapshot과 영구 로컬 runtime으로 재시작했다(최종 PID52101). 기존 Vite5173(PID11579)와 SSO/env 값 유지, 변경된 DB만 조회. 서버 metadata는 기존 services.json의 backend만 갱신했다.

## 제공처 오류와 남은 범위

- 평창 영어42개 배치는 원천 contentid3591045의 createdtime=20261231162607, modifiedtime=20251231164414 때문에 FUTURE_SOURCE_MODIFICATION 실패. 공식 응답1회42개 전수 검증, 41개는 시간 검사 정상. 생성시간이 현재보다 미래이고 수정일보다 뒤여서 파싱 문제가 아니며 원자적 정책에 따라 해당 배치는 미저장·기존 자료 보존. 제공처 정상화 후 기존 backoff 작업이 재시도한다.
- 이번 작업은 장소 카탈로그와 지역 검색·추천 범위 확대다. 도 전체 관측소·기상 격자/내륙 수질 평가의 완전한 확대를 뜻하지 않는다. 기존 데이터의 공간 범위·결측·unsupported 의미를 유지한다. Kakao 장소 수집 반경도 기존 지역 설정을 유지한다.

## 검증과 실행 환경

- backend 전체 1,260 passed / 2 skipped(Docker CLI 미설치), Ruff lint/format 통과. 테스트는 새 폐기용 PG18 127.0.0.1:55468/pongdang_test만 사용했고 실제 화면 DB51906에는 테스트 fixture를 넣지 않았다.
- frontend 최종 lint / 115 unit / build 통과. 전체 browser 134개 모두 통과(3.2분). 앞선 8개 실패는 갱신 이전 snapshot의 제목 공백, 지역 조회 완료 대기, 단건 spot_id 연결 문제였으며 최신 양쪽 소스 동기화 후 전부 해소됐다. 마지막 변경은 표시 helper의 TypeScript Record 타입 정합성뿐이며 runtime 변경 없이 lint/build를 재실행해 통과했다. 기존 500kB 번들 경고는 남는다.
- 최종 backend 변경(인덱스/명시적인 spot_id 단건 조회)의 관련 회귀 79개 재실행 통과. 실제 프록시에서도 선택 ID5609는 그 한 건, 없는 ID999999는 빈 목록으로 확인했다. 지역 숫자 코드는 일반 UI에 노출하지 않고 검증된 시군 이름으로 표시하며 원자료 표시는 유지한다.
- 마지막 검증 snapshot의 backend/frontend 소스·테스트 349개 SHA256이 현재 원본과 일치함을 확인했다. 검사용 PG55468은 종료했고 실제 화면 DB51906 및 로컬 primary5432는 유지했다.
- 원본 파일과 `.local` runtime이 iCloud dataless로 바뀌며 검사 일부가 정지했다. 해당 작업의 정지 프로세스만 종료하고 파일 다운로드 후 외부 source snapshot 및 `/Users/cksmacbook/.local/share/pongdang/runtime/bin/python`으로 재실행했다. 정지한 실행은 통과에 포함하지 않았다.
- 검증·백업 디렉터리: `/var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-gangwon-implementation-0ytq9kyi/`. DB backup은 local-before.dump, preview-before.dump이며 비공개 권한으로 보관한다. 서비스 파일 services.json, 최종 검사 로그 backend-tests.log/backend-final-regression.log/frontend-final-{lint,test,build}.log/browser-final.log. 소스 일치 기록 verified-source-manifest.json.
- 요청한 선행 작업 완료. 로컬 화면 http://127.0.0.1:5173/pongdang/#spots 기본 선택은 강원도 전체다. 운영 반영·커밋·푸시는 수행하지 않았다. 다음 별도 범위는 도 전체 관측 격자/관측소 확대와 내륙 평가 기준 검증이다. 평창 영문은 원천 생성일 수정이 필요하며 오류 배치를 성공으로 바꾸지 않는다.

## 후속 · 프런트 범위 선택과 로컬 운영 확인 (완료)

- 사용자 승인: 기존 프런트 틀·디자인을 보존하면서 지역/장소 select를 기존 엘리먼트에 맞게 추가하고 강원도 전체 운영 전환을 로컬 확인한다. 다른 프런트 개발자의 i18n 변경 보존. 운영 배포/커밋/푸시 없음.
- 명소↔지도↔상세에서 시군/분류/검색/페이지를 같은 탭 sessionStorage+메모리 상태로 유지한다. 실제 조회 시군과 지도에 표시된 수를 기존 요약줄에 표시한다. 필터와 페이지 버튼은 기존 pd/dk 색상·14px 모서리·44px 조작 영역 사용.
- 추천 조건에 강원도 전체/18시군 select 추가. 고성·동해 혼동을 막기 위해 `gangwon sokcho` 같은 도+시군 요청값 사용. 요청 전 선택도 화면 이동·뷰포트 전환에 유지하며 대화·저장 코스는 실제 request.region 표시. 지역을 바꾸면 이전 후보/선택 토큰/경로/로컬 미리보기를 비운다. 서버 저장 코스는 변경하지 않음.
- 홈·오늘은 기존 장소/기준 문구 근처에 접힌 “장소 바꾸기” 한 줄만 추가. 펼치면 지역/검색/장소와 100행 페이지 선택을 제공한다. 선택 ID는 홈↔오늘·언어·새로고침에 유지. 지역/검색/페이지 변경·조회 중·실패·빈 목록에서는 이전 장소의 값이 남지 않는다. 단일 장소의 관측·예보임을 명시하고 API 실패/미선택을 강릉으로 가정하지 않는다.
- 실제 수집 자료에서 부곡계곡4118의 주소(횡성)와 원천 지역코드(영월)가 충돌하여 두 시군에 포함되는 결함 발견. 기존 canonical 정책에 맞춰 원자료는 유지하고 도 전체에는 포함하되 개별 시군에서 제외하도록 공통 지역 predicate 수정. 전체162 유지, 시군확정161+상충1. 실제51906 read-only 조회에서 수정후 시군 count23~82ms/전체65ms, 인덱스 사용 유지. API8000 재시작후 횡성3건 및 상충행 제외도 확인.
- 최종 frontend lint/123 unit/type/build 통과. 전체 browser136개 실행은134pass/2fail; 기본 장소가 없을 때의 메시지 처리와 과거 강릉 이름 기대를 수정했다. 영향받는24개 중23pass 후 남은 문구 기대를 요구사항에 맞춰 강화하고 해당1개도pass. 최종 app 변경 후 lint/build 재실행 통과. 미해결 테스트 실패 없음. 기존500kB 번들 경고 유지.
- backend 최초101 API회귀에 새 상충4개를 추가한105개 통과, Ruff lint/format180개 통과. 프런트만 변경한 시점의 backend app/tests182개는 이전검증SHA256과 동일했고, 마지막변경은 regions.py와회귀2파일. 이전전체1260pass/2Docker CLI skips는 이번변경전 결과이며 이번전체재실행으로표현하지않음.
- 실제 UI: 양양군27건 명소→지도 유지, 홍천 수타사계곡3724 선택→홈/오늘/새로고침 유지, 모바일390/데스크톱1440 가로 넘침 없음. 추천 속초시 선택→탭왕복→데스크톱유지 및 요청 region=`gangwon sokcho`,locale=ko,limit=5 확인. 요청 캡처용 임시 브라우저 route/변수 제거. 실제 후보조회1회는 출발지 확인을 요청했으며 외부 AI/유료경로 호출은 하지 않았다.
- 운영 판단: 강원도 전체 장소 탐색·지역별 여행 추천 범위는 전환 가능. 도 전체 실시간 환경 점수·입수 안전·내륙 수질 평가 완성은 아님. 양양 갯마을해변5609와 홍천 수타사계곡3724 실제GET은HTTP200이지만 점수null/수영근거0 of4/추천choice=null/안전unknown. 계곡수질unsupported, 해변수질은과거주변관측소자료. 이 결측을 안전이나 정상값으로 바꾸지 않음.
- 검사환경: frontend `/var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-gangwon-frontend-58q0b2cs/`에 검증로그·스크린샷·verified-frontend-changes.json(최종수정28파일) 보관. backend `/var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-ui-backend-check-kxaq1q9h/`에105회귀/실제자료/성능JSON 보관. 폐기용PG55469/55470 모두종료. 실제preview51906/primary5432에테스트fixture를쓰지않음.
- iCloud dataless 때문에 원본읽기·스냅샷복사·일부검사가중단됨. 중단검사는통과로포함하지않음. 마지막변경저자의정확한편집입력과기존보관본으로검증복사본을갱신하고작업소유파일만원래mode/동시변경확인후실체화하여최종28파일SHA256일치확인. 기존다른변경보존. 검증용dependency symlink의Vite폰트allowlist문제는외부임시config에서만보완.
- 로컬확인서버 `http://127.0.0.1:5173/pongdang/#spots` 유지. backend8000 PID82422는이전snapshot/backend에최신regions.py적용, frontend5173 PID84754는새검증폴더의live-frontend에서실행하며기존.env.local보존. iCloud읽기지연을피하기위한고정복사본이므로후속소스수정시live-frontend동기화또는원본Vite재시작필요. 서비스metadata는새폴더와이전implementation폴더의services.json에갱신.
