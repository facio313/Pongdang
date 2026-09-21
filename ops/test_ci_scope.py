import ast
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import ci_scope


class ScopeTests(unittest.TestCase):
    def test_ops_scripts_support_runner_python_312(self):
        for path in Path(__file__).parent.glob("*.py"):
            with self.subTest(path=path.name):
                ast.parse(path.read_text(), filename=str(path), feature_version=(3, 12))

    def test_ui_and_styles_get_the_fast_profile(self):
        self.assertEqual(
            ci_scope.profile(
                ["frontend/src/HomePage.tsx", "frontend/src/pongdang.css"]
            ),
            "fast",
        )

    def test_risky_or_unrecognized_changes_get_full_validation(self):
        for path in [
            "backend/app/auth.py",
            "backend/app/schema.py",
            "backend/app/ingestion/worker.py",
            "backend/app/water_index/conditions.py",
            "frontend/src/productApi.ts",
            "frontend/playwright.config.ts",
            "frontend/tests/browser/product.spec.ts",
            "frontend/package-lock.json",
            "compose.yaml",
            "ops/ci_scope.py",
        ]:
            with self.subTest(path=path):
                self.assertEqual(ci_scope.profile([path]), "full")
        self.assertEqual(ci_scope.profile(None), "full")

    def test_display_copy_runs_related_backend_contracts(self):
        paths = ["backend/app/travel/language.py"]
        self.assertEqual(ci_scope.profile(paths), "fast")
        targets = ci_scope.backend_tests(paths)
        self.assertIn("tests/test_health.py", targets)
        self.assertIn("tests/test_travel_integration.py", targets)
        self.assertNotIn("tests/test_ingestion.py", targets)

    def test_backend_test_file_runs_itself_and_core_checks(self):
        targets = ci_scope.backend_tests(["backend/tests/test_weather.py"])
        self.assertIn("tests/test_weather.py", targets)
        self.assertIn("tests/test_health.py", targets)

    def test_deleted_backend_test_and_unknown_module_fall_back_to_full(self):
        self.assertEqual(
            ci_scope.backend_tests(["backend/tests/test_missing_removed_file.py"]), []
        )
        self.assertEqual(ci_scope.backend_tests(["backend/app/new-module.py"]), [])

    def test_documentation_does_not_build_or_deploy(self):
        self.assertFalse(
            any(
                ci_scope.classify(
                    ["README.md", "docs/ai/CURRENT.md", "AGENTS.md"]
                ).values()
            )
        )

    def test_frontend_retains_browser_and_container_checks(self):
        self.assertEqual(
            ci_scope.classify(["frontend/src/HomePage.tsx"]),
            {"frontend": True, "backend": False, "browser": True, "smoke": True},
        )

    def test_backend_retains_browser_contract_checks(self):
        self.assertEqual(
            ci_scope.classify(["backend/app/main.py"]),
            {"frontend": False, "backend": True, "browser": True, "smoke": True},
        )

    def test_infrastructure_and_unknown_paths_require_every_check(self):
        for path in [
            ".github/workflows/ci.yml",
            "compose.yaml",
            "ops/pongdang-ci-watch",
            "new-config",
        ]:
            with self.subTest(path=path):
                self.assertTrue(all(ci_scope.classify([path]).values()))

    def test_combined_changes_run_both_suites(self):
        self.assertTrue(
            all(
                ci_scope.classify(
                    ["frontend/src/App.tsx", "backend/app/main.py"]
                ).values()
            )
        )

    def test_manual_runs_request_full_validation(self):
        self.assertIsNone(ci_scope.changed_paths("workflow_dispatch", {}, "owner/repo"))

    def test_scope_uses_last_success_not_previous_failed_push(self):
        verified = "a" * 40
        with (
            patch.object(
                ci_scope.subprocess,
                "check_output",
                side_effect=[
                    json.dumps({"workflow_runs": [{"head_sha": verified}]}),
                    b"backend/app/main.py\0frontend/src/App.css\0",
                ],
            ) as read,
            patch.object(ci_scope.subprocess, "run"),
        ):
            paths = ci_scope.changed_paths("push", {"before": "b" * 40}, "owner/repo")
        self.assertIn("status=success", read.call_args_list[0].args[0][-1])
        self.assertIn(verified, read.call_args_list[1].args[0])
        self.assertTrue(all(ci_scope.classify(paths).values()))

    def test_unavailable_history_falls_back_to_full_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            event = Path(directory) / "event.json"
            output = Path(directory) / "output"
            event.write_text("{}")
            with (
                patch.dict(
                    os.environ,
                    {
                        "GITHUB_REF": "refs/heads/main",
                        "GITHUB_HEAD_REF": "",
                        "GITHUB_EVENT_NAME": "push",
                        "GITHUB_EVENT_PATH": str(event),
                        "GITHUB_OUTPUT": str(output),
                        "GITHUB_REPOSITORY": "owner/repo",
                    },
                ),
                patch.object(
                    ci_scope,
                    "changed_paths",
                    side_effect=subprocess.CalledProcessError(1, "gh"),
                ),
            ):
                ci_scope.main()
            self.assertEqual(output.read_text().count("=true"), 4)
            self.assertIn("backend_shards=[1, 2, 3]", output.read_text())

    def test_fast_backend_selection_uses_one_shard(self):
        with tempfile.TemporaryDirectory() as directory:
            event = Path(directory) / "event.json"
            output = Path(directory) / "output"
            event.write_text("{}")
            with (
                patch.dict(
                    os.environ,
                    {
                        "GITHUB_REF": "refs/heads/main",
                        "GITHUB_HEAD_REF": "",
                        "GITHUB_EVENT_NAME": "push",
                        "GITHUB_EVENT_PATH": str(event),
                        "GITHUB_OUTPUT": str(output),
                        "GITHUB_REPOSITORY": "owner/repo",
                    },
                ),
                patch.object(
                    ci_scope,
                    "changed_paths",
                    return_value=[
                        "backend/tests/test_weather.py",
                    ],
                ),
            ):
                ci_scope.main()
            self.assertIn("backend_shards=[1]\n", output.read_text())
            self.assertIn("tests/test_weather.py", output.read_text())

    def test_dev_is_rejected_even_for_manual_dispatch(self):
        for ref, head_ref in [("refs/heads/dev", ""), ("refs/pull/1/merge", "dev")]:
            with (
                self.subTest(ref=ref),
                patch.dict(
                    os.environ, {"GITHUB_REF": ref, "GITHUB_HEAD_REF": head_ref}
                ),
            ):
                with self.assertRaisesRegex(SystemExit, "dev is excluded"):
                    ci_scope.main()


if __name__ == "__main__":
    unittest.main()
