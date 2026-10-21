# 이전 Multtara의 운영 폐기 선언

폐기 대상은 이전 Multtara뿐이다. 독립 Pongdang은 계속 운영하며,
`pongdang.site`, Bonifacio의 `/pongdang/`, PostgreSQL 18의
`pongdang_postgres_data`, 로그인 서비스와 배포·인증서 갱신 경로를 유지한다.
2026-10-21 독립 Pongdang까지 중단한 잘못된 작업을 사용자 요청으로 복구했다.

- `portfolio-guard.sh`: `/etc/portfolio-deploy/retired-apps.sh`. 공용 `portfolio-deploy`의 `set -Eeuo pipefail` 다음에서 source한다. Multtara 명령만 거부한다.
- `bonifacio-retired-locations.conf`: `/etc/nginx/snippets/portfolio-retired-locations.conf`. 이전 Multtara 경로만 HTTP 410으로 응답한다. 기존 `pongdang-location.conf` include와 함께 사용한다.

이전 Multtara의 앱·DB 접속 컨테이너와 15432 접속 경로를 제거하고,
`multtara-db-access-renew` service/timer와 Multtara release workflow만 비활성화한다.
공유 cksDB에 남은 이전 Multtara용 `pongdang` DB와 전용 역할은 접속을 막아 보존한다.
이 DB는 독립 Pongdang의 PostgreSQL 18 DB와 별개다. 운영 DB·볼륨과 복구본을
영구 삭제하지 않는다. 공용 SSO 사용자·그룹, DNS·메일은 변경하지 않는다.

독립 Pongdang의 CI/deploy watcher, 인증서 갱신, 제한된 SSH 키와 기존 배포 게이트는
복원한다. 최신 main 확인·동시 배포 방지·실패 복구를 그대로 유지하며,
이 디렉터리를 근거로 독립 Pongdang을 중지하거나 폐기해서는 안 된다.

호스트의 원본 설정·DB dump·컨테이너 설정·실행 검증은 Git 밖의
`/home/cks/.local/share/server-security-20261021`에 0700/0600으로 보관한다.
