# Windy 웹캠 목록 영구 저장 · 2026-09-21

- 요청: 목록을 처음 받아 DB에 저장하고 이후 목록·필터·페이지·섞기는 저장된 자료를 사용한다. 카메라 선택 시 Windy 공식 페이지/플레이어를 연다. 이번 사용자 지시가 기존 AGENTS.md의 웹캠 목록 `10분 캐시 / DB 미사용` 규칙을 대체한다.
- 범위: 기존 한국 물 관련 5개 분류의 첫 25개씩, 중복 제거 후 최대 125개. 위치 매칭·추가 제공자 페이지 조회·영상 저장은 추가하지 않는다. 후속 요청에 따라 대표 사진은 최초 한 번 저장한다(아래 후속 기록). 별도 spot_id 주변 조회는 기존 단기 캐시를 유지한다.
- 구현: 추가형 스키마 v12의 `windy_catalog_revision`에 정규화한 메타데이터만 보관한다. API 키·원본 응답·서명 이미지 URL은 저장하지 않는다. `windy_api_budget`은 목록 및 spot_id 조회의 일일 호출 수·호출 간격·실패 대기를 공유하고 재시작 후에도 유지한다.
- 최초 빈 DB의 목록 요청은 DB advisory lock으로 한 번만 수집·저장한다. 성공한 빈 목록도 초기화 완료로 보존한다. 일반 목록 조회에는 API 키나 남은 호출 한도가 필요하지 않으며, 시간이 지나거나 서버가 재시작해도 목록 API를 다시 호출하지 않는다. DB 조회 실패 시 제공자 재조회로 대체하지 않는다.
- 수동 갱신은 CLI 전용이다. 모든 제공자 조회와 검증이 성공한 뒤 트랜잭션으로 현재 revision을 교체하고 이전 revision은 `superseded`로 보존한다. 실패·부분 응답·충돌 시 기존 목록/조회 시각을 유지한다. HTTP 요청으로 강제 갱신할 수 없다.
- API 계약: `livecams.preview.v1`, catalog는 `storage: "database"`, `valid_until: null`. `fetched_at`은 마지막 성공한 가져오기 시각이며 최신 촬영/재생 보장이 아니다. spot_id 응답은 `storage: "temporary"` 및 기존 만료 시각을 유지한다.
- 동시 작업: 기존 명소 상세 v11과 사용자 변경을 보존하며 그 다음 v12로 연결한다. 이후 공유 작업 트리에 추가된 점수/갱신 v13도 보존한다. 기존 v4 업그레이드 테스트의 준비 단계는 v11·v12·v13 이전 상태로 맞췄으며 실제 업그레이드 검증은 유지한다. 다른 작업의 CURRENT.md는 덮어쓰지 않는다. 커밋·푸시·운영 배포는 요청 범위에 포함하지 않는다.

## 적용 및 갱신

backend 디렉터리에서 해당 환경의 서버 전용 DB/API 설정을 사용한다. 기존 배포 initialize 서비스도 `app.schema --initialize`를 통해 추가형 마이그레이션을 적용한다.

```sh
python -m app.schema --initialize
python -m app.livecams.catalog --initialize
```

두 번째 명령은 선택 사항이며 이미 목록이 있으면 재사용한다. 생략하면 최초 목록 요청이 같은 경로로 가져와 저장한다. API 한도 초과 또는 키 오류가 남아 있으면 실제 최초 저장은 성공할 수 없으며 오류를 명시한다. 실패를 빈 성공 목록으로 저장하지 않는다.

운영자가 목록 변경을 반영할 때만 다음 명령을 실행한다. 저장된 목록이 있는 동안에는 일반 사용자 조회가 계속 가능하다.

```sh
python -m app.livecams.catalog --refresh
```

## 목록 영구 저장 단계의 검증 기록

- 웹캠 백엔드 55개 및 기존 DB 업그레이드 1개가 실제 작업 트리에서 통과했다. 전체 백엔드 회귀는 현재 변경·미추적 파일 60개를 정확히 동기화한 검증 사본에서 **1,346개 통과 / 2개 skip**, Ruff check 및 format check **207개 파일 통과**했다. skip은 Docker CLI가 없어 실행할 수 없는 Compose 확인 2개이며 CI에서 수행한다.
- DB 테스트는 별도 PostgreSQL 18 `pongdang_test`(51737)와 주입한 오프라인 제공자 응답을 사용했다. 검증 후 이 전용 PostgreSQL을 정상 종료했다. 기존 확인용 DB·운영 DB·실제 Windy API는 사용하지 않았다.
- 프런트 Node 24 전체 단위 130개 통과. 이후 동시 작업의 resourceRefresh 변경 2개 파일과 새 의존 파일을 반영해 관련 단위 **15개**, lint·TypeScript·Vite build, mock Playwright **4개**를 다시 통과했다. 복사 시 원본 내용을 해시하고 읽기 전후 stat을 비교했다. 검증 뒤 재읽기 일부는 iCloud 때문에 지연돼 추가 반복을 중단했다. `/private/tmp/pongdang-windy-frontend-9rzk032v/source-verification.json` 및 `resource-refresh-sync.json`에 검증 입력과 재확인 상태를 구분해 기록했다.
- 전체 백엔드 실행 중 동시 변경된 `schema.py`의 차이는 별도 `--reconcile-places` 명령 추가뿐이며 웹캠 v12 마이그레이션 경로는 동일하다. 웹캠 서비스·저장소·관련 테스트 5개 파일은 전체 검사 사본과 최종 SHA-256이 일치했다. 다른 작업의 변경은 수정하지 않았다.
- iCloud의 `.pyc` 및 소스 hydration 지연으로 초기 실행 두 번을 중단했다. 첫 검증 사본의 58 실패는 읽지 못한 동시 작업 수정 파일 대신 기준 커밋 파일을 포함한 혼합 상태에서 발생했다. 이를 실제 제품 실패로 해석하지 않고 수정 파일 전체를 반영했으며, 최종 전체 검사는 위와 같이 통과했다. 로그와 파일별 해시는 `/var/folders/ns/8yh7k1zn3q9flcsx0msyzfhm0000gn/T/pongdang-windy-test-ay8_th0e/backend-tests-accurate.log` 및 `backend-current-workspace-manifest.json`에 있다.
- 중요 검증: 10분/장기간 경과 및 재시작 후 재조회 없음, 키 없음·예산 소진 후 목록 조회, 빈 성공 목록 보존, 동시 최초 요청 중복 방지, 실패 갱신 중 기존 목록 유지, revision 이력, DB 실패 시 API 재호출 없음, 프런트 클릭 시 목록 재조회 없음.
- 환경: 원본 Desktop 저장소의 iCloud 파일 읽기 지연으로 일부 의존성 로딩이 멈춰, 고정 lockfile로 저장소 밖 임시 검증 런타임을 사용한다. 저장소 의존성/lockfile은 변경하지 않는다.
- 첫 DB 검증에서 조회 시각이 DB 세션 시간대로 직렬화되는 차이를 발견해 읽기 시 UTC로 정규화했다. 동시성 테스트의 완료 대기 순서도 고쳤다. 원래 가져오기 시각은 바뀌지 않는다.
- 코드·추가형 마이그레이션·화면·운영 안내 구현 완료. 운영 DB 마이그레이션 실행, 실제 최초 Windy 목록 가져오기, 커밋·푸시·배포는 수행하지 않았다. 실제 적용은 기존 CI 배포의 initialize 경로를 사용하며 최초 성공 조회 후 목록이 보존된다.

## 후속 요청: 대표 사진 최초 한 번 저장

- 사용자 지시: 최신 촬영 장면일 필요 없이 처음 받은 실제 이미지를 파일로 저장해 계속 썸네일로 표시한다. 코드와 DB 변경을 승인했으며 기존 사진 미저장 방침을 대체한다.
- 구현: 추가형 v15 `windy_thumbnail`에 카메라 ID별 시도 상태·저장 경로·해시·MIME·크기·저장/제공자 시각만 기록한다. API 서명 주소는 import 메모리에만 잠깐 유지하고 DB·HTTP 응답·로그에 저장하지 않는다.
- 최초 목록의 전체 검증 후 썸네일을 최대 8개씩 다운로드한다. 공식 이미지 host/카메라 경로/작은 이미지 크기만 허용하고 리다이렉트·프록시·인증 헤더·자동 재시도를 사용하지 않는다. 파일당 512KiB, 래스터 1,048,576픽셀을 제한하고 기존 이미지 검증/원자적 저장 도구를 재사용한다. 새 의존성은 없다.
- 성공·실패·미제공·중단 시도 모두 카메라 ID별로 보존한다. 목록 조회, 이미지 GET, 서버 재시작, 수동 목록 갱신에서도 이미 시도한 사진을 다시 받지 않는다. 파일 유실이나 실패는 기본 배경으로 표시하며 목록/플레이어 이용은 유지한다.
- 프런트 계약: nullable `thumbnail_url`(`/api/data/livecams/thumbnails/{camera_id}`), `thumbnail_saved_at`. 홈 모바일·데스크톱·전체 목록에 대표 이미지 라벨/4개 언어 접근성 설명을 표시한다. `BASE_URL` 및 기존 공식 플레이어 링크를 유지하고 임의 이미지 URL은 거부한다. 최초 요청 제한은 180초다.
- 저장소: backend 전용 `windy_thumbnail_data` volume을 `/var/lib/pongdang/windy-thumbnails`에 rw 연결한다. Docker 이미지에서 app 소유 디렉터리를 준비한다. 기존 관광 사진 ro 볼륨·DB 볼륨은 유지한다. 로컬 기본 경로는 `.local/windy-thumbnails`, 필요 시 절대 `WINDY_THUMBNAIL_ROOT`를 사용한다.
- 이미 목록만 저장된 환경은 운영자가 기존 `python -m app.livecams.catalog --refresh`를 한 번 실행해 사진이 없는 기존 카메라의 최초 시도를 수행한다. 일반 조회와 마이그레이션에서 자동 backfill하거나 API를 호출하지 않는다.
- 검증 완료: 실제 작업 트리 관련 백엔드 첫 검사 **67개 통과**. 이후 read1 시간 제한과 Compose 볼륨 검증까지 반영한 전체 백엔드 **1,396개 통과 / Docker CLI 부재 2개 skip**, Ruff check 및 format check **212개 파일 통과**. 프런트 실제 작업 트리 Node 24 단위 **139개**, 현재 소스를 반영한 검증 사본의 lint·TypeScript·Vite build 및 이미지 mock 브라우저 **5개** 모두 통과했다. 관련 tracked 파일 diff --check도 통과했다.
- 백엔드 전체 221개와 Compose 2개를 실제 읽어 사본에 복사하고 SHA-256/stat을 기록했다. 검증 후 이번 백엔드·DB·저장소 변경 12개 파일의 mtime/크기에 변화가 없음을 확인했다. 근거는 임시 검증 root의 `thumbnail-backend-workspace-manifest.json`, 전체 결과는 `thumbnail-tests-full.log`이며 프런트는 `/private/tmp/pongdang-windy-frontend-9rzk032v/thumbnail-source-verification.json`이다. 현재 스키마 v14의 사용자 변경을 보존하여 v15로 연결했다.
- 구현 완료. 운영 DB·실제 Windy API·운영 파일 저장소는 건드리지 않았다. 테스트는 별도 PostgreSQL 18 `pongdang_test`(51737), 임시 이미지 디렉터리, 주입한 가짜 HTTP 응답을 사용했으며 검증 후 전용 DB를 정상 종료했다. 다른 작업의 CURRENT.md·커밋·푸시·배포는 수행하지 않았다. 운영 적용 후 기존 목록에 사진이 필요하면 위의 명시적인 최초 갱신을 실행한다.
