"""Owner-bound receipts let explicit saves retain server-calculated road evidence."""

import base64
import hmac
import json
import zlib

from fastapi import HTTPException

from app.travel import tokens

MAX_TOKEN_LENGTH = 750_000
MAX_SNAPSHOT_BYTES = 8_000_000


def plan_contract(body):
    return {
        "request": body.request.model_dump(mode="json"),
        "stops": [stop.model_dump(mode="json") for stop in body.stops],
    }


def signing_key(settings):
    return hmac.digest(tokens.key(settings), b"pongdang-saved-route.v1", "sha256")


def encode(settings, owner, body, result, now):
    payload = {
        "owner": hmac.digest(signing_key(settings), owner.encode(), "sha256").hex(),
        "plan": plan_contract(body),
        "issued_at": int(now.timestamp()),
        "expires_at": int(now.timestamp()) + 1800,
        "snapshot": {
            name: result[name]
            for name in (
                "contract_version",
                "status",
                "route_calculated",
                "reason_codes",
                "queried_at",
                "optimality",
                "route",
            )
        },
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    if len(raw) > MAX_SNAPSHOT_BYTES:
        raise HTTPException(422, "route_snapshot_too_large")
    compressed = base64.urlsafe_b64encode(zlib.compress(raw)).decode().rstrip("=")
    signature = hmac.digest(signing_key(settings), compressed.encode(), "sha256").hex()
    receipt = compressed + "." + signature
    if len(receipt) > MAX_TOKEN_LENGTH:
        raise HTTPException(422, "route_snapshot_too_large")
    return receipt


def decode(settings, owner, body, now):
    try:
        receipt = body.route_token
        if not receipt or len(receipt) > MAX_TOKEN_LENGTH:
            raise ValueError
        encoded, signature = receipt.split(".")
        expected = hmac.digest(signing_key(settings), encoded.encode(), "sha256").hex()
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        compressed = base64.b64decode(
            encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True
        )
        decoder = zlib.decompressobj()
        raw = decoder.decompress(compressed, MAX_SNAPSHOT_BYTES + 1)
        if len(raw) > MAX_SNAPSHOT_BYTES or not decoder.eof or decoder.unused_data:
            raise ValueError
        payload = json.loads(raw)
        subject = hmac.digest(signing_key(settings), owner.encode(), "sha256").hex()
        if not hmac.compare_digest(payload["owner"], subject) or payload[
            "plan"
        ] != plan_contract(body):
            raise ValueError
        if not payload["issued_at"] <= now.timestamp() < payload["expires_at"]:
            raise HTTPException(410, "route_snapshot_expired")
        return payload["snapshot"]
    except ValueError, KeyError, TypeError, zlib.error:
        raise HTTPException(422, "route_snapshot_invalid") from None


def attach(plan, snapshot):
    """Keep historical estimates and evidence; saving never calls a provider."""
    route = snapshot["route"]
    legs = [
        {
            **leg,
            "duration_minutes": saved["duration_minutes"],
            "status": "estimated",
            "evidence": saved["evidence"],
            "geometry": saved.get("geometry"),
        }
        for leg, saved in zip(plan.legs, route["legs"], strict=True)
    ]
    items = iter(route["items"])
    index = 0
    for day in plan.days:
        for item in day["items"]:
            saved = next(items)
            item.update(
                arrival_at=saved["arrival_at"],
                departure_at=saved["departure_at"],
                previous_leg=legs[index],
            )
            index += 1
        day["return_at"] = route["return_at"]
    return plan.model_copy(
        update={
            "legs": legs,
            "route_snapshot": snapshot,
            "route_status": "saved_estimate",
            "unresolved": [
                reason
                for reason in plan.unresolved
                if reason
                not in {
                    "route_provider_unconfigured",
                    "travel_time_unknown",
                    "return_time_unknown",
                }
            ],
        }
    )
