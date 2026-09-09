"""Operator-only import of normalized evidence; not an HTTP upload endpoint."""

import argparse
from pathlib import Path

from app.config import Settings
from app.ingestion import Batch, ingest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument("--confirm-live-import", action="store_true", required=True)
    args = parser.parse_args()
    try:
        with args.file.open("rb") as stream:
            payload = stream.read(1_000_001)
        if len(payload) > 1_000_000:
            raise ValueError("Import exceeds 1 MB")
        result = ingest(Settings(), Batch.model_validate_json(payload))
    except Exception:
        raise SystemExit(
            "Import rejected; no partial rows committed. "
            "Check schema, references and input."
        ) from None
    print("Pongdang evidence imported" if result else "Already imported; no changes")


if __name__ == "__main__":
    main()
