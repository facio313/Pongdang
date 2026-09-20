# 장소 사진 자동 수집 · 2026-09-21 KST

- 목표: 사진 자동 수집, 첨부파일 DB, 로컬·운영 저장 위치와 Compose 볼륨, 실제 UI 표시.
- 구현: schema9 `attachment`, `place_attachment`, `attachment_collection`; 별도 worker의 `place_photos`; 조회 전용 `/api/data/attachments`와 `/{id}/file`. 공식 TourAPI+허용 이미지 호스트만 사용. 사진 원본/출처/공공누리1·3유형/수집·원본수정시각/SHA256 보존. 중복 파일 재사용, 원본 변경 이력 보존, 실패 재시도.
- 제한: 한 작업25장소(최대100), 검색 첫20건, 상세이미지 첫10건, 8MiB/2천만 화소/정지 JPEG PNG WebP. 이름+500m 내 유일 후보만 자동 연결. 없는 사진을 합성하지 않음.
- 저장: 직접 로컬 `.local/attachments`; dev Compose는 같은 폴더 bind. 기본/운영 Compose는 프로젝트별 `attachment_data` volume, collector RW/backend RO, 컨테이너 `/var/lib/pongdang/attachments`. postgres_data 유지.
- 로컬 적용: loopback PostgreSQL18 pongdang DB v8→v9 additive 적용. 실제17장소 중15연결,12원본파일3,209,775바이트 저장. 순개울해변·사천진해변공원은 일치근거 부족 no_match. 실패/합성 사진 없음.
- 실제 제공자 차이: tong 서버가 JPEG MIME을 image/jpg로 응답해 첫15건 실패. 실제 JPEG decode를 통과한 경우에만 alias를 허용하고 회귀 테스트 추가 후 성공.
- 로컬 실행: 기존 collector runtime에 Pillow12.3 설치, installer로 새 snapshot+절대 ATTACHMENT_ROOT 적용. 기존 로컬 backend를 같은127.0.0.1:8000으로 재시작. localhost5173/pongdang 경유 사진 metadata/file200 및 SHA/ETag 확인.
- 검증 진행: backend 전용 PostgreSQL18 pongdang_test, port55439 별도 임시 cluster 사용. 첨부+마이그레이션61 tests 통과. 전체 pytest1150 passed/2 skipped(86.66초), Ruff lint/format 통과. frontend97 tests/lint/build 및 mobile/desktop mock 검증 통과. 실제 localhost5173/pongdang의 mobile390/desktop1440 명소목록·582상세 사진 로딩/출처/파일200 확인, JS오류0. Docker CLI 없음: Compose 실제 실행과2개config tests는 실행 불가, CI에 mount RW/RO·재생성 보존 검사 추가.
- 동시 작업: 기존 docs/ai/CURRENT.md 및 예보/수질 작업 보존. 다른 작업에서 upstream pull/stash 충돌 해소 후17c3efc에 당시 tracked 수정들을 커밋함. 이후 외부 작업이5cdcbda에 신규 모듈·테스트·문서도 포함함을 git log/status로 확인. 이 작업에서는 commit/push를 실행하지 않음.
- 자동 실행 확인: 설치한 launchd 프로세스가 place_photos 1건을 스케줄 실행해 succeeded/inserted0, 같은 파일 재사용 성공. 수동실행에만 의존하지 않음.
- 운영: 로컬 구성만 완료. 실제 서버 배포/마이그레이션/volume 생성은 실행하지 않음. 기존 main CI 성공 후 배포 경로로 적용해야 함. 상세는 docs/implementation/attachments-storage.md.
