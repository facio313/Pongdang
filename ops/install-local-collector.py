#!/usr/bin/env python3
"""Install this checkout's collector as the current user's macOS LaunchAgent."""

import argparse
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import sys
import time
from pathlib import Path

LABEL = "work.bonifacio.pongdang.collector"


def resolve_attachment_root(executable: Path, backend: Path) -> Path:
    """Resolve source settings before moving the worker into its release directory."""
    result = subprocess.run(
        [
            str(executable),
            "-c",
            (
                "import json; from app.config import Settings; "
                "print(json.dumps(str(Settings().attachment_root)))"
            ),
        ],
        cwd=backend,
        capture_output=True,
        text=True,
        check=False,
    )
    # Settings validation errors may contain configuration inputs; never echo them.
    if result.returncode:
        raise SystemExit("Cannot resolve attachment storage; check backend settings")
    try:
        value = json.loads(result.stdout)
        if not isinstance(value, str) or not Path(value).is_absolute():
            raise ValueError("Attachment root must be absolute")
    except (ValueError, TypeError) as error:
        raise SystemExit(
            "Invalid attachment storage path in backend settings"
        ) from error
    return Path(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python", required=True, type=Path)
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("Use the Compose collector service on non-macOS hosts")
    root = Path(__file__).resolve().parents[1]
    executable = args.python.absolute()
    if not executable.is_file() or not os.access(executable, os.X_OK):
        parser.error("Python executable is unavailable")
    if not (root / "backend/.env").is_file():
        parser.error("Configure backend/.env before installing")
    attachment_root = resolve_attachment_root(executable, root / "backend")
    attachment_root.mkdir(parents=True, exist_ok=True, mode=0o750)
    # LaunchAgents must not depend on iCloud/Desktop's on-demand file access.
    # Install a source snapshot outside Desktop; rerun to apply checkout changes.
    runtime = Path.home() / ".local/share/pongdang/collector"
    files = sorted(
        p
        for p in (root / "backend/app").rglob("*")
        if p.is_file() and "__pycache__" not in p.parts
    )
    fingerprint = hashlib.sha256()
    for path in files:
        fingerprint.update(str(path.relative_to(root / "backend")).encode())
        fingerprint.update(path.read_bytes())
    release = runtime / "releases" / fingerprint.hexdigest()[:16]
    release.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copytree(
        root / "backend/app",
        release / "app",
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )
    configuration = release / ".env"
    descriptor = os.open(configuration, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write((root / "backend/.env").read_bytes())
    configuration.chmod(0o600)
    agents = Path.home() / "Library/LaunchAgents"
    logs = Path.home() / "Library/Logs/Pongdang"
    agents.mkdir(parents=True, exist_ok=True)
    logs.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = agents / (LABEL + ".plist")
    spec = {
        "Label": LABEL,
        "ProgramArguments": [str(executable), "-u", "-m", "app.ingestion.worker"],
        "WorkingDirectory": str(release),
        "EnvironmentVariables": {"ATTACHMENT_ROOT": str(attachment_root)},
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 60,
        "ProcessType": "Background",
        "StandardOutPath": str(logs / "collector.log"),
        "StandardErrorPath": str(logs / "collector-error.log"),
    }
    # Credentials remain in the ignored .env, never in launchd arguments/plist.
    target.write_bytes(plistlib.dumps(spec))
    target.chmod(0o600)
    domain = f"gui/{os.getuid()}"
    subprocess.run(
        ["launchctl", "bootout", domain + "/" + LABEL],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    for _ in range(50):
        status = subprocess.run(
            ["launchctl", "print", domain + "/" + LABEL],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if status.returncode:
            break
        time.sleep(0.1)
    else:
        raise SystemExit("Collector is still stopping; retry installation shortly")
    subprocess.run(["launchctl", "bootstrap", domain, str(target)], check=True)
    print(f"Installed {LABEL}; logs: {logs}")
    print(f"Attachments: {attachment_root}")
    print(f"Stop: launchctl bootout {domain}/{LABEL}")


if __name__ == "__main__":
    main()
