"""Bounded KOEM Wemo and TourAPI evidence, independently collected for Pongdang.

Wemo units are not specified by the public response table: keep them unknown.
TourAPI visitor counts describe historical administrative regions, not beach
occupancy; visitor categories and regional levels are never added together.
"""

import json
import re
from datetime import datetime, timedelta
from functools import partial
from urllib.parse import unquote

from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.ingestion.marine import (
    KST,
    RequestBudget,
    coordinate,
    in_radius,
    source_time,
    unique_readings,
    unpack,
    utcnow,
    value,
)
from app.ingestion.models import Place, Reading, SourceBatch, Station, Value
from app.ingestion.water import lab_rows, xml_rows

WEMO_INFO = (
    "https://apis.data.go.kr/B553931/service/OceansWemoInfoService1/getOceansWemoInfo1"
)
WEMO_WATER = "https://apis.data.go.kr/B553931/service/OceansWemoService1/getOceansWemo1"
VISITORS = "https://apis.data.go.kr/B551011/DataLabService/locgoRegnVisitrDDList"
LANGUAGES = {
    "english": "EngService2",
    "japanese": "JpnService2",
    "chinese_simplified": "ChsService2",
    "chinese_traditional": "ChtService2",
}
# Field allowlist from data.go.kr/data/15059977/openapi.do, 2026-09-14.
# Neither the public response table nor live empty samples establish units.
WEMO_FIELDS = {
    "cndctvty": "electrical_conductivity",
    "wtrtmp": "water_temperature",
    "phdnsty": "ph",
    "doxy": "dissolved_oxygen",
    "trbdty": "turbidity",
    "trbdtytmpr": "temporary_turbidity",
    "wiper": "wiper",
    "slrqty": "solar_radiation",
    "tmprt": "air_temperature",
    "relatehd": "relative_humidity",
    "ws": "wind_speed",
    "wd": "wind_direction",
    "prcptqy": "precipitation",
    "voltage": "voltage",
    "wlevel1": "water_level_1",
    "wlevel2": "water_level_2",
    "salnt": "salinity",
    "clrpla": "chlorophyll_a",
    "choxdm": "chemical_oxygen_demand",
    "totn": "total_nitrogen",
    "totp": "total_phosphorus",
    "nh4n": "ammonium_nitrogen",
    "no3n": "nitrate_nitrogen",
    "cyanbtr": "cyanobacteria",
    "po4p": "phosphate_phosphorus",
}


def normalized(row):
    """Accept documented camelCase and verified snake_case without guessing."""
    result = {}
    for key, item in row.items():
        name = re.sub("_", "", key).lower()
        if name in result and result[name] != item:
            raise ProviderError("CONFLICTING_FIELD_ALIAS")
        result[name] = item
    return result


def required(row, key):
    raw = row.get(key)
    if not isinstance(raw, (str, int)) or isinstance(raw, bool) or not str(raw).strip():
        raise ProviderError("MISSING_SOURCE_IDENTITY")
    return str(raw).strip()


def source_value(name, raw, unit=""):
    if isinstance(raw, (dict, list, bool)) or (raw is not None and len(str(raw)) > 500):
        raise ProviderError("INVALID_SOURCE_VALUE")
    return value(name, raw, unit)


def source_text(name, raw):
    if not isinstance(raw, (str, int)) or isinstance(raw, bool) or len(str(raw)) > 500:
        raise ProviderError("INVALID_SOURCE_VALUE")
    return Value(name=name, text_value=str(raw))


def tourism_time(raw):
    if not isinstance(raw, str) or not re.fullmatch(r"\d{14}", raw):
        raise ProviderError("INVALID_SOURCE_TIME")
    try:
        return datetime.strptime(raw, "%Y%m%d%H%M%S").replace(tzinfo=KST)
    except ValueError:
        raise ProviderError("INVALID_SOURCE_TIME") from None


def tourism_place(row, fetched):
    """Preserve TourAPI identity, administrative codes and source timestamps."""
    code, title = required(row, "contentid"), required(row, "title")
    lat, lon = coordinate(row.get("mapy")), coordinate(row.get("mapx"), False)
    if lat is None or lon is None or not lat or not lon:
        return None
    created = tourism_time(row["createdtime"]) if row.get("createdtime") else None
    modified = tourism_time(row["modifiedtime"]) if row.get("modifiedtime") else None
    if any(dt and dt > fetched for dt in (created, modified)):
        raise ProviderError("FUTURE_SOURCE_MODIFICATION")
    if created and modified and created > modified:
        raise ProviderError("INVALID_SOURCE_CHRONOLOGY")
    region_fields = (
        ("lDongRegnCd", "lDongSignguCd")
        if row.get("lDongRegnCd")
        else ("areacode", "sigungucode")
    )
    return Place(
        source_id=code,
        name=title,
        kind="tourism",
        latitude=lat,
        longitude=lon,
        address=" ".join(str(row[k]) for k in ("addr1", "addr2") if row.get(k)),
        region=":".join(str(row.get(k) or "") for k in region_fields),
        category=str(row.get("contenttypeid") or ""),
        source_created_at=created,
        source_modified_at=modified,
    )


class WaterTourExtraProvider:
    def __init__(self, settings, client=None, clock=utcnow):
        self.settings = settings
        self.client = client or Client()
        self.clock = clock

    def _paged(
        self, url, params, budget, *, named=(), xml=False, page_size=1000, pages=5
    ):
        key = self.settings.data_go_kr_key.get_secret_value()
        if not key:
            raise ProviderError("MISSING_CREDENTIAL")
        rows, previous_total, previous_rows = [], None, set()
        for page in range(1, pages + 1):
            budget.take()
            query = {
                "serviceKey": unquote(key),
                **params,
                "pageNo": page,
                "numOfRows": page_size,
            }
            if xml:
                try:
                    part, total = xml_rows(self.client.get_text(url, query))
                except ProviderError as exc:
                    if exc.code == "PROVIDER_03":
                        part, total = [], 0
                    else:
                        raise
            else:
                payload = self.client.get_json(url, query)
                if not isinstance(payload, dict):
                    raise ProviderError("INVALID_RESPONSE")
                matching = [key for key in named if key in payload]
                if len(matching) > 1:
                    raise ProviderError("INVALID_RESPONSE")
                part, total = (
                    lab_rows(payload[matching[0]]) if matching else unpack(payload)
                )
            if len(part) > page_size or len(rows) + len(part) > 5000 or total > 5000:
                raise ProviderError("RECORD_LIMIT_EXCEEDED")
            if previous_total is not None and total != previous_total:
                raise ProviderError("PAGINATION_TOTAL_CHANGED")
            page_rows = {json.dumps(row, sort_keys=True) for row in part}
            if previous_rows.intersection(page_rows):
                raise ProviderError("PAGINATION_REPEATED_RECORD")
            previous_rows.update(page_rows)
            previous_total = total
            rows.extend(part)
            if len(rows) > total:
                raise ProviderError("INVALID_TOTAL_COUNT")
            if len(rows) == total:
                return rows, False
            if not part:
                raise ProviderError("INCOMPLETE_PAGINATION")
        return rows, True

    def _wemo_stations(self, budget):
        rows, bounded = self._paged(
            WEMO_INFO,
            {"resultType": "json"},
            budget,
            named=("getOceansWemoInfo", "getOceansWemoInfo1"),
        )
        if bounded:
            raise ProviderError("INCOMPLETE_STATION_CATALOG")
        stations = {}
        for raw in rows:
            row = normalized(raw)
            code = required(row, "stnpntcode")
            station = Station(
                source_id=code,
                name=required(row, "stnpntkoreannm"),
                kind="marine_automated_water_quality",
                latitude=coordinate(row.get("lat")),
                longitude=coordinate(row.get("lon"), False),
                region=str(row.get("oceannm") or ""),
            )
            if code in stations and stations[code] != station:
                raise ProviderError("CONFLICTING_STATION")
            stations[code] = station
        return stations

    def wemo_catalog(self):
        fetched = self.clock()
        stations = self._wemo_stations(RequestBudget())
        return SourceBatch(
            provider="koem_wemo_catalog",
            fetched_at=fetched,
            catalog_only=True,
            stations=list(stations.values()),
        )

    def wemo_water_quality(self):
        fetched, budget = self.clock(), RequestBudget()
        catalog = self._wemo_stations(budget)
        name = self.settings.water_quality_station_name.strip()
        selected = {
            code: station
            for code, station in catalog.items()
            if (station.name == name if name else in_radius(station, self.settings))
        }
        if name and not selected:
            raise ProviderError("CONFIGURED_STATION_NOT_FOUND")
        # One closed local day; no old sample is promoted to a current value.
        day = fetched.astimezone(KST).date() - timedelta(days=1)
        readings = []
        for station in selected.values():
            rows, bounded = self._paged(
                WEMO_WATER,
                {
                    "resultType": "json",
                    "sdate": day.strftime("%Y%m%d"),
                    "edate": day.strftime("%Y%m%d"),
                    "STNPNT_KOREAN_NM": station.name,
                },
                budget,
                named=("getOceansWemo", "getOceansWemo1"),
            )
            if bounded:
                raise ProviderError("INCOMPLETE_PAGINATION")
            for raw in rows:
                row = normalized(raw)
                if required(row, "stnpntcode") != station.source_id:
                    raise ProviderError("UNEXPECTED_STATION")
                observed = source_time(row.get("obsrdate"))
                if observed.astimezone(KST).date() != day:
                    raise ProviderError("UNEXPECTED_OBSERVATION_DATE")
                vals = [
                    source_value(metric, row[field])
                    for field, metric in WEMO_FIELDS.items()
                    if field in row
                ]
                if not vals:
                    raise ProviderError("MISSING_MEASUREMENT_FIELDS")
                readings.append(
                    Reading(
                        source_id=f"{station.source_id}:{observed.isoformat()}",
                        station=station,
                        observed_at=observed,
                        valid_until=observed + timedelta(minutes=1),
                        issued_at=None,
                        spatial_scope=(
                            "특별관리해역 자동측정 정점; 원자료 관측시각의 1분 구간, "
                            "유효기간 미제공·지속성 및 해수욕장 대표성 미검증"
                        ),
                        values=vals,
                    )
                )
        return SourceBatch(
            provider="koem_wemo_water_quality",
            fetched_at=fetched,
            stations=list(selected.values()),
            readings=unique_readings(readings),
            coverage="bounded",
        )

    def tourism_places(self, language):
        if language not in LANGUAGES:
            raise ProviderError("UNSUPPORTED_LANGUAGE")
        fetched = self.clock()
        rows, _ = self._paged(
            f"https://apis.data.go.kr/B551011/{LANGUAGES[language]}/locationBasedList2",
            {
                "MobileOS": "ETC",
                "MobileApp": "Pongdang",
                "_type": "json",
                "mapX": self.settings.collection_longitude,
                "mapY": self.settings.collection_latitude,
                "radius": self.settings.collection_radius_m,
                "arrange": "E",
            },
            RequestBudget(),
            page_size=100,
            pages=5,
        )
        places, source_rows = {}, {}
        for row in rows:
            code = required(row, "contentid")
            # Check before skipping incomplete coordinates, so a conflicting
            # later revision cannot silently leave the earlier record selected.
            if code in source_rows and source_rows[code] != row:
                raise ProviderError("CONFLICTING_PLACE")
            source_rows[code] = row
            place = tourism_place(row, fetched)
            if place is None:
                continue  # A place cannot be placed at invented coordinates.
            if not in_radius(place, self.settings):
                continue
            if code in places and places[code] != place:
                raise ProviderError("CONFLICTING_PLACE")
            places[code] = place
        return SourceBatch(
            provider="tourapi_" + language,
            fetched_at=fetched,
            coverage="bounded",  # The configured geographic window is partial.
            catalog_only=True,
            places=list(places.values()),
        )

    def visitor_statistics(self):
        fetched = self.clock()
        lag = self.settings.visitor_statistics_lag_days
        day = fetched.astimezone(KST).date() - timedelta(days=lag)
        rows, bounded = self._paged(
            VISITORS,
            {
                "MobileOS": "ETC",
                "MobileApp": "Pongdang",
                "startYmd": day.strftime("%Y%m%d"),
                "endYmd": day.strftime("%Y%m%d"),
            },
            RequestBudget(),
            xml=True,
        )
        if bounded:
            raise ProviderError("INCOMPLETE_PAGINATION")
        region = self.settings.visitor_region_code.strip()
        readings, stations = [], {}
        for row in rows:
            code = required(row, "signguCode")
            if region and code != region:
                continue
            raw_date = required(row, "baseYmd")
            if raw_date != day.strftime("%Y%m%d"):
                raise ProviderError("UNEXPECTED_OBSERVATION_DATE")
            category = required(row, "touDivCd")
            station = Station(
                source_id=code,
                name=required(row, "signguNm"),
                kind="tourism_administrative_statistics",
                region=code,
            )
            if code in stations and stations[code] != station:
                raise ProviderError("CONFLICTING_STATION")
            stations[code] = station
            if "touNum" not in row:
                raise ProviderError("MISSING_MEASUREMENT_FIELDS")
            count = source_value("daily_visitors", row["touNum"], "명")
            if (
                count.numeric_value is None
                and not count.missing
                or count.numeric_value is not None
                and count.numeric_value < 0
            ):
                raise ProviderError("INVALID_VISITOR_COUNT")
            vals = [count, source_text("visitor_category_code", category)]
            for key, metric in (
                ("touDivNm", "visitor_category_name"),
                ("daywkDivCd", "day_of_week_code"),
                ("daywkDivNm", "day_of_week_name"),
            ):
                if key in row:
                    vals.append(source_text(metric, row[key]))
            observed = source_time(raw_date)
            readings.append(
                Reading(
                    source_id=f"{code}:{raw_date}:{category}",
                    station=station,
                    observed_at=observed,
                    valid_until=observed + timedelta(days=1),
                    issued_at=None,
                    spatial_scope=(
                        "행정구역별·방문자 유형별 일 순방문 통계; "
                        "지자체 간 합산 불가·실시간 해변 혼잡도 아님"
                    ),
                    values=vals,
                )
            )
        return SourceBatch(
            provider="tourapi_daily_visitors",
            fetched_at=fetched,
            stations=list(stations.values()),
            readings=unique_readings(readings),
            coverage="bounded",
        )


def water_tour_extra_jobs(settings):
    provider = WaterTourExtraProvider(settings)
    portal = bool(settings.data_go_kr_key.get_secret_value())
    jobs = [
        Job("koem_wemo_catalog", 86400, provider.wemo_catalog, portal),
        Job("koem_wemo_water_quality", 86400, provider.wemo_water_quality, portal),
        Job("tourapi_daily_visitors", 86400, provider.visitor_statistics, portal),
    ]
    for language in LANGUAGES:
        allowed = (
            language != "chinese_traditional" or settings.tourism_traditional_enabled
        )
        local = getattr(settings, "tourism_collection_scope", "local") == "local"
        jobs.append(
            Job(
                "tourapi_" + language,
                86400,
                partial(provider.tourism_places, language),
                portal and allowed and local,
                disabled_reason=(
                    "SERVICE_APPROVAL_UNCONFIRMED"
                    if portal and not allowed
                    else "COLLECTION_SCOPE_REPLACED"
                    if portal and not local
                    else "KEY_NOT_CONFIGURED"
                ),
            )
        )
    # Official HYD-03 approval is pending; its geometry/time payload has not
    # been observed. No empty successful fetch or invented restriction is used.
    jobs.append(
        Job(
            "kwater_dam_release",
            3600,
            enabled=False,
            disabled_reason=(
                "KEY_NOT_CONFIGURED"
                if not portal
                else "ADAPTER_PENDING"
                if settings.dam_release_enabled
                else "APPROVAL_PENDING"
            ),
        )
    )
    return jobs
