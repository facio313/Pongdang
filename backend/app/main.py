import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, HTTPException

from app.ai.chat import create_chat_router
from app.ai.service import create_ai_router
from app.attachments.api import create_attachment_router
from app.config import Settings
from app.data_reader import create_data_router
from app.database import check_database
from app.forecast.api import create_forecast_router
from app.livecams.places import create_places_router
from app.livecams.preview import create_preview_router
from app.livecams.service import create_livecam_router
from app.notifications.api import create_router as create_notifications_router
from app.place_details.api import create_place_details_router
from app.quality.api import create_router as create_quality_router
from app.refresh.api import create_router as create_refresh_router
from app.tides.api import create_tides_router
from app.travel.api import create_router as create_travel_router
from app.twin.api import create_twin_router
from app.water_index.api import create_water_index_router
from app.water_index.condition_api import create_condition_router
from app.water_index.default_place import create_default_place_router
from app.water_index.recommendation_api import create_recommendation_router


def create_app(
    settings: Settings | None = None, *, chat_factory=create_chat_router
) -> FastAPI:
    settings = settings or Settings()

    chat_router, ai_provider = chat_factory(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            await check_database(settings)
            yield
        finally:
            await ai_provider.aclose()

    app = FastAPI(
        title="Pongdang API",
        version="0.1.0",
        root_path=settings.api_root_path,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    @app.get("/api/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/ready", tags=["health"])
    async def ready() -> dict[str, str]:
        try:
            async with asyncio.timeout(5):
                await check_database(settings)
        except (psycopg.Error, TimeoutError) as exc:
            raise HTTPException(status_code=503, detail="Database unavailable") from exc
        return {"status": "ok"}

    app.include_router(create_data_router(settings))
    app.include_router(create_refresh_router(settings))
    app.include_router(create_places_router(settings))
    app.include_router(create_attachment_router(settings))
    app.include_router(create_place_details_router(settings))
    app.include_router(create_water_index_router(settings))
    app.include_router(create_condition_router(settings))
    app.include_router(create_default_place_router(settings))
    app.include_router(create_recommendation_router(settings))
    app.include_router(create_forecast_router(settings))
    app.include_router(create_twin_router(settings))
    app.include_router(create_livecam_router(settings))
    app.include_router(create_preview_router(settings))
    app.include_router(create_tides_router(settings))
    app.include_router(create_notifications_router(settings))
    app.include_router(create_quality_router(settings))
    app.include_router(create_ai_router(settings))
    app.include_router(create_travel_router(settings))
    app.include_router(chat_router)
    return app
