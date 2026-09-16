"""Load the deployment key and authenticate only with the selected route key."""

import asyncio
from datetime import UTC, datetime

import httpx
import pytest

from app.config import Settings
from app.travel.directions import DirectionError, KakaoDirections, availability


@pytest.mark.parametrize(
    "route_key, collection_key, expected",
    [
        ("route-test-key", "collection-test-key", "route-test-key"),
        ("route-test-key", "", "route-test-key"),
        ("", "collection-test-key", "collection-test-key"),
        ("  ", "", None),
    ],
)
def test_deployment_env_selects_route_key_without_changing_collection_key(
    tmp_path, monkeypatch, route_key, collection_key, expected
):
    for name in ("KAKAO_REST_API_KEY", "KAKAO_REST_KEY", "TRAVEL_ROUTE_PROVIDER"):
        monkeypatch.delenv(name, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        f'KAKAO_REST_API_KEY="{route_key}"\n'
        f'KAKAO_REST_KEY="{collection_key}"\n'
        "TRAVEL_ROUTE_PROVIDER=kakao\n"
    )
    settings = Settings(_env_file=env_file, postgres_password="isolated-test")
    assert settings.kakao_rest_key.get_secret_value() == collection_key
    assert availability(settings) == ("configured" if expected else "unconfigured")
    calls = []

    async def handler(request):
        calls.append(request.url.path)
        assert request.url.path == "/v1/directions"
        assert request.headers["Authorization"] == f"KakaoAK {expected}"
        return httpx.Response(
            200,
            json={
                "trans_id": "isolated-source-id",
                "routes": [
                    {"result_code": 0, "summary": {"distance": 1000, "duration": 600}}
                ],
            },
        )

    async def run():
        now = datetime.now(UTC)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = KakaoDirections(settings, now, client=client)
            if expected is None:
                with pytest.raises(DirectionError, match="route_provider_unconfigured"):
                    await adapter.leg(
                        {"longitude": 128, "latitude": 37},
                        {"longitude": 129, "latitude": 38},
                        now,
                    )
                return
            result = await adapter.leg(
                {"longitude": 128, "latitude": 37},
                {"longitude": 129, "latitude": 38},
                now,
            )
            assert result["duration_seconds"] == 600
            assert expected not in str(result)
            assert expected not in repr(settings)

    asyncio.run(run())
    assert calls == (["/v1/directions"] if expected else [])


def test_rejected_route_key_does_not_retry_with_collection_key():
    settings = Settings(
        _env_file=None,
        postgres_password="isolated-test",
        travel_route_provider="kakao",
        kakao_rest_api_key="rejected-route-test-key",
        kakao_rest_key="collection-test-key",
    )
    calls = []

    async def handler(request):
        calls.append(request.url.path)
        assert request.headers["Authorization"] == "KakaoAK rejected-route-test-key"
        return httpx.Response(401, json={"msg": "private provider detail"})

    async def run():
        now = datetime.now(UTC)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            adapter = KakaoDirections(settings, now, client=client)
            for _ in range(2):
                with pytest.raises(
                    DirectionError, match="route_provider_authentication_failed"
                ) as error:
                    await adapter.leg(
                        {"longitude": 128, "latitude": 37},
                        {"longitude": 129, "latitude": 38},
                        now,
                    )
                assert "private provider detail" not in str(error.value)
                assert "test-key" not in str(error.value)

    asyncio.run(run())
    assert len(calls) == 1
