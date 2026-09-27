import importlib.machinery
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

OPS = Path(__file__).parent
SHA = "a" * 40
OLD_SHA = "b" * 40
NEW_SHA = "c" * 40


def load_script(module_name, filename):
    loader = importlib.machinery.SourceFileLoader(module_name, str(OPS / filename))
    spec = importlib.util.spec_from_loader(module_name, loader)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    loader.exec_module(module)
    return module


watch = load_script("pongdang_deploy_watch", "pongdang-deploy-watch")
local = load_script("pongdang_deploy_local", "pongdang-deploy-local")


def run_entry(
    *,
    status="completed",
    conclusion="success",
    run_id=42,
    attempt=1,
    created_at="2026-09-27T00:00:00Z",
):
    return {
        "id": run_id,
        "run_attempt": attempt,
        "event": "push",
        "head_branch": "main",
        "head_sha": SHA,
        "status": status,
        "conclusion": conclusion,
        "created_at": created_at,
    }


def runs_payload(*runs):
    return {"total_count": len(runs), "workflow_runs": list(runs)}


def jobs_payload(*, backend="success", frontend="success", attempt=1):
    jobs = [
        {
            "name": "Build backend image",
            "status": "completed",
            "conclusion": backend,
            "run_attempt": attempt,
        },
        {
            "name": "Build frontend image",
            "status": "completed",
            "conclusion": frontend,
            "run_attempt": attempt,
        },
    ]
    return {"total_count": len(jobs), "jobs": jobs}


class FakeApi:
    def __init__(self, *, latest=None, runs=None, jobs=None):
        self.latest = list(latest or [SHA])
        self.runs = list(runs or [runs_payload(run_entry())])
        self.jobs = jobs or jobs_payload()
        self.calls = []

    @staticmethod
    def _next(values):
        return values.pop(0) if len(values) > 1 else values[0]

    def __call__(self, endpoint):
        self.calls.append(endpoint)
        if "/git/ref/heads/main" in endpoint:
            return {"object": {"sha": self._next(self.latest)}}
        if "/actions/workflows/ci.yml/runs?" in endpoint:
            return self._next(self.runs)
        if "/jobs?filter=latest" in endpoint:
            return self.jobs
        raise AssertionError(f"unexpected API endpoint: {endpoint}")


class Workspace:
    def __init__(self, root):
        self.root = Path(root)
        self.state = self.root / "state"
        self.releases = self.state / "releases"
        self.current = self.state / "current"
        self.attempt = self.state / "deploy-watch-state.json"
        self.state.mkdir(mode=0o700)
        self.releases.mkdir()
        self.point_current(OLD_SHA)

    def point_current(self, sha):
        release = self.releases / sha
        release.mkdir(exist_ok=True)
        self.current.unlink(missing_ok=True)
        self.current.symlink_to(release)


class DeployWatchTests(unittest.TestCase):
    def run_watch(self, workspace, api, deploy):
        return watch.run_once(
            api=api,
            deploy=deploy,
            current=workspace.current,
            releases=workspace.releases,
            attempt_state=workspace.attempt,
        )

    def test_queued_or_in_progress_run_always_defers(self):
        for status in ("queued", "in_progress"):
            with (
                self.subTest(status=status),
                tempfile.TemporaryDirectory() as directory,
            ):
                workspace = Workspace(directory)
                calls = []
                run = run_entry(status=status, conclusion=None)
                api = FakeApi(runs=[runs_payload(run)])
                self.assertEqual(self.run_watch(workspace, api, calls.append), 0)
                self.assertEqual(calls, [])
                self.assertFalse(any("/jobs?" in endpoint for endpoint in api.calls))

    def test_newest_completed_failure_blocks_older_success(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Workspace(directory)
            older = run_entry(run_id=40, created_at="2026-09-27T00:00:00Z")
            newer = run_entry(
                run_id=41,
                conclusion="failure",
                created_at="2026-09-27T00:01:00Z",
            )
            calls = []
            api = FakeApi(runs=[runs_payload(older, newer)])
            self.assertEqual(self.run_watch(workspace, api, calls.append), 0)
            self.assertEqual(calls, [])

    def test_both_exact_build_jobs_must_succeed(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Workspace(directory)
            calls = []
            api = FakeApi(jobs=jobs_payload(frontend="failure"))
            self.assertEqual(self.run_watch(workspace, api, calls.append), 0)
            self.assertEqual(calls, [])

    def test_success_rechecks_main_and_ci_then_calls_wrapper_once(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Workspace(directory)
            api = FakeApi(
                latest=[SHA, SHA],
                runs=[runs_payload(run_entry()), runs_payload(run_entry())],
            )
            calls = []

            def deploy(sha):
                calls.append(sha)
                workspace.point_current(sha)
                return 0

            self.assertEqual(self.run_watch(workspace, api, deploy), 0)
            self.assertEqual(calls, [SHA])
            state = json.loads(workspace.attempt.read_text())
            self.assertEqual(state["outcome"], "success")
            self.assertEqual(state["run_id"], 42)

    def test_current_release_skips_ci_and_deploy(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Workspace(directory)
            workspace.point_current(SHA)
            api = FakeApi()
            calls = []
            self.assertEqual(self.run_watch(workspace, api, calls.append), 0)
            self.assertEqual(calls, [])
            self.assertFalse(any("/actions/" in endpoint for endpoint in api.calls))

    def test_changed_main_or_changed_run_state_never_deploys(self):
        cases = [
            FakeApi(latest=[SHA, NEW_SHA]),
            FakeApi(
                latest=[SHA, SHA],
                runs=[
                    runs_payload(run_entry()),
                    runs_payload(run_entry(status="in_progress", conclusion=None)),
                ],
            ),
        ]
        for api in cases:
            with (
                self.subTest(calls=api.calls),
                tempfile.TemporaryDirectory() as directory,
            ):
                workspace = Workspace(directory)
                calls = []
                self.assertEqual(self.run_watch(workspace, api, calls.append), 0)
                self.assertEqual(calls, [])

    def test_failed_deploy_is_recorded_and_not_retried_for_same_attempt(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Workspace(directory)
            calls = []

            def fail(sha):
                calls.append(sha)
                return 7

            self.assertEqual(self.run_watch(workspace, FakeApi(), fail), 7)
            state = json.loads(workspace.attempt.read_text())
            self.assertEqual(state["outcome"], "failed")
            self.assertEqual(self.run_watch(workspace, FakeApi(), fail), 0)
            self.assertEqual(calls, [SHA])

    def test_truncated_or_unexpected_api_data_fails_closed(self):
        malformed = {"total_count": 101, "workflow_runs": [run_entry()]}
        with self.assertRaises(watch.WatchError):
            watch.select_run(malformed, SHA)
        unexpected = jobs_payload()
        unexpected["jobs"].append(
            {"name": "deploy", "status": "completed", "conclusion": "success"}
        )
        unexpected["total_count"] = 3
        with self.assertRaises(watch.WatchError):
            watch.jobs_succeeded(
                lambda _endpoint: unexpected,
                watch.Candidate(SHA, 42, 1),
            )


class LocalWrapperTests(unittest.TestCase):
    def test_invalid_sha_is_refused_before_gate(self):
        with self.assertRaises(local.LocalDeployError):
            local.deploy("main", verify_security=False)

    def test_current_sha_is_not_deployed_twice(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Workspace(directory)
            workspace.point_current(SHA)
            calls = []
            result = local.deploy(
                SHA,
                state_directory=workspace.state,
                current=workspace.current,
                releases=workspace.releases,
                lock_path=workspace.state / "local.lock",
                runner=calls.append,
                verify_security=False,
            )
            self.assertEqual(result, 0)
            self.assertEqual(calls, [])

    def test_gate_gets_only_exact_forced_command_and_must_update_current(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Workspace(directory)
            calls = []

            def runner(command, *, check, env):
                calls.append((command, check, env))
                workspace.point_current(SHA)
                return subprocess.CompletedProcess(command, 0)

            gate = Path("/usr/local/libexec/pongdang-deploy")
            result = local.deploy(
                SHA,
                gate=gate,
                state_directory=workspace.state,
                current=workspace.current,
                releases=workspace.releases,
                lock_path=workspace.state / "local.lock",
                runner=runner,
                verify_security=False,
            )
            self.assertEqual(result, 0)
            self.assertEqual(calls[0][0], [str(gate)])
            self.assertFalse(calls[0][1])
            self.assertEqual(
                calls[0][2]["SSH_ORIGINAL_COMMAND"], f"deploy pongdang {SHA}"
            )
            self.assertEqual(
                set(calls[0][2]),
                {"HOME", "LOGNAME", "PATH", "SSH_ORIGINAL_COMMAND", "USER"},
            )

    def test_gate_success_without_current_sha_is_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Workspace(directory)

            def runner(command, *, check, env):
                return subprocess.CompletedProcess(command, 0)

            self.assertEqual(
                local.deploy(
                    SHA,
                    state_directory=workspace.state,
                    current=workspace.current,
                    releases=workspace.releases,
                    lock_path=workspace.state / "local.lock",
                    runner=runner,
                    verify_security=False,
                ),
                1,
            )


class ContractTests(unittest.TestCase):
    def test_production_paths_are_absolute_and_no_environment_override_exists(self):
        self.assertEqual(watch.GH, Path("/usr/bin/gh"))
        self.assertEqual(
            watch.DEPLOY_WRAPPER, Path("/usr/local/libexec/pongdang-deploy-local")
        )
        self.assertEqual(local.DEPLOY_GATE, Path("/usr/local/libexec/pongdang-deploy"))
        for script in (OPS / "pongdang-deploy-watch", OPS / "pongdang-deploy-local"):
            self.assertNotIn("os.environ", script.read_text())

    def test_workflow_has_only_the_two_image_builds(self):
        workflow = (OPS.parent / ".github/workflows/ci.yml").read_text()
        self.assertNotIn("\n  deploy:", workflow)
        self.assertNotIn("DEPLOY_KEY", workflow)
        self.assertNotIn("ssh.bonifacio.work", workflow)
        self.assertEqual(workflow.count("          - image:"), 2)

    def test_units_call_only_installed_absolute_templates(self):
        service = (OPS / "pongdang-deploy-watch.service").read_text()
        timer = (OPS / "pongdang-deploy-watch.timer").read_text()
        self.assertIn("ExecStart=/usr/local/libexec/pongdang-deploy-watch", service)
        self.assertIn("User=cks", service)
        self.assertIn("Unit=pongdang-deploy-watch.service", timer)


if __name__ == "__main__":
    unittest.main()
