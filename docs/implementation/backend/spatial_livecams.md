# A3/A4 공간 상태 및 A5 공개 영상 인계

기존 지도/수온 화면의 구조와 원자료 표를 유지하는 API 계약이다. 구현은 `app/twin/api.py`, `app/livecams/service.py`이며 추가 회귀 시험은 `tests/test_spatial_integrations.py`다.

## A3/A4 조회

`GET /api/data/water-twin`, `GET /api/data/water-temperature`는 `SpatialQuery`/`SpatialEnvelope`의 OpenAPI schema를 사용한다. `spot_id`, `activity`, `mode=observation|forecast`, `at`, `as_of`, `kind`, `west/east/south/north`, `page`, `page_size`를 지원한다. bbox는 네 좌표를 함께 지정하며 각 축 최대 20도, 장소 페이지 최대100행, 페이지 최대1000, at은 knowledge cutoff 전후31일까지만 허용한다. 미래 as_of와 중복 쿼리는 거부한다.

`at`은 보고 싶은 대상시각이고 `as_of`는 당시 알려진 자료만 사용하기 위한 정보 cutoff다. metric `mode`, `time_role`, `observed_at`, `issued_at`, `fetched_at`, `valid_until`, 단위, missing과 stale을 분리한다. 원 source record 단위로 그 cutoff의 최신 correction을 먼저 선택하므로 결측 정정이 과거 성공값으로 대체되지 않는다. 수온도 보간·추정하지 않는다.

`rows[].stations`는 실제 원 관측점 `station_observation_point` 또는 검토된 mapping `representative_station` 관계다. representative mapping ID/버전/기관 공개 URL/공간·시간 범위를 반환한다. `rows[].layers`의 station_id로 연결하며 관측소 수온을 해변 직접 측정으로 표현하지 않는다.

`rows[].assessment`는 A1의 기존 read manifest/target/assessment 선택기를 같은 spot/activity/mode/at/as_of로 실행한 실제 저장 결과 요약이다. assessment ID, input manifest ID, 원 input IDs, support/environment/safety 상태와 평가·유효 시각을 보존한다. `rows[].forecast`는 A2의 같은 spot/activity/at/as_of immutable forecast projection과 발표/대상시각, horizon 상태다. 새 계산이나 외부 API 호출 없이 동일 read-only repeatable-read DB transaction에서 도메인 선택기를 재사용한다. 장소가 많을 때도 장소100/총연결100/총metric100/총평가·예보100개로 제한하고 초과하면 범위를 좁히도록 422를 반환한다. 각 도메인 selector가 bounded SQL을 수행하며 장소마다 외부 서비스 호출을 하지 않는다.

원 카탈로그는 기존 ingestion 구조상 현재 metadata를 갱신한다. `metadata_fetched_at`/`catalog_verified_at`와 `metadata_state=current_metadata`는 좌표·이름이 그 카탈로그의 갱신값이라는 뜻이다. 과거 as_of보다 늦은 metadata는 원 snapshot의 존재로 station 연결을 유지하되 이름/유형/좌표를 null, `metadata_state=historical_metadata_unavailable`로 반환한다. 현재 장소/관측소 좌표를 당시 좌표로 소급 표시하지 않는다. 과거 bbox에서는 당시 위치를 증명할 수 없는 catalog를 제외하며 `historical_catalog_filter_may_be_incomplete`를 반환한다. 당시 좌표의 완전한 복원은 별도 versioned place/station catalog 데이터가 필요하다.

입력 부족/지원 미확인/모델 미검증은 A1의 null/unknown을 유지한다. `score`를 수온에서 유추하지 않는다. 관측값에 근거한 수영 안전 판정은 없다. schema와 field 이름은 현재 프론트 바인딩에 호환되며 신규 `metadata_*`, `assessment`, `forecast`로 세부 UI를 확장할 수 있다.

## A5 공개 영상

`GET /api/data/livecams`는 선택적 spot_id/media_kind와 최대100행 페이지를 지원하며 OpenAPI `CameraEnvelope`/`CameraView`를 반환한다. 실제 검토된 camera revision이 없으면 `status=no_data`, `rows=[]`다.

카메라는 운영자의 명시적 `register_camera(settings, Camera)`를 통해 등록한다. 등록은 seed/GET이 아니며 source_revision 충돌을 거부한다. 공개 페이지·재생 주소·사용 조건 URL은 credentials/query/fragment가 없는 HTTPS 공식 `.go.kr`/`.or.kr` host만 허용하고, 등록·점검 시 서버 `LIVECAM_ALLOWED_HOSTS`의 정확한 host allowlist와 대조한다. 별도 원제공처 key나 arbitrary proxy는 없다. 임베드는 재생 URL과 명시적 허가가 모두 있어야 한다. 장소 연결 근거·검토 시각·검토 만료와 원 revision을 보존한다.

`livecam_revision`, `livecam_check`는 불변 DB trigger로 보호된다. 같은 camera_id/source_revision의 상충하는 입력은 DB unique와 애플리케이션 충돌 검사로 거부된다. 점검 job은 최신 camera별 마지막 check 시각이 가장 오래된 순서(미점검 우선)로100개를 처리한다. 마지막 확인시각이 DB에 남기 때문에 프로세스 재시작 뒤에도 101번째 이후 카메라를 계속 점검한다. 같은 revision/checked_at 재실행은 중복 저장하지 않으며 actual inserted 수를 반환한다.

점검은 approved host의 HEAD 요청과5초 timeout을 사용한다. `reachable`은 URL 응답만 확인했다는 뜻이며 `live_verified=false`, `media_liveness_not_verified`를 유지한다. HTTP404/410/5xx는 `offline`, 인증·접근 제한/redirect/network실패는 `unverifiable`로 구분한다. 마지막 check가10분 이상 지났거나 review가 만료되면 GET은 `unverifiable` 상태를 반환한다. 체크 실패가 이전 성공의 만료시각을 연장하지 않는다.

`media_kind=live|recording|image`는 기관 공개자료를 검토해 등록한 매체 유형이다. HEAD 성공은 영상이 생중계 중인지 확인하지 못하므로 live_verified를 true로 바꾸지 않는다. 실제 verified live feed가 확보되지 않은 상태를 무관한 영상으로 채우지 않는다. 현재 운영 등록/주기점검 활성화는 승인된 공개 영상 페이지·사용 조건·장소 연결과 정확한 host 설정이 필요하다.

## 추가 검증

`test_spatial_integrations.py`는 후속 metadata 갱신 뒤 과거 source revision 조회/새 좌표 누출 차단, 동일 target시각의 실제 A1/A2 저장결과 소비, 예보범위 밖, HTTP오프라인/접근불가, 카메라101개 순환점검, 페이지 상한과 DB 불변성을 검증한다. 실제 HTTP에 대한5개 오류 분류 시험은 네트워크 대역이며 실제 영상 생중계 검증을 주장하지 않는다. DB 시험은 root가 disposable pongdang_test에서 다른 통합시험과 직렬 실행한다.
