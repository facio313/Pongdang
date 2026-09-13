"""Bounded provider HTTP access. Never expose authenticated URLs or bodies."""

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.etree import ElementTree

HOSTS = {
    "apis.data.go.kr",
    "apihub.kma.go.kr",
    "dapi.kakao.com",
    "api.hrfco.go.kr",
    "www.hrfco.go.kr",
    "hrfco.go.kr",
}


class ProviderError(Exception):
    def __init__(self, code: str):
        self.code = code if code.replace("_", "").isalnum() else "PROVIDER_ERROR"
        super().__init__(self.code)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, timeout: float = 35, max_bytes: int = 4_000_000):
        self.timeout = timeout
        self.max_bytes = max_bytes

    def get_text(self, url, params=None, headers=None):
        parsed = urlsplit(url)
        if (
            parsed.scheme != "https"
            or parsed.hostname not in HOSTS
            or parsed.username
            or parsed.password
            or parsed.port not in (None, 443)
        ):
            raise ProviderError("ENDPOINT_NOT_ALLOWED")
        if params:
            url += ("&" if parsed.query else "?") + urlencode(params)
        try:
            request = Request(url, headers=headers or {})
            with build_opener(NoRedirect).open(
                request, timeout=self.timeout
            ) as response:
                payload = response.read(self.max_bytes + 1)
                if len(payload) > self.max_bytes:
                    raise ProviderError("RESPONSE_TOO_LARGE")
                encoding = response.headers.get_content_charset() or "utf-8"
                text = payload.decode(encoding)
        except HTTPError as exc:
            raise ProviderError(f"HTTP_{exc.code}") from None
        except URLError, TimeoutError, OSError, UnicodeError, LookupError:
            raise ProviderError("NETWORK_ERROR") from None
        if "<html" in text.lower() or "<!doctype html" in text.lower():
            raise ProviderError("UNEXPECTED_HTML")
        if "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" in text:
            raise ProviderError("SERVICE_NOT_AUTHORIZED")
        if text.lstrip().startswith("<"):
            try:
                root = ElementTree.fromstring(text)
                codes = {e.tag.split("}")[-1]: e.text for e in root.iter()}
                code = codes.get("returnReasonCode") or codes.get("resultCode")
                if code and code not in {"00", "0000", "0"}:
                    raise ProviderError("PROVIDER_" + code)
            except ElementTree.ParseError:
                raise ProviderError("INVALID_XML") from None
        return text

    def get_json(self, url, params=None, headers=None):
        text = self.get_text(url, params, headers)
        try:
            value = json.loads(text)
        except ValueError, TypeError:
            raise ProviderError("INVALID_JSON") from None
        if not isinstance(value, (dict, list)):
            raise ProviderError("INVALID_JSON_STRUCTURE")
        if isinstance(value, dict):
            gateway = value.get("OpenAPI_ServiceResponse", {}).get("cmmMsgHeader", {})
            root = value.get("response", value)
            header = root.get("header", {}) if isinstance(root, dict) else {}
            code = gateway.get("returnReasonCode") or header.get("resultCode")
            if code is not None and str(code) not in {"00", "0000", "0", "03"}:
                raise ProviderError("PROVIDER_" + str(code))
            if value.get("errorType") or value.get("error"):
                raise ProviderError("PROVIDER_ERROR")
        return value
