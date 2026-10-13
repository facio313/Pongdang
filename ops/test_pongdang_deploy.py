"""Run the deployment gate with local command doubles, without Docker or SSH."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

OPS = Path(__file__).parent
SHA = "a" * 40
OLD_SHA = "b" * 40

COMMAND_DOUBLES = r"""
id() { printf 'cks\n'; }
flock() { :; }
git() {
  case "$*" in
    *' rev-parse refs/heads/main') printf '%s\n' "$TEST_SHA" ;;
    *' fetch --no-tags '*) return 0 ;;
    *) printf 'Unexpected git invocation\n' >&2; return 90 ;;
  esac
}
readlink() { printf '%s\n' "$TEST_PREVIOUS"; }
docker() {
  printf '%s\t' "$RELEASE_SHA" "$@" >> "$TEST_CALLS"
  printf '\n' >> "$TEST_CALLS"
  if [[ "$RELEASE_SHA" == "$TEST_OLD_SHA" ]]; then
    # An old initializer rejects the new schema. Docker --no-deps with the
    # explicit app services is the only safe recovery path in this fixture.
    if [[ " $* " != *' --no-deps '* ]]; then return 79; fi
    if [[ "$TEST_FAILURE" == rollback ]]; then return 80; fi
  elif [[ " $* " == *' run --rm --no-deps initialize '* ]]; then
    if [[ "$TEST_FAILURE" == initialize ]]; then return 81; fi
  elif [[ " $* " == *' up '* && " ${*: -1} " != ' db ' ]]; then
    if [[ "$TEST_FAILURE" == up || "$TEST_FAILURE" == rollback ]]; then
      return 82
    fi
  fi
}
curl() { [[ "$TEST_FAILURE" != ready ]]; }
export -f id flock git readlink docker curl
source "$TEST_GATE"
"""


class DeployGateTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.state = self.root / "state"
        self.release = self.state / "releases" / SHA
        self.previous = self.state / "releases" / OLD_SHA
        for directory in (self.release, self.previous):
            (directory / "backend/app").mkdir(parents=True)
            (directory / "backend/app/schema.py").touch()
            (directory / "compose.yaml").touch()
        (self.state / "repository.git").mkdir()
        (self.state / "current").symlink_to(self.previous)
        env_file = self.root / "production.env"
        env_file.touch()
        self.calls = self.root / "calls.tsv"
        self.gate = self.root / "gate"
        source = (OPS / "pongdang-deploy").read_text()
        # Keep production paths fixed in the installed gate; only this temporary
        # test copy can reach the disposable filesystem and command doubles.
        source = source.replace(
            "readonly state=/home/cks/.local/share/pongdang-deploy",
            f"readonly state='{self.state}'",
        ).replace(
            "readonly env_file=/home/cks/.config/pongdang/production.env",
            f"readonly env_file='{env_file}'",
        )
        self.gate.write_text(source)

    def run_gate(self, failure=""):
        environ = {
            **os.environ,
            "SSH_ORIGINAL_COMMAND": f"deploy pongdang {SHA}",
            "TEST_SHA": SHA,
            "TEST_OLD_SHA": OLD_SHA,
            "TEST_PREVIOUS": str(self.previous),
            "TEST_CALLS": str(self.calls),
            "TEST_FAILURE": failure,
            "TEST_GATE": str(self.gate),
        }
        result = subprocess.run(
            ["bash", "-c", COMMAND_DOUBLES],
            env=environ,
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
        calls = [
            line.rstrip("\t").split("\t")
            for line in self.calls.read_text().splitlines()
        ]
        return result, calls

    def assert_app_only_rollback(self, calls):
        previous_calls = [args for args in calls if args[0] == OLD_SHA]
        self.assertEqual(len(previous_calls), 1)
        args = previous_calls[0]
        self.assertEqual(
            args[args.index("up") :],
            [
                "up",
                "-d",
                "--no-build",
                "--no-deps",
                "--wait",
                "--wait-timeout",
                "180",
                "backend",
                "collector",
                "frontend",
            ],
        )
        self.assertNotIn("initialize", args)
        self.assertNotIn("db", args)
        self.assertEqual((self.state / "current").resolve(), self.previous)
        self.assertFalse((self.state / "previous").exists())

    def test_success_initializes_once_and_publishes_new_release(self):
        result, calls = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([args[0] for args in calls], [SHA] * 5)
        self.assertEqual(sum("initialize" in args for args in calls), 1)
        self.assertEqual((self.state / "current").resolve(), self.release)
        self.assertEqual((self.state / "previous").resolve(), self.previous)

    def test_unhealthy_compose_restores_only_previous_apps(self):
        result, calls = self.run_gate("up")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assert_app_only_rollback(calls)

    def test_failed_readiness_restores_only_previous_apps(self):
        result, calls = self.run_gate("ready")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assert_app_only_rollback(calls)

    def test_failed_rollback_stays_failed_without_publishing_release(self):
        result, calls = self.run_gate("rollback")
        self.assertNotEqual(result.returncode, 0)
        self.assert_app_only_rollback(calls)

    def test_failed_initialization_does_not_replace_apps(self):
        result, calls = self.run_gate("initialize")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([args[0] for args in calls], [SHA] * 4)
        self.assertEqual(calls[-1][-4:], ["run", "--rm", "--no-deps", "initialize"])
        self.assertEqual((self.state / "current").resolve(), self.previous)


if __name__ == "__main__":
    unittest.main()
