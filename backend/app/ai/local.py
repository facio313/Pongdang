"""Explicit loopback operator preview; production never registers these routes."""

import argparse
import base64
import hashlib
import json
import os
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from ipaddress import ip_address
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

from app.ai import budget
from app.ai.chat import _create_authorized_chat_router, availability, converse
from app.ai.provider import ResponsesProvider
from app.config import Settings
from app.main import create_app

ORIGIN = "http://127.0.0.1:5173"
HOST = "127.0.0.1:5173"
COOKIE = "pongdang_local_ai"
COOKIE_PATH = "/api/data/ai"
BOOTSTRAP_SECONDS = 300
SESSION_SECONDS = 7200
SCRIPT = """(async () => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  history.replaceState(null, '', location.pathname);
  try {
    const response = await fetch('/api/local/session', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      credentials: 'same-origin', body: JSON.stringify({token})
    });
    if (!response.ok) throw new Error('session');
    location.replace('/#ai');
  } catch {
    document.getElementById('status').textContent =
      '로컬 실행 링크가 만료되었거나 이미 사용되었습니다. ' +
      '로컬 서버를 다시 실행해 주세요.';
  }
})();"""
SCRIPT_HASH = base64.b64encode(hashlib.sha256(SCRIPT.encode()).digest()).decode()
SECURITY_HEADERS = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": (
        "default-src 'none'; script-src 'sha256-"
        + SCRIPT_HASH
        + "'; connect-src 'self'; base-uri 'none'; "
        "frame-ancestors 'none'; form-action 'none'"
    ),
}


@dataclass(frozen=True)
class LocalOperator:
    """A process-local capability, with no SSO identity or account grants."""


class OperatorAccounting:
    @staticmethod
    def acquire_request(settings, _unused_subject):
        return budget.acquire_operator_request(settings)

    reserve_attempt = staticmethod(budget.reserve_attempt)
    record_usage = staticmethod(budget.record_usage)
    release_request = staticmethod(budget.release_request)


class LocalAccess:
    def __init__(self, bootstrap_token, *, now=time.monotonic):
        self.now = now
        self.bootstrap_digest = self.digest(bootstrap_token)
        self.bootstrap_expires = now() + BOOTSTRAP_SECONDS
        self.session_digest = None
        self.session_expires = 0

    @staticmethod
    def digest(value):
        return hashlib.sha256(value.encode()).digest()

    @staticmethod
    def boundary(request):
        try:
            local_peer = request.client and ip_address(request.client.host).is_loopback
        except ValueError:
            local_peer = False
        if not local_peer or request.headers.get("host") != HOST:
            raise HTTPException(403, "LOCAL_OPERATOR_BOUNDARY_REQUIRED")
        origin = request.headers.get("origin")
        if origin is not None and origin != ORIGIN:
            raise HTTPException(403, "ORIGIN_NOT_ALLOWED")
        if request.method not in {"GET", "HEAD"} and origin != ORIGIN:
            raise HTTPException(403, "ORIGIN_NOT_ALLOWED")
        if request.headers.get("sec-fetch-site") not in {None, "same-origin", "none"}:
            raise HTTPException(403, "CROSS_SITE_REQUEST_REJECTED")

    def authenticate(self, request: Request):
        self.boundary(request)
        token = request.cookies.get(COOKIE, "")
        occurrences = sum(
            part.partition("=")[0].strip() == COOKIE
            for header in request.headers.getlist("cookie")
            for part in header.split(";")
        )
        if (
            not token
            or occurrences != 1
            or len(token) > 128
            or self.session_digest is None
            or self.now() >= self.session_expires
            or not secrets.compare_digest(self.digest(token), self.session_digest)
        ):
            raise HTTPException(401, "LOCAL_OPERATOR_SESSION_REQUIRED")
        return LocalOperator()

    def exchange(self, token):
        if (
            not isinstance(token, str)
            or not token
            or len(token) > 128
            or self.bootstrap_digest is None
            or self.now() >= self.bootstrap_expires
            or not secrets.compare_digest(self.digest(token), self.bootstrap_digest)
        ):
            raise HTTPException(401, "LOCAL_OPERATOR_BOOTSTRAP_INVALID")
        # No await separates validation and consumption; a token is used once.
        self.bootstrap_digest = None
        session_token = secrets.token_urlsafe(32)
        self.session_digest = self.digest(session_token)
        self.session_expires = self.now() + SESSION_SECONDS
        return session_token


def create_local_app(
    settings=None,
    *,
    bootstrap_token=None,
    now=time.monotonic,
    provider=None,
    handler=converse,
):
    settings = settings or Settings()
    if not budget.operator_local_database(settings):
        raise ValueError("Local preview requires a loopback Pongdang database")
    settings = settings.model_copy(update={"api_root_path": ""})
    access = LocalAccess(bootstrap_token or secrets.token_urlsafe(32), now=now)

    def chat_factory(settings):
        local_provider = provider or ResponsesProvider(settings)

        async def operator_handler(settings, body, _actor, provider):
            return await handler(
                settings,
                body,
                "local-operator",
                provider,
                budget_api=OperatorAccounting,
            )

        def local_status(settings):
            return {**availability(settings), "auth_mode": "local_operator"}

        return _create_authorized_chat_router(
            settings,
            auth=access.authenticate,
            provider=local_provider,
            handler=operator_handler,
            status_factory=local_status,
        )

    app = create_app(settings, chat_factory=chat_factory)

    @app.middleware("http")
    async def private_local_responses(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith(("/api/local/", "/api/data/ai/")):
            response.headers.update(SECURITY_HEADERS)
        return response

    @app.get("/api/local/start", include_in_schema=False)
    async def start(request: Request):
        access.boundary(request)
        return HTMLResponse(
            '<!doctype html><html lang="ko"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>Pongdang 로컬 실행</title><body><p id="status">'
            "로컬 AI 실행 권한을 확인하고 있습니다.</p><script>"
            + SCRIPT
            + "</script></body></html>",
            headers=SECURITY_HEADERS,
        )

    @app.post("/api/local/session", include_in_schema=False)
    async def session(request: Request):
        access.boundary(request)
        if (
            request.headers.get("content-type", "").split(";", 1)[0]
            != "application/json"
        ):
            raise HTTPException(415, "LOCAL_OPERATOR_JSON_REQUIRED")
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 1024:
                raise HTTPException(413, "LOCAL_OPERATOR_INPUT_LIMIT")
        try:
            value = json.loads(body)
        except ValueError, UnicodeError:
            raise HTTPException(400, "LOCAL_OPERATOR_BOOTSTRAP_INVALID") from None
        if not isinstance(value, dict) or set(value) != {"token"}:
            raise HTTPException(400, "LOCAL_OPERATOR_BOOTSTRAP_INVALID")
        token = access.exchange(value["token"])
        response = JSONResponse({"status": "ready"}, headers=SECURITY_HEADERS)
        response.set_cookie(
            COOKIE,
            token,
            max_age=SESSION_SECONDS,
            expires=datetime.now(UTC) + timedelta(seconds=SESSION_SECONDS),
            path=COOKIE_PATH,
            httponly=True,
            samesite="strict",
        )
        return response

    return app


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--session-file",
        required=True,
        type=Path,
        help="New private bootstrap JSON file",
    )
    args = parser.parse_args(argv)
    token = secrets.token_urlsafe(32)
    try:
        app = create_local_app(bootstrap_token=token)
        descriptor = os.open(
            args.session_file,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
            0o600,
        )
    except ValueError, OSError:
        print("Local preview could not start. Check the local DB and new session path.")
        return 1
    try:
        with os.fdopen(descriptor, "w") as handle:
            json.dump(
                {"bootstrap_url": ORIGIN + "/api/local/start#token=" + token}, handle
            )
        import uvicorn

        print(
            "Local AI preview: loopback only; private file: " + str(args.session_file)
        )
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=8000,
            proxy_headers=False,
            access_log=False,
        )
    finally:
        args.session_file.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
