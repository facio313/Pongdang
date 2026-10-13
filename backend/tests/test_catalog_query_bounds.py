"""Catalogue count/filter reads exclude badge work and avoid JIT compilation."""

import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime

import pytest

from app.livecams.places import (
    read_nearby_places,
    read_places_page,
    with_catalog_verification,
)
from app.livecams.preview import read_preview_places
from app.travel.catalog import Catalog
from app.travel.models import TravelRequest


class Result:
    def __init__(self, rows):
        self.rows = rows

    async def fetchone(self):
        return self.rows[0] if self.rows else None

    async def fetchall(self):
        return self.rows


class Reader:
    def __init__(self, *results):
        self.results = list(results)
        self.queries = []

    @asynccontextmanager
    async def connection(self):
        yield self

    async def execute(self, query, params=None):
        self.queries.append((query, params))
        if query == "SET LOCAL jit=off":
            return Result([])
        if "catalog_check" in query:
            assert len(params[0]) <= 100
            return Result(
                [{"id": sid, "catalog_verified_at": None} for sid in params[0]]
            )
        return Result(self.results.pop(0))


def place(sid=1):
    return {
        "id": sid,
        "name": "Catalogue place",
        "place_kind": "beach",
        "lat": 37.8,
        "lng": 128.9,
        "province_code": "gangwon",
        "catalog_verified_at": datetime.now(UTC),
    }


def assert_bounded_catalog(reader, expected_ids):
    assert reader.queries[0] == ("SET LOCAL jit=off", None)
    badge_queries = [query for query in reader.queries if "catalog_check" in query[0]]
    assert badge_queries == [reader.queries[-1]]
    assert badge_queries[0][1] == [expected_ids]
    assert all("collection_job" not in query for query, _ in reader.queries[:-1])
    assert reader.results == []


def test_places_count_and_page_do_not_verify_unreturned_rows():
    rows = [place(20), place(21)]
    reader = Reader([{"total": 1000}], rows)
    result = asyncio.run(read_places_page(reader, page=11, page_size=2))
    assert result["total"] == 1000
    assert result["has_more"] is True
    assert_bounded_catalog(reader, [20, 21])
    assert reader.queries[2][1][-2:] == [2, 20]
    assert all(row["catalog_recently_verified"] is False for row in result["rows"])
    assert all(row["catalog_verified_at"] is None for row in result["rows"])


@pytest.mark.parametrize("spot_id", [None, 1])
def test_preview_list_and_explicit_id_use_bounded_badges(spot_id):
    reader = Reader([place()])
    result = asyncio.run(read_preview_places(reader, spot_id=spot_id))
    assert_bounded_catalog(reader, [1])
    assert result[0]["catalog_recently_verified"] is False


def test_nearby_badges_only_include_nearest_returned_places():
    reader = Reader([{**place(), "canonical_id": 1}], [place(2)])
    result = asyncio.run(read_nearby_places(reader, 1, limit=1))
    assert_bounded_catalog(reader, [2])
    assert reader.queries[2][1][-1] == 1
    assert result["rows"][0]["catalog_recently_verified"] is False


@pytest.mark.parametrize("search", [True, False])
def test_travel_count_candidates_and_explicit_ids_have_bounded_badges(
    monkeypatch, search
):
    row = {
        **place(),
        "spot_id": 1,
        "type": "beach",
        "provider": "tourapi_english",
        "source_id": "official-1",
        "category": "76",
    }
    reader = Reader(*([[{"count": 1}], [row]] if search else [[row]]))
    catalog = Catalog(None, datetime.now(UTC), reader=reader)

    async def already_tested_details(*args):
        return None

    monkeypatch.setattr(catalog, "_with_stored_details", already_tested_details)
    if search:
        result, _ = asyncio.run(catalog.search(TravelRequest(locale="en")))
        assert result[0]["catalog_recently_verified"] is False
    else:
        result = asyncio.run(catalog.places([1]))
        assert result[1]["catalog_recently_verified"] is False
    assert_bounded_catalog(reader, [1])


def test_badge_reads_are_chunked_and_empty_candidates_make_no_query():
    reader = Reader()
    asyncio.run(with_catalog_verification(reader, []))
    assert reader.queries == []
    rows = [{"spot_id": sid} for sid in range(1, 302)]
    asyncio.run(with_catalog_verification(reader, rows, id_key="spot_id"))
    assert [len(params[0]) for _, params in reader.queries] == [100, 100, 100, 1]
    assert all(row["catalog_recently_verified"] is False for row in rows)
