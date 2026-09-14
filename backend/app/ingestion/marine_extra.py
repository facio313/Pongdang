"""Bounded KHOA tide, current and ROMS collection; no activity/safety inference.

Official September 2026 Swagger and attached HWP guides:
data.go.kr/data/{15156022,15155531,15156024,15142227}/openapi.do.
Tide is cm; HF current is cm/s and degrees; tidal-current predictions are
cm/s and 16-point compass text. ROMS guide specifies degrees, m/s and Celsius.
All source target times follow the existing KHOA KST adapter convention.
The APIs do not expose a forecast issuance timestamp: it stays unknown.
"""

import hashlib
import math
from datetime import timedelta
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal
from functools import partial
from urllib.parse import unquote

from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.ingestion.marine import (
    BASE,
    KST,
    coordinate,
    source_time,
    unique_readings,
    unpack,
    utcnow,
    value,
)
from app.ingestion.models import Reading, SourceBatch, Station

ENDPOINTS = {
    "tide_timeseries": "tideFcstTime/GetTideFcstTimeApiService",
    "hf_current": "hfCurrent/GetHFCurrentApiService",
    "current_timeseries": "crntFcstTime/GetCrntFcstTimeApiService",
    "roms": "roms/GetRomsApiService",
}
PAGE_SIZE = 100
MAX_ROWS = 5000
MAX_REQUESTS = 51  # 50 bounded pages, plus HF latest-time discovery.


class Budget:
    def __init__(self):
        self.used = 0

    def take(self):
        if self.used >= MAX_REQUESTS:
            raise ProviderError("REQUEST_BUDGET_EXCEEDED")
        self.used += 1


def grid_box(settings):
    """A bounded local ROMS rectangle, not a claim to cover the whole radius."""
    latitude = settings.collection_latitude
    longitude = settings.collection_longitude
    radius = settings.collection_radius_m
    # The official maximum is 1 degree per axis. A smaller 0.1 degree box
    # keeps a multi-day grid response practical under the 5000-row contract.
    dy = min(radius / 111_320, 0.05)
    dx = min(radius / (111_320 * max(0.01, math.cos(math.radians(latitude)))), 0.05)
    bounds = {
        "ymin": max(-90, latitude - dy),
        "ymax": min(90, latitude + dy),
        "xmin": max(-180, longitude - dx),
        "xmax": min(180, longitude + dx),
    }
    # Round inward so decimal normalization never widens configured coverage.
    return {
        name: float(
            Decimal(str(bound)).quantize(
                Decimal("0.00001"),
                rounding=ROUND_CEILING if name.endswith("min") else ROUND_FLOOR,
            )
        )
        for name, bound in bounds.items()
    }


def _point(row):
    lat, lon = coordinate(row.get("lat")), coordinate(row.get("lot"), False)
    if lat is None or lon is None:
        raise ProviderError("MISSING_OR_INVALID_COORDINATE")
    return lat, lon


def _grid_station(row, code, kind):
    lat, lon = _point(row)
    # HF's obsCode identifies an observing network, with hundreds of separate
    # spatial cells in its response. It is not one point to overwrite repeatedly.
    ident = f"derived:{code}:grid:{lat!r}:{lon!r}"
    return Station(
        source_id=ident,
        name=f"{row.get('obsvtrNm') or code} [{lat}, {lon}]",
        kind=kind,
        latitude=lat,
        longitude=lon,
    )


class MarineExtraProvider:
    def __init__(self, settings, client=None, clock=utcnow):
        self.settings = settings
        self.client = client or Client()
        self.clock = clock

    def _page(self, kind, params, page, budget, size=PAGE_SIZE):
        key = self.settings.data_go_kr_key.get_secret_value()
        if not key:
            raise ProviderError("MISSING_CREDENTIAL")
        budget.take()
        payload = self.client.get_json(
            BASE + ENDPOINTS[kind],
            {
                "serviceKey": unquote(key),
                "type": "json",
                "pageNo": page,
                "numOfRows": size,
                **params,
            },
        )
        rows, total = unpack(payload)
        if len(rows) > size:
            raise ProviderError("PAGE_LIMIT_EXCEEDED")
        return rows, total

    def _rows(self, kind, params, budget):
        rows, expected_total, pages = [], None, set()
        for page in range(1, MAX_ROWS // PAGE_SIZE + 1):
            part, total = self._page(kind, params, page, budget)
            if expected_total is not None and total != expected_total:
                raise ProviderError("UNSTABLE_PAGINATION")
            expected_total = total
            if not part and len(rows) < total:
                raise ProviderError("INCOMPLETE_PAGINATION")
            fingerprint = hashlib.sha256(repr(part).encode()).hexdigest()
            if part and fingerprint in pages:
                raise ProviderError("REPEATED_PAGE")
            pages.add(fingerprint)
            rows.extend(part)
            if len(rows) > total:
                raise ProviderError("INVALID_TOTAL_COUNT")
            if len(rows) == total:
                return rows, "complete"
            if len(part) != PAGE_SIZE:
                raise ProviderError("INCOMPLETE_PAGINATION")
        return rows, "bounded"

    def fetch(self, kind):
        if kind not in ENDPOINTS:
            raise ProviderError("UNSUPPORTED_SERVICE")
        fetched, budget = self.clock(), Budget()
        if kind == "hf_current":
            readings, coverage = self._current(fetched, budget)
        elif kind == "roms":
            readings, coverage = self._roms(fetched, budget)
        else:
            readings, coverage = self._timeseries(kind, fetched, budget)
        readings = unique_readings(readings)
        return SourceBatch(
            provider="khoa_" + kind,
            fetched_at=fetched,
            adapter_version="marine-extra.1",
            coverage=coverage,
            readings=readings,
            stations=list({r.station.source_id: r.station for r in readings}.values()),
        )

    def _timeseries(self, kind, fetched, budget):
        tide = kind == "tide_timeseries"
        code = (
            self.settings.khoa_tide_station_code
            if tide
            else self.settings.khoa_current_forecast_code
        )
        readings, coverage = [], "complete"
        # Explicit date avoids midnight-dependent pagination and identity. Today
        # plus six days matches the existing tide-extrema view at hourly targets.
        for offset in range(7):
            date = (fetched.astimezone(KST) + timedelta(days=offset)).date()
            rows, part_coverage = self._rows(
                kind,
                {"obsCode": code, "reqDate": date.strftime("%Y%m%d"), "min": 60},
                budget,
            )
            if part_coverage == "bounded":
                coverage = "bounded"
            for row in rows:
                target = source_time(row.get("predcDt"))
                if target.astimezone(KST).date() != date:
                    raise ProviderError("UNEXPECTED_TARGET_DATE")
                lat, lon = _point(row)
                station = Station(
                    source_id=code,
                    name=str(row.get("obsvtrNm") or code),
                    kind="tide_station" if tide else "tidal_current_forecast_point",
                    latitude=lat,
                    longitude=lon,
                    datum="기관 조위 기준면; 절대표고·평균해수면 기준 미확인"
                    if tide
                    else "",
                )
                vals = (
                    [value("tide_level", row.get("tdlvHgt"), "cm", "forecast")]
                    if tide
                    else [
                        value("current_speed", row.get("crsp"), "cm/s", "forecast"),
                        value(
                            "current_direction",
                            row.get("crdir"),
                            "16-point",
                            "forecast",
                        ).model_copy(update={"numeric_value": None}),
                    ]
                )
                readings.append(
                    Reading(
                        source_id=f"{code}:{target.isoformat()}:forecast",
                        station=station,
                        observed_at=target,
                        # This is an hourly sample, not an invented tide window.
                        valid_until=target + timedelta(hours=1),
                        spatial_scope=(
                            "기관 예보지점의 시계열 예측; KST; "
                            "발표시각 미제공; 해변 공간 보간 없음"
                        ),
                        values=vals,
                    )
                )
            if len(readings) > MAX_ROWS:
                raise ProviderError("RECORD_LIMIT_EXCEEDED")
        return readings, coverage

    def _current(self, fetched, budget):
        code = self.settings.khoa_current_station_code
        latest, _ = self._page("hf_current", {"obsCode": code}, 1, budget, size=1)
        if not latest:
            return [], "complete"
        target = source_time(latest[0].get("obsrvnDt"))
        if target > fetched:
            raise ProviderError("FUTURE_OBSERVATION")
        # Pin the actual provider hour, not the request/fetch hour. Fetching
        # pages of the mutable "latest" response can combine two grid snapshots.
        rows, coverage = self._rows(
            "hf_current",
            {"obsCode": code, "reqDate": target.astimezone(KST).strftime("%Y%m%d%H")},
            budget,
        )
        if not rows:
            raise ProviderError("INCOMPLETE_SNAPSHOT")
        readings = []
        for row in rows:
            row_time = source_time(row.get("obsrvnDt"))
            if row_time != target:
                raise ProviderError("UNEXPECTED_OBSERVATION_TIME")
            station = _grid_station(row, code, "hf_current_grid")
            readings.append(
                Reading(
                    source_id=f"{station.source_id}:{target.isoformat()}:observation",
                    station=station,
                    observed_at=target,
                    valid_until=target + timedelta(hours=1),
                    spatial_scope=(
                        f"기관 HF-RADAR {code}의 실제 격자 관측; KST; "
                        "활동 장소 연결 미검증"
                    ),
                    values=[
                        value("current_speed", row.get("crsp"), "cm/s"),
                        value("current_direction", row.get("crdir"), "degree"),
                    ],
                )
            )
        return readings, coverage

    def _roms(self, fetched, budget):
        box = grid_box(self.settings)
        # Five-place inward bounds succeeded in the September 2026 live check;
        # six-place and binary-float bounds received PROVIDER_10 for this area.
        # This is request compatibility, not a documented global precision cap.
        # Normalize only request bounds; keep returned source coordinates exact.
        params = {name: f"{bound:.5f}" for name, bound in box.items()}
        rows, coverage = self._rows("roms", params, budget)
        readings = []
        for row in rows:
            target = source_time(row.get("predcDt"))
            station = _grid_station(row, "ROMS", "marine_model_grid")
            # Do not silently put out-of-area source points on the requested map.
            if not (
                box["ymin"] <= station.latitude <= box["ymax"]
                and box["xmin"] <= station.longitude <= box["xmax"]
            ):
                raise ProviderError("OUTSIDE_REQUESTED_GRID")
            readings.append(
                Reading(
                    source_id=f"{station.source_id}:{target.isoformat()}:forecast",
                    station=station,
                    observed_at=target,
                    valid_until=target + timedelta(hours=1),
                    spatial_scope=(
                        "기관 ROMS 표층 격자 예측; KST; 발표시각 미제공; "
                        "수집 중심 최대 0.1도 사각형 일부 해역"
                    ),
                    values=[
                        value(
                            "current_direction", row.get("crdir"), "degree", "forecast"
                        ),
                        value("current_speed", row.get("crsp"), "m/s", "forecast"),
                        value("water_temperature", row.get("wtem"), "°C", "forecast"),
                    ],
                )
            )
        return readings, coverage


def marine_extra_jobs(settings):
    provider = MarineExtraProvider(settings)
    enabled = bool(settings.data_go_kr_key.get_secret_value())
    return [
        Job(
            "khoa_" + kind,
            3600 if kind == "hf_current" else 6 * 3600,
            partial(provider.fetch, kind),
            enabled=enabled,
        )
        for kind in ENDPOINTS
    ]
