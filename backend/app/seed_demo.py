"""Explicit, atomic, idempotent seeding; never run by an HTTP request/startup."""

import argparse
import asyncio
import json
from datetime import UTC, datetime

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

from app.collector import CollectorReader
from app.config import Settings
from app.demo_data import DEMO_CATALOG, SCHEMA, VERSION, build_demo

TYPES = {
    "text": "text",
    "number": "double precision",
    "boolean": "boolean",
    "json": "jsonb",
    "datetime": "timestamptz",
    "date": "date",
}
REFERENCES = {
    "snapshots": {"spot_id": "spots"},
    "metrics": {"snapshot_id": "snapshots"},
    "scores": {"spot_id": "spots"},
    "forecasts": {"spot_id": "spots"},
    "calibrations": {"spot_id": "spots"},
    "facilities": {"spot_id": "spots"},
    "catch-guides": {"spot_id": "spots"},
    "hot-springs": {"spot_id": "spots"},
    "lineage": {"source_metric_id": "metrics", "derived_metric_id": "metrics"},
    "route-entries": {
        "snapshot_id": "route-snapshots",
        "origin_spot_id": "spots",
        "destination_spot_id": "spots",
    },
}


def write_demo(settings: Settings, bundle: dict) -> dict:
    if settings.postgres_db not in {"pongdang", "pongdang_test"}:
        raise ValueError("Unexpected demo target database")
    if settings.postgres_host.lower() == "cksdb":
        raise ValueError("Never seed the shared source database")
    with psycopg.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password.get_secret_value(),
        connect_timeout=3,
        options="-c statement_timeout=10000 -c lock_timeout=3000",
    ) as connection:
        # The shared source is PostgreSQL 16, Pongdang's isolated app DB is 18.
        version = int(connection.execute("SHOW server_version_num").fetchone()[0])
        if version < 180000:
            raise ValueError("Demo seeding requires the isolated PostgreSQL 18 app DB")
        connection.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [VERSION])
        exists = connection.execute(
            "SELECT to_regclass('pongdang_demo.seed_manifest')"
        ).fetchone()[0]
        if exists:
            row = connection.execute(
                "SELECT payload FROM pongdang_demo.seed_manifest WHERE id=1"
            ).fetchone()
            if row and row[0].get("version") == VERSION:
                return {"created": False, "manifest": row[0]}
            raise ValueError(
                "Existing demo schema is not this complete seed; refusing overwrite"
            )
        if connection.execute(
            "SELECT 1 FROM pg_namespace WHERE nspname=%s", [SCHEMA]
        ).fetchone():
            raise ValueError("Refusing to modify an existing unrecognized demo schema")
        connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(SCHEMA)))
        connection.execute(
            sql.SQL("REVOKE ALL ON SCHEMA {} FROM PUBLIC").format(
                sql.Identifier(SCHEMA)
            )
        )
        for dataset in DEMO_CATALOG:
            columns = []
            for column in dataset["columns"]:
                kind = (
                    "bigint PRIMARY KEY"
                    if column["key"] == "id"
                    else (
                        "bigint"
                        if column["key"].endswith("_id") and column["type"] == "number"
                        else TYPES[column["type"]]
                    )
                )
                columns.append(
                    sql.SQL("{} {}").format(
                        sql.Identifier(column["key"]), sql.SQL(kind)
                    )
                )
            connection.execute(
                sql.SQL("CREATE TABLE {} ({})").format(
                    sql.Identifier(SCHEMA, dataset["table"]),
                    sql.SQL(", ").join(columns),
                )
            )
            names = [column["key"] for column in dataset["columns"]]
            query = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                sql.Identifier(SCHEMA, dataset["table"]),
                sql.SQL(", ").join(map(sql.Identifier, names)),
                sql.SQL(", ").join(sql.Placeholder() for _ in names),
            )
            values = [
                [
                    Jsonb(row[name])
                    if isinstance(row[name], (dict, list))
                    else row[name]
                    for name in names
                ]
                for row in bundle["rows"][dataset["key"]]
            ]
            with connection.cursor() as cursor:
                cursor.executemany(query, values)
        tables = {dataset["key"]: dataset["table"] for dataset in DEMO_CATALOG}
        # Enforce every demo relationship within the demo schema, never public.
        for key, references in REFERENCES.items():
            for column, target in references.items():
                connection.execute(
                    sql.SQL(
                        "ALTER TABLE {} ADD FOREIGN KEY ({}) REFERENCES {} (id)"
                    ).format(
                        sql.Identifier(SCHEMA, tables[key]),
                        sql.Identifier(column),
                        sql.Identifier(SCHEMA, tables[target]),
                    )
                )
        for key in ("scores", "forecasts"):
            connection.execute(
                sql.SQL(
                    "ALTER TABLE {} ADD CHECK "
                    "(safety_status='unknown' AND score IS NULL)"
                ).format(sql.Identifier(SCHEMA, tables[key]))
            )
        connection.execute(
            "ALTER TABLE pongdang_demo.conditions_hydrauliccalibration "
            "ADD CHECK (NOT verified AND NOT active)"
        )
        connection.execute(
            "CREATE TABLE pongdang_demo.seed_manifest "
            "(id integer PRIMARY KEY CHECK (id=1), payload jsonb NOT NULL)"
        )
        connection.execute(
            "INSERT INTO pongdang_demo.seed_manifest VALUES (1,%s)",
            [Jsonb(bundle["manifest"])],
        )
    return {"created": True, "manifest": bundle["manifest"]}


async def seed_from_source(settings: Settings):
    source = await CollectorReader(settings).rows(
        "spots", 1, 100, "", "id", "asc", "", ""
    )
    if source["total"] > 100:
        raise ValueError("Choose an explicit bounded reference catalog before seeding")
    anchor = datetime.now(UTC).replace(microsecond=0)
    return write_demo(settings, build_demo(source["rows"], anchor))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-demo-only", action="store_true", required=True)
    parser.parse_args()
    try:
        result = asyncio.run(seed_from_source(Settings()))
    except Exception:
        # Do not leak DSNs, credentials or provider details in operational output.
        raise SystemExit(
            "Demo seed failed; transaction rolled back. Check target/configuration."
        ) from None
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
