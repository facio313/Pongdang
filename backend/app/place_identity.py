"""Conservative catalogue aliases; source places and their evidence stay intact."""

import math
import re
import unicodedata
from collections import defaultdict

from psycopg.rows import dict_row

from app.regions import administrative_codes

MAX_DISTANCE_M = 500
MAX_PLACES = 10000


def normalized_name(name):
    value = re.sub(r"\s+", "", unicodedata.normalize("NFKC", name or ""))
    return re.sub(r"해수욕장$", "해변", value).casefold()


def distance_m(a, b):
    lat1, lat2 = math.radians(a["lat"]), math.radians(b["lat"])
    delta = math.radians(b["lng"] - a["lng"])
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta / 2) ** 2
    )
    return 6371000 * 2 * math.asin(math.sqrt(min(1, h)))


def aliases_for(rows):
    """Require a known district and pairwise proximity, never a nearest match.

    A chain of nearby points is insufficient: an ambiguous connected component
    remains separate. Parenthetical names are intentionally not stripped.
    """
    groups = defaultdict(list)
    for row in rows:
        name = normalized_name(row["name"])
        province, district = (
            (row["verified_province_code"], row["verified_district_code"])
            if row.get("verified_province_code")
            else administrative_codes(row.get("address"), row.get("region"))
        )
        coordinates = all(
            isinstance(row.get(key), (int, float))
            and math.isfinite(row[key])
            and low <= row[key] <= high
            for key, low, high in (("lat", -90, 90), ("lng", -180, 180))
        )
        if (
            name
            and province
            and district
            and coordinates
            and (row["lat"], row["lng"]) != (0, 0)
            and row["place_kind"] in {"beach", "valley"}
        ):
            groups[(name, province, district, row["place_kind"])].append(row)
    aliases = {}
    for group in groups.values():
        by_id = {row["id"]: row for row in group}
        neighbours = {sid: {sid} for sid in by_id}
        for index, a in enumerate(group):
            for b in group[index + 1 :]:
                if distance_m(a, b) <= MAX_DISTANCE_M:
                    neighbours[a["id"]].add(b["id"])
                    neighbours[b["id"]].add(a["id"])
        unseen = set(by_id)
        while unseen:
            pending = [min(unseen)]
            component = set()
            while pending:
                sid = pending.pop()
                if sid not in component:
                    component.add(sid)
                    pending.extend(neighbours[sid] - component)
            unseen -= component
            if len(component) < 2 or any(
                neighbours[sid] != component for sid in component
            ):
                continue
            # Keep the oldest catalogue ID, which supports photos/details and
            # existing saved links. A measurement-only record is the last choice.
            canonical = min(
                component,
                key=lambda sid: (
                    by_id[sid].get("catalog_source")
                    not in {"KAKAO_LOCAL", "TOURAPI_KOREAN"},
                    sid,
                ),
            )
            aliases.update({sid: canonical for sid in component if sid != canonical})
    return aliases


def reconcile_place_identities(connection):
    """Re-evaluate mappings in the caller's transaction, without provider calls."""
    from app.livecams.places import PLACE_SELECT

    connection.execute("SELECT pg_advisory_xact_lock(hashtext('pongdang-ingestion'))")
    with connection.cursor(row_factory=dict_row) as cursor:
        rows = cursor.execute(
            f"SELECT * FROM ({PLACE_SELECT}) p WHERE place_kind IS NOT NULL "
            "ORDER BY id LIMIT %s",
            [MAX_PLACES + 1],
        ).fetchall()
    if len(rows) > MAX_PLACES:
        raise ValueError("Place identity catalogue exceeds reconciliation limit")
    aliases = aliases_for(rows)
    # Only derived mappings are removed; no spot, favourite or evidence is moved.
    connection.execute(
        "DELETE FROM pongdang_data.place_alias WHERE NOT(spot_id=ANY(%s::bigint[]))",
        [list(aliases)],
    )
    with connection.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO pongdang_data.place_alias(spot_id,canonical_spot_id) "
            "VALUES(%s,%s) ON CONFLICT(spot_id) DO UPDATE SET "
            "canonical_spot_id=EXCLUDED.canonical_spot_id,matched_at=now() "
            "WHERE place_alias.canonical_spot_id<>EXCLUDED.canonical_spot_id",
            sorted(aliases.items()),
        )
    return len(aliases)


def initialize_place_identity(connection):
    """Add and backfill only the identity table, also usable on a v10+ catalogue."""
    connection.execute(
        "CREATE TABLE IF NOT EXISTS pongdang_data.place_alias ("
        "spot_id bigint PRIMARY KEY REFERENCES pongdang_data.spots_waterspot(id),"
        "canonical_spot_id bigint NOT NULL "
        "REFERENCES pongdang_data.spots_waterspot(id),"
        "match_method text NOT NULL DEFAULT 'name_kind_district_coordinates_v1' "
        "CHECK(match_method='name_kind_district_coordinates_v1'),"
        "matched_at timestamptz NOT NULL DEFAULT now(),"
        "CHECK(spot_id<>canonical_spot_id))"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS place_alias_canonical_idx "
        "ON pongdang_data.place_alias(canonical_spot_id)"
    )
    connection.execute("REVOKE ALL ON pongdang_data.place_alias FROM PUBLIC")
    return reconcile_place_identities(connection)


def migrate_place_identity(connection):
    """Explicit v13 -> v14; backfill aliases without rewriting source records."""
    initialize_place_identity(connection)
    connection.execute("UPDATE pongdang_data.schema_version SET version=14 WHERE id=1")
