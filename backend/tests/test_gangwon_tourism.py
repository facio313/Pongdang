from datetime import UTC, datetime

import pytest

from app.config import Settings
from app.ingestion.gangwon import (
    DISTRICTS,
    GangwonTourism,
    gangwon_tourism_jobs,
    job_name,
)
from app.ingestion.http import ProviderError
from app.ingestion.places import place_jobs
from app.ingestion.storage import store_batch
from app.ingestion.water_tour_extra import water_tour_extra_jobs
from app.schema import connect, initialize

NOW = datetime(2026, 9, 20, tzinfo=UTC)


def settings(**changes):
    return Settings(
        _env_file=None,
        postgres_password="test",
        data_go_kr_key="test%2Bkey",
        **changes,
    )


def place(number, **changes):
    return {
        "contentid": str(number),
        "title": f"Provider place {number}",
        "mapx": "128.9",
        "mapy": "37.8",
        "lDongRegnCd": "51",
        "lDongSignguCd": "150",
        "addr1": "강원특별자치도 강릉시",
        "contenttypeid": "12",
        "createdtime": "20210503140000",
        "modifiedtime": "20240523142523",
        **changes,
    }


class Client:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []
        self.rewrite = None

    def get_json(self, url, params):
        self.calls.append((url, params))
        page = params["pageNo"]
        rows = self.rows[(page - 1) * 100 : page * 100]
        response = {
            "response": {
                "header": {"resultCode": "0000"},
                "body": {"items": {"item": rows}, "totalCount": len(self.rows)},
            }
        }
        return self.rewrite(page, response) if self.rewrite else response


def collector(rows, **changes):
    return GangwonTourism(settings(**changes), Client(rows), lambda: NOW)


@pytest.mark.parametrize(
    "language", ["korean", "english", "japanese", "chinese_simplified"]
)
def test_scope_continues_after_500_with_existing_provider_identity(language):
    provider = collector([place(n) for n in range(650)])
    first = provider.fetch(language, "150")
    assert len(first.batch.places) == 500
    assert first.cursor["next_page"] == 6
    assert len(provider.client.calls) == 5
    second = provider.fetch(language, "150", first.cursor)
    assert len(second.batch.places) == 150
    assert second.cursor == {}
    assert second.batch.coverage == "complete"
    assert len(provider.client.calls) == 9  # first + previous + two new pages
    assert second.batch.provider == (
        "TOURAPI_KOREAN" if language == "korean" else "tourapi_" + language
    )
    assert second.batch.places[0].source_id == "500"
    assert second.batch.places[0].region == "51:150"
    assert second.batch.places[0].source_modified_at.year == 2024
    assert not second.batch.readings
    for url, params in provider.client.calls:
        assert url.endswith("/areaBasedList2")
        assert params["lDongRegnCd"] == "51"
        assert params["lDongSignguCd"] == "150"
        assert params["serviceKey"] == "test+key"
        assert "radius" not in params and "areaCode" not in params
        assert params["arrange"] == "D"


@pytest.mark.parametrize("changed_page", [1, 2])
def test_boundary_revision_restarts_sweep_in_same_bounded_invocation(changed_page):
    provider = collector([place(n) for n in range(350)], tourism_pages_per_run=2)
    first = provider.fetch("korean", "150")
    provider.client.rows[(changed_page - 1) * 100]["title"] = "Source revision"
    second = provider.fetch("korean", "150", first.cursor)
    assert second.restarted
    assert second.batch.places[0].source_id == "0"
    assert second.cursor["next_page"] == 3
    assert len(provider.client.calls) == 4  # both restart pages reused from checks


def test_changed_total_restarts_and_shorter_catalog_can_complete():
    provider = collector([place(n) for n in range(350)], tourism_pages_per_run=2)
    first = provider.fetch("korean", "150")
    provider.client.rows = provider.client.rows[:50]
    second = provider.fetch("korean", "150", first.cursor)
    assert second.restarted and not second.cursor
    assert len(second.batch.places) == 50


def test_missing_coordinates_are_skipped_but_cursor_counts_real_provider_rows():
    provider = collector(
        [place(n, mapx="") for n in range(101)], tourism_pages_per_run=1
    )
    first = provider.fetch("english", "150")
    assert first.batch.places == [] and first.received == 100
    second = provider.fetch("english", "150", first.cursor)
    assert second.batch.places == [] and second.received == 1 and not second.cursor


def test_duplicates_including_prior_chunks_cannot_silently_overwrite():
    provider = collector([place(n) for n in range(201)], tourism_pages_per_run=1)
    first = provider.fetch("english", "150")
    provider.client.rows[110] = place(10, title="Conflicting later record")
    with pytest.raises(ProviderError, match="PAGINATION_REPEATED_RECORD"):
        provider.fetch("english", "150", first.cursor)


@pytest.mark.parametrize("changes", [{"lDongRegnCd": "11"}, {"lDongSignguCd": "110"}])
def test_provider_ignoring_region_filter_fails(changes):
    with pytest.raises(ProviderError, match="UNEXPECTED_TOURISM_REGION"):
        collector([place(1, **changes)]).fetch("korean", "150")


def test_incomplete_page_and_mid_chunk_total_change_fail_without_new_cursor():
    provider = collector([place(n) for n in range(201)])

    def truncated(page, response):
        if page == 2:
            response["response"]["body"]["items"]["item"].pop()
        return response

    provider.client.rewrite = truncated
    with pytest.raises(ProviderError, match="INCOMPLETE_PAGINATION"):
        provider.fetch("korean", "150")

    def total_change(page, response):
        if page == 2:
            response["response"]["body"]["totalCount"] += 1
        return response

    provider.client.rewrite = total_change
    with pytest.raises(ProviderError, match="PAGINATION_TOTAL_CHANGED"):
        provider.fetch("korean", "150")


def test_empty_scope_is_real_empty_and_unapproved_language_never_calls_provider():
    provider = collector([])
    result = provider.fetch("korean", "150")
    assert result.batch.places == [] and result.cursor == {} and result.total == 0
    with pytest.raises(ProviderError, match="SERVICE_APPROVAL_UNCONFIRMED"):
        provider.fetch("chinese_traditional", "150")
    assert len(provider.client.calls) == 1


def test_explicit_job_scopes_keep_local_option_and_traditional_approval():
    jobs = gangwon_tourism_jobs(settings(tourism_collection_scope="gangwon"))
    assert len(jobs) == len(DISTRICTS) * 5 == 90
    assert len({job.name for job in jobs}) == 90
    assert sum(job.enabled for job in jobs) == 72
    assert all(job.process is not None for job in jobs)
    local = settings(tourism_collection_scope="local")
    assert not any(job.enabled for job in gangwon_tourism_jobs(local))
    assert next(
        job for job in place_jobs(local) if job.name == "tourism_places"
    ).enabled
    gangwon = settings(tourism_collection_scope="gangwon")
    assert not next(
        job for job in place_jobs(gangwon) if job.name == "tourism_places"
    ).enabled
    languages = [
        job for job in water_tour_extra_jobs(gangwon) if job.name == "tourapi_english"
    ]
    assert not languages[0].enabled
    assert job_name("korean", "150") != job_name("english", "150")


@pytest.fixture
def database():
    config = Settings()
    if config.postgres_db != "pongdang_test":
        pytest.fail("Requires disposable pongdang_test database")
    initialize(config)
    yield config.model_copy(
        update={
            "tourism_pages_per_run": 1,
            "data_go_kr_key": settings().data_go_kr_key,
        }
    )
    with connect(config) as connection:
        connection.execute("DROP SCHEMA pongdang_data CASCADE")


def test_database_cursor_survives_restart_and_keeps_existing_spot_identity(database):
    old = collector([place(0)]).fetch("korean", "150").batch
    old.places[0].region = "32:1"
    old.places[0].name = "Previous provider title"
    store_batch(database, old)
    with connect(database) as connection:
        original_id = connection.execute(
            "SELECT spot_id FROM pongdang_data.collection_place "
            "WHERE provider='TOURAPI_KOREAN' AND source_id='0'"
        ).fetchone()[0]
    provider = GangwonTourism(
        database, Client([place(n) for n in range(101)]), lambda: NOW
    )
    result = provider.collect("korean", "150")
    assert result == {
        "received": 100,
        "inserted": 99,
        "state": "partial",
        "error": "CATALOG_CONTINUATION_PENDING",
        "next_run_seconds": 60,
    }
    restarted = GangwonTourism(database, provider.client, lambda: NOW)
    result = restarted.collect("korean", "150")
    assert result["state"] == "succeeded" and result["inserted"] == 1
    assert "next_run_seconds" not in result
    with connect(database) as connection:
        assert connection.execute(
            "SELECT spot_id,region,name FROM pongdang_data.collection_place "
            "WHERE provider='TOURAPI_KOREAN' AND source_id='0'"
        ).fetchone() == (original_id, "51:150", "Provider place 0")
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.collection_place"
            ).fetchone()[0]
            == 101
        )
        cursor, completed = connection.execute(
            "SELECT cursor,completed_at FROM pongdang_data.collection_scope_cursor "
            "WHERE task_name=%s",
            [job_name("korean", "150")],
        ).fetchone()
        assert cursor == {} and completed == NOW


def test_database_cursor_and_places_rollback_together_on_storage_error(
    database, monkeypatch
):
    import app.ingestion.gangwon as module

    provider = GangwonTourism(
        database, Client([place(n) for n in range(201)]), lambda: NOW
    )
    provider.collect("korean", "150")

    def fail_after_insert(*args, **kwargs):
        store_batch(*args, **kwargs)
        raise RuntimeError("Interruption before committing the cursor")

    monkeypatch.setattr(module, "store_batch", fail_after_insert)
    with pytest.raises(RuntimeError):
        provider.collect("korean", "150")
    with connect(database) as connection:
        assert (
            connection.execute(
                "SELECT count(*) FROM pongdang_data.collection_place"
            ).fetchone()[0]
            == 100
        )
        assert (
            connection.execute(
                "SELECT cursor->>'next_page' FROM pongdang_data.collection_scope_cursor"
            ).fetchone()[0]
            == "2"
        )
    monkeypatch.setattr(module, "store_batch", store_batch)
    assert provider.collect("korean", "150")["inserted"] == 100
    assert provider.collect("korean", "150")["inserted"] == 1
