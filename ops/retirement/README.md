# 운영 폐기 선언

2026-10-21 운영자 요청으로 독립 Pongdang과 이전 Multtara 서비스를 폐기했다.
이 디렉터리에는 실제 호스트에 설치한 비밀값 없는 차단 선언을 보관한다.

- `refuse-deploy.sh`: `/usr/local/libexec/pongdang-deploy`. 자격증명이나 Docker를 읽기 전에 실패한다.
- `portfolio-guard.sh`: `/etc/portfolio-deploy/retired-apps.sh`. 공용 `portfolio-deploy`의 `set -Eeuo pipefail` 다음에서 source한다. Multtara 명령만 거부한다.
- `bonifacio-retired-locations.conf`: `/etc/nginx/snippets/portfolio-retired-locations.conf`. 기존 Pongdang include와 Multtara location 두 개를 대체한다. 나머지 경로와 SSO 권한·계정은 유지한다.
- `pongdang.site`: 전용 가상 호스트. HTTP는 410, HTTPS는 handshake를 거부한다. 인증서 자동 갱신이나 OAuth upstream을 사용하지 않는다. DNS·메일은 변경하지 않는다.

Pongdang CI/deploy watcher, pongdang-certificate-renew, multtara-db-access-renew의
service/timer를 백업한 뒤 중지·비활성화·마스킹한다. Pongdang CI 및 Multtara release
workflow를 비활성화하고 전용 Pongdang forced-command SSH 키만 제거한다.
공용 키와 SSO 사용자·그룹은 유지한다. 앱·접속 컨테이너는 restart=no 후 제거하며
`down -v`와 볼륨 삭제를 사용하지 않는다. 공유 cksDB의 전용 역할은 NOLOGIN으로
보존하고 pongdang DB는 접속 불가 상태로 보존한다. 독립 PostgreSQL 18 데이터와
기존 복구본은 비공개 보존한다.

호스트의 원본 설정·DB dump·컨테이너 설정·실행 검증은 Git 밖의
`/home/cks/.local/share/server-security-20261021`에 0700/0600으로 보관한다.
복구 시 원본의 소유권/모드, Compose 파일·환경·이미지·볼륨을 대조하고 별도 승인 후
진행한다. 차단 파일 제거, unit unmask, workflow 활성화만으로 재개하지 않는다.
