"""Mode transitions use command doubles and disposable files, never Docker/DB."""

import fcntl
import hashlib
import importlib.machinery
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

LOADER = importlib.machinery.SourceFileLoader(
    "pongdang_mode", str(Path(__file__).with_name("pongdang-mode"))
)
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
mode = importlib.util.module_from_spec(SPEC)
LOADER.exec_module(mode)


class Commands:
    def __init__(self):
        self.calls = []
        self.containers = {"frontend": "pongdang-archive"}
        self.volume = True
        self.restore_fails = False
        self.archive_fails = False

    def __call__(self, command, **kwargs):
        self.calls.append(command)
        output, code = b"", 0
        if command[0] == "systemctl":
            pass
        elif command[:3] != list(mode.DOCKER):
            raise AssertionError(f"Unexpected external command: {command[0]}")
        else:
            args = command[3:]
            if args[:2] == ["container", "inspect"]:
                service = args[2].removeprefix("pongdang-")
                if service not in self.containers:
                    code = 1
                else:
                    output = json.dumps(
                        {
                            "com.docker.compose.project": self.containers[service],
                            "com.docker.compose.service": service,
                        }
                    ).encode()
            elif args[:2] == ["container", "ls"]:
                service = args[4].removeprefix("name=^/pongdang-").removesuffix("$")
                if service in self.containers:
                    output = f"pongdang-{service}\n".encode()
            elif args[:2] == ["container", "stop"]:
                self.assert_known(args[-1])
            elif args[:2] == ["container", "rm"]:
                self.assert_known(args[-1])
                self.containers.pop(args[-1].removeprefix("pongdang-"), None)
            elif args[:2] == ["volume", "inspect"]:
                if self.volume:
                    output = json.dumps(
                        {
                            "com.docker.compose.project": "pongdang",
                            "com.docker.compose.volume": "postgres_data",
                        }
                    ).encode()
                else:
                    code = 1
            elif args[:2] == ["volume", "ls"]:
                output = mode.VOLUME.encode() if self.volume else b""
            elif args[:2] == ["volume", "rm"]:
                assert args == ["volume", "rm", mode.VOLUME]
                assert "db" not in self.containers
                self.volume = False
            elif args[0] in {"info", "image"}:
                output = b"available\n"
            elif args[0] == "compose":
                if "up" in args:
                    assert "--no-build" in args and "--no-deps" in args
                    assert args[args.index("--pull") + 1] == "never"
                    project = args[args.index("--project-name") + 1]
                    service = args[-1]
                    assert service in mode.SERVICES
                    if self.archive_fails and project == "pongdang-archive":
                        code = 1
                    else:
                        self.containers[service] = project
                        if service == "db":
                            self.volume = True
                else:
                    assert args[-2:] == ["config", "--quiet"]
            elif args[:3] == ["exec", "-i", "pongdang-db"]:
                assert "--single-transaction" in args[-1]
                assert "--exit-on-error" in args[-1]
                assert kwargs["stdin"].read() == b"verified backup fixture"
                code = 1 if self.restore_fails else 0
            else:
                raise AssertionError(f"Unexpected Docker operation: {args[:2]}")
        return subprocess.CompletedProcess(
            command, code, output, b"secret must never be reported"
        )

    @staticmethod
    def assert_known(name):
        assert name in {f"pongdang-{service}" for service in mode.SERVICES}

    def mutating_calls(self):
        return [
            call
            for call in self.calls
            if call[0] == "systemctl"
            or any(word in call for word in ("stop", "rm", "up", "exec"))
        ]


class ModeTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.state, self.deploy = self.root / "archive", self.root / "deploy"
        self.state.mkdir()
        self.release = self.deploy / "releases" / ("a" * 40)
        self.release.mkdir(parents=True)
        (self.release / "compose.yaml").write_text("test-only compose")
        self.env_file = self.root / "production.env"
        self.env_file.write_text("test-only; never parsed")
        self.public = self.state / "public"
        self.public.mkdir()
        (self.state / "compose.yaml").write_text("test-only archive compose")
        self.backup = self.state / "database.dump"
        self.backup.write_bytes(b"verified backup fixture")
        mode.atomic_json(
            self.state / "runtime.json",
            {
                "public_dir": str(self.public),
                "release_dir": str(self.release),
                "frontend_image": "pongdang-archive:test",
                "compose_file": str(self.state / "compose.yaml"),
                "backup_file": str(self.backup),
                "preview_url": "http://127.0.0.1:15188/api/ready",
            },
        )
        mode.atomic_json(
            self.state / "preparation.json",
            {
                "release": str(self.release),
                "timers": {
                    timer: {"is-active": "active", "is-enabled": "enabled"}
                    for timer in mode.TIMERS
                },
            },
        )
        mode.atomic_json(
            self.state / "database-backup.json",
            {
                "file": self.backup.name,
                "bytes": self.backup.stat().st_size,
                "created_at": "2026-11-02T00:00:00+00:00",
                "sha256": hashlib.sha256(self.backup.read_bytes()).hexdigest(),
                "postgres_image": "postgres:18-alpine",
                "verified_restore_list": True,
                "verified_restore_stream": True,
            },
        )
        self.retirements = self.root / "retirements.json"
        mode.atomic_json(
            self.retirements,
            {"schemaVersion": 1, "targets": ["container/multtara-backend"]},
        )
        self.commands = Commands()
        self.controller = mode.Controller(
            self.state,
            self.deploy,
            self.env_file,
            self.retirements,
            self.root / "collector.lock",
            self.commands,
        )
        self.controller.write_marker(phase="archive", volume_removed=False)
        self.readiness = patch.object(self.controller, "ready").start()
        self.addCleanup(patch.stopall)

    def test_resume_reuses_existing_volume_without_restore_or_deletion(self):
        self.controller.resume()
        self.assertFalse(self.controller.marker.exists())
        self.assertTrue(self.commands.volume)
        self.assertEqual(
            self.commands.containers,
            {
                "frontend": "pongdang",
                "backend": "pongdang",
                "db": "pongdang",
                "collector": "pongdang",
            },
        )
        self.assertFalse(
            any(
                "exec" in call or "rm" in call and "volume" in call
                for call in self.commands.calls
            )
        )
        self.assertEqual(
            mode.read_json(self.retirements)["targets"], ["container/multtara-backend"]
        )

    def test_missing_volume_restores_saved_backup_once_before_backend(self):
        self.commands.volume = False
        self.controller.write_marker(volume_removed=True)
        self.controller.resume()
        calls = self.commands.calls
        restores = [i for i, call in enumerate(calls) if "exec" in call]
        self.assertEqual(len(restores), 1)
        backend = next(
            i for i, call in enumerate(calls) if "up" in call and call[-1] == "backend"
        )
        self.assertLess(restores[0], backend)
        self.assertTrue(self.commands.volume)

    def test_restore_failure_restores_static_web_and_preserves_new_volume(self):
        self.commands.volume = False
        self.commands.restore_fails = True
        self.controller.write_marker(volume_removed=True)
        with self.assertRaisesRegex(mode.ModeError, "archive website restored"):
            self.controller.resume()
        self.assertEqual(self.commands.containers, {"frontend": "pongdang-archive"})
        self.assertTrue(self.commands.volume)
        self.assertTrue(self.backup.is_file())
        self.assertEqual(
            mode.read_json(self.controller.marker)["restore_state"], "failed"
        )
        self.assertFalse(
            any("rm" in call and "volume" in call for call in self.commands.calls)
        )
        self.assertTrue(
            mode.TARGETS.issubset(mode.read_json(self.retirements)["targets"])
        )
        self.assertFalse(
            any(call[:2] == ["systemctl", "enable"] for call in self.commands.calls)
        )

    def test_other_project_container_is_refused_before_mutation(self):
        self.commands.containers["backend"] = "unrelated-app"
        with self.assertRaisesRegex(mode.ModeError, "another project"):
            self.controller.resume()
        self.assertEqual(self.commands.mutating_calls(), [])
        self.assertEqual(self.commands.containers["backend"], "unrelated-app")

    def test_archive_keeps_volume_unless_explicitly_requested(self):
        self.controller.marker.unlink()
        self.commands.containers = {service: "pongdang" for service in mode.SERVICES}
        self.controller.archive()
        self.assertTrue(self.commands.volume)
        self.assertFalse(
            any("volume" in call and "rm" in call for call in self.commands.calls)
        )
        self.controller.archive(remove_database_volume=True)
        deletions = [
            call for call in self.commands.calls if "volume" in call and "rm" in call
        ]
        self.assertEqual(deletions, [[*mode.DOCKER, "volume", "rm", mode.VOLUME]])
        self.assertFalse(self.commands.volume)
        self.assertTrue(mode.read_json(self.controller.marker)["volume_removed"])

    def test_checksum_mismatch_changes_nothing(self):
        self.backup.write_bytes(b"corrupted archive")
        with self.assertRaises(mode.ModeError):
            self.controller.archive(remove_database_volume=True)
        self.assertEqual(self.commands.calls, [])
        self.assertTrue(self.commands.volume)

    def test_interrupted_restore_is_not_mistaken_for_an_existing_database(self):
        self.controller.write_marker(restore_state="restoring", volume_removed=True)
        with self.assertRaisesRegex(mode.ModeError, "interrupted"):
            self.controller.resume()
        self.assertEqual(self.commands.mutating_calls(), [])
        self.assertTrue(self.commands.volume)

    def test_live_readiness_failure_rolls_back_without_starting_collector(self):
        def readiness(archive, url=None):
            if not archive:
                raise mode.ModeError("test live readiness failure")

        self.readiness.side_effect = readiness
        with self.assertRaisesRegex(mode.ModeError, "archive website restored"):
            self.controller.resume()
        self.assertEqual(self.commands.containers, {"frontend": "pongdang-archive"})
        self.assertTrue(self.commands.volume)
        self.assertFalse(
            any(
                "up" in call and call[-1] == "collector" for call in self.commands.calls
            )
        )

    def test_existing_retirements_are_preserved_and_only_pongdang_is_removed(self):
        self.controller.set_retirements(True)
        self.assertEqual(
            set(mode.read_json(self.retirements)["targets"]),
            mode.TARGETS | {"container/multtara-backend"},
        )
        self.controller.set_retirements(False)
        self.assertEqual(
            mode.read_json(self.retirements)["targets"], ["container/multtara-backend"]
        )
        self.assertEqual(
            len(list(self.state.glob("monitor-retirements-before-*.json"))), 2
        )

    def test_old_backup_cannot_delete_data_collected_after_resume(self):
        mode.atomic_json(
            self.state / "last-live.json", {"started_at": "2026-11-02T00:01:00+00:00"}
        )
        with self.assertRaisesRegex(mode.ModeError, "new archive generation"):
            self.controller.archive(remove_database_volume=True)
        self.assertEqual(self.commands.mutating_calls(), [])
        self.assertTrue(self.commands.volume)

    def test_static_redeployment_failure_never_creates_an_empty_live_database(self):
        self.commands.volume = False
        self.commands.archive_fails = True
        self.controller.write_marker(volume_removed=True)
        with self.assertRaisesRegex(mode.ModeError, "no live database created"):
            self.controller.archive(remove_database_volume=True)
        self.assertFalse(self.commands.volume)
        self.assertFalse(
            any("up" in call and call[-1] == "db" for call in self.commands.calls)
        )
        self.assertTrue(mode.read_json(self.controller.marker)["volume_removed"])
        self.assertTrue(self.backup.exists())

    def test_restore_stream_verification_is_required_before_mutation(self):
        path = self.state / "database-backup.json"
        value = mode.read_json(path)
        value.pop("verified_restore_stream")
        mode.atomic_json(path, value)
        with self.assertRaisesRegex(mode.ModeError, "list/stream"):
            self.controller.archive(remove_database_volume=True)
        self.assertEqual(self.commands.mutating_calls(), [])

    def test_lock_excludes_an_independent_descriptor(self):
        path = self.root / "mode.lock"
        with (
            mode.locked(path),
            path.open("r+") as other,
            self.assertRaises(BlockingIOError),
        ):
            fcntl.flock(other.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)


if __name__ == "__main__":
    unittest.main()
