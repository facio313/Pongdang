# 카카오 경로 API 배포 후 진단 참고

## 목적과 범위

Pilgrimage에서 사용 중인 카카오모빌리티 REST 키의 실제 유효성을 확인하고,
Pongdang의 별도 경로 요청 연결에 필요한 설정 상태를 반환한다.
이 문서는 서버에서 아직 실행하지 않은 **선택적 읽기 전용 진단 절차**다.
기존 `dev` 통합 → `main` CI → 자동 배포 이후 연결 문제가 있을 때 참고한다.
로컬 백엔드 개발을 완료하기 위해 이 절차나 운영 SSH 접속을 요구하지 않는다.
배포·재시작·마이그레이션·키 교체·SSO 변경은 이 검증에 포함하지 않는다.

## 확인된 로컬 상태

- 대상: Raspberry Pi의 Pilgrimage/Pongdang. 배포 workflow의 SSH 대상은
  `cks@ssh.bonifacio.work:22022`이며 이번 로컬 연결은 SSH 인증 실패로 종료됐다.
- 소스: Pongdang의 `codex/luna-concierge`, 기준 HEAD
  `e5d0ba4b330c7fe932d5843d54ddf715bf3319ea`와 미커밋 변경.
  이 커밋만으로 이번 경로 구현이 서버에 배포되어 있다고 간주하면 안 된다.
- 사용자 확인: Pilgrimage 내부 `GET /api/directions/` →
  `https://apis-navi.kakaomobility.com/v1/directions`.
- 사용자 확인: Pilgrimage는 `/home/cks/pilgrimage/.env`에서
  `KAKAO_REST_API_KEY`를 설정한다. 이 파일은 운영 `docker-compose.yml`과 같은
  디렉터리에 있다.
- Pongdang 로컬 구현: `backend/app/config.py`, `backend/app/travel/directions.py`,
  `compose.yaml`. 경로는 `KAKAO_REST_API_KEY` 우선, 비어 있으면
  `KAKAO_REST_KEY`를 사용한다. 수집기는 기존 키를 사용한다.
- Pongdang 운영 선언: `ops/pongdang-deploy`가
  `/home/cks/.config/pongdang/production.env`를 명시적으로 사용한다.
  사용자가 이 운영 파일 경로를 확인했다.
- 서버 파일의 실제 내용과 운영 컨테이너 상태는 로컬 작업에서 관측하지 못했다.
- 이번 로컬 전체 백엔드 검사는 1,192개 통과했다. 실제 운영 경로 성공의 증거는 아니다.

## 서버 읽기 전용 사전 확인

서버 `cks` 계정의 기존 rootless Docker 연결에서 실행한다. 컨테이너가 없거나
환경이 다르면 명령을 중단하고 실제 서비스명과 구성 경로만 반환한다.

```sh
export DOCKER_HOST=unix:///run/user/1001/docker.sock
docker inspect --format '{{.State.Status}}' pilgrimageBackend
docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' pilgrimageBackend
docker inspect --format '{{.State.Status}}' pongdang-backend
```

전체 `docker inspect`, 환경 덤프, `.env` 출력은 하지 않는다.
다음 호출은 키를 컨테이너 내부 메모리에서만 사용하며 공식 HTTPS 주소에 1회 요청한다.
좌표는 로컬 Pongdang의 실제 등록 경포해수욕장(7)과 강문해변(9)에서 읽었다.
개인 위치나 임의 생성 장소는 사용하지 않는다.

```sh
docker exec -i pilgrimageBackend python - <<'PY'
import json
import os
import urllib.error
import urllib.parse
import urllib.request

key = os.environ.get("KAKAO_REST_API_KEY", "").strip()
if not key:
    print(json.dumps({"status": "unconfigured", "setting": "KAKAO_REST_API_KEY"}))
    raise SystemExit(0)

query = urllib.parse.urlencode({
    "origin": "128.910210247605,37.8034055083125",
    "destination": "128.919175274112,37.7948207421998",
    "priority": "TIME",
    "summary": "true",
    "alternatives": "false",
    "roadevent": "0",
})

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
request = urllib.request.Request(
    "https://apis-navi.kakaomobility.com/v1/directions?" + query,
    headers={"Authorization": "KakaoAK " + key},
)
try:
    with opener.open(request, timeout=5) as response:
        raw = response.read(1_000_001)
        if len(raw) > 1_000_000:
            raise ValueError("response_too_large")
        data = json.loads(raw)
        route = data["routes"][0]
        summary = route["summary"]
        valid = (
            type(route.get("result_code")) is int and route["result_code"] == 0
            and type(summary.get("distance")) is int and summary["distance"] > 0
            and type(summary.get("duration")) is int and summary["duration"] > 0
            and isinstance(data.get("trans_id"), str) and bool(data["trans_id"])
        )
        print(json.dumps({
            "http_status": response.status,
            "status": "available" if valid else "invalid_evidence",
            "distance_m": summary["distance"] if valid else None,
            "duration_seconds": summary["duration"] if valid else None,
            "source_record_id_present": bool(data.get("trans_id")),
        }))
except urllib.error.HTTPError as error:
    print(json.dumps({"status": "upstream_failed", "http_status": error.code}))
except Exception as error:
    print(json.dumps({"status": "check_failed", "error_type": type(error).__name__}))
PY
```

## 반환할 증거와 후속 단계

- 실제 Compose 디렉터리, 컨테이너 상태, 실행 시각.
- 위 검증의 정제된 JSON 결과만 반환한다. 키·전체 응답·환경 값은 반환하지 않는다.
- HTTP 200과 유효한 소요시간/거리/출처 ID가 확인되어야 상위 API 성공으로 판정한다.
  이 성공만으로 Pongdang 배포·환경 비교·후속 경로 응답까지 검증된 것은 아니다.
- 실제 키 설정을 Pongdang에 반영하는 작업과 새 코드 배포는 별도 실행 범위다.
  기존 `dev` 통합 → `main` CI → 배포 절차를 사용한다.
- Pongdang에 연결된 뒤 장소 목록 단계에서 외부 경로 호출이 없는지,
  별도 경로 요청에서 실제 ETA/지도 선/환경 근거·미확인 상태를 반환하는지 확인한다.
- 이 문서의 검증은 영구 상태를 변경하지 않으므로 롤백 작업은 없다.
