"""KHOA APIs verified in September 2026; provider evidence, never safety scores.

The source station is retained even when it is outside the collection radius.
In particular, Mukho tide levels are not projected onto Gyeongpo beach.
"""

import hashlib
import math
from datetime import UTC, datetime, timedelta
from functools import partial
from urllib.parse import unquote
from zoneinfo import ZoneInfo

from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.ingestion.models import Reading, SourceBatch, Station, Value

KST = ZoneInfo("Asia/Seoul")
BASE = "https://apis.data.go.kr/1192136/"
ENDPOINTS = {
    "beach": "fcstBeachv2/GetFcstBeachApiServicev2",
    "surfing": "fcstSurfingv2/GetFcstSurfingApiServicev2",
    "mudflat": "fcstMudflatv2/GetFcstMudflatApiServicev2",
    "rip_current": "ripCurrent/GetRipCurrentApiService",
    "tide_recent": "dtRecent/GetDTRecentApiService",
    "buoy_recent": "twRecent/GetTWRecentApiService",
    "water_temperature": "surveyWaterTemp/GetSurveyWaterTempApiService",
    "tide_level": "surveyTideLevel/GetSurveyTideLevelApiService",
    "tide_extrema": "tideFcstHghLw/GetTideFcstHghLwApiService",
    "waves": "noonWave/GetNoonWaveApiService",
}
# Undocumented units stay empty. Known sentinels remain visible as source text.
MISSING = {"", "-", "--", "null", "none", "nan", "-999", "-9999"}
FIELDS = {
    "wtem": ("water_temperature", "°C"),
    "artmp": ("air_temperature", "°C"),
    "wspd": ("wind_speed", "m/s"),
    "wndrct": ("wind_direction", "degree"),
    "maxMmntWspd": ("wind_gust", "m/s"),
    "atmpr": ("air_pressure", "hPa"),
    "wvhgt": ("wave_height", "m"),
    "wvpd": ("wave_period", "s"),
    "wvdrct": ("wave_direction", "degree"),
    "maxWvhgt": ("maximum_wave_height", "m"),
    "maxWvpd": ("maximum_wave_period", "s"),
    "bscTdlvHgt": ("tide_level", "cm"),
    "slntQty": ("salinity", "psu"),
    "slnty": ("salinity", "psu"),
    "crdir": ("current_direction", "degree"),
}


def utcnow():
    return datetime.now(UTC)


def number(raw):
    if raw is None or str(raw).strip().lower() in MISSING:
        return None
    try:
        n = float(str(raw).strip())
        return n if math.isfinite(n) else None
    except ValueError, TypeError:
        return None


def value(name, raw, unit="", mode="observation"):
    missing = raw is None or str(raw).strip().lower() in MISSING | {
        "inf",
        "-inf",
        "+inf",
    }
    return Value(
        name=name,
        numeric_value=number(raw),
        text_value=None if raw is None else str(raw).strip()[:500],
        unit=unit,
        mode=mode,
        missing=missing,
    )


def source_time(raw):
    if raw is None:
        raise ProviderError("MISSING_SOURCE_TIME")
    s = str(raw).strip().replace(".", "-")
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%Y%m%d%H%M",
        "%Y%m%d",
    ):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=KST)
        except ValueError:
            continue
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=KST)
    except ValueError:
        raise ProviderError("INVALID_SOURCE_TIME") from None


def coordinate(raw, latitude=True):
    n = number(raw)
    limit = 90 if latitude else 180
    return n if n is not None and -limit <= n <= limit else None


def in_radius(station, settings):
    if station.latitude is None or station.longitude is None:
        return False
    lat1, lat2 = map(math.radians, (settings.collection_latitude, station.latitude))
    dlon = math.radians(station.longitude - settings.collection_longitude)
    a = math.sin((lat2 - lat1) / 2) ** 2
    a += math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    distance = 6371000 * 2 * math.asin(min(1, math.sqrt(a)))
    return distance <= settings.collection_radius_m


def unpack(payload):
    if not isinstance(payload, dict):
        raise ProviderError("INVALID_RESPONSE")
    gateway = payload.get("OpenAPI_ServiceResponse", {}).get("cmmMsgHeader", {})
    if gateway:
        raise ProviderError("PROVIDER_" + str(gateway.get("returnReasonCode", "ERROR")))
    root = payload.get("response", payload)
    if not isinstance(root, dict):
        raise ProviderError("INVALID_RESPONSE")
    header = root.get("header", {})
    code = str(header.get("resultCode", ""))
    if code in {"03", "3"}:
        return [], 0
    if code not in {"0", "00", "0000"}:
        raise ProviderError("PROVIDER_" + (code or "MISSING_STATUS"))
    body = root.get("body")
    if not isinstance(body, dict):
        raise ProviderError("INVALID_RESPONSE_BODY")
    items = body.get("items") or {}
    rows = items.get("item", []) if isinstance(items, dict) else items
    rows = [rows] if isinstance(rows, dict) else rows or []
    if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        raise ProviderError("INVALID_RESPONSE_ITEMS")
    try:
        total = int(body.get("totalCount", len(rows)))
    except TypeError, ValueError:
        raise ProviderError("INVALID_TOTAL_COUNT") from None
    if total < len(rows) or total < 0:
        raise ProviderError("INVALID_TOTAL_COUNT")
    return rows, total


class RequestBudget:
    def __init__(self):
        self.used = 0

    def take(self):
        if self.used >= 10:
            raise ProviderError("REQUEST_BUDGET_EXCEEDED")
        self.used += 1


def unique_readings(readings):
    found = {}
    for reading in readings:
        if reading.source_id in found and found[reading.source_id] != reading:
            raise ProviderError("CONFLICTING_PROVIDER_RECORD")
        found[reading.source_id] = reading
    if len(found) > 5000:
        raise ProviderError("RECORD_LIMIT_EXCEEDED")
    return list(found.values())


class MarineProvider:
    def __init__(self, settings, client=None, clock=utcnow):
        self.settings = settings
        self.client = client or Client()
        self.clock = clock

    def _rows(self, kind, params, budget):
        key = self.settings.data_go_kr_key.get_secret_value()
        if not key:
            raise ProviderError("MISSING_CREDENTIAL")
        rows = []
        page = 1
        while True:
            budget.take()
            payload = self.client.get_json(
                BASE + ENDPOINTS[kind],
                {
                    "serviceKey": unquote(key),
                    "type": "json",
                    "numOfRows": 300,
                    "pageNo": page,
                    **params,
                },
            )
            part, total = unpack(payload)
            rows.extend(part)
            if len(rows) >= total:
                return rows
            if not part:
                raise ProviderError("INCOMPLETE_PAGINATION")
            page += 1

    def _station(self, row, code, kind):
        return Station(
            source_id=str(row.get("obsvtrId") or code),
            name=str(row.get("obsvtrNm") or code),
            kind=kind,
            latitude=coordinate(row.get("lat")),
            longitude=coordinate(row.get("lot"), False),
            datum="기관 조위 기준면; 절대표고·평균해수면 기준 미확인"
            if kind.startswith("tide")
            else "",
        )

    def fetch(self, kind):
        if kind not in ENDPOINTS:
            raise ProviderError("UNSUPPORTED_SERVICE")
        fetched = self.clock()
        budget = RequestBudget()
        if kind in {"beach", "surfing", "mudflat"}:
            readings = self._activity(kind, fetched, budget)
        elif kind == "tide_extrema":
            readings = self._extrema(fetched, budget)
        else:
            readings = self._observations(kind, fetched, budget)
        readings = unique_readings(readings)
        return SourceBatch(
            provider="khoa_" + kind,
            fetched_at=fetched,
            adapter_version="tide-event-slots.2" if kind == "tide_extrema" else "1",
            stations=list({r.station.source_id: r.station for r in readings}.values()),
            readings=readings,
        )

    def _observations(self, kind, fetched, budget):
        tide = kind in {"tide_recent", "tide_level", "water_temperature"}
        code = (
            getattr(self.settings, "khoa_tide_station_code", "DT_0006")
            if tide
            else getattr(self.settings, "khoa_buoy_station_code", "TW_0089")
        )
        params = {"obsCode": code, "min": 10}
        if kind == "rip_current":
            code = getattr(self.settings, "khoa_rip_beach_code", "GYEONGPO")
            params = {"beachCode": code}
        rows = []
        # Date selection is explicit; midnight can legitimately have no new row.
        for days_back in (0, 1):
            date = (fetched.astimezone(KST) - timedelta(days=days_back)).strftime(
                "%Y%m%d"
            )
            rows = self._rows(kind, {**params, "reqDate": date}, budget)
            if rows:
                break
        readings = []
        for row in rows:
            target = source_time(row.get("obsrvnDt"))
            station = self._station(row, code, "tide_station" if tide else kind)
            fields = dict(FIELDS)
            fields["crsp"] = ("current_speed", "m/s" if tide else "cm/s")
            if kind == "rip_current":
                fields.update(
                    {
                        "lastScr": ("official_rip_index", ""),
                        "lastScrCn": ("official_rip_message", ""),
                        "wndrct": ("wind_direction", "16-point"),
                    }
                )
            vals = [
                value(name, row[field], unit)
                for field, (name, unit) in fields.items()
                if field in row
            ]
            if vals and target <= fetched:
                readings.append(
                    Reading(
                        source_id=f"{station.source_id}:{target.isoformat()}:observation",
                        station=station,
                        observed_at=target,
                        valid_until=target + timedelta(minutes=30),
                        spatial_scope="기관 관측소 위치의 관측값",
                        values=vals,
                    )
                )
            # surveyTideLevel exposes actual AND predicted levels in one row.
            if kind == "tide_level" and "tdlvHgt" in row:
                readings.append(
                    Reading(
                        source_id=f"{station.source_id}:{target.isoformat()}:prediction",
                        station=station,
                        observed_at=target,
                        valid_until=target + timedelta(minutes=10),
                        spatial_scope="조위관측소 예측 조위; 해변 공간 보간 없음",
                        values=[value("tide_level", row["tdlvHgt"], "cm", "forecast")],
                    )
                )
        return readings

    def _extrema(self, fetched, budget):
        code = getattr(self.settings, "khoa_tide_station_code", "DT_0006")
        readings = []
        for offset in range(7):
            date = (fetched.astimezone(KST) + timedelta(days=offset)).strftime("%Y%m%d")
            rows = self._rows(
                "tide_extrema", {"obsCode": code, "reqDate": date}, budget
            )
            occurrences = {}
            for row in sorted(rows, key=lambda item: source_time(item.get("predcDt"))):
                target = source_time(row.get("predcDt"))
                station = self._station(row, code, "tide_station")
                raw_code = str(row.get("extrSe", ""))
                kind = {"1": "high", "2": "low", "3": "high", "4": "low"}.get(raw_code)
                local_day = target.astimezone(KST).date()
                key = (station.source_id, local_day, kind)
                occurrences[key] = occurrences.get(key, 0) + 1
                # Actual official responses may have two code=4 lows on one day.
                # Preserve that code but identify the chronological high/low slot.
                source_id = (
                    f"derived:{station.source_id}:{local_day}:extremum:{kind}:{occurrences[key]}"
                    if kind
                    else f"{station.source_id}:{target.isoformat()}:{raw_code}"
                )
                readings.append(
                    Reading(
                        source_id=source_id,
                        station=station,
                        observed_at=target,
                        valid_until=target + timedelta(minutes=1),
                        spatial_scope="기관 조위관측소 고조·저조 예측 사건; 시각은 KST",
                        values=[
                            value(
                                "tide_level", row.get("predcTdlvVl"), "cm", "forecast"
                            ),
                            value(
                                "tide_extremum_code", row.get("extrSe"), "", "forecast"
                            ),
                        ],
                    )
                )
        return readings

    def _activity(self, kind, fetched, budget):
        rows = self._rows(
            kind, {"reqDate": fetched.astimezone(KST).strftime("%Y%m%d")}, budget
        )
        names = {"beach": "bbchNm", "surfing": "surfPlcNm", "mudflat": "mdftExpcnVlgNm"}
        fields = {
            "maxWvhgt": ("maximum_wave_height", "m"),
            "avgWvhgt": ("wave_height", "m"),
            "avgWvpd": ("wave_period", "s"),
            "avgWtem": ("water_temperature", "°C"),
            "avgArtmp": ("air_temperature", "°C"),
            "maxWspd": ("maximum_wind_speed", "m/s"),
            "avgWspd": ("wind_speed", "m/s"),
            "minWspd": ("minimum_wind_speed", "m/s"),
            "minArtmp": ("minimum_air_temperature", "°C"),
            "maxArtmp": ("maximum_air_temperature", "°C"),
            "lastScr": ("official_activity_index", ""),
            "totalIndex": ("official_activity_grade", ""),
            "grdCn": ("surfing_skill", ""),
            "opnStat": ("opening_status", ""),
            "weather": ("weather", ""),
            "predcNoonSeCd": ("forecast_half_day", ""),
            "mdftExprnBgngTm": ("experience_start", ""),
            "mdftExprnEndTm": ("experience_end", ""),
        }
        readings = []
        for row in rows:
            name = str(row.get(names[kind]) or "")
            if not name:
                raise ProviderError("MISSING_STATION_NAME")
            # This endpoint does not return its placeCode. The prefix discloses
            # that identity is derived from the provider's name and coordinates.
            ident = (
                "named-"
                + hashlib.sha256(
                    f"{name}|{row.get('lat')}|{row.get('lot')}".encode()
                ).hexdigest()[:24]
            )
            station = Station(
                source_id=ident,
                name=name,
                kind=kind,
                latitude=coordinate(row.get("lat")),
                longitude=coordinate(row.get("lot"), False),
            )
            if not in_radius(station, self.settings):
                continue
            target = source_time(row.get("predcYmd"))
            half = str(row.get("predcNoonSeCd", ""))
            duration = timedelta(days=1)
            if half.upper() in {"AM", "오전", "PM", "오후"}:
                if half.upper() in {"PM", "오후"}:
                    target += timedelta(hours=12)
                duration = timedelta(hours=12)
            vals = [
                value(n, row[k], u, "forecast")
                for k, (n, u) in fields.items()
                if k in row
            ]
            if not vals:
                continue
            # Ambiguous half-day/time-window codes stay explicit source text;
            # no guessed issue time or unsupported fine temporal precision.
            suffix = hashlib.sha256(
                f"{half}|{row.get('grdCn')}|{row.get('mdftExprnBgngTm')}".encode()
            ).hexdigest()[:12]
            readings.append(
                Reading(
                    source_id=f"{ident}:{target.isoformat()}:{suffix}",
                    station=station,
                    observed_at=target,
                    valid_until=target + duration,
                    spatial_scope="기관 활동예보 지점·날짜/시간구분; 발표시각 미제공",
                    values=vals,
                )
            )
        return readings


def marine_jobs(settings):
    provider = MarineProvider(settings)
    enabled = bool(settings.data_go_kr_key.get_secret_value())
    return [
        Job(
            "khoa_" + kind,
            3600 if kind in {"beach", "surfing", "mudflat", "tide_extrema"} else 600,
            partial(provider.fetch, kind),
            enabled=enabled,
        )
        for kind in ENDPOINTS
    ]
