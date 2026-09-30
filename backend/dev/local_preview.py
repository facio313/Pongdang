"""Local login against an explicitly marked disposable DB; excluded from Docker.

Run from backend: .venv/bin/python dev/local_preview.py --config /absolute/file.json
This is a test identity provider, not a connection to production Bonifacio SSO.
"""

import argparse
import hashlib
import ipaddress
import json
import secrets
import socket
import sys
import time
from pathlib import Path

import psycopg
import uvicorn
from dotenv import dotenv_values
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

ORIGIN = "http://127.0.0.1:5173"
COOKIE = "pongdang_local_test"
SUBJECT = "local-test-user"
SESSION_SECONDS = 12 * 60 * 60
KAKAO_DIRECTIONS_HOST = "apis-navi.kakaomobility.com"
OPENAI_HOST = "api.openai.com"


def preview_settings(config, *, kakao_rest_api_key="", ai_api_key=""):
    if (
        config.get("kind") != "pongdang-isolated-local-preview-v1"
        or config.get("postgres_host") != "127.0.0.1"
        or config.get("postgres_db") != "pongdang_test"
        or not isinstance(config.get("postgres_port"), int)
        or config["postgres_port"] == 5432
        or not config.get("database_marker")
    ):
        raise ValueError("A marked, separate loopback pongdang_test is required")
    # Supply every value explicitly: neither .env nor inherited provider keys
    # can activate an integration in this process.
    values = {name: field.default for name, field in Settings.model_fields.items()}
    values.update(
        {
            key: config[key]
            for key in (
                "postgres_host",
                "postgres_port",
                "postgres_db",
                "postgres_user",
                "postgres_password",
                "attachment_root",
                "windy_thumbnail_root",
            )
        }
    )
    values.update(
        api_root_path="",
        sso_proxy_secret=secrets.token_urlsafe(48),
        sso_allowed_origins=ORIGIN,
        ai_provider="openai" if ai_api_key else "disabled",
        ai_api_key=ai_api_key,
        # Explicit AI previews share the existing durable accounting, with a
        # smaller local ceiling: at most 30 attempts and USD 0.60 per UTC day.
        ai_max_daily_calls=30,
        ai_daily_budget_microusd=600000,
        travel_route_provider="kakao" if kakao_rest_api_key else "disabled",
        kakao_rest_api_key=kakao_rest_api_key,
        notifications_provider="disabled",
        notifications_delivery_enabled=False,
        photo_collection_enabled=False,
        place_detail_collection_enabled=False,
    )
    return Settings(_env_file=None, **values)


def verify_database(settings, marker):
    with psycopg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password.get_secret_value(),
        connect_timeout=3,
        options="-c default_transaction_read_only=on -c statement_timeout=3000",
    ) as connection:
        row = connection.execute(
            "SELECT current_database(), inet_server_addr()::text, marker "
            "FROM local_preview.identity WHERE singleton"
        ).fetchone()
        if row != ("pongdang_test", "127.0.0.1/32", marker):
            raise ValueError("Local preview database identity does not match")


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class LocalSession:
    def __init__(self, username, password, *, now=time.monotonic):
        if not username or len(password) < 16:
            raise ValueError("Explicit local-only login credentials are required")
        self.username = username
        self.password_digest = self.digest(password)
        self.now = now
        self.sessions = {}
        self.failures = 0
        self.retry_at = 0.0

    @staticmethod
    def digest(value):
        return hashlib.sha256(value.encode()).digest()

    @staticmethod
    def boundary(request):
        if (
            not request.client
            or request.client.host != "127.0.0.1"
            or request.headers.get("host") != "127.0.0.1:5173"
        ):
            raise HTTPException(403, "LOCAL_TEST_BOUNDARY_REQUIRED")
        origin = request.headers.get("origin")
        if origin not in {None, ORIGIN} or (
            request.method not in {"GET", "HEAD", "OPTIONS"} and origin != ORIGIN
        ):
            raise HTTPException(403, "ORIGIN_NOT_ALLOWED")
        if request.headers.get("sec-fetch-site") not in {None, "none", "same-origin"}:
            raise HTTPException(403, "CROSS_SITE_REQUEST_REJECTED")

    def session(self, request):
        raw = request.cookies.get(COOKIE, "")
        occurrences = sum(
            part.partition("=")[0].strip() == COOKIE
            for header in request.headers.getlist("cookie")
            for part in header.split(";")
        )
        self.sessions = {
            token: expires
            for token, expires in self.sessions.items()
            if expires > self.now()
        }
        return bool(
            raw
            and len(raw) <= 128
            and occurrences == 1
            and self.digest(raw) in self.sessions
        )

    def login(self, credentials):
        if self.now() < self.retry_at:
            raise HTTPException(429, "LOCAL_TEST_LOGIN_RATE_LIMIT")
        if not (
            secrets.compare_digest(
                credentials.username.encode(), self.username.encode()
            )
            and secrets.compare_digest(
                self.digest(credentials.password), self.password_digest
            )
        ):
            self.failures += 1
            if self.failures >= 5:
                self.retry_at = self.now() + 30
            raise HTTPException(401, "SSO_INVALID_CREDENTIALS")
        self.failures = 0
        token = secrets.token_urlsafe(32)
        # This preview has one local test identity and one active session.
        self.sessions = {self.digest(token): self.now() + SESSION_SECONDS}
        return token


def create_preview_app(
    config, *, now=time.monotonic, kakao_rest_api_key="", ai_api_key=""
):
    settings = preview_settings(
        config, kakao_rest_api_key=kakao_rest_api_key, ai_api_key=ai_api_key
    )
    verify_database(settings, config["database_marker"])
    access = LocalSession(config["username"], config["password"], now=now)
    app = create_app(settings)

    @app.middleware("http")
    async def local_ingress(request, call_next):
        try:
            access.boundary(request)
        except HTTPException as error:
            return JSONResponse({"detail": error.detail}, error.status_code)
        # Never accept a caller's simulated SSO principal or a production cookie.
        request.scope["headers"] = [
            (name, value)
            for name, value in request.scope["headers"]
            if not name.lower().startswith(b"x-pongdang-sso-")
        ]
        if access.session(request):
            request.scope["headers"] += [
                (
                    b"x-pongdang-sso-token",
                    settings.sso_proxy_secret.get_secret_value().encode(),
                ),
                (b"x-pongdang-sso-subject", SUBJECT.encode()),
                (b"x-pongdang-sso-grants", b"access-pongdang"),
            ]
        response = await call_next(request)
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Pongdang-Environment"] = "isolated-local-test"
        return response

    @app.get("/api/auth/state", include_in_schema=False)
    async def state(request: Request):
        authenticated = access.session(request)
        return JSONResponse(
            {"authenticated": authenticated, "environment": "local_test"},
            200 if authenticated else 401,
        )

    @app.post("/api/auth/login", include_in_schema=False)
    async def login(body: Credentials):
        token = access.login(body)
        response = JSONResponse({"authenticated": True, "environment": "local_test"})
        response.set_cookie(
            COOKIE,
            token,
            max_age=SESSION_SECONDS,
            httponly=True,
            samesite="strict",
            path="/pongdang/",
        )
        return response

    @app.post("/api/auth/logout", include_in_schema=False)
    async def logout():
        access.sessions.clear()
        response = JSONResponse({"authenticated": False})
        response.delete_cookie(COOKIE, path="/pongdang/")
        return response

    return app


def read_kakao_route_key(path):
    """Opt in to one provider without importing any other environment settings."""
    values = dotenv_values(path, interpolate=False)
    key = (values.get("KAKAO_REST_API_KEY") or "").strip() or (
        values.get("KAKAO_REST_KEY") or ""
    ).strip()
    if not key:
        raise ValueError("The selected environment file has no Kakao REST key")
    return key


def resolve_kakao_addresses():
    return resolve_provider_addresses(KAKAO_DIRECTIONS_HOST)


def read_ai_key(path):
    """Import only the explicitly selected AI key, never production settings."""
    key = (dotenv_values(path, interpolate=False).get("AI_API_KEY") or "").strip()
    if not key:
        raise ValueError("The selected environment file has no AI API key")
    return key


def resolve_provider_addresses(hostname):
    addresses = frozenset(
        (row[4][0], 443)
        for row in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
    )
    if not addresses or any(
        not ipaddress.ip_address(host).is_global for host, _ in addresses
    ):
        raise ValueError("Provider must resolve to public HTTPS addresses")
    return addresses


def network_guard(
    database_port, *, kakao_addresses=frozenset(), openai_addresses=frozenset()
):
    destinations = {
        ("127.0.0.1", database_port),
        *kakao_addresses,
        *openai_addresses,
    }
    providers = {
        name
        for hostname, addresses in (
            (KAKAO_DIRECTIONS_HOST, kakao_addresses),
            (OPENAI_HOST, openai_addresses),
        )
        if addresses
        for name in (hostname, hostname.encode())
    }

    def audit(event, args):
        if event == "socket.getaddrinfo" and args[0] != "127.0.0.1":
            if not (args[0] in providers and args[1] == 443):
                raise PermissionError("External network is disabled in local testing")
        if event == "socket.connect":
            address = args[1]
            if not isinstance(address, tuple) or address[:2] not in destinations:
                raise PermissionError(
                    "Destination is outside the local preview allowlist"
                )

    return audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--port", type=int, default=18000)
    parser.add_argument(
        "--kakao-env",
        type=Path,
        help="Enable real Kakao directions using only the REST key in this file",
    )
    parser.add_argument(
        "--ai-env",
        type=Path,
        help="Opt in to real Luna calls using only AI_API_KEY in this file; "
        "limited to 30 attempts and USD 0.60 per UTC day",
    )
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    route_key = read_kakao_route_key(args.kakao_env) if args.kakao_env else ""
    ai_key = read_ai_key(args.ai_env) if args.ai_env else ""
    app = create_preview_app(config, kakao_rest_api_key=route_key, ai_api_key=ai_key)
    addresses = resolve_kakao_addresses() if route_key else frozenset()
    ai_addresses = resolve_provider_addresses(OPENAI_HOST) if ai_key else frozenset()
    sys.addaudithook(
        network_guard(
            config["postgres_port"],
            kakao_addresses=addresses,
            openai_addresses=ai_addresses,
        )
    )
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        proxy_headers=False,
        access_log=False,
    )


if __name__ == "__main__":
    main()
