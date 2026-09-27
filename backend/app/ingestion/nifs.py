"""Bounded NIFS RISA surface observations with station/depth provenance.

Official contract: https://www.nifs.go.kr/openApi/actionOpenapiInfoList.do
Two requests per run; never infer a beach observation from station proximity.
"""

import math
import re
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.ingestion.models import Reading, SourceBatch, Station, Value

# The documented /OpenAPI_json redirects here on the same official HTTPS host.
# Call the verified destination directly; the shared client rejects redirects.
URL = "https://www.nifs.go.kr/api/OpenAPI_json"
KST = ZoneInfo("Asia/Seoul")
# RISA publishes every 30 minutes. This is our freshness window, not an
# upstream-issued expiry; retries never move it beyond the observation time.
VALIDITY = timedelta(minutes=60)


def _items(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("header"), dict):
        raise ProviderError("INVALID_NIFS_RESPONSE")
    if str(payload["header"].get("resultCode")) != "00":
        raise ProviderError("NIFS_PROVIDER_ERROR")
    body = payload.get("body")
    if not isinstance(body, dict) or "item" not in body:
        raise ProviderError("INVALID_NIFS_RESPONSE")
    rows = body["item"]
    if isinstance(rows, dict):
        rows = [rows]
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ProviderError("INVALID_NIFS_RESPONSE")
    if len(rows) > 5000:
        raise ProviderError("NIFS_RECORD_LIMIT")
    return rows


def _number(value):
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except TypeError, ValueError:
        return None


def _date(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=KST)
    except ValueError, TypeError:
        raise ProviderError("INVALID_NIFS_STATION_DATE") from None


class NifsProvider:
    def __init__(self, settings, client=None, clock=None):
        self.settings = settings
        self.client = client or Client()
        self.clock = clock or (lambda: datetime.now(UTC))

    def fetch(self):
        key = self.settings.nifs_api_key.get_secret_value().strip()
        if not key:
            raise ProviderError("KEY_NOT_CONFIGURED")
        codes = {
            code.strip()
            for code in self.settings.nifs_station_codes.split(",")
            if code.strip()
        }
        if not 1 <= len(codes) <= 20 or any(
            not re.fullmatch(r"[a-z0-9]{5}", code) for code in codes
        ):
            raise ProviderError("INVALID_STATION_CONFIGURATION")
        metadata = _items(
            self.client.get_json(
                URL, {"id": "risaCode", "key": key, "gru_nam": "E", "use_yn": "Y"}
            )
        )
        stations = {}
        for row in metadata:
            code = row.get("sta_cde")
            if code not in codes:
                continue
            latitude, longitude = _number(row.get("lat")), _number(row.get("lon"))
            depth = _number(row.get("sur_dep"))
            if (
                latitude is None
                or longitude is None
                or not -90 <= latitude <= 90
                or not -180 <= longitude <= 180
                or depth is None
                or depth < 0
                or row.get("sur_tmp_yn") != "Y"
                or not isinstance(row.get("sta_nam_kor"), str)
                or not row["sta_nam_kor"].strip()
            ):
                raise ProviderError("INVALID_NIFS_STATION_METADATA")
            station = Station(
                source_id=code,
                name=row["sta_nam_kor"].strip(),
                kind="sea_water_temperature",
                latitude=latitude,
                longitude=longitude,
                region="동해",
                source_valid_from=_date(row.get("bld_dat")),
                source_valid_until=_date(row.get("end_dat")),
            )
            record = (station, depth)
            if code in stations and stations[code] != record:
                raise ProviderError("CONFLICTING_NIFS_STATION")
            stations[code] = record
        if stations.keys() != codes:
            raise ProviderError("MISSING_NIFS_STATION_METADATA")
        observations = _items(self.client.get_json(URL, {"id": "risaList", "key": key}))
        fetched = self.clock()
        readings = {}
        for row in observations:
            code = row.get("sta_cde")
            # Mid/bottom layers have separate physical meaning, never a surface
            # fallback. Unconfigured stations stay outside this collection scope.
            if code not in stations or str(row.get("obs_lay")) != "1":
                continue
            try:
                observed = datetime.strptime(
                    f"{row['obs_dat']} {row['obs_tim']}", "%Y-%m-%d %H:%M:%S"
                ).replace(tzinfo=KST)
            except KeyError, ValueError, TypeError:
                raise ProviderError("INVALID_NIFS_OBSERVATION_TIME") from None
            if observed > fetched:
                raise ProviderError("FUTURE_NIFS_OBSERVATION")
            station, depth = stations[code]
            if (station.source_valid_from and observed < station.source_valid_from) or (
                station.source_valid_until and observed >= station.source_valid_until
            ):
                raise ProviderError("NIFS_OBSERVATION_OUTSIDE_STATION_PERIOD")
            # The live API spells this repair_gbn; its documentation also uses
            # repaire_gbn. Only explicit normal values are usable observations.
            repair = row.get("repair_gbn", row.get("repaire_gbn"))
            normal = str(repair) == "1" and row.get("rpr_yn") == "N"
            value = _number(row.get("wtr_tmp"))
            usable = normal and value is not None and -5 <= value <= 50
            identity = f"{code}:{observed.isoformat()}:surface"
            reading = Reading(
                source_id=identity,
                station=station,
                observed_at=observed,
                valid_until=observed + VALIDITY,
                spatial_scope=f"국립수산과학원 관측소 표층 · 측정 수심 {depth:g}m",
                values=[
                    Value(
                        name="water_temperature",
                        numeric_value=value if usable else None,
                        missing=not usable,
                        unit="degC",
                        text_value=None
                        if usable
                        else (
                            "station_maintenance_or_unknown"
                            if not normal
                            else "missing_or_invalid_temperature"
                        ),
                    ),
                    Value(
                        name="water_temperature_depth", numeric_value=depth, unit="m"
                    ),
                    Value(name="water_temperature_layer", text_value="surface"),
                ],
            )
            if identity in readings and readings[identity] != reading:
                raise ProviderError("CONFLICTING_NIFS_OBSERVATION")
            readings[identity] = reading
        return SourceBatch(
            provider="nifs_risa",
            adapter_version="1",
            fetched_at=fetched,
            stations=[s for s, _ in stations.values()],
            readings=list(readings.values()),
        )


def nifs_jobs(settings):
    enabled = bool(
        getattr(settings, "nifs_api_key", None)
        and settings.nifs_api_key.get_secret_value().strip()
    )
    return [Job("nifs_risa", 1800, NifsProvider(settings).fetch, enabled)]
