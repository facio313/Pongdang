import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, HTTPException

from app.collector import create_collector_router
from app.config import Settings
from app.database import check_database
from app.demo import create_demo_router


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

    app.include_router(create_collector_router(settings))
    app.include_router(create_demo_router(settings))
    return app
