import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, HTTPException

from app.ai.service import create_ai_router
from app.config import Settings
from app.data_reader import create_data_router
from app.database import check_database
from app.forecast.api import create_forecast_router
from app.livecams.service import create_livecam_router
from app.notifications.api import create_router as create_notifications_router
from app.quality.api import create_router as create_quality_router
from app.tides.api import create_tides_router
from app.twin.api import create_twin_router
from app.water_index.api import create_water_index_router
from app.water_index.condition_api import create_condition_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        await check_database(settings)
        yield

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
    app.include_router(create_water_index_router(settings))
    app.include_router(create_condition_router(settings))
    app.include_router(create_forecast_router(settings))
    app.include_router(create_twin_router(settings))
    app.include_router(create_livecam_router(settings))
    app.include_router(create_tides_router(settings))
    app.include_router(create_notifications_router(settings))
    app.include_router(create_quality_router(settings))
    app.include_router(create_ai_router(settings))
    return app
