"""Bounded Resend adapter with immutable idempotency keys and no redirects."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

from app.ingestion.http import NoRedirect

ENDPOINT = "https://api.resend.com/emails"


class DeliveryError(Exception):
    def __init__(self, code: str, *, retryable: bool = False):
        self.code = code
        self.retryable = retryable
        super().__init__(code)


def configuration_state(settings, channel="email"):
    if channel == "in_app":
        return "in_app"
    if not getattr(settings, "notifications_delivery_enabled", False):
        return "delivery_disabled"
    if getattr(settings, "notifications_provider", "disabled") != "resend":
        return "provider_not_configured"
    key = getattr(settings, "notifications_resend_api_key", None)
    if not key or not key.get_secret_value():
        return "credentials_not_configured"
    sender = getattr(settings, "notifications_from_email", "")
    if not sender or "@" not in sender or any(c in sender for c in "\r\n"):
        return "sender_not_configured"
    return "configured"


class ResendProvider:
    def __init__(self, settings, *, opener=None):
        self.settings = settings
        self.opener = opener or build_opener(NoRedirect)

    def send(self, event_id: str, message: dict) -> str:
        if configuration_state(self.settings) != "configured":
            raise DeliveryError("PROVIDER_NOT_CONFIGURED")
        request = Request(
            ENDPOINT,
            method="POST",
            data=json.dumps(message, ensure_ascii=False).encode(),
            headers={
                "Authorization": "Bearer "
                + self.settings.notifications_resend_api_key.get_secret_value(),
                "Content-Type": "application/json",
                "Idempotency-Key": "pongdang-temperature/" + event_id,
            },
        )
        try:
            with self.opener.open(request, timeout=10) as response:
                body = response.read(16_385)
                if len(body) > 16_384:
                    raise DeliveryError("PROVIDER_RESPONSE_TOO_LARGE", retryable=True)
                data = json.loads(body)
        except HTTPError as exc:
            raise DeliveryError(
                "PROVIDER_HTTP_" + str(exc.code),
                retryable=exc.code in {408, 409, 429} or exc.code >= 500,
            ) from None
        except URLError, OSError, TimeoutError:
            raise DeliveryError("PROVIDER_NETWORK_ERROR", retryable=True) from None
        except ValueError, UnicodeError:
            raise DeliveryError("PROVIDER_INVALID_RESPONSE", retryable=True) from None
        identifier = data.get("id") if isinstance(data, dict) else None
        if not isinstance(identifier, str) or not identifier or len(identifier) > 200:
            raise DeliveryError("PROVIDER_INVALID_RESPONSE", retryable=True)
        return identifier
