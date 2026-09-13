"""Fail-closed bridge to Bonifacio SSO; no local users, sessions or passwords.

The reviewed TLS ingress must overwrite all X-Pongdang-SSO-* headers with
values from its successful auth_request. The shared token is server-only.
Public clients must never receive it. See the notifications handoff.
"""

import secrets
from dataclasses import dataclass

from fastapi import HTTPException, Request


@dataclass(frozen=True)
class Principal:
    subject: str
    grants: frozenset[str]
    email: str | None = None


def require_principal(settings):
    """Return a reusable dependency for owner-scoped A7/A8 APIs."""

    def authenticate(request: Request) -> Principal:
        configured = getattr(settings, "sso_proxy_secret", None)
        secret = configured.get_secret_value() if configured else ""
        if len(secret) < 32:
            raise HTTPException(503, detail="AUTH_NOT_CONFIGURED")
        token = request.headers.get("x-pongdang-sso-token", "")
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
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
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
        email = request.headers.get("x-pongdang-sso-email")
        if email and (len(email) > 254 or any(c in email for c in "\r\n")):
            raise HTTPException(401, detail="SSO_EMAIL_INVALID")
        return Principal(subject, grants, email)

    return authenticate
