"""KMA public evidence adapters, independent of storage and presentation.

Portal: data.go.kr services 15084084, 15059468, 15000415.
Hub: apihub.kma.go.kr/apiList.do?seqApi=2 (AWS), seqApi=3 (buoys).
KMA category codes and hub column names are retained in metric text_value.
"""

import math
import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from functools import partial
from urllib.parse import unquote
from zoneinfo import ZoneInfo

from app.config import Settings
from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.ingestion.models import Reading, SourceBatch, Station, Value, Warning

KST = ZoneInfo("Asia/Seoul")
PORTAL = "https://apis.data.go.kr/1360000/"
HUB = "https://apihub.kma.go.kr/api/typ01/"
CATEGORIES = {
    "T1H": ("air_temperature", "degC"),
    "TMP": ("air_temperature", "degC"),
    "TMN": ("minimum_air_temperature", "degC"),
    "TMX": ("maximum_air_temperature", "degC"),
    "REH": ("relative_humidity", "%"),
    "RN1": ("precipitation", "mm/1h"),
    "PCP": ("precipitation", "mm/1h"),
    "POP": ("precipitation_probability", "%"),
    "PTY": ("precipitation_type", "code"),
    "SKY": ("sky_condition", "code"),
    "UUU": ("eastward_wind", "m/s"),
    "VVV": ("northward_wind", "m/s"),
    "VEC": ("wind_direction", "degree"),
    "WSD": ("wind_speed", "m/s"),
    "WAV": ("wave_height", "m"),
    "SNO": ("snowfall", "cm/1h"),
    "LGT": ("lightning", "code"),
}
AWS_COLUMNS = {
    "WD1": ("wind_direction", "degree"),
    "WS1": ("wind_speed", "m/s"),
    "WDS": ("gust_direction", "degree"),
    "WSS": ("gust_speed", "m/s"),
    "WD10": ("wind_direction_10min", "degree"),
    "WS10": ("wind_speed_10min", "m/s"),
    "TA": ("air_temperature", "degC"),
    "RE": ("precipitation_detection", "code"),
    "RN-15m": ("precipitation_15min", "mm/15min"),
    "RN-60m": ("precipitation", "mm/1h"),
    "RN-12H": ("precipitation_12h", "mm/12h"),
    "RN-DAY": ("precipitation_day", "mm/day"),
    "HM": ("relative_humidity", "%"),
    "PA": ("station_pressure", "hPa"),
    "PS": ("sea_level_pressure", "hPa"),
    "TD": ("dew_point", "degC"),
}
BUOY_COLUMNS = {
    "WD1": ("wind_direction", "degree"),
    "WS1": ("wind_speed", "m/s"),
    "WS1_GST": ("gust_speed", "m/s"),
    "WD2": ("wind_direction_sensor2", "degree"),
    "WS2": ("wind_speed_sensor2", "m/s"),
    "WS2_GST": ("gust_speed_sensor2", "m/s"),
    "PA": ("sea_level_pressure", "hPa"),
    "HM": ("relative_humidity", "%"),
    "TA": ("air_temperature", "degC"),
    "TW": ("water_temperature", "degC"),
    "WH_MAX": ("maximum_wave_height", "m"),
    "WH_SIG": ("wave_height", "m"),
    "WH_AVE": ("average_wave_height", "m"),
    "WP": ("wave_period", "s"),
    "WO": ("wave_direction", "degree"),
}


def _now():
    return datetime.now(UTC)


def _secret(value):
    key = unquote(value.get_secret_value().strip())
    if not key:
        raise ProviderError("MISSING_CREDENTIAL")
    return key


def _time(date, clock="0000"):
    value = str(date) + str(clock).zfill(4)
    try:
        if value.endswith("2400"):
            return datetime.strptime(value[:8], "%Y%m%d").replace(
                tzinfo=KST
            ) + timedelta(days=1)
        return datetime.strptime(value, "%Y%m%d%H%M").replace(tzinfo=KST)
    except ValueError:
        raise ProviderError("INVALID_SOURCE_TIME") from None


def grid_coordinates(latitude, longitude):
    """KMA's published DFS Lambert projection, returning a 5 km grid cell."""
    rad = math.pi / 180
    sn = math.log(math.cos(30 * rad) / math.cos(60 * rad)) / math.log(
        math.tan(math.pi / 4 + 60 * rad / 2) / math.tan(math.pi / 4 + 30 * rad / 2)
    )
    sf = math.tan(math.pi / 4 + 30 * rad / 2) ** sn * math.cos(30 * rad) / sn
    ro = 6371.00877 / 5 * sf / math.tan(math.pi / 4 + 38 * rad / 2) ** sn
    ra = 6371.00877 / 5 * sf / math.tan(math.pi / 4 + latitude * rad / 2) ** sn
    theta = (longitude - 126) * rad * sn
    return math.floor(ra * math.sin(theta) + 43.5), math.floor(
        ro - ra * math.cos(theta) + 136.5
    )


def _value(code, raw, mapping, mode, hub=False):
    name, unit = mapping[code]
    text = "" if raw is None else str(raw).strip()
    number = None
    missing = not text
    try:
        candidate = float(text)
        missing = not math.isfinite(candidate) or (
            candidate <= -50 if hub else candidate in {-999, -998, -9999}
        )
        if not missing:
            number = candidate
    except ValueError, TypeError:
        pass
    return Value(
        name=name,
        numeric_value=number,
        text_value=f"{code}={text}",
        missing=missing,
        unit=unit,
        mode=mode,
    )


def _paged(client, endpoint, params, page_size=1000, max_pages=4):
    """Fail a truncated/inconsistent collection instead of committing a partial page."""
    result = []
    for page in range(1, max_pages + 1):
        payload = client.get_json(
            PORTAL + endpoint,
            {**params, "dataType": "JSON", "pageNo": page, "numOfRows": page_size},
        )
        try:
            root = payload["response"]
            code = str(root["header"]["resultCode"])
            if code == "03":
                if result:
                    raise ProviderError("INCONSISTENT_PAGINATION")
                return []
            if code not in {"00", "0", "0000"}:
                raise ProviderError("SOURCE_ERROR")
            body = root["body"]
            items = body.get("items") or []
            if isinstance(items, dict):
                items = items.get("item") or []
            if isinstance(items, dict):
                items = [items]
            total = int(body["totalCount"])
            if not isinstance(items, list) or not all(
                isinstance(x, dict) for x in items
            ):
                raise ProviderError("INVALID_SOURCE_ITEMS")
        except KeyError, TypeError, ValueError:
            raise ProviderError("INVALID_SOURCE_STRUCTURE") from None
        result.extend(items)
        if len(result) >= total:
            return result
        if not items:
            raise ProviderError("INCONSISTENT_PAGINATION")
    raise ProviderError("PAGINATION_LIMIT")


def _issue(now, kind):
    cutoff = now.astimezone(KST) - timedelta(hours=1)
    if kind == "nowcast":
        return cutoff.replace(minute=0, second=0, microsecond=0)
    if kind == "ultra_forecast":
        if cutoff.minute < 30:
            cutoff -= timedelta(hours=1)
        return cutoff.replace(minute=30, second=0, microsecond=0)
    hours = [6, 18] if kind == "mid_forecast" else list(range(2, 24, 3))
    candidates = [
        (cutoff - timedelta(days=day)).replace(
            hour=hour, minute=0, second=0, microsecond=0
        )
        for day in (0, 1)
        for hour in hours
    ]
    return max(t for t in candidates if t <= cutoff)


def _grid(settings, kind):
    issued = _issue(_now(), kind)
    nx, ny = grid_coordinates(
        settings.collection_latitude, settings.collection_longitude
    )
    operation = {
        "nowcast": "getUltraSrtNcst",
        "ultra_forecast": "getUltraSrtFcst",
        "short_forecast": "getVilageFcst",
    }[kind]
    rows = _paged(
        Client(),
        "VilageFcstInfoService_2.0/" + operation,
        {
            "serviceKey": _secret(settings.data_go_kr_key),
            "base_date": issued.strftime("%Y%m%d"),
            "base_time": issued.strftime("%H%M"),
            "nx": nx,
            "ny": ny,
        },
    )
    station = Station(
        source_id=f"kma-grid-{nx}-{ny}",
        name=f"기상청 5km 격자 {nx},{ny}",
        kind="weather_forecast_grid",
    )
    grouped = defaultdict(dict)
    mode = "observation" if kind == "nowcast" else "forecast"
    for row in rows:
        code = row.get("category")
        if code not in CATEGORIES:
            continue
        source_issue = _time(row["baseDate"], row["baseTime"])
        target = (
            source_issue
            if mode == "observation"
            else _time(row["fcstDate"], row["fcstTime"])
        )
        value = _value(
            code,
            row.get("obsrValue" if mode == "observation" else "fcstValue"),
            CATEGORIES,
            mode,
        )
        group = grouped[(source_issue, target)]
        if value.name in group:
            raise ProviderError("DUPLICATE_SOURCE_METRIC")
        group[value.name] = value
    readings = [
        Reading(
            source_id=f"{operation}:{nx}:{ny}:{issue:%Y%m%d%H%M}:{target:%Y%m%d%H%M}",
            station=station,
            observed_at=target,
            issued_at=issue if mode == "forecast" else None,
            valid_until=target + timedelta(hours=2 if mode == "observation" else 1),
            spatial_scope="KMA 5 km grid; representative weather, not beach conditions",
            values=list(values.values()),
        )
        for (issue, target), values in sorted(grouped.items())
    ]
    return SourceBatch(
        provider="kma_" + kind, fetched_at=_now(), stations=[station], readings=readings
    )


def _mid(settings):
    issued = _issue(_now(), "mid_forecast")
    rows = _paged(
        Client(),
        "MidFcstInfoService/getMidFcst",
        {
            "serviceKey": _secret(settings.data_go_kr_key),
            "stnId": 108,
            "tmFc": issued.strftime("%Y%m%d%H%M"),
        },
        page_size=1,
        max_pages=1,
    )
    station = Station(
        source_id="kma-mid-108", name="기상청 전국 중기전망", kind="region"
    )
    readings = []
    for row in rows:
        text = str(row.get("wfSv") or "").strip()
        if not text or len(text) > 10000:
            raise ProviderError("INVALID_MID_FORECAST")
        readings.append(
            Reading(
                source_id=f"getMidFcst:108:{issued:%Y%m%d%H%M}",
                station=station,
                observed_at=issued,
                issued_at=issued,
                valid_until=issued + timedelta(hours=12),
                spatial_scope="KMA national medium-range outlook bulletin",
                values=[
                    Value(
                        name=f"weather_outlook_part_{i // 500 + 1}",
                        text_value=text[i : i + 500],
                        mode="forecast",
                    )
                    for i in range(0, len(text), 500)
                ],
            )
        )
    return SourceBatch(
        provider="kma_mid_forecast",
        fetched_at=_now(),
        stations=[station],
        readings=readings,
    )


def _warnings(settings):
    now = _now().astimezone(KST)
    rows = _paged(
        Client(),
        "WthrWrnInfoService/getWthrWrnList",
        {
            "serviceKey": _secret(settings.data_go_kr_key),
            "stnId": 108,
            "fromTmFc": (now - timedelta(days=3)).strftime("%Y%m%d"),
            "toTmFc": now.strftime("%Y%m%d"),
        },
        page_size=100,
        max_pages=4,
    )
    warnings = []
    for row in rows:
        stamp = str(row["tmFc"])
        issued = _time(stamp[:8], stamp[8:])
        warnings.append(
            Warning(
                source_id=f"{row['stnId']}:{issued:%Y%m}:{row['tmSeq']}:{stamp}",
                issued_at=issued,
                title=str(row["title"]),
                region=f"발표관서 {row['stnId']} (대상구역은 통보문 참조)",
                kind="weather_warning_bulletin",
                status="bulletin",
            )
        )
    return SourceBatch(provider="kma_warnings", fetched_at=_now(), warnings=warnings)


def _hub_rows(text):
    """Require complete framing; a lone START marker was observed on failed queries."""
    if "#START7777" not in text or "#7777END" not in text:
        raise ProviderError("INCOMPLETE_HUB_RESPONSE")
    columns = None
    result = []
    for line in text.splitlines():
        line = line.strip()
        fields = re.split(r"[\s,]+", line.lstrip("#").strip())
        if line.startswith("#"):
            if len(fields) > 2 and fields[0] in {"YYMMDDHHMI", "TM"}:
                columns = fields
                # The buoy's two-line display header repeats WS1/WS2 for gusts
                # and WH for max/significant/average heights. The documented
                # column order disambiguates these before converting to a dict.
                if fields[1:] == [
                    "STN",
                    "WD1",
                    "WS1",
                    "WS1",
                    "WD2",
                    "WS2",
                    "WS2",
                    "PA",
                    "HM",
                    "TA",
                    "TW",
                    "WH",
                    "WH",
                    "WH",
                    "WP",
                    "WO",
                ]:
                    columns = [fields[0], "STN", *BUOY_COLUMNS]
                if len(set(columns)) != len(columns):
                    raise ProviderError("AMBIGUOUS_HUB_COLUMNS")
            continue
        if not line:
            continue
        if not columns or len(fields) != len(columns):
            raise ProviderError("INVALID_HUB_COLUMNS")
        if not re.fullmatch(r"\d{12}", fields[0]):
            raise ProviderError("INVALID_HUB_ROW")
        result.append(dict(zip(columns, fields, strict=True)))
        if len(result) > 1000:
            raise ProviderError("HUB_ROW_LIMIT")
    if not columns:
        raise ProviderError("MISSING_HUB_HEADER")
    return result


def _hub(settings, kind):
    key = _secret(settings.kma_api_hub_key)
    aws = kind == "aws"
    station_ids = settings.aws_stations.split(",") if aws else ["22105"]
    station_ids = list(dict.fromkeys(s.strip() for s in station_ids if s.strip()))
    if not 1 <= len(station_ids) <= 10 or any(
        not re.fullmatch(r"[1-9]\d{1,4}", s) for s in station_ids
    ):
        raise ProviderError("INVALID_STATION_CONFIGURATION")
    stations, readings = {}, []
    client = Client()
    for station_id in station_ids:
        params = {"authKey": key, "stn": station_id, "help": 0}
        if aws:
            # Explicit past timestamps returned only START; current tm2=0 was verified.
            params.update(tm2=0, disp=0)
        path = "cgi-bin/url/nph-aws2_min" if aws else "url/kma_buoy.php"
        for row in _hub_rows(client.get_text(HUB + path, params)):
            if row.get("STN") != station_id:
                raise ProviderError("UNEXPECTED_HUB_STATION")
            stamp = row.get("YYMMDDHHMI", row.get("TM", ""))
            observed = _time(stamp[:8], stamp[8:])
            station = Station(
                source_id=station_id,
                name=f"기상청 {'AWS' if aws else '해양부이'} {station_id}",
                kind="weather_station" if aws else "marine_buoy",
            )
            stations[station_id] = station
            mapping = AWS_COLUMNS if aws else BUOY_COLUMNS
            values = [
                _value(code, row[code], mapping, "observation", hub=True)
                for code in mapping
                if code in row
            ]
            if not values:
                raise ProviderError("MISSING_HUB_METRICS")
            readings.append(
                Reading(
                    source_id=f"{station_id}:{stamp}",
                    station=station,
                    observed_at=observed,
                    valid_until=observed + timedelta(minutes=20 if aws else 90),
                    spatial_scope="KMA station observation; location unverified",
                    values=values,
                )
            )
    return SourceBatch(
        provider="kma_" + kind,
        fetched_at=_now(),
        adapter_version="1" if aws else "2",
        stations=list(stations.values()),
        readings=readings,
    )


def weather_jobs(settings: Settings) -> list[Job]:
    public = bool(settings.data_go_kr_key.get_secret_value().strip())
    hub = bool(settings.kma_api_hub_key.get_secret_value().strip())
    return [
        Job("kma_nowcast", 600, partial(_grid, settings, "nowcast"), public),
        Job(
            "kma_ultra_forecast",
            1800,
            partial(_grid, settings, "ultra_forecast"),
            public,
        ),
        Job(
            "kma_short_forecast",
            3600,
            partial(_grid, settings, "short_forecast"),
            public,
        ),
        Job("kma_mid_forecast", 3600, partial(_mid, settings), public),
        Job("kma_warnings", 600, partial(_warnings, settings), public),
        Job("kma_aws", 300, partial(_hub, settings, "aws"), hub),
        Job("kma_buoy", 600, partial(_hub, settings, "buoy"), hub),
    ]
