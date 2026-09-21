"""TourAPI detailCommon2/Intro2/Info2, fetched only by the collection worker.

fields.json is the field allowlist from the official September 2026 Swagger
specifications: data.go.kr/data/{15101578,15101753,15101760,15101764}/openapi.do.
Descriptions are provider text, not assertions about current access or safety.
"""

import json
import re
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit

from pydantic import ValidationError

from app.attachments.files import image_url
from app.ingestion.http import Client, ProviderError
from app.ingestion.marine import unpack
from app.ingestion.models import SourceBatch
from app.ingestion.water_tour_extra import tourism_time
from app.place_details.models import DetailField, PlaceDetail

SERVICES = {
    "TOURAPI_KOREAN": "KorService2",
    "tourapi_english": "EngService2",
    "tourapi_japanese": "JpnService2",
    "tourapi_chinese_simplified": "ChsService2",
    "tourapi_chinese_traditional": "ChtService2",
}
SUPPORTED_TYPES = {
    "korean": {"12", "14", "15", "25", "28", "32", "38", "39"},
    "foreign": {"75", "76", "77", "78", "79", "80", "82", "85"},
}
FIELDS = json.loads(Path(__file__).with_name("fields.json").read_text())
PRIVATE_QUERY = re.compile(
    r"(?:[?&])(?:servicekey|api[_-]?key|token|access_token|auth|password|secret|key)=",
    re.I,
)
SUMMARY_KEYS = {
    "opening_hours": (
        "usetime",
        "usetimeculture",
        "usetimeleports",
        "opentime",
        "opentimefood",
        "operationtimetraffic",
        "playtime",
    ),
    "rest_days": (
        "restdate",
        "restdateculture",
        "restdateleports",
        "restdateshopping",
        "restdatefood",
    ),
    "opening_period": ("openperiod", "useseason"),
    "opening_date": ("opendate", "opendateshopping", "opendatefood"),
    "parking": (
        "parking",
        "parkingculture",
        "parkingleports",
        "parkinglodging",
        "parkingshopping",
        "parkingfood",
        "parkingtraffic",
    ),
    "contact": (
        "infocenter",
        "infocenterculture",
        "infocenterleports",
        "infocenterlodging",
        "infocentershopping",
        "infocenterfood",
        "infocentertraffic",
        "sponsor1tel",
    ),
}


def language_group(provider):
    return "korean" if provider == "TOURAPI_KOREAN" else "foreign"


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.links, self.hidden = [], [], 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "iframe", "object"}:
            self.hidden += 1
        if self.hidden:
            return
        if tag in {"br", "p", "div", "li", "tr"}:
            self.parts.append("\n")
        if tag == "a":
            self.links.extend(v for k, v in attrs if k == "href" and v)

    def handle_endtag(self, tag):
        if tag in {"script", "style", "iframe", "object"} and self.hidden:
            self.hidden -= 1
        elif not self.hidden and tag in {"p", "div", "li", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain(value):
    if value is None or value == "":
        return None
    if type(value) not in {str, int, float} or len(str(value)) > 40000:
        raise ProviderError("INVALID_DETAIL_TEXT")
    parser = PlainText()
    parser.feed(str(value))
    text = "\n".join(
        re.sub(r"[\t\r \xa0]+", " ", line).strip()
        for line in "".join(parser.parts).splitlines()
    )
    # Authenticated URLs are never public evidence, even as non-clickable text.
    text = re.sub(
        r"https?://[^\s<>]+",
        lambda match: "" if PRIVATE_QUERY.search(match[0]) else match[0],
        text,
    )
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > 20000:
        raise ProviderError("DETAIL_TEXT_TOO_LONG")
    return text or None


def homepage(value):
    if not isinstance(value, str) or len(value) > 40000:
        return None
    parser = PlainText()
    parser.feed(value)
    for candidate in [*parser.links, value.strip()]:
        try:
            url = urlsplit(candidate)
            if (
                url.scheme == "https"
                and url.hostname
                and not url.username
                and not url.password
                and url.port in (None, 443)
                and len(candidate) <= 2000
                and not PRIVATE_QUERY.search(candidate)
                and not re.search(r"[\s<>]", candidate)
            ):
                return urlunsplit(url)
        except ValueError:
            continue
    return None


def normalized_detail(place, common, intro, extra):
    group = language_group(place["provider"])
    kind = str(place["category"])
    fields = []
    introductory = {}
    for key, description in FIELDS[group]["detailIntro2"].items():
        if key in {"contentid", "contenttypeid"}:
            continue
        kinds = re.findall(r"\(([0-9]+)\)", description)
        if kinds and kind not in kinds:
            continue
        value = plain(intro.get(key))
        if value is not None:
            introductory[key] = value
            fields.append(
                DetailField(
                    section="intro",
                    key=key,
                    label=description.split(" : ")[-1],
                    value=value,
                )
            )
    for number, row in enumerate(extra):
        if row.get("infoname") or row.get("infotext"):
            label, value = plain(row.get("infoname")), plain(row.get("infotext"))
            if value:
                fields.append(
                    DetailField(
                        section="info",
                        key=f"info:{row.get('serialnum', number)}",
                        label=label or "추가 안내",
                        value=value,
                    )
                )
            continue
        # Room/course fields stay separate; never infer a boolean facility.
        for key, description in FIELDS[group]["detailInfo2"].items():
            if key in {"contentid", "contenttypeid"} or "img" in key.lower():
                continue
            value = plain(row.get(key))
            if value:
                fields.append(
                    DetailField(
                        section="room" if kind == "32" else "course",
                        key=f"{number}:{key}",
                        label=(plain(row.get("roomtitle") or row.get("subname")) or "")
                        + " · "
                        + description.split(" : ")[-1],
                        value=value,
                    )
                )
    for key in ("telname", "addr1", "addr2", "zipcode"):
        value = plain(common.get(key))
        if value:
            fields.append(
                DetailField(
                    section="common",
                    key=key,
                    label=FIELDS[group]["detailCommon2"][key],
                    value=value,
                )
            )
    summaries = {
        field: next((introductory[k] for k in keys if k in introductory), None)
        for field, keys in SUMMARY_KEYS.items()
    }
    facility_fields = [
        field
        for field in fields
        if field.key
        in {"subfacility", "conven", "restroom", "restroomtraffic", "disablefacility"}
        or (
            field.section == "info"
            and re.search(
                r"시설|화장실|샤워|탈의|facilit|amenit|restroom|shower|施設|设施",
                field.label,
                re.I,
            )
        )
    ]
    summaries["facilities"] = (
        "\n".join(f"{field.label}: {field.value}" for field in facility_fields) or None
    )
    summaries["contact"] = summaries["contact"] or plain(common.get("tel"))
    photo = common.get("firstimage") or None
    if photo:
        try:
            photo = image_url(photo)
        except ProviderError:
            photo = None  # Only the existing, approved raster host is usable.
    detail = PlaceDetail(
        source_id=place["source_id"],
        content_type=kind,
        name=plain(common.get("title")) or place["name"],
        catalog_modified_at=place.get("source_modified_at"),
        source_created_at=tourism_time(common["createdtime"])
        if common.get("createdtime")
        else None,
        source_modified_at=tourism_time(common["modifiedtime"])
        if common.get("modifiedtime")
        else None,
        homepage=homepage(common.get("homepage")),
        overview=plain(common.get("overview")),
        details=fields,
        photo_url=photo,
        photo_license=plain(common.get("cpyrhtDivCd")),
        **summaries,
    )
    detail.availability = (
        "available"
        if (
            any(summaries.values())
            or detail.overview
            or detail.homepage
            or any(f.section != "common" for f in fields)
        )
        else "empty"
    )
    return detail


class TourDetails:
    def __init__(self, settings, *, client=None, reserve=None, clock=None):
        self.settings = settings
        self.client = client or Client(timeout=15, max_bytes=1_000_000)
        self.reserve = reserve
        self.clock = clock or (lambda: datetime.now(UTC))

    def rows(self, place, method, *, many=False):
        service = SERVICES[place["provider"]]
        key = self.settings.data_go_kr_key.get_secret_value()
        if not key:
            raise ProviderError("MISSING_CREDENTIAL")
        rows, previous_total, seen = [], None, set()
        size = 100 if many else 1
        for page in range(1, 6 if many else 2):
            if self.reserve:
                self.reserve(service)
            params = {
                "serviceKey": unquote(key),
                "MobileOS": "ETC",
                "MobileApp": "Pongdang",
                "_type": "json",
                "pageNo": page,
                "numOfRows": size,
                "contentId": place["source_id"],
            }
            if method != "detailCommon2":
                params["contentTypeId"] = place["category"]
            part, total = unpack(
                self.client.get_json(
                    f"https://apis.data.go.kr/B551011/{service}/{method}",
                    params,
                )
            )
            if len(part) > size or total > (500 if many else 1):
                raise ProviderError("DETAIL_RECORD_LIMIT")
            if previous_total is not None and total != previous_total:
                raise ProviderError("PAGINATION_TOTAL_CHANGED")
            previous_total = total
            for row in part:
                if str(row.get("contentid", "")) != place["source_id"]:
                    raise ProviderError("DETAIL_ID_MISMATCH")
                if str(row.get("contenttypeid", "")) != str(place["category"]):
                    raise ProviderError("DETAIL_TYPE_MISMATCH")
                identity = json.dumps(row, ensure_ascii=False, sort_keys=True)
                if identity in seen:
                    raise ProviderError("PAGINATION_REPEATED_RECORD")
                seen.add(identity)
            rows.extend(part)
            if len(rows) == total:
                return rows
            if not part or len(rows) > total:
                raise ProviderError("INCOMPLETE_PAGINATION")
        raise ProviderError("INCOMPLETE_PAGINATION")

    def fetch(self, place):
        group = language_group(place["provider"])
        if str(place["category"]) not in SUPPORTED_TYPES[group]:
            raise ProviderError("UNSUPPORTED_CONTENT_TYPE")
        common = self.rows(place, "detailCommon2")
        intro = self.rows(place, "detailIntro2") if common else []
        extra = self.rows(place, "detailInfo2", many=True) if common else []
        try:
            detail = normalized_detail(
                place,
                common[0] if common else {},
                intro[0] if intro else {},
                extra,
            )
            return SourceBatch(
                provider=place["provider"],
                fetched_at=self.clock(),
                adapter_version="tourism-details-1",
                place_details=[detail],
            )
        except ValidationError:
            raise ProviderError("INVALID_NORMALIZED_DETAILS") from None
