"""A routine main deployment must not wake the archived production stack."""

import getpass
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class ArchiveDeployGuardTest(unittest.TestCase):
    def test_archive_marker_refuses_before_fetch_or_container_operations(self):
        source = Path(__file__).resolve().parents[1] / "pongdang-deploy"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "production.env").touch()
            (root / "active.json").write_text('{"mode":"archive"}')
            script = source.read_text().replace(
                "/home/cks/.local/share/pongdang-deploy", str(root / "state")
            ).replace(
                "/home/cks/.config/pongdang/production.env", str(root / "production.env")
            ).replace(
                "/home/cks/.local/share/pongdang-archive/active.json", str(root / "active.json")
            ).replace("$(id -un) == cks", f"$(id -un) == {getpass.getuser()}")
            # Fail closed if the test ever reaches an external operation.
            script = script.replace(
                "set -Eeuo pipefail",
                "set -Eeuo pipefail\ngit() { exit 91; }\ndocker() { exit 92; }",
                1,
            )
            result = subprocess.run(
                ["bash", "-c", script],
                env={**os.environ, "SSH_ORIGINAL_COMMAND": "deploy pongdang " + "a" * 40},
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertIn("archive mode", result.stderr)
            self.assertFalse((root / "state" / "repository.git").exists())


if __name__ == "__main__":
    unittest.main()
