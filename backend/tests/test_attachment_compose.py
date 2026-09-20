"""Resolve real Compose merges without starting containers or using private env."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TARGET = "/var/lib/pongdang/attachments"


def compose_config(*files):
    docker = shutil.which("docker")
    if not docker:
        pytest.skip("Docker CLI is unavailable; runtime checks run in Compose CI")
    command = [docker, "compose", "--env-file", os.devnull]
    for file in files:
        command.extend(["-f", str(ROOT / file)])
    command.extend(
        ["--project-name", "pongdang-storage-check", "config", "--format", "json"]
    )
    result = subprocess.run(
        command,
        cwd=ROOT,
        env={
            "PATH": os.environ.get("PATH", os.defpath),
            "HOME": str(Path.home()),
            "POSTGRES_PASSWORD": "compose-test-only",
        },
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def attachment_mount(config, service):
    (mount,) = [
        mount
        for mount in config["services"][service]["volumes"]
        if mount["target"] == TARGET
    ]
    return mount


def test_production_attachment_storage_is_scoped_and_api_is_read_only():
    config = compose_config("compose.yaml")
    for service, read_only in (("backend", True), ("collector", False)):
        settings = config["services"][service]
        mount = attachment_mount(config, service)
        assert mount["type"] == "volume"
        assert mount["source"] == "attachment_data"
        assert mount.get("read_only", False) is read_only
        assert settings["read_only"] is True
        assert settings["environment"]["ATTACHMENT_ROOT"] == TARGET
    assert config["volumes"]["attachment_data"]["name"] == (
        "pongdang-storage-check_attachment_data"
    )
    assert config["volumes"]["postgres_data"]["name"] == (
        "pongdang-storage-check_postgres_data"
    )
    assert not config["services"]["initialize"].get("volumes")
    assert not config["services"]["frontend"].get("volumes")
    assert (
        "PHOTO_COLLECTION_ENABLED" not in (config["services"]["backend"]["environment"])
    )
    assert (
        config["services"]["collector"]["environment"]["PHOTO_COLLECTION_ENABLED"]
        == "true"
    )


def test_dev_bind_replaces_the_volume_without_making_api_storage_writable():
    config = compose_config("compose.yaml", "compose.dev.yaml")
    for service, read_only in (("backend", True), ("collector", False)):
        mount = attachment_mount(config, service)
        assert mount["type"] == "bind"
        assert Path(mount["source"]) == ROOT / ".local/attachments"
        assert mount.get("read_only", False) is read_only
        assert mount["bind"].get("create_host_path", False) is False
