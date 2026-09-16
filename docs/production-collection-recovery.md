# 운영 홈에서 해수욕장과 조건 자료가 없을 때

## 2026-09-16 확인한 상태

- 운영 배포 `772be14`의 CI 및 컨테이너 준비 상태 검사는 통과했다.
- 이후 운영 화면에 `수집된 해수욕장이 없습니다`가 표시됐다. 이 문장은
  `/api/data/water-index/default-place`에서 분류된 해수욕장 후보가 0건인
  `no_places` 응답에 해당한다. 점수 계산 이전 단계의 결손이다.
- 같은 코드로 로컬 Pongdang의 실제 수집 DB를 읽으면 경포해수욕장이
  선택되고 관측 자료와 참고 점수가 반환됐다. 이 결과는 운영 DB에 자료가
  있다는 증거가 아니다.
- 수집기 healthcheck는 최근 heartbeat만 검사한다. API 키가 없어 외부
  수집 작업들이 `disabled`여도 프로세스는 healthy일 수 있다.
- 운영 API 키 누락 여부와 실제 작업 실패 코드는 아직 조회하지 못했다.
  로컬 환경 파일은 운영으로 자동 전달되지 않는다.

## 관리자 접속 후 읽기 전용 진단

Pongdang 전용 collector 컨테이너에서 실행한다. 키 원문이나 `.env` 내용,
Docker 전체 환경, 제공자 원문 응답을 출력하지 않는다.

```sh
export DOCKER_HOST=unix:///run/user/1001/docker.sock
docker exec pongdang-collector python -m app.ingestion.diagnostics
```

진단 모듈이 포함되기 전 배포 버전에서는 검토한 로컬 파일을 SSH 표준입력으로
전달해 실행할 수 있다. 관리자 SSH 연결이 있어야 하며, 배포 전용 강제 명령
키를 우회하는 용도로 사용하지 않는다.

```sh
# 관리자 SSH 설정의 실제 호스트 별칭을 사용한다.
ssh ADMIN_HOST \
  'DOCKER_HOST=unix:///run/user/1001/docker.sock docker exec -i pongdang-collector python -' \
  < backend/app/ingestion/diagnostics.py
```

## 진단 결과에 따라 복구

1. 필수 키가 미설정이면 `/home/cks/.config/pongdang/production.env`에서
   **Pongdang용** 설정을 보완한다. `DATA_GO_KR_KEY`는 해수욕장·기상 자료,
   `KMA_API_HUB_KEY`는 관측 자료, `KAKAO_REST_KEY`는 장소 수집에 사용된다.
   `KAKAO_REST_API_KEY`는 경로 조회용 변수이며 장소 수집 키를 대신하지 않는다.
2. 현재 배포 release의 Compose와 위 환경 파일을 사용해 backend와 collector를
   재생성한다. 기존 `postgres_data` 볼륨과 DB는 그대로 유지한다.

   ```sh
   PONGDANG_RELEASE="$(readlink -f /home/cks/.local/share/pongdang-deploy/current)"
   RELEASE_SHA="$(basename "$PONGDANG_RELEASE")" docker compose \
     --project-name pongdang \
     --env-file /home/cks/.config/pongdang/production.env \
     -f "$PONGDANG_RELEASE/compose.yaml" \
     up -d --no-build --no-deps --force-recreate --wait backend collector
   ```

3. 키가 설정되어 있는데 작업이 실패한다면 진단의 오류 코드로 제공자 인증,
   활용 신청, 통신 오류, 수집 범위를 구분한다. 설정 문제를 고친 뒤 필요할 때만
   해당 작업을 한 번 강제 실행한다. 아래 명령은 실제 제공자 조회와 정상
   수집 저장을 수행하며 읽기 전용 진단 명령이 아니다.

   ```sh
   docker exec pongdang-collector python -m app.ingestion.worker --once --force --job kakao_places
   docker exec pongdang-collector python -m app.ingestion.worker --once --force --job khoa_beach
   docker exec pongdang-collector python -m app.ingestion.worker --once --force --job khoa_buoy_recent
   docker exec pongdang-collector python -m app.ingestion.worker --once --force --job kma_nowcast
   ```

4. 진단을 다시 실행해 해수욕장 후보, 선택된 실제 장소, 유효한 관측·예보 항목을
   확인한다. 이후 운영의 `/pongdang/` 화면에서도 선택한 장소의 API 응답과
   표시 값을 대조한다. 수집기 heartbeat만으로 복구 완료라고 판단하지 않는다.

키가 없는 상태에서 장소 이름만 바꾸거나 대표 해수욕장을 순환하는 것은
수집 자료를 만들지 않는다. 임의 장소 ID, 합성 관측값, 안전 점수로 빈 값을
대체하지 않는다.
