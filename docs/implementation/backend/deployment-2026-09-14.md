# 2026-09-14 운영 배포 기록

기존 Goal의 로컬 구현·검증 완료 뒤 사용자가 커밋·푸시·운영 배포를 명시적으로 요청했다. 이 요청으로 앱의 CI 배포와 명시적 additive migration을 진행한다. 알림/LLM provider 활성화, SSO ingress·host SSH gate 설치, legacy DB/network 변경은 포함하지 않는다.

## 배포 전 확인

- 저장소: facio313/Pongdang, 공개 GitHub repository.
- 작업 브랜치: feature/api. 시작 HEAD d2589b62f53cddcf3966459180f279c4cd43d6b4.
- 확인한 원격 main: d07cd23279808e74c1998d849c240a48e06d06d2.
- 원격 main 코드의 schema VERSION은 1이고 collector 모듈이 아직 없다. 서버의 현재 schema는 코드 선언과 구분하며 CI 배포의 명시 migration 실행으로 확인한다. 기존 v1/2/3→v5 migration 회귀도 전체 테스트에 포함됐다.
- 확인한 원격 dev: 549c0b5. main/dev 모두 작업 브랜치의 조상이며 fast-forward 통합 가능.
- 기존 미커밋 frontend/실자료 조회/운영 템플릿 변경과 이번 backend Goal 결과를 함께 검토했다. 현재 요청에 따라 이 완성된 작업 상태를 커밋한다.
- 변경 파일 124개에서 서버 .env의 key/password/token/secret과 일치하는 비밀값, private key/token 패턴, 금지 환경파일/키파일, 2MB 초과 파일이 없는 것을 확인했다.
- 이전 Goal에서 Backend 413tests·Ruff check/format, Frontend20tests·lint/build, 독립 PostgreSQL18 migration/worker/API 검증 통과. 변경 없는 소스는 그대로 CI에 전달한다.
- feature/api와 dev에 커밋을 올리고 CI(Frontend, Backend, standalone Compose smoke) 통과를 확인한 뒤 동일 커밋을 main으로 fast-forward한다. main의 CI 및 자동 deploy도 별도로 확인한다.

## migration 및 복구 범위

스키마 v5는 기존 collection/Water Index 원자료를 보존하는 추가 migration이다. production용 fixture 삽입이나 테스트 실행은 하지 않는다. production postgres_data volume과 서비스 DNS·명시 container names·private ports는 보존한다.

기존 schema의 버전 불일치 거부 때문에 **v5 적용 뒤 이전 schema v1–v4 초기화 코드·collector 이미지로 단순 rollback하면 시작에 실패할 수 있다**. ops/pongdang-deploy의 previous 이미지 재시작만으로 DB 버전까지 되돌아가지 않는다. 따라서 migration 이후 앱 회귀가 발생하면 v5와 호환되는 수정 커밋을 CI 검증한 후 배포하여 복구한다. 스키마 버전 숫자만 낮추거나 새 테이블/운영 volume을 삭제하는 방식으로 우회하지 않는다. 이번 변경은 데이터 파괴 migration이 아니며 복구를 위해 실자료를 제거할 필요가 없다.

실행 중인 host gate는 저장소 템플릿과 구분한다. CI의 실제 배포 로그·health 관측이 배포 성공의 근거이며 템플릿 파일만으로 서버 상태를 단정하지 않는다. 앱 배포 과정에서 host gate를 자가 업데이트하지 않는다.

## 상태 기록

현재 문서는 배포 전 체크와 승인 범위를 기록한 커밋 자료다. 실제 commit SHA, GitHub Actions URL, 배포 완료 로그와 공개 SSO 경로 관측은 실행 결과로 별도 확인하여 사용자에게 보고한다. 수치 모델·실영상·실제 리뷰·SSO mutation 헤더·알림·AI 모델의 미활성/검증 한계는 기존 기능 인계표 그대로 유지한다.
