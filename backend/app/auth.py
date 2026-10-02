"""Fail-closed bridge to Bonifacio SSO; no local users, sessions or passwords.

The reviewed TLS ingress must overwrite all X-Pongdang-SSO-* headers with
values from its successful auth_request. The shared token is server-only.
Public clients must never receive it. See the notifications handoff.

When SSO is unconfigured, travel and AI concierge may admit a process-local
loopback operator. That path is not an account, does not trust forwarded
addresses, and never opens notifications or other SSO-only writes.
"""

import secrets
from dataclasses import dataclass
from ipaddress import ip_address

from fastapi import HTTPException, Request

LOCAL_OPERATOR_SUBJECT = "local-operator"
#: 계정 없이 둘러보는 사람. SSO subject 와 겹칠 수 없는 예약값입니다 --
#: Bonifacio 가 발급하는 subject 에는 하이픈으로 묶인 이 이름이 없습니다.
#: 이 주체로는 저장된 취향 · 코스 · 알림을 읽거나 쓸 수 없습니다.
GUEST_SUBJECT = "anonymous-guest"
LOCAL_OPERATOR_HOSTS = frozenset(
    {
        "127.0.0.1:5173",
        "localhost:5173",
        "[::1]:5173",
        "127.0.0.1:8000",
        "localhost:8000",
        "[::1]:8000",
    }
)
LOCAL_OPERATOR_ORIGINS = frozenset(
    {
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://[::1]:5173",
    }
)


@dataclass(frozen=True)
class Principal:
    subject: str
    grants: frozenset[str]
    email: str | None = None


def loopback_peer(request: Request) -> bool:
    try:
        return bool(request.client and ip_address(request.client.host).is_loopback)
    except ValueError:
        return False


def local_operator_request(settings, request: Request) -> bool:
    from app.ai.budget import operator_local_database

    if not operator_local_database(settings) or not loopback_peer(request):
        return False
    if (request.headers.get("host") or "").lower() not in LOCAL_OPERATOR_HOSTS:
        return False
    origin = request.headers.get("origin")
    if origin is not None and origin not in LOCAL_OPERATOR_ORIGINS:
        return False
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        if origin not in LOCAL_OPERATOR_ORIGINS:
            return False
        if request.headers.get("sec-fetch-site") == "cross-site":
            return False
    return True


def check_write_origin(settings, request: Request) -> None:
    """Reject a cross-site write even when the caller has no account.

    Guest routes compute and return nothing owner-scoped, but they are still
    POSTs. The same origin rule applies to them as to signed-in writes.
    """
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    origins = {
        x.strip()
        for x in getattr(settings, "sso_allowed_origins", "").split(",")
        if x.strip()
    }
    if not origins:
        raise HTTPException(503, detail="SSO_ORIGINS_NOT_CONFIGURED")
    if request.headers.get("origin") not in origins:
        raise HTTPException(403, detail="ORIGIN_NOT_ALLOWED")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, detail="CROSS_SITE_REQUEST_REJECTED")


def require_principal(settings, *, allow_local_operator=False, allow_guest=False):
    """Return a reusable dependency for owner-scoped A7/A8 APIs.

    `allow_guest` admits an **anonymous** caller under a reserved subject. It is
    only for routes that compute an answer and store nothing: 로그인하지 않고도
    추천 7단계와 코스 생성을 끝까지 써 볼 수 있어야 하기 때문입니다. 저장 ·
    취향 · 알림처럼 사람에게 묶인 것은 이 문을 쓰지 않습니다.

    게스트의 선택 토큰은 소유자 격리가 없습니다 -- 상수 subject 로 HMAC 하므로
    한 게스트의 토큰을 다른 게스트가 열 수 있습니다. 토큰이 담는 것은 장소 id
    목록과 요청 조건뿐이고 개인정보가 아니므로 그대로 둡니다.
    """

    def guest(request: Request) -> Principal:
        check_write_origin(settings, request)
        return Principal(GUEST_SUBJECT, frozenset())

    def authenticate(request: Request) -> Principal:
        configured = getattr(settings, "sso_proxy_secret", None)
        secret = configured.get_secret_value() if configured else ""
        if len(secret) >= 32:
            token = request.headers.get("x-pongdang-sso-token", "")
            if not token and allow_guest:
                # 토큰이 **아예 없는** 것만 게스트입니다. 틀린 토큰은 그대로
                # 401 입니다 -- 끊긴 세션을 조용히 익명으로 강등하면 저장한
                # 것이 사라진 채로 화면이 멀쩡해 보입니다.
                return guest(request)
            if not token or not secrets.compare_digest(token.encode(), secret.encode()):
                raise HTTPException(401, detail="SSO_AUTHENTICATION_REQUIRED")
            subject = request.headers.get("x-pongdang-sso-subject", "").strip()
            raw_grants = request.headers.get("x-pongdang-sso-grants", "")
            if not subject or len(subject) > 255 or any(ord(c) < 32 for c in subject):
                raise HTTPException(401, detail="SSO_SUBJECT_REQUIRED")
            if len(raw_grants) > 4096:
                raise HTTPException(403, detail="SSO_GRANT_REQUIRED")
            grants = frozenset(raw_grants.replace(",", " ").split())
            if "access-pongdang" not in grants:
                raise HTTPException(403, detail="SSO_GRANT_REQUIRED")
            check_write_origin(settings, request)
            email = request.headers.get("x-pongdang-sso-email")
            if email and (len(email) > 254 or any(c in email for c in "\r\n")):
                raise HTTPException(401, detail="SSO_EMAIL_INVALID")
            return Principal(subject, grants, email)
        if allow_local_operator and local_operator_request(settings, request):
            return Principal(LOCAL_OPERATOR_SUBJECT, frozenset({"access-pongdang"}))
        if allow_guest:
            # SSO 가 설정되지 않은 배포에서도 둘러보기는 됩니다. 이 분기에는
            # 검사할 허용 origin 이 없으므로 origin 규칙을 걸지 않습니다 --
            # 같은 배포가 이미 위에서 로컬 운영자를 받고 있고, 이 라우트들은
            # 아무것도 쓰지 않습니다.
            return Principal(GUEST_SUBJECT, frozenset())
        raise HTTPException(503, detail="AUTH_NOT_CONFIGURED")

    return authenticate
