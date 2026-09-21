"""Local catalog revisions must drive the same detail cache as district catalogs."""

from datetime import UTC, datetime

from app.config import Settings
from app.ingestion.places import tourism_places


def test_local_tourism_catalog_preserves_source_revision_and_region():
    class Client:
        def get_json(self, url, params):
            return {
                "response": {
                    "body": {
                        "totalCount": 1,
                        "items": {
                            "item": [
                                {
                                    "contentid": "1234",
                                    "contenttypeid": "12",
                                    "title": "경포해변",
                                    "mapx": "128.909",
                                    "mapy": "37.805",
                                    "addr1": "강원특별자치도 강릉시",
                                    "lDongRegnCd": "51",
                                    "lDongSignguCd": "150",
                                    "createdtime": "20200101000000",
                                    "modifiedtime": "20200102030405",
                                }
                            ],
                        },
                    },
                },
            }

    settings = Settings(_env_file=None, postgres_password="offline-fixture")
    batch = tourism_places(settings, client=Client())
    place = batch.places[0]
    assert place.source_id == "1234"
    assert place.region == "51:150"
    assert place.source_created_at.astimezone(UTC) == datetime(
        2019, 12, 31, 15, tzinfo=UTC
    )
    assert place.source_modified_at.astimezone(UTC) == datetime(
        2020, 1, 1, 18, 4, 5, tzinfo=UTC
    )
