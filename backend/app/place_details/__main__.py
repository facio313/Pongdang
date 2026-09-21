"""Explicit bounded backfill and operator-requested recheck; no HTTP writes."""

import argparse
from datetime import UTC, datetime

from app.config import Settings
from app.ingestion.worker import run_due
from app.place_details.collector import link_places, place_detail_jobs
from app.schema import connect


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh-spot", type=int, help="Queue a linked place for recheck"
    )
    args = parser.parse_args()
    settings = Settings()
    if args.refresh_spot is not None:
        if not 0 < args.refresh_spot < 2**63:
            parser.error("Invalid place ID")
        link_places(settings)
        with connect(settings) as c:
            linked = c.execute(
                "SELECT place_id FROM pongdang_data.place_detail_link WHERE spot_id=%s",
                [args.refresh_spot],
            ).fetchone()
            if not linked:
                parser.error("No confirmed tourism source for this place")
            c.execute(
                "UPDATE pongdang_data.place_detail_collection SET next_attempt_at=%s "
                "WHERE place_id=%s",
                [datetime.now(UTC), linked[0]],
            )
            c.execute(
                "UPDATE pongdang_data.attachment_collection SET next_attempt_at=%s "
                "WHERE spot_id=%s",
                [datetime.now(UTC), args.refresh_spot],
            )
    outcomes = run_due(settings, place_detail_jobs(settings), force=True)
    return int(any(row["state"] == "failed" for row in outcomes))


if __name__ == "__main__":
    raise SystemExit(main())
