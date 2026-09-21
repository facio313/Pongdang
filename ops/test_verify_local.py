import unittest

import verify_local


class LocalVerificationTests(unittest.TestCase):
    def test_ui_check_does_not_repeat_release_build_or_full_browser_suite(self):
        commands = verify_local.plan(["frontend/src/HomePage.tsx"])
        self.assertEqual(len(commands), 3)
        flattened = [word for _, command in commands for word in command]
        self.assertIn("typecheck", flattened)
        self.assertNotIn("build", flattened)
        self.assertNotIn("playwright", flattened)

    def test_documentation_does_not_run_checks(self):
        self.assertEqual(verify_local.plan(["docs/ci.md", "AGENTS.md"]), [])

    def test_backend_changes_require_a_related_test_instead_of_silent_full_run(self):
        with self.assertRaisesRegex(ValueError, "require related --test"):
            verify_local.plan(["backend/app/database.py"])

    def test_explicit_test_is_used_without_collecting_the_whole_suite(self):
        _, command = verify_local.plan(
            ["backend/app/database.py"], ["backend/tests/test_health.py"]
        )[-1]
        self.assertEqual(
            command, ["uv", "run", "--frozen", "pytest", "tests/test_health.py"]
        )

    def test_backend_guard_requires_all_explicit_disposable_db_settings(self):
        valid = {
            "PONGDANG_TEST_DISPOSABLE": "1",
            "POSTGRES_HOST": "127.0.0.1",
            "POSTGRES_PORT": "49289",
            "POSTGRES_DB": "pongdang_test",
            "POSTGRES_USER": "pongdang",
            "POSTGRES_PASSWORD": "test-only",
        }
        verify_local.require_test_database(valid)
        for key in valid:
            with self.subTest(missing=key), self.assertRaises(ValueError):
                verify_local.require_test_database(
                    {k: v for k, v in valid.items() if k != key}
                )
        for key, value in (
            ("POSTGRES_DB", "pongdang"),
            ("POSTGRES_HOST", "db.example.test"),
        ):
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_local.require_test_database(valid | {key: value})

    def test_paths_cannot_escape_the_repository_or_request_a_whole_tree(self):
        for path in ("../another-repo/file.py", "frontend"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                verify_local.normalized(path)


if __name__ == "__main__":
    unittest.main()
