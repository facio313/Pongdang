# 보관 운영과 실제 DB 서비스 복구

2026-11-02에 공모전 운영을 종료하고 실제 수집 자료의 정적 보관 화면으로 전환했다.
현재 서버에서는 아래 `resume` 명령으로 전체 DB 백업을 복원하고 수집을 재개한다.
다른 에이전트도 이 문서와 서버의 보존 자료를 이용할 수 있다.
**Git 저장소만으로 새 서버의 데이터·비밀 설정까지 복구되는 것은 아니다.**
새 서버에는 아래 비공개 자료와 호스트 구성을 먼저 옮기거나 재구성해야 한다.

## 현재 서버에서 다시 켜기

현재 공개 주소는 `https://pongdang.site/`이다. 보관 모드는 한국어 장소 201개,
실제 사진 189개와 허용된 API 응답 1,238개를 표시한다. 기준 시각은
2026-11-02 16:20 KST이며 원본 관측 시각·점수는 바꾸지 않았다.
AI·실시간 웹캠·개인 저장·수집은 중지되어 있다. 정적 보관본은 전체 DB를 대신하는
백업이 아니며, 실서비스에는 아래 별도의 전체 DB 백업을 사용한다.

사용자가 정식 서비스 재개를 요청하면 서버에서 실행한다.

```bash
sudo /usr/local/sbin/pongdang-mode status
sudo /usr/local/sbin/pongdang-mode resume
```

`resume`은 다음 작업을 순서대로 수행한다.

1. 모드·배포 잠금을 획득하고 백업 크기·SHA-256·검증 기록을 확인한다.
2. DB 볼륨이 없으면 `pongdang_postgres_data`를 새로 만들고 PostgreSQL 18에
   `pg_restore --single-transaction --exit-on-error`로 전체 실제 데이터를 복원한다.
   기존 볼륨이 있으면 덮어쓰지 않는다. 출처가 불분명하거나 이전 복원이 실패한
   볼륨은 자동으로 사용하지 않는다.
3. 보존된 릴리스의 backend와 frontend를 시작하고 `/api/ready`를 확인한다.
   이 단계에서는 초기화·시드 명령으로 백업을 대체하지 않는다.
4. collector를 시작하고, Monitor의 backend/DB 제외 항목을 해제한다.
   보관 전 상태에 맞춰 Pongdang CI·배포 감시 타이머를 복구한다.

DB 복원에는 시간이 걸릴 수 있다. 복원 직후의 자료는 백업 시점의 실제 자료이며,
수집기가 재개된 뒤 제공처별 주기에 맞춰 갱신된다. 오래된 근거를 새 관측으로 만들거나
목업으로 빈값을 채우지 않는다. 성공 후에는 `status`, 4개 앱 컨테이너의 health,
`http://127.0.0.1:5188/api/ready`와 필요한 대표 GET만 확인한다.

복원이 실패하면 도구는 정적 웹으로 돌아가고 백업·DB 볼륨을 보존한다.
`active.json`의 `restore_state=restoring/failed`가 남으면 단순 재시도나 볼륨 삭제로
우회하지 말고 중단 원인과 보존된 볼륨부터 확인한다. 오류 내용을 조사할 때 운영
환경 값·DB 자료·로그인 자료를 출력하지 않는다.

## Git과 별도로 보존해야 하는 자료

현재 서버의 작업 상태 디렉터리는 `/home/cks/.local/share/pongdang-archive`이다.
DB 백업과 운영 환경 파일은 Git에 추가하지 않는다.

| 자료 | 현재 위치와 용도 |
|---|---|
| 전체 실제 DB | `database-20261102-final.dump` — 위 상태 디렉터리 안, 185,408,814바이트 |
| 백업 검증 기록 | `database-backup.json` — 파일명·크기·SHA·쓰기를 멈춘 시각·목록/전체 스트림 검증 결과 |
| 모드 상태 | `runtime.json`, `preparation.json`, `active.json` — 절대 경로·릴리스·원래 타이머 상태·볼륨 삭제 상태 |
| 정적 웹과 실제 화면 자료 | `snapshot-20261102/` 전체 — 이미 빌드한 웹·manifest·응답 JSON·사진 |
| 정적 실행 구성 | `compose.yaml`, `nginx.conf` — 서버용으로 경로와 이미지가 확정된 파일 |
| 원본 사진 | Docker 볼륨 `pongdang_attachment_data` — DB 참조에 대응하는 원본 파일, 현재 서버에 보존 |
| 웹캠 썸네일 | Docker 볼륨 `pongdang_windy_thumbnail_data` — 기존 실제 파일, 현재 서버에 보존 |
| 운영 환경 | `/home/cks/.config/pongdang/production.env` — DB·제공처·AI·로그인 연결 설정, 비공개로 별도 전달 |
| 기존 로그인·TLS | Pongdang ingress, `pongdang-domain-auth`/`pongdang-oauth2` 및 이들이 사용하는 사설 설정·인증서. 공용 SSO와의 연결을 별도로 유지 |
| 배포 감시 인증 | 새 호스트의 `cks`가 기존 watcher의 GitHub 조회·CI 요청을 수행할 수 있는 비공개 인증 설정. 인증값은 Git이나 이 문서에 저장하지 않음 |

최신 DB 백업의 SHA-256은 다음과 같다.

```text
9b0a892d3eacbaf12dfabeb2deebe098d7b96ab57cd8e0dddd978d1d63d449c8
```

backend와 collector를 제거한 뒤 2026-11-02 16:31:44 KST부터 애플리케이션 쓰기가
없는 상태로 최종 백업을 만들었고, 16:37:35 KST에 검증을 마쳤다.
DB 컨테이너와 DB 볼륨은 이 검증 뒤 삭제했다. 위 원본 사진·썸네일 볼륨은 삭제하지 않았다.
DB 백업만 옮기면 DB가 참조하는 원본 사진 파일까지 옮겨지는 것은 아니다.

현재 확인된 보존 위치는 이 서버이다. 별도 외부 저장소에 사본이 있다고 확인한 것은
아니다. 서버를 폐기하거나 디스크를 교체하기 전에는 이 목록의 비공개 자료를 승인된
보관처로 옮기고 파일 검증값을 대조해야 한다. 비밀값은 공개 이슈·PR·문서에 넣지 않는다.

## 새 서버에서 복구를 준비하는 순서

아래는 새 호스트를 준비하는 절차이며 현재 서버의 DB를 다시 켜는 데는 필요하지 않다.
현재 제어 도구는 이 호스트의 계정·소켓·systemd·Monitor 구성에 맞춰져 있으므로
단순히 Git을 clone한 뒤 바로 실행하는 범용 설치기로 취급하지 않는다.

1. 저장소의 최신 `main`에서 이 문서와 `AGENTS.md`, `docs/ci.md`를 읽는다.
   `dev` refs를 변경하지 않는다. 보관 중이라는 이유만으로 전체 live Compose를
   먼저 실행하거나 새 빈 DB를 초기화하지 않는다.
2. 운영 계정 `cks`(현재 UID 1001), rootless Docker 소켓
   `/run/user/1001/docker.sock`, Python 3.11 이상과 Docker Compose를 준비한다.
   계정·경로·소켓이 달라지면 `ops/pongdang-mode`의 상수와 관련 systemd unit,
   아래 메타데이터 경로를 함께 조정하고 관련 명령 모형 검사를 다시 실행해야 한다.
3. 비공개 자료 표의 상태 디렉터리·운영 환경 파일·첨부 볼륨 내용을 옮긴다.
   상태 디렉터리는 현재 `cks` 소유·0700, 상태 JSON과 DB 백업은 root 소유·0600이다.
   정적 웹 디렉터리/파일은 0755/0644로 컨테이너에서 읽을 수 있게 하되,
   DB 백업·운영 환경 파일을 웹의 bind mount 아래에 넣지 않는다.
   첨부 볼륨은 Docker 사용자 네임스페이스 안의 소유권을 보존해 복원한다.
4. 실제 데이터 백업과 대응하는 live 릴리스
   `404b49742009f873de2007c7c072b60ed7d99be0`를 Git 이력에서 준비한다.
   위치는 `/home/cks/.local/share/pongdang-deploy/releases/<SHA>`이며
   `current` 링크도 이 릴리스를 가리키게 한다. 배포 상태 디렉터리는 `cks` 소유로
   준비하고 `deploy.lock`도 `cks` 소유·0600으로 만들어 root 제어 도구와 기존
   `cks` 배포 게이트가 같은 잠금을 사용할 수 있게 한다. 저장된 이미지
   `pongdang-backend:<SHA>`, `pongdang-frontend:<SHA>`, `postgres:18-alpine`을
   가져오거나 해당 릴리스와 운영 Compose 빌드 인자로 준비한다.
   CPU 아키텍처가 다르면 새 호스트에 맞게 이미지를 다시 만들어야 한다.
   `resume` 자체는 `--no-build --pull never`를 사용하므로 이미지 준비를 대신하지 않는다.
   정적 웹은 함께 옮긴 `snapshot-20261102/`를 사용한다. 과거 릴리스의 frontend
   이미지에 정적 보관 기능이 이미 들어 있다고 가정하지 않는다.
5. `runtime.json`의 `public_dir`, `release_dir`, `frontend_image`, `compose_file`,
   `backup_file`과 `preparation.json`의 `release`가 실제 복원한 경로에 맞는지 확인한다.
   `active.json`은 실제 보관 모드와 DB 볼륨 부재를 나타내야 한다.
   `database-backup.json`의 검증 플래그를 임의로 만들어 맞추지 말고 옮긴 백업의
   크기·SHA·PostgreSQL 18 `pg_restore --list` 및 전체 스트림 읽기를 확인한다.
   서버용 `compose.yaml`의 bind mount 경로도 함께 확인한다.
6. 저장소의 `ops/pongdang-mode`와 archive guard가 있는 `ops/pongdang-deploy`를
   `/usr/local/libexec/`에 root:root 0755로 설치한다. 편의 링크는
   `/usr/local/sbin/pongdang-mode` → `/usr/local/libexec/pongdang-mode`이다.
   기존 정책대로 Pongdang CI/deploy watcher·local wrapper·unit을 설치하되
   보관 모드에서는 두 watcher timer를 비활성화해 둔다. 인증서 갱신은 유지한다.
7. 현재 제어 도구는 `/run/monitor-collector/collector.lock`과
   `monitor-container-exporter.service`, `/etc/monitor/alert-retirements.json`을 사용한다.
   새 서버에서도 해당 호스트 모니터 구성을 준비하거나, 운영 환경에 맞춘 별도의
   모니터 연동 변경을 검증해야 한다. 빈 service를 만들어 성공으로 위장하지 않는다.
   기존 retirement 항목은 보존하고 Pongdang backend/DB 두 대상만 조정한다.
8. Pongdang의 기존 ingress·도메인·TLS·로그인 연결을 복구한다. 공용 SSO 사용자·권한을
   새로 만들거나 우회하지 않고 기존 `access-pongdang` 정책을 유지한다.
   먼저 정적 Compose만 시작하여 보관 화면, 사진, `/api/ready`의
   `mode=archive`, `live_data=false`와 필요한 로그인 보호를 확인한다.
9. 위 전제가 충족되고 실제 서비스 재개가 승인된 뒤 `pongdang-mode resume`를 실행한다.
   DB 복원 뒤에 collector가 시작되도록 순서를 유지한다. 새 main 배포는 기존 CI와
   배포 게이트를 통해 진행하며 같은 커밋을 별도로 중복 빌드·배포하지 않는다.

새 호스트 준비 중 백업·사진·비밀 설정이 없으면 그 누락을 보고한다.
실제 데이터를 복구한 것처럼 빈 DB나 목업으로 대체하지 않는다.

## 다시 보관 모드로 내릴 때

`archive` 명령은 새 백업·정적 자료를 자동 생성하는 명령이 아니다.
실서비스를 한 번 재개한 뒤에는 과거 보관본으로 DB 볼륨을 삭제하지 않도록
`last-live.json`을 근거로 거부한다. 그 파일을 삭제해 보호를 우회하지 않는다.

다시 내릴 때는 collector를 멈추고 허용된 읽기 API로 새 화면 자료를 내보낸다.
`ops/export_archive.py`는 실제 API 응답과 사진만 보존하며 외부 제공처·유료 API·
사용자 개인 API를 직접 호출하지 않는다. 새 정적 화면을 별도 loopback 포트에서
확인한 뒤 그 화면으로 전환하고 backend 쓰기도 멈춘 상태에서 새 전체 DB 백업을 만든다.
새 보관 세대의 메타데이터와 복구 명령을 검증한 후, 해당 범위의 승인이 있을 때만
DB 컨테이너와 정확한 `pongdang_postgres_data` 볼륨을 제거한다.

## 확인한 범위

2026-11-02 전환에서 frontend lint·Node 310개·타입 검사, exporter 7개,
모드 제어 명령 모형 13개, 배포 차단 1개 검사를 통과했다.
PC/모바일의 주요 화면·사진·미래 날짜의 보관 자료 유지와 공개 도메인의 지도까지
확인했다. DB 백업의 목록·전체 스트림·SHA 검증은 했지만 실제 운영 DB 복원이나
새 서버 전체 복구 시험을 실행한 것은 아니다.

구현: [모드 제어](../ops/pongdang-mode), [자료 내보내기](../ops/export_archive.py),
[정적 Compose](../ops/compose.archive.yaml), [정적 nginx](../ops/archive-nginx.conf),
[현재 서버 상태](ai/CURRENT.md), [CI·배포 정책](ci.md).
