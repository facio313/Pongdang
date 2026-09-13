"""Register a reviewed catalogue file; this tool never invents camera entries."""

import argparse
from pathlib import Path

from app.config import Settings
from app.livecams.service import Camera, register_camera

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--register", type=Path, required=True)
args = parser.parse_args()
try:
    revision = register_camera(
        Settings(), Camera.model_validate_json(args.register.read_text())
    )
except Exception:
    raise SystemExit(
        "Camera registration failed; check reviewed metadata and host allowlist"
    ) from None
print(revision)
