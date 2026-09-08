import asyncio
import json
import math
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

import psycopg
from fastapi import APIRouter, HTTPException, Query
from psycopg import sql
from psycopg.rows import dict_row

from app.config import Settings

CATALOG = json.loads(Path(__file__).with_name("collector_catalog.json").read_text())
DATASETS = {item["key"]: item for item in CATALOG}


def clean_value(value: Any) -> Any:
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {key: clean_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_value(item) for item in value]
    return value


class CollectorReader:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.slots = asyncio.Semaphore(4)
        self.summary_lock = asyncio.Lock()
        self.cached_summary: dict[str, Any] | None = None
        self.cache_until = 0.0

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[psycopg.AsyncConnection]:
        settings = self.settings
        if not settings.collector_db_host or not settings.collector_db_password:
            raise HTTPException(503, "수집 데이터 DB 연결이 설정되지 않았습니다.")
        acquired = False
        try:
            async with asyncio.timeout(1):
                await self.slots.acquire()
                acquired = True
            async with asyncio.timeout(12):
                async with await psycopg.AsyncConnection.connect(
                    host=settings.collector_db_host,
                    port=settings.collector_db_port,
                    dbname=settings.collector_db_name,
                    user=settings.collector_db_user,
                    password=settings.collector_db_password.get_secret_value(),
                    connect_timeout=3,
                    options=(
                        "-c default_transaction_read_only=on "
                        "-c statement_timeout=3000 -c lock_timeout=500 "
                        "-c idle_in_transaction_session_timeout=5000"
                    ),
                    row_factory=dict_row,
                ) as connection:
                    await connection.execute(
                        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
                    )
                    yield connection
        except psycopg.Error, TimeoutError:
            raise HTTPException(
                503, "수집 데이터 DB를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요."
            ) from None
        finally:
            if acquired:
                self.slots.release()

    async def summary(self) -> dict[str, Any]:
        async with self.summary_lock:
            if self.cached_summary and time.monotonic() < self.cache_until:
                return self.cached_summary
            async with self.connection() as connection:
                datasets = []
                for dataset in CATALOG:
                    latest = (
                        sql.SQL("max({})").format(sql.Identifier(dataset["time"]))
                        if dataset["time"]
                        else sql.SQL("NULL")
                    )
                    query = sql.SQL(
                        "SELECT count(*) AS count, {} AS latest_at FROM public.{}"
                    ).format(latest, sql.Identifier(dataset["table"]))
                    result = await (await connection.execute(query)).fetchone()
                    datasets.append({**dataset, **result})
                heartbeat = await (
                    await connection.execute(
                        "SELECT state,current_tasks,last_seen_at "
                        "FROM public.conditions_pipelineheartbeat "
                        "WHERE key='condition-pipeline'"
                    )
                ).fetchone()
                now = datetime.now(UTC)
                if heartbeat:
                    age = max(0, (now - heartbeat["last_seen_at"]).total_seconds())
                    heartbeat = {
                        **heartbeat,
                        "age_seconds": round(age),
                        "effective_state": "stale" if age > 900 else heartbeat["state"],
                    }
                providers = await (
                    await connection.execute(
                        "SELECT provider,state,count(*) AS count,"
                        "max(fetched_at) AS latest_at "
                        "FROM public.conditions_observationsnapshot "
                        "GROUP BY provider,state "
                        "ORDER BY provider,state"
                    )
                ).fetchall()
                tasks = await (
                    await connection.execute(
                        "SELECT DISTINCT ON (task_name) task_name,status,started_at,"
                        "finished_at,error_code FROM public.conditions_ingestionrun "
                        "ORDER BY task_name,started_at DESC,id DESC"
                    )
                ).fetchall()
                forecasts = await (
                    await connection.execute(
                        "SELECT availability,safety_status,count(*) AS count "
                        "FROM public.forecasts_dailyforecast "
                        "GROUP BY availability,safety_status "
                        "ORDER BY availability,safety_status"
                    )
                ).fetchall()
                result = clean_value(
                    {
                        "queried_at": now,
                        "database": "cksDB / Multtara",
                        "datasets": datasets,
                        "heartbeat": heartbeat,
                        "providers": providers,
                        "tasks": tasks,
                        "forecasts": forecasts,
                    }
                )
            self.cached_summary = result
            self.cache_until = time.monotonic() + 30
            return result

    async def rows(
        self,
        key: str,
        page: int,
        page_size: int,
        q: str,
        sort: str,
        direction: str,
        filter_column: str,
        filter_value: str,
    ) -> dict[str, Any]:
        dataset = DATASETS.get(key)
        if dataset is None:
            raise HTTPException(404, "조회할 수 없는 데이터셋입니다.")
        columns = {column["key"]: column for column in dataset["columns"]}
        if sort not in columns or columns[sort]["type"] == "json":
            raise HTTPException(422, "지원하지 않는 정렬 항목입니다.")
        if filter_column and (
            filter_column not in columns or columns[filter_column]["type"] == "json"
        ):
            raise HTTPException(422, "지원하지 않는 필터 항목입니다.")
        predicates = []
        parameters: list[Any] = []
        if q.strip():
            if not dataset["search"]:
                raise HTTPException(
                    422, "이 데이터셋은 검색 대신 열 필터를 사용합니다."
                )
            escaped = (
                q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            )
            predicates.append(
                sql.SQL("({})").format(
                    sql.SQL(" OR ").join(
                        sql.SQL("{} ILIKE %s").format(sql.Identifier(column))
                        for column in dataset["search"]
                    )
                )
            )
            parameters.extend([f"%{escaped}%"] * len(dataset["search"]))
        if filter_column and filter_value != "":
            predicates.append(
                sql.SQL("{}::text = %s").format(sql.Identifier(filter_column))
            )
            parameters.append(filter_value)
        where = (
            sql.SQL(" WHERE {}").format(sql.SQL(" AND ").join(predicates))
            if predicates
            else sql.SQL("")
        )
        table = sql.Identifier("public", dataset["table"])
        async with self.connection() as connection:
            count = await (
                await connection.execute(
                    sql.SQL("SELECT count(*) AS total FROM {}{}").format(table, where),
                    parameters,
                )
            ).fetchone()
            query = sql.SQL(
                "SELECT {} FROM {}{} ORDER BY {} {} NULLS LAST, id DESC "
                "LIMIT %s OFFSET %s"
            ).format(
                sql.SQL(", ").join(map(sql.Identifier, columns)),
                table,
                where,
                sql.Identifier(sort),
                sql.SQL("ASC" if direction == "asc" else "DESC"),
            )
            rows = await (
                await connection.execute(
                    query,
                    [*parameters, page_size, (page - 1) * page_size],
                )
            ).fetchall()
        return clean_value(
            {
                "dataset": dataset,
                "rows": rows,
                "total": count["total"],
                "page": page,
                "page_size": page_size,
                "queried_at": datetime.now(UTC),
            }
        )


def create_collector_router(settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/api/collector", tags=["collector"])
    reader = CollectorReader(settings)

    @router.get("/catalog")
    async def catalog() -> list[dict[str, Any]]:
        return CATALOG

    @router.get("/summary")
    async def summary() -> dict[str, Any]:
        return await reader.summary()

    @router.get("/datasets/{key}")
    async def rows(
        key: str,
        page: Annotated[int, Query(ge=1, le=1000)] = 1,
        page_size: Annotated[int, Query(ge=1, le=100)] = 25,
        q: Annotated[str, Query(max_length=100)] = "",
        sort: str = "id",
        direction: Literal["asc", "desc"] = "desc",
        filter_column: str = "",
        filter_value: Annotated[str, Query(max_length=100)] = "",
    ) -> dict[str, Any]:
        return await reader.rows(
            key,
            page,
            page_size,
            q,
            sort,
            direction,
            filter_column,
            filter_value,
        )

    return router
