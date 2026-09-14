"""Official air, astronomy and KMA catalog/UV evidence, without local scores.

Contracts: data.go.kr 15073861, 15073877, 15012688, 15057111, 15085288.
AirKorea's published dmX/dmY examples are WGS84 latitude/longitude. Its
quality flags invalidate concentrations. UV V5's date is the issue time;
h0..h75 are three-hour forecast targets, not observed ultraviolet levels.
"""

import math
import re
from datetime import UTC, datetime, timedelta
from functools import partial
from urllib.parse import unquote
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.ingestion.models import Reading, SourceBatch, Station, Value

KST = ZoneInfo("Asia/Seoul")
PORTAL = "https://apis.data.go.kr/"
AIR_STATIONS = "B552584/MsrstnInfoInqireSvc/getMsrstnList"
AIR_OBSERVATIONS = "B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty"
ASTRONOMY = "B090041/openapi/service/RiseSetInfoService/getAreaRiseSetInfo"
FORECAST_ZONES = "1360000/FcstZoneInfoService/getFcstZoneCd"
UV = "1360000/LivingWthrIdxServiceV5/getUVIdxV5"
AIR_VALUES = {
    "so2Value": ("sulfur_dioxide", "ppm", "so2Flag"),
    "coValue": ("carbon_monoxide", "ppm", "coFlag"),
    "o3Value": ("ozone", "ppm", "o3Flag"),
    "no2Value": ("nitrogen_dioxide", "ppm", "no2Flag"),
    "pm10Value": ("pm10", "ug/m3", "pm10Flag"),
    "pm25Value": ("pm25", "ug/m3", "pm25Flag"),
}
AIR_GRADES = {
    "khaiValue": "airkorea_comprehensive_index",
    "khaiGrade": "airkorea_comprehensive_grade",
    "so2Grade": "airkorea_so2_grade",
    "coGrade": "airkorea_co_grade",
    "o3Grade": "airkorea_o3_grade",
    "no2Grade": "airkorea_no2_grade",
    "pm10Grade": "airkorea_pm10_24h_grade",
    "pm25Grade": "airkorea_pm25_24h_grade",
    "pm10Grade1h": "airkorea_pm10_1h_grade",
    "pm25Grade1h": "airkorea_pm25_1h_grade",
}
EVENTS = {
    "sunrise": "sunrise",
    "suntransit": "solar_transit",
    "sunset": "sunset",
    "moonrise": "moonrise",
    "moontransit": "lunar_transit",
    "moonset": "moonset",
    "civilm": "civil_dawn",
    "civile": "civil_dusk",
    "nautm": "nautical_dawn",
    "naute": "nautical_dusk",
    "astm": "astronomical_dawn",
    "aste": "astronomical_dusk",
}
MISSING = {"", "-", "--", "----", "--:--", "null", "-999", "-9999"}


def _now():
    return datetime.now(UTC)


def _secret(settings):
    value = unquote(settings.data_go_kr_key.get_secret_value().strip())
    if not value:
        raise ProviderError("MISSING_CREDENTIAL")
    return value


def _text(value):
    if value is None:
        return ""
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ProviderError("INVALID_SOURCE_VALUE")
    return str(value).strip()


def _required(row, key):
    value = _text(row.get(key))
    if not value or len(value) > 200:
        raise ProviderError("MISSING_SOURCE_IDENTITY")
    return value


def _names(settings):
    names = [x.strip() for x in settings.air_quality_station_names.split(",")]
    if (
        not 1 <= len(names) <= 10
        or any(not x or len(x) > 30 for x in names)
        or len(set(names)) != len(names)
    ):
        raise ProviderError("INVALID_AIR_STATION_SCOPE")
    return names


def _items(payload):
    """One complete, explicitly scoped page; no silent truncation or seed."""
    try:
        root = payload["response"]
        code = str(root["header"]["resultCode"])
        if code == "03":
            # Explicit no-data is valid only without contradictory records.
            body = root.get("body") or {}
            if body.get("totalCount") not in (None, "0", 0):
                raise ProviderError("INCONSISTENT_SOURCE_COUNT")
            if body.get("items") not in (
                None,
                "",
                [],
                {},
                {"item": []},
                {"item": None},
            ):
                raise ProviderError("INCONSISTENT_SOURCE_COUNT")
            return []
        if code not in {"00", "0000", "0"}:
            raise ProviderError("SOURCE_ERROR")
        body = root["body"]
        count = _text(body["totalCount"])
        if not count.isdigit():
            raise ProviderError("INVALID_SOURCE_COUNT")
        items = body.get("items")
        if items in (None, ""):
            items = []
        if isinstance(items, dict):
            items = items.get("item", [])
        if isinstance(items, dict):
            items = [items]
        if not isinstance(items, list) or not all(isinstance(x, dict) for x in items):
            raise ProviderError("INVALID_SOURCE_ITEMS")
        if len(items) != int(count):
            raise ProviderError("INCOMPLETE_SOURCE_PAGE")
        if len(items) > 100:
            raise ProviderError("SOURCE_PAGE_LIMIT")
        return items
    except KeyError, TypeError, AttributeError:
        raise ProviderError("INVALID_SOURCE_STRUCTURE") from None


def _json(client, path, params):
    return _items(
        client.get_json(PORTAL + path, {"pageNo": 1, "numOfRows": 100, **params})
    )


def _number(key, raw, name, unit, *, mode="observation", flag=""):
    text = _text(raw)
    missing = text in MISSING or bool(flag)
    number = None
    if not missing:
        try:
            number = float(text)
        except ValueError:
            raise ProviderError("INVALID_SOURCE_NUMBER") from None
        if not math.isfinite(number) or number < 0:
            raise ProviderError("INVALID_SOURCE_NUMBER")
    return Value(
        name=name,
        numeric_value=number,
        text_value=f"{key}={text}" + (f"; flag={flag}" if flag else ""),
        unit=unit,
        missing=missing,
        mode=mode,
    )


def _coordinate(row, key, limit):
    raw = _text(row.get(key))
    if raw in MISSING:
        return None
    try:
        value = float(raw)
    except ValueError:
        raise ProviderError("INVALID_SOURCE_COORDINATE") from None
    if not math.isfinite(value) or not -limit <= value <= limit:
        raise ProviderError("INVALID_SOURCE_COORDINATE")
    return value


def _air_station(client, key, name):
    rows = _json(
        client,
        AIR_STATIONS,
        {"serviceKey": key, "returnType": "json", "stationName": name},
    )
    # stationName is the provider's lookup identity, not an invented station ID.
    matches = [r for r in rows if _required(r, "stationName") == name]
    if not matches:
        return None
    if len(matches) != 1:
        raise ProviderError("AMBIGUOUS_AIR_STATION")
    row = matches[0]
    return Station(
        source_id=name,
        name=name,
        kind="air_quality_station",
        latitude=_coordinate(row, "dmX", 90),
        longitude=_coordinate(row, "dmY", 180),
        region=_text(row.get("addr")),
        datum="WGS84",
    )


def _air_time(raw):
    text = _text(raw)
    try:
        # AirKorea labels the midnight hourly value as the previous day's 24:00.
        if re.fullmatch(r"\d{4}-\d{2}-\d{2} 24:00", text):
            return datetime.strptime(text[:10], "%Y-%m-%d").replace(
                tzinfo=KST
            ) + timedelta(days=1)
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}", text):
            raise ValueError
        return datetime.strptime(text, "%Y-%m-%d %H:%M").replace(tzinfo=KST)
    except ValueError:
        raise ProviderError("INVALID_SOURCE_TIME") from None


def _air(settings, catalog_only=False):
    client, key = Client(), _secret(settings)
    stations, readings = [], []
    for name in _names(settings):
        station = _air_station(client, key, name)
        if station is None:
            if catalog_only:
                continue
            raise ProviderError("AIR_STATION_NOT_FOUND")
        stations.append(station)
        if catalog_only:
            continue
        rows = _json(
            client,
            AIR_OBSERVATIONS,
            {
                "serviceKey": key,
                "returnType": "json",
                "stationName": name,
                "dataTerm": "DAILY",
                "ver": "1.3",
            },
        )
        for row in rows:
            if "stationName" in row and _required(row, "stationName") != name:
                raise ProviderError("SOURCE_SCOPE_MISMATCH")
            target = _air_time(row.get("dataTime"))
            # At least one measured concentration field must be present; null
            # measurements remain missing, while malformed envelopes fail.
            if not any(k in row for k in AIR_VALUES):
                raise ProviderError("INCOMPLETE_AIR_OBSERVATION")
            values = [
                _number(k, row.get(k), metric, unit, flag=_text(row.get(flag)))
                for k, (metric, unit, flag) in AIR_VALUES.items()
            ]
            values.extend(
                _number(k, row[k], name, "index" if k == "khaiValue" else "code")
                for k, name in AIR_GRADES.items()
                if k in row
            )
            # The provider explicitly calls these 24h predicted moving values.
            for pollutant in ("pm10", "pm25"):
                field = pollutant + "Value24"
                if field in row:
                    values.append(
                        _number(
                            field,
                            row[field],
                            pollutant + "_24h_predicted_moving",
                            "ug/m3",
                            mode="forecast",
                            flag=_text(row.get(pollutant + "Flag")),
                        )
                    )
            if "mangName" in row:
                network = _text(row["mangName"])
                values.append(
                    Value(
                        name="airkorea_measurement_network",
                        text_value="mangName=" + network,
                        missing=not network,
                    )
                )
            readings.append(
                Reading(
                    source_id=f"{station.source_id}/{_required(row, 'dataTime')}",
                    station=station,
                    observed_at=target,
                    valid_until=target + timedelta(hours=1),
                    spatial_scope=f"airkorea:stationName={station.source_id}",
                    values=values,
                )
            )
    return SourceBatch(
        provider="AIRKOREA",
        fetched_at=_now(),
        catalog_only=catalog_only,
        stations=stations,
        readings=readings,
    )


def _forecast_zones(settings):
    code = settings.forecast_zone_code.strip()
    if not re.fullmatch(r"[A-Za-z0-9]{8}", code):
        raise ProviderError("INVALID_FORECAST_ZONE_SCOPE")
    rows = _json(
        Client(),
        FORECAST_ZONES,
        {"serviceKey": _secret(settings), "dataType": "JSON", "regId": code},
    )
    stations = []
    for row in rows:
        if _required(row, "regId") != code:
            raise ProviderError("SOURCE_SCOPE_MISMATCH")
        valid_from = _zone_time(row.get("tmSt"))
        valid_until = _zone_time(row.get("tmEd"))
        if valid_from and valid_until and valid_until <= valid_from:
            raise ProviderError("INVALID_SOURCE_TIME")
        stations.append(
            Station(
                source_id=code,
                name=_required(row, "regName"),
                kind="weather_forecast_zone",
                latitude=_coordinate(row, "lat", 90),
                longitude=_coordinate(row, "lon", 180),
                region=_text(row.get("regUp")),
                source_valid_from=valid_from,
                source_valid_until=valid_until,
            )
        )
    return SourceBatch(
        provider="KMA_FORECAST_ZONE",
        fetched_at=_now(),
        catalog_only=True,
        stations=stations,
    )


def _zone_time(raw):
    """Published catalog applicability, never a fabricated observation/issue."""
    text = _text(raw)
    if text in MISSING:
        return None
    try:
        if not re.fullmatch(r"\d{12}", text):
            raise ValueError
        return datetime.strptime(text, "%Y%m%d%H%M").replace(tzinfo=KST)
    except ValueError:
        raise ProviderError("INVALID_SOURCE_TIME") from None


def _xml_items(text):
    try:
        root = ElementTree.fromstring(text)
        # Namespaces do not alter the documented field identities.
        for node in root.iter():
            node.tag = node.tag.split("}")[-1]
        body = root.find("body")
        items = []
        for node in root.findall("./body/items/item"):
            keys = [child.tag for child in node]
            if len(set(keys)) != len(keys) or any(len(child) for child in node):
                raise ProviderError("INVALID_SOURCE_ITEMS")
            items.append({child.tag: child.text for child in node})
        return _items(
            {
                "response": {
                    "header": {"resultCode": root.findtext("./header/resultCode")},
                    "body": {
                        "totalCount": body.findtext("totalCount")
                        if body is not None
                        else None,
                        "items": items,
                    },
                }
            }
        )
    except ElementTree.ParseError:
        raise ProviderError("INVALID_XML") from None


def _astro_event(day, key, raw):
    text = _text(raw)
    missing = text in MISSING
    event = None
    if not missing:
        try:
            if text in {"2400", "240000"}:
                event = day + timedelta(days=1)
            else:
                fmt = "%H%M" if len(text) == 4 else "%H%M%S"
                if not re.fullmatch(r"\d{4}|\d{6}", text):
                    raise ValueError
                clock = datetime.strptime(text, fmt)
                event = day.replace(
                    hour=clock.hour, minute=clock.minute, second=clock.second
                )
        except ValueError:
            raise ProviderError("INVALID_ASTRONOMY_EVENT") from None
    return Value(
        name=EVENTS[key],
        text_value=f"{key}={text}"
        + (f"; event_at={event.isoformat()}" if event else ""),
        unit="KST",
        missing=missing,
        mode="forecast",
    )


def _astronomy(settings):
    location = settings.astronomy_location.strip()
    if not location or len(location) > 30:
        raise ProviderError("INVALID_ASTRONOMY_SCOPE")
    day = _now().astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = _xml_items(
        Client().get_text(
            PORTAL + ASTRONOMY,
            {
                "serviceKey": _secret(settings),
                "pageNo": 1,
                "numOfRows": 10,
                "locdate": day.strftime("%Y%m%d"),
                "location": location,
            },
        )
    )
    readings = []
    for row in rows:
        if _required(row, "location") != location or _required(
            row, "locdate"
        ) != day.strftime("%Y%m%d"):
            raise ProviderError("SOURCE_SCOPE_MISMATCH")
        if not all(k in row for k in EVENTS):
            raise ProviderError("INCOMPLETE_ASTRONOMY_EVENTS")
        # latitude/longitude are degree-minute strings, not decimal degrees.
        # The explicitly decimal *Num fields are used when the API supplies them.
        station = Station(
            source_id=location,
            name=f"{location} 출몰시각 기준점",
            kind="astronomy_location",
            latitude=_coordinate(row, "latitudeNum", 90),
            longitude=_coordinate(row, "longitudeNum", 180),
            region=location,
        )
        readings.append(
            Reading(
                source_id=f"{location}/{row['locdate']}",
                station=station,
                observed_at=day,
                valid_until=day + timedelta(days=1),
                spatial_scope=f"kasi:location={location}",
                values=[_astro_event(day, k, row[k]) for k in EVENTS],
            )
        )
    return SourceBatch(provider="KASI_RISE_SET", fetched_at=_now(), readings=readings)


def _uv_issue(now):
    # V5 publishes eight times/day. One hour is an adapter request delay;
    # only the provider's returned date is stored as the actual issue time.
    cutoff = now.astimezone(KST) - timedelta(hours=1)
    return cutoff.replace(hour=cutoff.hour // 3 * 3, minute=0, second=0, microsecond=0)


def _uv(settings):
    area = settings.uv_area_code.strip()
    if not re.fullmatch(r"\d{10}", area):
        raise ProviderError("INVALID_UV_AREA_SCOPE")
    requested_issue = _uv_issue(_now()).strftime("%Y%m%d%H")
    rows = _json(
        Client(),
        UV,
        {
            "serviceKey": _secret(settings),
            "dataType": "JSON",
            "areaNo": area,
            "time": requested_issue,
        },
    )
    readings = []
    for row in rows:
        if (
            _required(row, "areaNo") != area
            or _required(row, "date") != requested_issue
        ):
            raise ProviderError("SOURCE_SCOPE_MISMATCH")
        code = _required(row, "code")
        issued = datetime.strptime(row["date"], "%Y%m%d%H").replace(tzinfo=KST)
        if not all(f"h{hour}" in row for hour in range(0, 76, 3)):
            raise ProviderError("INCOMPLETE_UV_FORECAST")
        station = Station(
            source_id=area, name=f"기상청 UV 구역 {area}", kind="uv_forecast_area"
        )
        for hour in range(0, 76, 3):
            target = issued + timedelta(hours=hour)
            value = _number(
                f"h{hour}", row[f"h{hour}"], "uv_index", "index", mode="forecast"
            )
            value.text_value = f"code={code}; " + value.text_value
            readings.append(
                Reading(
                    source_id=f"{area}/{issued.strftime('%Y%m%d%H')}/h{hour}",
                    station=station,
                    observed_at=target,
                    issued_at=issued,
                    valid_until=target + timedelta(hours=3),
                    spatial_scope=f"kma:uv:areaNo={area}",
                    values=[value],
                )
            )
    return SourceBatch(provider="KMA_UV", fetched_at=_now(), readings=readings)


def environment_jobs(settings):
    """No network or storage during construction; worker owns execution."""
    enabled = bool(settings.data_go_kr_key.get_secret_value().strip())
    return [
        Job("airkorea_stations", 86400, partial(_air, settings, True), enabled),
        Job("airkorea_observations", 3600, partial(_air, settings), enabled),
        Job("kasi_rise_set", 21600, partial(_astronomy, settings), enabled),
        Job("kma_forecast_zones", 86400, partial(_forecast_zones, settings), enabled),
        Job("kma_uv_forecast", 10800, partial(_uv, settings), enabled),
    ]
