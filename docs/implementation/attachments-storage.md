# 장소 사진 수집과 첨부파일 저장소

장소 사진은 collector가 공식 제공처에서 내려받아 파일 저장소에 보관하고,
`pongdang_data`의 첨부파일 메타데이터로 장소와 연결한다. 브라우저는 backend의
읽기 API를 이용한다. 파일 자체를 DB의 바이너리 컬럼이나 컨테이너 이미지에 넣지
않으며, 웹 요청이 사진 수집이나 파일 생성을 실행하지 않는다.

스키마 버전 9의 추가 마이그레이션은 `app.schema --initialize`가 적용한다.
`attachment`는 파일과 변경하지 않는 제공처 정보를 보관하고,
`place_attachment`는 장소의 현재 대표 사진을 참조하며,
`attachment_collection`은 장소별 다음 실행·재시도·마지막 성공 시각을 관리한다.
기존 장소나 수집 이력은 삭제하지 않는다.

`place_photos` 작업은 300초마다 실행 기회를 확인하고 한 번에 최대 25개 장소를
처리한다. 성공하거나 사진이 없는 장소는 기본 7일 뒤 재조회하며 오류는 30분부터
재시도 간격을 늘린다. HTTP 주소로 응답하는 TourAPI 사진은 승인된
`tong.visitkorea.or.kr` 호스트에 한해 HTTPS로 바꾸어 받는다. 허용된 JPG·PNG·WebP를
기본 8 MiB 이내로 내려받고 SHA-256 내용 해시 기반 경로(예: `aa/<sha>.jpg`)에
저장한다. 공공누리 1·3유형의 원본 사진과 이용조건을 유지한다.
Pillow로 실제 이미지 디코딩을 확인하며 2천만 화소 초과·애니메이션·손상 파일은
저장하지 않는다. 검증 후에도 원본 바이트를 변환하거나 잘라내지 않는다.

TourAPI 관광지 ID가 연결된 장소는 그 ID로 조회한다. 카카오 등 다른 출처의 장소는
관광지 검색 첫 20건 안에서 이름(공백·괄호 설명, 해수욕장/해변 표기 정규화)과
좌표 500m 이내가 함께 일치하는 유일한 후보만 연결한다. 사진 추가 조회는 첫
10건으로 제한한다. 일치 후보가 없거나 여러 개면 연결하지 않고 상태를 기록한다.
사진이 바뀌면 기존 DB 증거를 `superseded`로 보존하고 새로운 파일/출처 개정을
연결한다. 동일 파일은 내용 해시로 재사용하고 다운로드 실패는 이전 사진과
마지막 성공 시각을 변경하지 않는다.

사진 메타데이터는 `GET /api/data/attachments?spot_ids=1,2`, 파일은
`GET /api/data/attachments/{attachment_id}/file`로 읽는다. 원본 제공처의 인증 URL이나
호스트의 저장 경로를 브라우저에 전달하지 않는다.

## 실행 환경별 위치

| 실행 환경 | 실제 파일 저장소 | backend / collector에서 보는 경로 |
| --- | --- | --- |
| Python 직접 실행 | 저장소 루트의 `.local/attachments/` | 같은 절대 경로 |
| 로컬 Compose + `compose.dev.yaml` | 호스트의 `.local/attachments/` bind mount | `/var/lib/pongdang/attachments` |
| 운영 또는 기본 Compose | 프로젝트 전용 `attachment_data` named volume | `/var/lib/pongdang/attachments` |

직접 실행의 기본 경로는 현재 터미널 디렉터리가 아닌 소스 저장소를 기준으로 한다.
사용자 지정 저장소는 backend와 collector에 같은 절대 `ATTACHMENT_ROOT`를 설정한다.
로컬 기본 폴더 `.local/`은 Git에서 제외되며 파일은 커밋하거나 이미지에 포함하지 않는다.

운영 Compose 프로젝트가 `pongdang`이면 실제 볼륨 이름은
`pongdang_attachment_data`이다. `COMPOSE_PROJECT_NAME`이나 `--project-name`으로
격리한 Compose 검사 프로젝트에는 해당 프로젝트 접두사가 붙는다. 볼륨에 공통 `name:`이나
`external: true`를 지정하지 않아 다른 프로젝트의 파일 저장소와 공유하지 않는다.
DB는 기존 `postgres_data` 볼륨을 그대로 사용한다.

backend에는 첨부파일 볼륨을 **읽기 전용**으로, collector에는 **읽기·쓰기**로
마운트한다. initialize와 frontend에는 마운트하지 않는다. 컨테이너 루트 파일시스템의
`read_only: true`, 권한 제거, 기존 SSO와 비공개 DB/API 포트는 유지한다.
파일은 기존 `/pongdang/` 경로와 SSO 경계를 거쳐 제공하며 별도 정적 파일 포트를
공개하지 않는다.

## 로컬 실행

저장소 루트에서 bind 디렉터리를 먼저 만든다.

```bash
mkdir -p .local/attachments
docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait
```

dev override는 같은 컨테이너 경로의 named volume을 bind mount로 교체한다.
`create_host_path: false`이므로 오타나 존재하지 않는 경로를 Docker가 자동으로
root 소유 디렉터리로 만들지 않고 실패한다. Docker Desktop에서는 이 저장소 경로가
파일 공유 대상으로 허용되어 있어야 한다. Linux에서는 실행 사용자와 컨테이너의
UID/GID `10001:10001`이 파일을 읽고 collector가 쓸 수 있도록 디렉터리 소유권이나
ACL을 미리 준비한다. 전체 디렉터리를 누구나 쓰게 만드는 권한 설정은 필요 없다.

다른 호스트 디렉터리를 쓰려면 루트 `.env`에 `PONGDANG_ATTACHMENTS_DIR`를 설정한다.
같은 파일을 Python 직접 실행과 공유하려면 `backend/.env`의 `ATTACHMENT_ROOT`에도
동일한 **절대 경로**를 지정한다. 전자는 Compose의 호스트 경로이고, 후자는 직접
실행하는 프로세스의 경로다. 컨테이너 안의 `ATTACHMENT_ROOT`는 항상
`/var/lib/pongdang/attachments`이며 호스트 경로를 컨테이너 경로로 전달하지 않는다.

기본 `docker compose up`만 사용하면 로컬에서도 named volume을 쓴다. 이 경우
직접 실행하는 Python backend와 파일을 자동으로 공유하지 않으므로 개발 중 두 실행
방식을 섞을 때는 dev override를 사용한다.

macOS `ops/install-local-collector.py`는 설치 시 원래 `backend`의 Settings에서
`ATTACHMENT_ROOT`를 읽어 절대 경로를 launchd 환경에 고정한다. 따라서 코드가
`~/.local/share/pongdang/collector/releases/`에 복사되어도 backend와 같은 저장소를
사용한다. 저장 경로를 바꿨다면 backend에도 적용하고 설치기를 다시 실행한다.
설치기는 설정 전체나 인증정보를 출력하지 않는다.

## 운영 배포와 수집 설정

관련 동작을 폐기 가능한 로컬 환경에서 확인하고 Actions의 이미지 빌드가
성공한 코드가 `main` 배포 절차로 적용되면 Compose가 새 첨부파일
볼륨을 만든다. 이미지 빌드 시 `/var/lib/pongdang/attachments`를 `10001:10001`,
권한 `0750`으로 준비하므로 빈 named volume의 최초 생성 시 Docker copy-up으로
소유권이 설정된다. 이미 존재하는 볼륨이나 bind mount의 소유권은 이미지 재빌드로
바뀌지 않는다. 권한 문제가 생기면 해당 저장소만 운영자가 확인한다.

운영 API 키는 기존 `/home/cks/.config/pongdang/production.env`에 보관한다.
TourAPI 키는 기존 `DATA_GO_KR_KEY`를 사용하고 collector에만 전달한다. 사진 작업의
설정도 collector에만 전달한다.

| 설정 | 기본값 | 목적 |
| --- | --- | --- |
| `PHOTO_COLLECTION_ENABLED` | `true` | 자동 사진 수집 사용 여부 |
| `PHOTO_COLLECTION_BATCH_SIZE` | `25` | 한 실행에서 조회할 장소 수, 최대 100 |
| `PHOTO_REFRESH_DAYS` | `7` | 장소 사진 재조회 간격(일) |
| `PHOTO_MAX_BYTES` | `8388608` | 사진 한 파일의 최대 크기, 기본 8 MiB |

사진이 없거나 API 조회·다운로드가 실패한 경우에도 이미지를 만들어 채우지 않는다.
사진의 제공처·원본 식별자·출처·이용조건을 메타데이터와 함께 유지한다. 파일과 DB의
참조를 확인하지 않는 정리 작업이나 자동 볼륨 삭제는 수행하지 않는다.

실제 운영 마운트 위치와 쓰기 가능 여부는 다음 읽기 전용 명령으로 확인할 수 있다.
프로젝트 이름을 바꾼 환경에서는 컨테이너 이름도 해당 접두사로 바꾼다.

```bash
docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/pongdang/attachments"}}{{.Type}} {{.Name}} {{.Source}} writable={{.RW}}{{end}}{{end}}' pongdang-collector pongdang-backend
```

Linux Docker Engine의 실제 데이터 경로는 `.Source`로 확인한다. Docker Desktop의
named volume은 Desktop VM 안에 있으므로 macOS 호스트의 같은 경로라고 가정하지
않는다. 전체 `docker inspect`나 보간된 `docker compose config`를 로그에 남기면
환경변수의 비밀값이 포함될 수 있으므로 마운트 정보만 출력한다.

## 백업과 복원

첨부파일은 컨테이너 재생성·이미지 재빌드·정상 재배포 이후에도 volume에 남는다.
이것은 디스크 장애에 대비한 백업을 대신하지 않는다. 운영에서 `down -v`,
`volume rm`, 사용 중인 볼륨을 지우는 prune을 실행하지 않는다. 자신이 만든 폐기 가능한
전용 Compose 검사 프로젝트의 정리만 볼륨 삭제 대상이다.

DB 메타데이터와 파일은 **같은 백업 세트**로 관리한다. 운영자가 승인된 점검 시간에
collector를 중지하고 진행 중인 작업 종료를 확인한 뒤 PostgreSQL의 일관된 dump와
`attachment_data` 파일 백업을 만들고 collector를 재개한다. 백업 도구가 volume을
읽을 때도 읽기 전용 마운트를 사용한다. 수집 중인 DB dump와 나중의 파일 복사를
아무 확인 없이 같은 시점의 백업으로 취급하지 않는다.

복원은 collector를 중지한 상태에서 같은 세트의 DB와 파일을 복원하고,
`10001:10001` 소유권 및 backend 읽기/collector 쓰기 권한을 확인한 다음 진행한다.
볼륨 내부의 상대 경로와 DB에 기록된 참조를 유지하며 파일 이름을 임의로 바꾸지
않는다. 배포 경로를 옮겨도 Compose 프로젝트 이름을 유지하면 같은 named volume을
사용한다. 프로젝트 이름까지 바꾸는 이전은 기존 볼륨을 자동 연결하지 않으므로
명시적인 백업·복원이 필요하다.

## 검증 범위

2026-09-23 이전 CI의 독립 Compose 스택은 collector UID/GID와 실제 파일 쓰기,
backend의 읽기 및 쓰기 거절, 프로젝트별 볼륨 이름, backend·collector 재생성 후
파일 유지를 폐기 가능한 `pongdang-ci` 환경에서 검사했다. 이는 기존 검증
구성의 기록이다. 2026-09-23 이후 Actions는 배포 이미지만 빌드하고 Compose를
기동하지 않으므로, 향후 첨부파일 저장소를 변경할 때는 자신이 만든 폐기 가능한
로컬 Compose 프로젝트에서 위 속성을 명시적으로 재검증한다. 운영 DB·환경 파일·볼륨은
사용하지 않는다. Docker가 없는 경우 설정 파일 정적 검증만으로 이 런타임 검사를
통과했다고 간주하지 않는다.
