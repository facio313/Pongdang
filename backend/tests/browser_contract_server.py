"""Explicit browser-test server; only disposable local pongdang_test is allowed.

No provider network calls. This module is never imported by the application.
"""

import os
from datetime import UTC, datetime, timedelta

import uvicorn
from test_condition_score_integration import ACTIVITIES, source, station
from test_travel_keywords_routes import RoutesFixture

from app.config import Settings
from app.ingestion.models import Place, Reading, SourceBatch, Station, Value
from app.ingestion.storage import store_batch
from app.main import create_app
from app.schema import connect, initialize
from app.travel import routing
from app.water_index.sources import EvidenceBundle, StationMapping, register_evidence


def test_app():
    settings = Settings(
        _env_file=None,
        ai_provider="disabled",
        travel_route_provider="disabled",
        sso_proxy_secret="browser-fixture-server-only-secret-32-characters",
        sso_allowed_origins="http://127.0.0.1:5177",
    )
    if (
        os.environ.get("PONGDANG_BROWSER_TEST") != "1"
        or settings.postgres_db != "pongdang_test"
        or settings.postgres_host != "127.0.0.1"
    ):
        raise RuntimeError("Explicit disposable local browser test DB required")
    with connect(settings) as connection:
        connection.execute("DROP SCHEMA IF EXISTS pongdang_data CASCADE")
    initialize(settings)
    now = datetime.now(UTC) - timedelta(seconds=5)
    store_batch(
        settings,
        SourceBatch(
            provider="TOURAPI_KOREAN",
            fetched_at=now,
            places=[
                Place(
                    source_id=str(index),
                    name=name,
                    kind=kind,
                    category="온천" if kind == "onsen" else "해수욕장",
                    region="강릉",
                    latitude=37.8 + index / 100,
                    longitude=128.9 + index / 100,
                )
                for index, (name, kind) in enumerate(
                    [
                        ("강릉 경포 OFFLINE TEST 해변", "beach"),
                        ("강릉 OFFLINE TEST 온천", "onsen"),
                        ("강릉 OFFLINE TEST 계곡", "valley"),
                    ]
                )
            ],
        ),
    )
    # Regression for real KHOA beach records: no collection_place row and no
    # region text, but still a real selectable water place in spots_waterspot.
    store_batch(
        settings,
        SourceBatch(
            provider="khoa_beach",
            fetched_at=now,
            stations=[
                Station(
                    source_id="browser-station-beach",
                    name="강릉 OFFLINE TEST 관측 해수욕장",
                    kind="beach",
                    latitude=37.85,
                    longitude=128.95,
                )
            ],
        ),
    )
    # Explicit fixture-only administrative evidence for an otherwise addressless
    # station place. The product uses provider-confirmed coordinate lookup.
    with connect(settings) as connection:
        connection.execute(
            "INSERT INTO pongdang_data.collection_place_region "
            "(spot_id,province_code,district_code,provider,provider_region_code,"
            "source_url,verified_at,latitude,longitude) "
            "SELECT spot_id,'gangwon','gangneung','OFFLINE_TEST','5115000000',"
            "'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json',%s,"
            "37.85,128.95 FROM pongdang_data.collection_station "
            "WHERE source_id='browser-station-beach'",
            [now],
        )
    # Real adapter shape, isolated test records: foreign addresses/region codes
    # cannot match the recommendation screen's former hard-coded Korean query.
    for provider, name in (
        ("english", "OFFLINE TEST English attraction"),
        ("japanese", "OFFLINE TEST 日本語観光地"),
        ("chinese_simplified", "OFFLINE TEST 简体中文景点"),
    ):
        store_batch(
            settings,
            SourceBatch(
                provider="tourapi_" + provider,
                fetched_at=now,
                places=[
                    Place(
                        source_id="browser-language-" + provider,
                        name=name,
                        kind="tourism",
                        category="75",
                        region="32:1",
                        latitude=37.81,
                        longitude=128.91,
                    )
                ],
            ),
        )
    batch = source(
        values=[
            Value(name="air_temperature", numeric_value=24.7, unit="degC"),
            Value(name="water_temperature", numeric_value=21.3, unit="degC"),
            Value(name="wave_height", numeric_value=0.4, unit="m"),
            Value(name="precipitation", numeric_value=0, unit="mm/1h"),
        ],
        fetched_at=now,
    )
    store_batch(settings, batch)
    sid, _ = station(settings)
    with connect(settings) as connection:
        place_id = connection.execute(
            "SELECT spot_id FROM pongdang_data.collection_place "
            "WHERE provider='TOURAPI_KOREAN' AND source_id='0'"
        ).fetchone()[0]
    register_evidence(
        settings,
        EvidenceBundle(
            mappings=[
                StationMapping(
                    mapping_id="browser-fixture-mapping",
                    spot_id=place_id,
                    station_id=sid,
                    spatial_scope="OFFLINE TEST FIXTURE ONLY",
                    mapping_version="fixture.v1",
                    evidence_ref="offline-fixture",
                    source_url="https://www.weather.go.kr/fixture",
                    authority="offline test",
                    reviewed_by="offline test",
                    activities=ACTIVITIES,
                    valid_from=now - timedelta(days=1),
                    valid_until=now + timedelta(days=1),
                )
            ]
        ),
    )
    # Historical lab evidence tests the public read path; never loaded by app startup.
    lab = Station(
        source_id="browser-quality",
        name="OFFLINE TEST 수질 관측소",
        kind="marine_water_quality",
        latitude=37.801,
        longitude=128.901,
    )
    store_batch(
        settings,
        SourceBatch(
            provider="koem_water_quality",
            fetched_at=now,
            readings=[
                Reading(
                    source_id="browser-quality-sample",
                    station=lab,
                    observed_at=now - timedelta(days=300),
                    valid_until=now - timedelta(days=299),
                    spatial_scope="OFFLINE TEST lab sample",
                    values=[
                        Value(
                            name="official_wqi_grade", numeric_value=2, text_value="2"
                        ),
                        Value(name="water_layer", text_value="surface"),
                        Value(name="ph", numeric_value=8.1),
                    ],
                )
            ],
        ),
    )
    routing.KakaoDirections = lambda *_: RoutesFixture()
    app = create_app(settings)

    @app.middleware("http")
    async def fixture_owner(request, call_next):
        # Emulate the server-side SSO ingress; no test credential reaches JS.
        request.scope["headers"] += [
            (
                b"x-pongdang-sso-token",
                settings.sso_proxy_secret.get_secret_value().encode(),
            ),
            (b"x-pongdang-sso-subject", b"browser-fixture-owner"),
            (b"x-pongdang-sso-grants", b"access-pongdang"),
        ]
        return await call_next(request)

    return app


if __name__ == "__main__":
    uvicorn.run(test_app(), host="127.0.0.1", port=8099)
