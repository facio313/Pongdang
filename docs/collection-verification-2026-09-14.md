# API 수집 연결 검증 결과

검증 시각: 2026-09-14 00:53:11 KST

현재 실행 대상은 **이 Mac의 독립 PostgreSQL 18 / pongdang DB**다. 운영 서버 배포 및 서버 키 등록은 아직 수행하지 않았다.

## 완료한 경로

- 공식 API → 정규화 → 실제 DB 저장 → 읽기 전용 API → 화면 조회를 확인했다.
- 23개 주기 작업을 등록해 실제 호출했다. 22개 작업에서 실자료를 받았고 갯벌은 경포 반경 내 지점 없음(no_data)을 확인했다. 최신 실행 상태는 아래 표가 기준이다.
- 자동 주기 중 AWS 불완전 응답을 실패로 기록하고 지수 백오프를 예약한 것도 확인했다. 외부 제공처의 매 요청 성공을 보장하지 않는다.
- launchd 수집기가 실제 재실행해 새 자료를 저장했고, 동일 특보·부이는 중복 삽입하지 않았다.
- 원본 정정과 A→B→A 재정정, 배치 내 충돌 거부, 실패 시 유효기간 보존·재시도, 다중 worker 잠금을 테스트했다.
- 더미 API/생성 코드를 제거했고 로컬 pongdang_demo가 없음을 DB에서 확인했다. 기존 기능 화면은 실제 자료 또는 빈 상태를 표시한다.
- 실제 수집 코드와 설치된 실행본의 모든 소스 파일이 일치한다. 확인한 변경·추가 파일에서 키 노출이 없다.

## 저장 건수

| 테이블 | 행 수 |
|---|---:|
| `spots_waterspot` | 1,044 |
| `collection_station` | 469 |
| `conditions_observationsnapshot` | 487 |
| `conditions_observationmetric` | 4,421 |
| `collection_warning` | 4 |
| `collection_place` | 575 |

스냅샷·측정값 건수에는 보존된 이전 수정본이 포함된다. 자동 수집 중이므로 이후 건수는 달라진다.

## 작업별 주기와 최종 결과

| 작업 | 간격(분) | 결과 | 최근 종료(KST) |
|---|---:|---|---|
| `hrfco_waterlevel` | 10 | succeeded | 2026-09-14 00:44:56.673420+09:00 |
| `kakao_places` | 1440 | partial | 2026-09-14 00:38:04.398788+09:00 |
| `khoa_beach` | 60 | succeeded | 2026-09-14 00:32:57.360304+09:00 |
| `khoa_buoy_recent` | 10 | succeeded | 2026-09-14 00:43:24.535343+09:00 |
| `khoa_mudflat` | 60 | no_data | 2026-09-14 00:32:57.952882+09:00 |
| `khoa_rip_current` | 10 | succeeded | 2026-09-14 00:43:24.204045+09:00 |
| `khoa_surfing` | 60 | succeeded | 2026-09-14 00:32:57.763212+09:00 |
| `khoa_tide_extrema` | 60 | succeeded | 2026-09-14 00:32:59.666547+09:00 |
| `khoa_tide_level` | 10 | succeeded | 2026-09-14 00:43:24.932925+09:00 |
| `khoa_tide_recent` | 10 | succeeded | 2026-09-14 00:43:24.384578+09:00 |
| `khoa_water_temperature` | 10 | succeeded | 2026-09-14 00:43:24.689222+09:00 |
| `khoa_waves` | 10 | succeeded | 2026-09-14 00:43:25.081987+09:00 |
| `kma_aws` | 5 | failed | 2026-09-14 00:46:27.703208+09:00 |
| `kma_buoy` | 10 | succeeded | 2026-09-14 00:51:04.302224+09:00 |
| `kma_mid_forecast` | 60 | succeeded | 2026-09-14 00:26:01.122742+09:00 |
| `kma_nowcast` | 10 | succeeded | 2026-09-14 00:51:02.717540+09:00 |
| `kma_short_forecast` | 60 | succeeded | 2026-09-14 00:26:01.037261+09:00 |
| `kma_ultra_forecast` | 30 | succeeded | 2026-09-14 00:25:59.662411+09:00 |
| `kma_warnings` | 10 | succeeded | 2026-09-14 00:51:02.932117+09:00 |
| `koem_catalog` | 1440 | succeeded | 2026-09-14 00:34:25.477776+09:00 |
| `koem_water_quality` | 1440 | succeeded | 2026-09-14 00:35:38.985145+09:00 |
| `nier_water_quality` | 1440 | succeeded | 2026-09-14 00:33:03.960241+09:00 |
| `tourism_places` | 1440 | partial | 2026-09-14 00:38:05.971009+09:00 |

## 확인한 한계

- 경포 중심 20km와 지정 관측소 범위다. KOEM 정점 목록은 전국 425개를 저장하되 수질 관측은 지역 정점을 고른다.
- KOEM 수질은 2025년, NIER 수질은 2026년 7월 등 제공처가 실제 제공한 과거 검사도 원래 시각과 stale 상태로 저장한다. 현재 수질이라는 뜻은 아니다.
- 카카오 주변 검색은 분류별15개씩 최대75개, 관광공사 목록은 최대500개다. 전체 목록 수집으로 표시하지 않는다.
- API별 미제공 단위·좌표·발표시각은 빈 값/NULL로 보존한다. 점수·안전 판정은 생성하지 않는다.
- 이 Mac이 꺼지거나 잠들면 로컬 수집도 멈춘다. 상시 서버 수집을 위해서는 운영 배포가 필요하다.
- Docker가 없어 컨테이너 전체 실행은 이 Mac에서 검증하지 못했다. YAML과 의존관계는 확인했고 로컬 PostgreSQL·worker·API·브라우저는 실제 실행했다.

## 검사

- Backend: 104 tests passed; Ruff check / format passed.
- Frontend: Node 24, 12 tests passed; lint / build passed. 검증 복사본은 원본 38개 파일과 바이트 단위로 일치.
- 브라우저: 실제 DB 연결, 표·수집상태, ?data=demo → ?data=data 전환 확인.
- 변경·추가 파일을 포함한 로컬 파일을 값·URL 인코딩 변형으로 검사. iCloud 미다운로드 상태인 변경 없는 기존 파일 4개는 제외.

실행·설정 변경·정지 방법은 [README](../README.md), 데이터 계약은 [수집 안내](ingestion.md)를 참고한다.
