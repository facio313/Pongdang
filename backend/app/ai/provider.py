"""One bounded async Responses transport; no automatic retries or redirects."""

import json

import httpx

ENDPOINT = "https://api.openai.com/v1/responses"
MAX_RESPONSE_BYTES = 131072


class ProviderError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def encode_body(body):
    return json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()


class ResponsesProvider:
    def __init__(self, settings, *, transport=None):
        self.settings = settings
        self.client = httpx.AsyncClient(
            transport=transport,
            follow_redirects=False,
            trust_env=False,
            timeout=httpx.Timeout(settings.ai_timeout_seconds),
            limits=httpx.Limits(max_connections=2, max_keepalive_connections=2),
        )

    async def aclose(self):
        await self.client.aclose()

    async def respond(self, body):
        raw = bytearray()
        try:
            async with self.client.stream(
                "POST",
                ENDPOINT,
                content=encode_body(body),
                headers={
                    "Authorization": "Bearer "
                    + self.settings.ai_api_key.get_secret_value(),
                    "Content-Type": "application/json",
                },
            ) as response:
                async for chunk in response.aiter_bytes():
                    raw.extend(chunk)
                    if len(raw) > MAX_RESPONSE_BYTES:
                        raise ProviderError("ai_response_limit")
                status = response.status_code
            if status != 200:
                code = {
                    401: "ai_authentication_failed",
                    403: "ai_access_denied",
                    404: "ai_model_unavailable",
                    429: "ai_rate_limited",
                }.get(
                    status,
                    "ai_upstream_error" if status >= 500 else "ai_request_rejected",
                )
                if status == 429:
                    try:
                        if json.loads(raw).get("error", {}).get("code") in {
                            "insufficient_quota",
                            "billing_hard_limit_reached",
                        }:
                            code = "ai_quota_exhausted"
                    except ValueError, AttributeError, TypeError:
                        pass
                raise ProviderError(code)
            try:
                value = json.loads(raw)
            except ValueError:
                raise ProviderError("ai_invalid_json") from None
            if not isinstance(value, dict):
                raise ProviderError("ai_invalid_response")
            return value
        except httpx.TimeoutException:
            raise ProviderError("ai_timeout") from None
        except httpx.RequestError:
            raise ProviderError("ai_connection_failed") from None
