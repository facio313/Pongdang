"""Provider-specific public URL policy. No image tokens, redirects or streams.

Windy hosts/paths below are from official v3 examples and API responses (2026-09-15).
An API-supplied URL must pass this policy; we never manufacture a player URL.
"""

import re
from urllib.parse import parse_qsl, urlsplit

PLAYER_TYPES = {"live", "day", "month", "year", "lifetime"}


def windy_url(url: str, camera_id: str, *, player_type: str | None = None) -> str:
    if not re.fullmatch(r"[1-9][0-9]{0,19}", camera_id):
        raise ValueError("Invalid provider camera ID")
    if not isinstance(url, str) or len(url) > 1000 or re.search(r"[\s\\%]", url):
        raise ValueError("Invalid public URL")
    p = urlsplit(url)
    if (
        p.scheme != "https"
        or p.username is not None
        or p.password is not None
        or p.fragment
    ):
        raise ValueError("Unapproved Windy public URL")
    if player_type is None:
        if (
            p.netloc not in {"webcams.windy.com", "windy.com"}
            or p.path != f"/webcams/{camera_id}"
            or p.query
        ):
            raise ValueError("Unapproved Windy detail URL")
    else:
        query = parse_qsl(p.query, keep_blank_values=True)
        legacy = (
            p.path == "/webcams/public//player"
            and len(query) == 2
            and dict(query) == {"webcamId": camera_id, "playerType": player_type}
        )
        current = (
            p.path == f"/webcams/public/embed/player/{camera_id}/{player_type}"
            and not p.query
        )
        if (
            p.netloc != "webcams.windy.com"
            or player_type not in PLAYER_TYPES
            or not (legacy or current)
        ):
            raise ValueError("Unapproved Windy embed URL")
    return url


def optional_windy_url(value, camera_id, *, player_type=None):
    if not value:
        return None
    try:
        return windy_url(value, camera_id, player_type=player_type)
    except ValueError, TypeError:
        return None
