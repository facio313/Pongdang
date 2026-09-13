"""KOEM/NIER periodic sampling and HRFCO station-level water evidence.

Sampling dates are historical evidence, not a certification that a beach is safe.
Unknown units and source missing-value strings are retained without conversion.
"""

import calendar
import re
from datetime import timedelta
from urllib.parse import quote, unquote
from xml.etree import ElementTree

from app.ingestion.http import Client, ProviderError
from app.ingestion.jobs import Job
from app.ingestion.marine import (
    KST,
    RequestBudget,
    coordinate,
    in_radius,
    number,
    source_time,
    unique_readings,
    unpack,
    utcnow,
    value,
)
from app.ingestion.models import Reading, SourceBatch, Station

KOEM_INFO = (
    "https://apis.data.go.kr/B553931/service/OceansNemoInfoService1/getOceansNemoInfo1"
)
KOEM_WATER = "https://apis.data.go.kr/B553931/service/OceansNemoService2/getOceansNemo2"
NIER_WATER = "https://apis.data.go.kr/1480523/WaterQualityService/getWaterMeasuringList"
# The public KOEM response specification does not declare concentration units.
# Only temperature is unambiguous. Avoid guessing mg/L versus µmol/L.
KOEM_FIELDS = {
    "wtrtmp": ("water_temperature", "°C"),
    "salnt": ("salinity", ""),
    "phDnsty": ("ph", ""),
    "doxy": ("dissolved_oxygen", ""),
    "choxdm": ("chemical_oxygen_demand", ""),
    "nh4n": ("ammonium_nitrogen", ""),
    "no2n": ("nitrite_nitrogen", ""),
    "no3n": ("nitrate_nitrogen", ""),
    "din": ("dissolved_inorganic_nitrogen", ""),
    "totn": ("total_nitrogen", ""),
    "dip": ("dissolved_inorganic_phosphorus", ""),
    "totp": ("total_phosphorus", ""),
    "slcacdSi": ("silicate_silicon", ""),
    "fltngMttr": ("suspended_solids", ""),
    "clrpla": ("chlorophyll_a", ""),
}
NIER_FIELDS = {
    "ITEM_TEMP": ("water_temperature", "°C"),
    "ITEM_PH": ("ph", ""),
    "ITEM_DOC": ("dissolved_oxygen", ""),
    "ITEM_BOD": ("biochemical_oxygen_demand", ""),
    "ITEM_COD": ("chemical_oxygen_demand", ""),
    "ITEM_SS": ("suspended_solids", ""),
    "ITEM_TCOLI": ("total_coliform", ""),
    "ITEM_ECOLI": ("e_coli", ""),
    "ITEM_TN": ("total_nitrogen", ""),
    "ITEM_TP": ("total_phosphorus", ""),
    "ITEM_TOC": ("total_organic_carbon", ""),
    "ITEM_CLOA": ("chlorophyll_a", ""),
    "ITEM_EC": ("electrical_conductivity", ""),
    "WMDEP": ("sample_depth", ""),
    "ITEM_LVL": ("river_level", ""),
    "ITEM_AMNT": ("river_flow", ""),
    "ITEM_NO3N": ("nitrate_nitrogen", ""),
    "ITEM_NH3N": ("ammonia_nitrogen", ""),
}


def xml_rows(text, require_header=True):
    try:
        root = ElementTree.fromstring(text)
    except ElementTree.ParseError:
        raise ProviderError("INVALID_XML") from None
    for node in root.iter():
        node.tag = node.tag.split("}")[-1]
    code = root.findtext(".//returnReasonCode") or root.findtext(".//resultCode")
    if code in {"3", "03"}:
        return [], 0
    if (require_header and code is None) or (
        code is not None and code not in {"0", "00", "0000"}
    ):
        raise ProviderError("PROVIDER_" + (code or "MISSING_STATUS"))
    if not require_header and root.tag != "entities":
        raise ProviderError("INVALID_RESPONSE_ROOT")
    nodes = root.findall(".//item") or root.findall(".//content")
    if not require_header:
        # HRFCO info wraps WaterlevelInfo records in one content element;
        # latest data may instead use one content element per observation.
        nodes = [n for n in root.iter() if any(e.tag.lower() == "wlobscd" for e in n)]
    rows = [
        {e.tag: (e.text or "").strip() for e in node if len(e) == 0} for node in nodes
    ]
    try:
        total = int(root.findtext(".//totalCount") or len(rows))
    except ValueError:
        raise ProviderError("INVALID_TOTAL_COUNT") from None
    if total < len(rows) or total > 5000 or len(rows) > 5000:
        raise ProviderError("RECORD_LIMIT_EXCEEDED")
    return rows, total


def dms(raw, latitude=True):
    if raw is None:
        return None
    # HRFCO documents world-geodetic DDD-MM-SS, not a projected grid.
    parts = re.fullmatch(
        r"\s*(\d{1,3})[- :](\d{1,2})[- :](\d{1,2}(?:\.\d+)?)\s*", str(raw)
    )
    if parts:
        degrees, minutes, seconds = map(float, parts.groups())
        if minutes >= 60 or seconds >= 60:
            return None
        return coordinate(degrees + minutes / 60 + seconds / 3600, latitude)
    return coordinate(raw, latitude)


def month_windows(now, count=6):
    now = now.astimezone(KST)
    for back in range(count):
        year, month0 = divmod(now.year * 12 + now.month - 1 - back, 12)
        month = month0 + 1
        yield year, month, calendar.monthrange(year, month)[1]


class WaterProvider:
    def __init__(self, settings, client=None, clock=utcnow):
        self.settings = settings
        self.client = client or Client()
        self.clock = clock

    def _params(self, params):
        key = self.settings.data_go_kr_key.get_secret_value()
        if not key:
            raise ProviderError("MISSING_CREDENTIAL")
        return {"serviceKey": unquote(key), **params}

    def _paged(self, url, params, budget, parser="standard"):
        rows, page = [], 1
        while True:
            budget.take()
            query = self._params({**params, "pageNo": page, "numOfRows": 1000})
            if parser == "xml":
                try:
                    text = self.client.get_text(url, query)
                except ProviderError as exc:
                    if exc.code == "PROVIDER_03":
                        return []
                    raise
                part, total = xml_rows(text)
            else:
                payload = self.client.get_json(url, query)
                if parser == "nier":
                    part, total = nier_rows(payload)
                elif parser == "koem_info" and "getOceansNemoInfo" in payload:
                    part, total = lab_rows(payload["getOceansNemoInfo"])
                else:
                    part, total = unpack(payload)
            rows.extend(part)
            if len(rows) > 5000 or total > 5000:
                raise ProviderError("RECORD_LIMIT_EXCEEDED")
            if len(rows) >= total:
                return rows
            if not part:
                raise ProviderError("INCOMPLETE_PAGINATION")
            page += 1

    def _koem_stations(self, budget):
        rows = self._paged(KOEM_INFO, {"resultType": "json"}, budget, "koem_info")
        stations = {}
        for row in rows:
            code = row.get("stnpnt_code") or row.get("stnpntCode")
            if not code:
                raise ProviderError("MISSING_STATION_ID")
            station = Station(
                source_id=str(code),
                kind="marine_water_quality",
                name=str(
                    row.get("mre_msnt_sta_korn_nm") or row.get("stnpntKoreanNm") or code
                ),
                latitude=coordinate(row.get("lat")),
                longitude=coordinate(row.get("lon"), False),
                region=str(row.get("ocean_nm") or row.get("oceanNm") or ""),
            )
            if str(code) in stations and stations[str(code)] != station:
                raise ProviderError("CONFLICTING_STATION")
            stations[str(code)] = station
        return stations

    def koem_catalog(self):
        fetched = self.clock()
        stations = self._koem_stations(RequestBudget())
        return SourceBatch(
            provider="koem_catalog",
            fetched_at=fetched,
            stations=list(stations.values()),
            catalog_only=True,
        )

    def koem(self):
        fetched, budget = self.clock(), RequestBudget()
        catalog = self._koem_stations(budget)
        selected = {k: s for k, s in catalog.items() if in_radius(s, self.settings)}
        readings = []
        # The catalogue is joined in memory; this adapter does not read SQL.
        if selected:
            for year, month, last in month_windows(fetched):
                rows = self._paged(
                    KOEM_WATER,
                    {
                        "sdate": f"{year}{month:02d}01",
                        "edate": f"{year}{month:02d}{last:02d}",
                    },
                    budget,
                    "xml",
                )
                readings = self._koem_readings(rows, selected, fetched)
                if readings:
                    break
            if not readings:
                # This periodic dataset can be published with a year-long lag.
                # One completed calendar year is within the documented 365-day
                # query window; pagination shares the same ten-request budget.
                year = fetched.astimezone(KST).year - 1
                rows = self._paged(
                    KOEM_WATER,
                    {"sdate": f"{year}0101", "edate": f"{year}1231"},
                    budget,
                    "xml",
                )
                readings = self._koem_readings(rows, selected, fetched)
        return SourceBatch(
            provider="koem_water_quality",
            fetched_at=fetched,
            stations=list(selected.values()),
            readings=unique_readings(readings),
        )

    def _koem_readings(self, rows, stations, fetched):
        readings = []
        for row in rows:
            code = str(row.get("stnpntCode", ""))
            if code not in stations:
                continue
            observed = source_time(row.get("obsrDe"))
            if observed > fetched:
                raise ProviderError("FUTURE_OBSERVATION")
            for layer, suffix in (("surface", "Sfclyr"), ("bottom", "Btmlyr")):
                vals = [
                    value(name, row[field + suffix], unit)
                    for field, (name, unit) in KOEM_FIELDS.items()
                    if field + suffix in row
                ]
                if not vals:
                    continue
                vals.extend(
                    [
                        value("water_layer", layer),
                        value("observation_precision", "day"),
                        value(
                            "unit_metadata",
                            "응답에 농도 단위 미제공; 단위 추정하지 않음",
                        ),
                    ]
                )
                for field, metric in (
                    ("eclgyZoneAreaScore", "official_wqi_index"),
                    ("eclgyZoneAreaGrad", "official_wqi_grade"),
                    ("wethr", "weather"),
                ):
                    if field in row:
                        vals.append(value(metric, row[field]))
                readings.append(
                    Reading(
                        source_id=f"{code}:{observed.date()}:{layer}",
                        station=stations[code],
                        observed_at=observed,
                        valid_until=observed + timedelta(days=1),
                        spatial_scope="해양환경측정망 정점·측정층 정기 채수; 검사일",
                        values=vals,
                    )
                )
        return readings

    def nier(self):
        fetched, budget = self.clock(), RequestBudget()
        readings = []
        for year, month, _ in month_windows(fetched):
            rows = self._paged(
                NIER_WATER,
                {
                    "resultType": "JSON",
                    "wmyrList": str(year),
                    "wmodList": f"{month:02d}",
                },
                budget,
                "nier",
            )
            readings = self._nier_readings(rows, fetched)
            if readings:
                break
        readings = unique_readings(readings)
        return SourceBatch(
            provider="nier_water_quality",
            fetched_at=fetched,
            stations=list({r.station.source_id: r.station for r in readings}.values()),
            readings=readings,
        )

    def _nier_readings(self, rows, fetched):
        readings = []
        for row in rows:
            code = row.get("PT_NO")
            if not code:
                raise ProviderError("MISSING_STATION_ID")
            station = Station(
                source_id=str(code),
                name=str(row.get("PT_NM") or code),
                kind="river_water_quality",
                latitude=nier_coordinate(row, "LAT"),
                longitude=nier_coordinate(row, "LON"),
                region=str(row.get("ADDR") or "")[:200],
            )
            if not in_radius(station, self.settings):
                continue
            observed = source_time(row.get("WMCYMD"))
            if observed > fetched:
                raise ProviderError("FUTURE_OBSERVATION")
            vals = [
                value(name, row[field], unit)
                for field, (name, unit) in NIER_FIELDS.items()
                if field in row
            ]
            if not vals:
                continue
            vals.extend(
                [
                    value("sample_round", row.get("WMWK")),
                    value("observation_precision", "day"),
                    value(
                        "unit_metadata", "응답에 농도 단위 미제공; 단위 추정하지 않음"
                    ),
                ]
            )
            readings.append(
                Reading(
                    source_id=(
                        f"{code}:{observed.date()}:"
                        f"{row.get('WMWK', '')}:{row.get('WMDEP', '')}"
                    ),
                    station=station,
                    observed_at=observed,
                    valid_until=observed + timedelta(days=1),
                    spatial_scope="수질측정망 정점의 정기 채수; 일 단위 검사일",
                    values=vals,
                )
            )
        return readings

    def hrfco(self):
        fetched = self.clock()
        key = self.settings.hrfco_key.get_secret_value()
        if not key:
            raise ProviderError("MISSING_CREDENTIAL")
        # The provider requires its credential in the path; HTTP errors must
        # never contain this URL (the common client exposes only safe codes).
        base = "https://api.hrfco.go.kr/" + quote(key, safe="") + "/waterlevel/"
        info, _ = xml_rows(
            self.client.get_text(base + "info.xml"), require_header=False
        )
        stations = {}
        for row in info:
            row = {k.lower(): v for k, v in row.items()}
            code = row.get("wlobscd")
            if not code:
                raise ProviderError("MISSING_STATION_ID")
            datum = "관측소 수위표 기준; 영점표고 미제공"
            if number(row.get("gdt")) is not None:
                datum = f"관측소 수위표 영점표고 {row['gdt']} EL.m"
            station = Station(
                source_id=str(code),
                name=str(row.get("obsnm") or code),
                kind="river_level",
                latitude=dms(row.get("lat")),
                longitude=dms(row.get("lon"), False),
                region=str(row.get("addr") or "")[:200],
                datum=datum,
            )
            if in_radius(station, self.settings):
                stations[str(code)] = station
        rows, _ = xml_rows(
            self.client.get_text(base + "list/10M.xml"), require_header=False
        )
        readings = []
        for raw in rows:
            row = {k.lower(): v for k, v in raw.items()}
            code = str(row.get("wlobscd", ""))
            if code not in stations:
                continue
            observed = source_time(row.get("ymdhm"))
            if observed > fetched:
                raise ProviderError("FUTURE_OBSERVATION")
            vals = [
                value(name, row[field], unit)
                for field, name, unit in (
                    ("wl", "river_level", "m"),
                    ("fw", "river_flow", "m³/s"),
                )
                if field in row
            ]
            if vals:
                readings.append(
                    Reading(
                        source_id=f"{code}:{observed.isoformat()}",
                        station=stations[code],
                        observed_at=observed,
                        valid_until=observed + timedelta(minutes=30),
                        spatial_scope="홍수통제소 수위관측소; 해변/계곡 공간 투영 없음",
                        values=vals,
                    )
                )
        return SourceBatch(
            provider="hrfco_waterlevel",
            fetched_at=fetched,
            stations=list(stations.values()),
            readings=unique_readings(readings),
        )


def nier_rows(payload):
    root = payload.get("getWaterMeasuringList") if isinstance(payload, dict) else None
    if not isinstance(root, dict):
        # Recognize gateway denial without leaking its payload into exceptions.
        unpack(payload)
        raise ProviderError("INVALID_NIER_RESPONSE")
    return lab_rows(root)


def lab_rows(root):
    if not isinstance(root, dict):
        raise ProviderError("INVALID_LAB_RESPONSE")
    code = str(root.get("header", {}).get("code", ""))
    if code in {"03", "3"}:
        return [], 0
    if code not in {"0", "00", "0000"}:
        raise ProviderError("PROVIDER_" + (code or "MISSING_STATUS"))
    rows = root.get("item") or []
    rows = [rows] if isinstance(rows, dict) else rows
    if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        raise ProviderError("INVALID_NIER_ITEMS")
    try:
        total = int(root.get("totalCount", len(rows)))
    except TypeError, ValueError:
        raise ProviderError("INVALID_TOTAL_COUNT") from None
    if total < len(rows):
        raise ProviderError("INVALID_TOTAL_COUNT")
    return rows, total


def nier_coordinate(row, prefix):
    parts = [
        number(row.get(prefix + "_" + component)) for component in ("DGR", "MIN", "SEC")
    ]
    if (
        any(p is None for p in parts)
        or not 0 <= parts[1] < 60
        or not 0 <= parts[2] < 60
    ):
        return None
    return coordinate(parts[0] + parts[1] / 60 + parts[2] / 3600, prefix == "LAT")


def water_jobs(settings):
    provider = WaterProvider(settings)
    portal = bool(settings.data_go_kr_key.get_secret_value())
    return [
        Job("koem_catalog", 86400, provider.koem_catalog, portal),
        Job("koem_water_quality", 86400, provider.koem, portal),
        Job("nier_water_quality", 86400, provider.nier, portal),
        Job(
            "hrfco_waterlevel",
            600,
            provider.hrfco,
            bool(settings.hrfco_key.get_secret_value()),
        ),
    ]
