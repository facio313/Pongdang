"""Read-only access to synthetic tables on Pongdang's own database."""

from app.config import Settings
from app.data_reader import DataReader, create_data_router
from app.demo_data import DEMO_CATALOG, DEMO_DATASETS, SCENARIOS, SCHEMA


class DemoReader(DataReader):
    schema = SCHEMA
    catalog = DEMO_CATALOG
    datasets = DEMO_DATASETS
    database_label = "Pongdang / pongdang_demo (합성 더미 전용)"
    is_demo = True

    def normalize_search(self, query: str) -> str:
        # A scenario code must not accidentally match humidity's metric name.
        scenarios = {item[0]: item[0] + " · " + item[1] for item in SCENARIOS}
        return scenarios.get(query.strip().lower(), query)

    async def summary(self):
        result = await super().summary()
        async with self.connection() as connection:
            row = await (
                await connection.execute(
                    "SELECT payload FROM pongdang_demo.seed_manifest WHERE id=1"
                )
            ).fetchone()
        return {**result, "demo_manifest": row["payload"]}


def create_demo_router(settings: Settings):
    return create_data_router(settings, reader=DemoReader(settings), prefix="/api/demo")
