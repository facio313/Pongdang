"""Collector health is its recent heartbeat, not merely an existing process."""

from app.config import Settings
from app.schema import connect


def main():
    try:
        with connect(Settings()) as c:
            row = c.execute(
                "SELECT state IN ('idle','running') AND last_seen_at>now()-interval "
                "'120 seconds' "
                "FROM pongdang_data.conditions_pipelineheartbeat WHERE "
                "key='condition-pipeline'"
            ).fetchone()
        ok = bool(row and row[0])
    except Exception:
        ok = False
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
