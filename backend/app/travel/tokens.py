"""Short-lived owner-bound candidate order. No model-supplied rankings are trusted."""

import base64
import hmac
import json

from fastapi import HTTPException


def key(settings):
    secret = settings.sso_proxy_secret.get_secret_value()
    if len(secret) < 32:
        raise HTTPException(503, "AUTH_NOT_CONFIGURED")
    return hmac.digest(secret.encode(), b"pongdang-travel-selection.v1", "sha256")


def encode(settings, owner, request, ids, now, *, preference=None):
    payload = {
        "owner": hmac.digest(key(settings), owner.encode(), "sha256").hex(),
        "request": request.model_dump(mode="json"),
        "spot_ids": ids,
        "preference": preference.model_dump(mode="json")
        if preference is not None
        else None,
        "issued_at": int(now.timestamp()),
        "expires_at": int(now.timestamp()) + 1800,
    }
    raw = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode()
    body = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    return body + "." + hmac.digest(key(settings), body.encode(), "sha256").hex()


def decode(settings, owner, token, now):
    try:
        if len(token) > 16000:
            raise ValueError
        body, signature = token.split(".")
        expected = hmac.digest(key(settings), body.encode(), "sha256").hex()
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        subject = hmac.digest(key(settings), owner.encode(), "sha256").hex()
        if not hmac.compare_digest(data["owner"], subject):
            raise ValueError
        if not data["issued_at"] <= now.timestamp() < data["expires_at"]:
            raise ValueError
        return data
    except ValueError, KeyError, TypeError:
        raise HTTPException(422, "selection_token_invalid_or_expired") from None
