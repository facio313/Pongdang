"""Precompute shared condition bundles from one bounded collection snapshot.

The HTTP reader and this worker share the final evidence/score assembly. Source
revisions, links and authority records are loaded once; target selection then
uses indexed in-memory evidence, without a query per place/activity/hour.
"""

from bisect import bisect_right
from collections import OrderedDict, defaultdict
from datetime import UTC, datetime, timedelta
from math import asin, cos, degrees, radians, sin, sqrt
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from psycopg.rows import dict_row

from app.ingestion.errors import SourceScopeTooLargeError
from app.ingestion.weather import grid_coordinates
from app.schema import connect
from app.water_index.condition_api import (
    ALIASES,
    PRODUCT_ACTIVITIES,
    ConditionQuery,
    assemble_conditions,
    authority_conditions,
)
from app.water_index.conditions import ACTIVITIES, METRICS
from app.water_index.sources import AuthorityRecord

KST = ZoneInfo("Asia/Seoul")
CONTEXT_PROVIDERS = {
    "kma_nowcast",
    "kma_ultra_forecast",
    "kma_short_forecast",
    "kma_aws",
    "kma_buoy",
    "khoa_buoy_recent",
    "khoa_water_temperature",
    "khoa_tide_recent",
    *PRODUCT_ACTIVITIES,
}
MAX_RECORDS = 1_000_000
MAX_ENVELOPE_CACHE = 2048


def _bounded(cursor, query, params, limit):
    rows = cursor.execute(query + " LIMIT %s", [*params, limit + 1]).fetchall()
    if len(rows) > limit:
        raise SourceScopeTooLargeError
    return rows


def _requested(activity, mode):
    allowed = {m.name for m in ACTIVITIES[activity].metrics}
    requested = allowed | {"precipitation"}
    if mode == "forecast":
        requested |= {
            f"maximum_{name}"
            for name in ("wave_height", "wind_speed")
            if name in allowed
        }
    source_names = requested | {
        alias for alias, name in ALIASES.items() if name in requested
    }
    return allowed, requested, source_names


def _load_inputs(c, now, start, end):
    with c.cursor(row_factory=dict_row) as cursor:
        places = _bounded(
            cursor,
            "SELECT id,name,lat,lng,catalog_verified_at "
            "FROM pongdang_data.spots_waterspot ORDER BY id",
            [],
            50_000,
        )
        stations = _bounded(
            cursor,
            "SELECT st.*,EXISTS (SELECT 1 FROM "
            "pongdang_data.conditions_observationsnapshot s "
            "WHERE s.station_id=st.id AND s.fetched_at<=%s) AS known_snapshot "
            "FROM pongdang_data.collection_station st ORDER BY st.id",
            [now],
            20_000,
        )
        # Context eligibility intentionally follows the raw reader's EXISTS:
        # even an omitted or corrected metric establishes a station's product.
        presence = _bounded(
            cursor,
            "SELECT DISTINCT s.station_id,m.name,m.mode FROM "
            "pongdang_data.conditions_observationsnapshot s JOIN "
            "pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
            "WHERE s.fetched_at<=%s AND m.name=ANY(%s)",
            [now, sorted(set(METRICS) | set(ALIASES))],
            500_000,
        )
        mappings = _bounded(
            cursor,
            "SELECT m.* FROM pongdang_data.water_index_station_mapping m "
            "WHERE m.available_at<=%s AND m.valid_from<%s AND m.valid_until>%s "
            "AND NOT EXISTS (SELECT 1 FROM "
            "pongdang_data.water_index_station_mapping n "
            "WHERE n.supersedes_id=m.mapping_id AND n.available_at<=%s) "
            "ORDER BY m.mapping_id",
            [now, end, start, now],
            100_000,
        )
        authorities = _bounded(
            cursor,
            "SELECT a.* FROM pongdang_data.water_index_authority_evidence a "
            "WHERE a.available_at<=%s AND a.valid_from<%s AND a.valid_until>%s "
            "AND NOT EXISTS (SELECT 1 FROM "
            "pongdang_data.water_index_authority_evidence n "
            "WHERE n.supersedes_id=a.evidence_id AND n.available_at<=%s) "
            "ORDER BY a.evidence_id",
            [now, end, start, now],
            100_000,
        )
        rows = _bounded(
            cursor,
            "WITH known AS (SELECT *,COALESCE(source_record_id,provider_record_id) "
            "AS source_key FROM pongdang_data.conditions_observationsnapshot "
            "WHERE fetched_at<=%s AND (issued_at IS NULL OR issued_at<=%s)), "
            # Aggregate revision conflicts once per source identity. A correlated
            # EXISTS against `known` scans the materialized collection repeatedly
            # for every metric, making a modest live history exceed the timeout.
            "revisions AS (SELECT DISTINCT ON (station_id,provider,source_key) *, "
            "min(fetched_at) FILTER (WHERE state<>'superseded') OVER "
            "(PARTITION BY station_id,provider,source_key) AS first_active_fetch "
            "FROM known ORDER BY station_id,provider,source_key,"
            "fetched_at DESC,id DESC), "
            "slots AS (SELECT DISTINCT s.station_id,s.provider,s.source_key,"
            "m.name,m.mode FROM known s JOIN "
            "pongdang_data.conditions_observationmetric m ON m.snapshot_id=s.id "
            "WHERE m.name=ANY(%s)), candidates AS (SELECT "
            "s.id AS snapshot_id,s.station_id,s.provider,s.provider_record_id,"
            "s.source_record_id,s.spatial_scope,s.issued_at,"
            "s.state AS source_state,s.valid_until AS snapshot_valid_until,"
            "m.id AS metric_id,m.state AS metric_state,k.name,m.numeric_value,"
            "m.text_value,m.unit,k.mode,COALESCE(m.is_missing,true) AS is_missing,"
            "COALESCE(m.observed_at,s.observed_at) AS observed_at,"
            "COALESCE(m.observed_at,s.observed_at) AS valid_from,"
            "COALESCE(m.fetched_at,s.fetched_at) AS fetched_at,m.valid_until,"
            "COALESCE(s.first_active_fetch<s.fetched_at,false) "
            "AS revision_ambiguous,"
            "dense_rank() OVER (PARTITION BY s.station_id,k.name,k.mode,"
            "COALESCE(m.observed_at,s.observed_at) ORDER BY CASE WHEN "
            "k.mode='forecast' AND s.provider IN "
            "('kma_short_forecast','kma_ultra_forecast') THEN s.issued_at END "
            "DESC NULLS LAST) AS issue_rank FROM revisions s JOIN slots k ON "
            "k.station_id=s.station_id AND k.provider=s.provider AND "
            "k.source_key=s.source_key LEFT JOIN "
            "pongdang_data.conditions_observationmetric m "
            "ON m.snapshot_id=s.id AND m.name=k.name AND m.mode=k.mode "
            "WHERE COALESCE(m.observed_at,s.observed_at)<%s "
            "AND (k.mode='forecast' OR COALESCE(m.observed_at,s.observed_at)<=%s) "
            "AND COALESCE(m.fetched_at,s.fetched_at)<=%s), ranked AS (SELECT *,"
            "max(observed_at) FILTER (WHERE observed_at<=%s) OVER "
            "(PARTITION BY station_id,name,mode) AS initial_target,"
            "max(observed_at) OVER (PARTITION BY station_id,name,mode) "
            "AS last_target FROM candidates WHERE issue_rank=1) "
            "SELECT * FROM ranked WHERE "
            "(mode='observation' AND observed_at=last_target) OR "
            "(mode='forecast' AND (observed_at>=%s OR observed_at=initial_target)) "
            "ORDER BY station_id,name,observed_at,snapshot_id,metric_id",
            [
                now,
                now,
                sorted(set(METRICS) | set(ALIASES)),
                end,
                now,
                now,
                start,
                start,
            ],
            500_000,
        )
    return ProjectionInputs(places, stations, presence, mappings, authorities, rows)


class ProjectionInputs:
    """A repeatable-read input set with target and geographic lookup indexes."""

    def __init__(self, places, stations, presence, mappings, authorities, rows):
        self.places = places
        self.stations = {s["id"]: s for s in stations}
        self.direct = defaultdict(list)
        self.mappings = defaultdict(list)
        self.authorities = defaultdict(list)
        self.presence = defaultdict(set)
        self.rows = defaultdict(list)
        self.targets = {}
        self.nearby = {}
        self.envelopes = OrderedDict()
        for station in stations:
            self.direct[station["spot_id"]].append(station["id"])
        for mapping in mappings:
            self.mappings[mapping["spot_id"]].append(mapping)
        for authority in authorities:
            authority = dict(authority)
            authority["payload"] = AuthorityRecord.model_validate(authority["payload"])
            self.authorities[(authority["spot_id"], authority["activity"])].append(
                authority
            )
        for item in presence:
            self.presence[(item["station_id"], item["mode"])].add(item["name"])
        grouped = defaultdict(lambda: defaultdict(list))
        for row in rows:
            self.rows[(row["station_id"], row["mode"])].append(row)
            grouped[(row["station_id"], row["mode"], row["name"])][
                row["observed_at"]
            ].append(row)
        for key, slots in grouped.items():
            times = sorted(slots)
            self.targets[key] = (times, [slots[t] for t in times])

    def context_candidates(self, place):
        if place["id"] in self.nearby:
            return self.nearby[place["id"]]
        candidates = []
        if place["lat"] is not None and place["lng"] is not None:
            nx, ny = grid_coordinates(place["lat"], place["lng"])
            grid_id = f"kma-grid-{nx}-{ny}"
            for station in self.stations.values():
                if station["provider"] not in CONTEXT_PROVIDERS:
                    continue
                grid = (
                    station["source_id"] == grid_id
                    and station["kind"] == "weather_forecast_grid"
                )
                if (
                    not grid
                    and station["latitude"] is not None
                    and abs(station["latitude"] - place["lat"]) > degrees(10 / 6371)
                ):
                    continue
                distance = None
                if station["latitude"] is not None and station["longitude"] is not None:
                    distance = (
                        6371
                        * 2
                        * asin(
                            sqrt(
                                min(
                                    1.0,
                                    max(
                                        0.0,
                                        sin(
                                            radians(station["latitude"] - place["lat"])
                                            / 2
                                        )
                                        ** 2
                                        + cos(radians(place["lat"]))
                                        * cos(radians(station["latitude"]))
                                        * sin(
                                            radians(station["longitude"] - place["lng"])
                                            / 2
                                        )
                                        ** 2,
                                    ),
                                )
                            )
                        )
                    )
                if grid or (distance is not None and distance <= 10):
                    candidates.append((station, grid, distance))
        candidates.sort(
            key=lambda item: (
                not item[1],
                item[0]["name"].replace(" ", "") != place["name"].replace(" ", ""),
                item[2] if item[2] is not None else float("inf"),
                item[0]["id"],
            )
        )
        self.nearby[place["id"]] = candidates
        return candidates

    @staticmethod
    def _station_link(station, as_of, mapping=None):
        known = station["fetched_at"] is not None and station["fetched_at"] <= as_of
        return {
            "station_id": station["id"],
            "name": station["name"] if known else None,
            "kind": station["kind"] if known else None,
            "relation": "representative_station"
            if mapping
            else "station_observation_point",
            "mapping": mapping["payload"] if mapping else None,
        }

    def links(self, place, q, at, as_of, source_names):
        links = [
            self._station_link(self.stations[sid], as_of)
            for sid in self.direct[place["id"]]
            if self.stations[sid]["fetched_at"] <= as_of
            or self.stations[sid]["known_snapshot"]
        ]
        links += [
            self._station_link(self.stations[m["station_id"]], as_of, m)
            for m in self.mappings[place["id"]]
            if m["valid_from"] <= at < m["valid_until"]
            and q.activity in m["payload"]["activities"]
        ]
        if len(links) > 100:
            raise HTTPException(422, "response_scope_too_large")
        linked_ids = {link["station_id"] for link in links}
        context = []
        for station, grid, distance in self.context_candidates(place):
            product = PRODUCT_ACTIVITIES.get(station["provider"])
            if (
                station["fetched_at"] > as_of
                or (station["source_valid_from"] and station["source_valid_from"] > at)
                or (
                    station["source_valid_until"]
                    and station["source_valid_until"] <= at
                )
                or (product and q.activity not in product)
                or not source_names.intersection(self.presence[(station["id"], q.mode)])
            ):
                continue
            context.append(
                {
                    "station_id": station["id"],
                    "name": station["name"],
                    "kind": station["kind"],
                    "relation": "containing_forecast_grid"
                    if grid
                    else "nearby_station_context",
                    "mapping": None,
                    "distance_km": None if grid else distance,
                    "context_scope": "장소가 포함된 기상청 5km 격자; 장소 실측 아님"
                    if grid
                    else "10km 이내 주변 관측소 자료; 장소 대표성 미확인",
                }
            )
            if len(context) == 6:
                break
        links += [link for link in context if link["station_id"] not in linked_ids]
        if len({link["station_id"] for link in links}) != len(links):
            raise HTTPException(422, "ambiguous_station_mapping")
        return links

    def selected_rows(self, links, mode, source_names, at):
        rows = []
        for link in links:
            for name in sorted(source_names):
                times, slots = self.targets.get(
                    (link["station_id"], mode, name), ((), ())
                )
                position = bisect_right(times, at) - 1
                if position >= 0:
                    rows.extend(slots[position])
        if len(rows) > 100:
            raise HTTPException(422, "response_scope_too_large")
        return sorted(
            rows,
            key=lambda row: (
                row["station_id"],
                row["name"],
                row["snapshot_id"],
                row["metric_id"] or 0,
            ),
        )

    def intervals(self, place, q, source_names, start, end):
        station_ids = set(self.direct[place["id"]])
        mappings = [
            m
            for m in self.mappings[place["id"]]
            if q.activity in m["payload"]["activities"]
        ]
        station_ids.update(m["station_id"] for m in mappings)
        station_ids.update(s["id"] for s, _, _ in self.context_candidates(place))
        rows = [
            row
            for sid in station_ids
            for row in self.rows[(sid, q.mode)]
            if row["name"] in source_names
        ]
        authorities = self.authorities[(place["id"], q.activity)]
        if not rows and not authorities:
            return []
        if q.mode == "forecast":
            horizon = max(
                [
                    r["valid_until"] or r["snapshot_valid_until"]
                    for r in rows
                    if r["valid_until"] or r["snapshot_valid_until"]
                ]
                + [a["valid_until"] for a in authorities],
                default=start,
            )
            end = min(end, horizon)
        if end <= start:
            return []
        boundaries = {start, end}
        for row in rows:
            for key in ("observed_at", "valid_until"):
                value = row[key]
                if value and start < value < end:
                    boundaries.add(value)
        for item in [*mappings, *authorities]:
            for key in ("valid_from", "valid_until"):
                if start < item[key] < end:
                    boundaries.add(item[key])
        for sid in station_ids:
            station = self.stations[sid]
            for key in ("source_valid_from", "source_valid_until"):
                value = station[key]
                if value and start < value < end:
                    boundaries.add(value)
        times = sorted(boundaries)
        return list(zip(times, times[1:], strict=False))

    def envelope(self, place, q, at, as_of):
        allowed, requested, source_names = _requested(q.activity, q.mode)
        links = self.links(place, q, at, as_of, source_names)
        rows = self.selected_rows(links, q.mode, source_names, at)
        authorities = [
            a
            for a in self.authorities[(place["id"], q.activity)]
            if a["valid_from"] <= at < a["valid_until"]
        ]
        if len(authorities) > 100:
            raise HTTPException(422, "response_scope_too_large")
        authority = authority_conditions(authorities, q, at, as_of)
        key = None
        if q.as_of is None:
            key = self._envelope_key(q, at, as_of, links, rows, authority)
            if cached := self.envelopes.get(key):
                self.envelopes.move_to_end(key)
                return self._place_envelope(cached, place, q, at, as_of, links)
        result = assemble_conditions(
            place=place,
            links=links,
            rows=rows,
            q=q,
            at=at,
            as_of=as_of,
            allowed=allowed,
            requested=requested,
            authority=authority,
        )
        if key is not None:
            self.envelopes[key] = result
            if len(self.envelopes) > MAX_ENVELOPE_CACHE:
                self.envelopes.popitem(last=False)
        return result

    @staticmethod
    def _envelope_key(q, at, as_of, links, rows, authority):
        # Nearby places often use the same observations and forecast grid.
        # Distance affects selection only through ordering and exact ties;
        # retain both here, and restore each place's real distances on a hit.
        # Exact target/cutoff times keep expiry and knowledge boundaries intact.
        used = {row["station_id"] for row in rows}
        links = [link for link in links if link["station_id"] in used]
        distances = sorted(
            {
                link["distance_km"]
                for link in links
                if link.get("distance_km") is not None
            }
        )
        ranks = {distance: index for index, distance in enumerate(distances)}
        return (
            q.activity,
            q.mode,
            at,
            as_of,
            tuple((r["snapshot_id"], r["metric_id"], r["name"]) for r in rows),
            (authority[0], authority[1], tuple(authority[2]), tuple(authority[3])),
            tuple(
                (
                    link["station_id"],
                    link["name"],
                    link["kind"],
                    link["relation"],
                    (
                        link["mapping"]["mapping_id"],
                        link["mapping"]["spatial_scope"],
                    )
                    if link["mapping"]
                    else None,
                    ranks.get(link.get("distance_km")),
                    link.get("context_scope"),
                )
                for link in sorted(links, key=lambda link: link["station_id"])
            ),
        )

    @staticmethod
    def _place_envelope(cached, place, q, at, as_of, links):
        distances = {link["station_id"]: link.get("distance_km") for link in links}

        def located(item):
            distance = distances.get(item.station_id)
            return (
                item
                if item.distance_km == distance
                else item.model_copy(update={"distance_km": distance})
            )

        return cached.model_copy(
            update={
                "spot_id": q.spot_id,
                "place_name": place["name"],
                "at": at,
                "as_of": as_of,
                "metrics": tuple(located(m) for m in cached.metrics),
                "context_metrics": tuple(located(m) for m in cached.context_metrics),
                "display_metrics": tuple(located(m) for m in cached.display_metrics),
                "condition_score": cached.condition_score.model_copy(
                    update={
                        "components": tuple(
                            located(c) for c in cached.condition_score.components
                        )
                    }
                ),
            }
        )

    def records(self, now, start, end):
        return list(self.iter_records(now, start, end))

    def iter_records(self, now, start, end):
        """Yield complete intervals without retaining every large JSON payload."""
        count = 0
        for place in self.places:
            for activity in ACTIVITIES:
                for mode in ("observation", "forecast"):
                    q = ConditionQuery(
                        spot_id=place["id"], activity=activity, mode=mode
                    )
                    _, _, source_names = _requested(activity, mode)
                    previous = None
                    previous_content = None
                    for begin, finish in self.intervals(
                        place,
                        q,
                        source_names,
                        now if mode == "observation" else start,
                        min(end, start + timedelta(days=7))
                        if mode == "observation"
                        else end,
                    ):
                        # Future observation intervals only capture known expiry
                        # transitions. They never include unknown future readings;
                        # the snapshot reader supplies the actual query cutoff.
                        cutoff = max(now, begin) if mode == "observation" else now
                        payload = self.envelope(place, q, begin, cutoff).model_dump(
                            mode="json"
                        )
                        content = {
                            k: v for k, v in payload.items() if k not in {"at", "as_of"}
                        }
                        if previous is not None and content == previous_content:
                            previous["target_end"] = finish
                            continue
                        if previous is not None:
                            yield previous
                        previous = {
                            "spot_id": place["id"],
                            "activity": activity,
                            "mode": mode,
                            "target_start": begin,
                            "target_end": finish,
                            "payload": payload,
                        }
                        previous_content = content
                        count += 1
                        if count > MAX_RECORDS:
                            raise SourceScopeTooLargeError
                    if previous is not None:
                        yield previous


def produce_conditions(settings, *, now=None):
    """Publish all shared condition results atomically, outside HTTP handling."""
    from app.water_index.condition_storage import (
        projection_is_current,
        projection_revision,
        publish_conditions,
    )

    with connect(settings) as c:
        c.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        now = now or c.execute("SELECT clock_timestamp()").fetchone()[0]
        if now.tzinfo is None or now > datetime.now(UTC):
            raise ValueError("Producer cannot use naive or future knowledge")
        source_revision = projection_revision(c)
        start = now.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
        if projection_is_current(c, source_revision, start):
            return 0
        # The same generation is reused throughout this KST day. Cover the
        # public 31-day target window even for a query near the end of the day.
        end = start + timedelta(days=32)
        inputs = _load_inputs(c, now, start, end)
    records = inputs.iter_records(now, start, end)
    return publish_conditions(
        settings, records=records, computed_at=now, source_revision=source_revision
    )
