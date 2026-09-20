"""The copied launchd worker must keep the source checkout's photo storage."""

import os
import runpy
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
RESOLVE = runpy.run_path(str(ROOT / "ops/install-local-collector.py"))[
    "resolve_attachment_root"
]


@pytest.fixture
def source_backend(tmp_path, monkeypatch):
    for name in tuple(os.environ):
        if name not in {"PATH", "HOME", "LANG", "LC_ALL", "TMPDIR"}:
            monkeypatch.delenv(name, raising=False)
    backend = tmp_path / "checkout/backend"
    app = backend / "app"
    app.mkdir(parents=True)
    shutil.copy(ROOT / "backend/app/config.py", app / "config.py")
    (backend / ".env").write_text("POSTGRES_PASSWORD=installer-test-only\n")
    return backend


def test_installer_resolves_source_storage_before_release_copy(source_backend):
    root = RESOLVE(Path(sys.executable), source_backend)
    assert root == source_backend.parent / ".local/attachments"
    assert root.is_absolute()


def test_installer_honors_backend_attachment_override(source_backend, tmp_path):
    storage = tmp_path / "photo storage"
    with (source_backend / ".env").open("a") as stream:
        stream.write(f'ATTACHMENT_ROOT="{storage}"\n')
    assert RESOLVE(Path(sys.executable), source_backend) == storage


def test_installer_settings_failure_does_not_echo_credentials(source_backend, capsys):
    (source_backend / ".env").write_text(
        "POSTGRES_PASSWORD=installer-test-only\n"
        "PHOTO_COLLECTION_BATCH_SIZE=private-invalid-value\n"
    )
    with pytest.raises(SystemExit, match="Cannot resolve attachment storage") as error:
        RESOLVE(Path(sys.executable), source_backend)
    assert "private-invalid-value" not in str(error.value)
    assert capsys.readouterr() == ("", "")
