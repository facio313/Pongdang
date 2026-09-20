"""Read only, bounded attachment metadata and locally stored raster files."""

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse

from app.attachments.files import file_path
from app.data_reader import DataReader


def create_attachment_router(settings):
    router = APIRouter(prefix="/api/data/attachments", tags=["attachments"])
    reader = DataReader(settings)

    @router.get("")
    async def attachments(
        response: Response,
        spot_ids: str = Query(
            min_length=1, max_length=2100, pattern=r"^[0-9]+(?:,[0-9]+)*$"
        ),
    ):
        raw_ids = spot_ids.split(",")
        if len(raw_ids) > 100 or any(len(v) > 18 or int(v) < 1 for v in raw_ids):
            raise HTTPException(422, "Choose 1 to 100 valid place IDs")
        ids = list({int(v) for v in raw_ids})
        async with reader.connection() as c:
            rows = await (
                await c.execute(
                    """
                SELECT p.spot_id,a.id,a.name,a.source_url,a.license,a.attribution,
                  a.fetched_at,a.source_modified_at,a.storage_key
                FROM pongdang_data.place_attachment p
                JOIN pongdang_data.attachment a ON a.id=p.attachment_id
                WHERE p.spot_id=ANY(%s) AND a.status='active'
                ORDER BY p.spot_id LIMIT 100
            """,
                    [ids],
                )
            ).fetchall()
        items = []
        for row in rows:
            key = row.pop("storage_key")
            try:
                present = file_path(settings.attachment_root, key).is_file()
            except OSError, ValueError:
                present = False
            if present:
                items.append({**row, "url": f"/api/data/attachments/{row['id']}/file"})
        response.headers["Cache-Control"] = "no-store"
        return {"items": items}

    @router.get("/{attachment_id}/file")
    async def attachment_file(attachment_id: int):
        if not 0 < attachment_id < 2**63:
            raise HTTPException(404, "Photo unavailable")
        async with reader.connection() as c:
            row = await (
                await c.execute(
                    """
                SELECT a.storage_key,a.media_type,a.sha256,a.byte_size
                FROM pongdang_data.attachment a WHERE a.id=%s AND a.status='active'
                AND EXISTS (SELECT 1 FROM pongdang_data.place_attachment p
                  WHERE p.attachment_id=a.id) LIMIT 1
            """,
                    [attachment_id],
                )
            ).fetchone()
        if row:
            try:
                path = file_path(settings.attachment_root, row["storage_key"])
                if path.is_file() and path.stat().st_size == row["byte_size"]:
                    return FileResponse(
                        path,
                        media_type=row["media_type"],
                        headers={
                            "Cache-Control": "private, max-age=3600",
                            "ETag": '"' + row["sha256"] + '"',
                            "X-Content-Type-Options": "nosniff",
                            "Content-Security-Policy": "default-src 'none'; sandbox",
                        },
                    )
            except ValueError, OSError:
                pass
        raise HTTPException(404, "Photo unavailable")

    return router
