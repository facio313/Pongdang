"""Transactional, idempotent normalized detail snapshots; no provider requests."""

import hashlib
import json

from psycopg import sql
from psycopg.types.json import Jsonb


def persist_details(connection, batch):
    inserted = 0
    for detail in batch.place_details:
        # Lock the parent as well as the active-evidence uniqueness constraint,
        # so a concurrent detail collector cannot replace half a revision.
        parent = connection.execute(
            "SELECT id,spot_id FROM pongdang_data.collection_place "
            "WHERE provider=%s AND source_id=%s FOR UPDATE",
            [batch.provider, detail.source_id],
        ).fetchone()
        if parent is None:
            raise ValueError("place_detail_requires_collected_place")
        place_id, spot_id = parent
        values = detail.model_dump(mode="json")
        evidence_hash = hashlib.sha256(
            json.dumps(values, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        existing = connection.execute(
            "SELECT id FROM pongdang_data.place_detail "
            "WHERE place_id=%s AND evidence_hash=%s",
            [place_id, evidence_hash],
        ).fetchone()
        connection.execute(
            "UPDATE pongdang_data.place_detail SET state='superseded' "
            "WHERE place_id=%s AND state='active' AND evidence_hash<>%s",
            [place_id, evidence_hash],
        )
        if existing:
            # A -> B -> A is a source reversion. Preserve the original fetch
            # timestamp and evidence, while restoring the matching revision.
            connection.execute(
                "UPDATE pongdang_data.place_detail SET state='active' WHERE id=%s",
                [existing[0]],
            )
            continue
        values = detail.model_dump()
        values["details"] = Jsonb(
            [entry.model_dump(mode="json") for entry in detail.details]
        )
        values.update(
            place_id=place_id,
            spot_id=spot_id,
            provider=batch.provider,
            evidence_hash=evidence_hash,
            fetched_at=batch.fetched_at,
            state="active",
        )
        connection.execute(
            sql.SQL("INSERT INTO pongdang_data.place_detail ({}) VALUES ({})").format(
                sql.SQL(",").join(map(sql.Identifier, values)),
                sql.SQL(",").join(sql.Placeholder() for _ in values),
            ),
            list(values.values()),
        )
        inserted += 1
    return inserted
