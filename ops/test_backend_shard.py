import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend_shard import BackendShard, assign_files, main


class BackendShardTests(unittest.TestCase):
    def test_balances_long_files_deterministically(self):
        counts = dict.fromkeys("abcdef", 1)
        weights = dict(zip("abcdef", [100, 80, 60, 40, 20, 1], strict=True))
        assigned, loads = assign_files(counts, weights, 3)
        self.assertEqual(loads, [101, 100, 100])
        self.assertEqual(
            (assigned, loads), assign_files(dict(reversed(counts.items())), weights, 3)
        )

    def test_partition_is_exhaustive_disjoint_and_preserves_file_order(self):
        original = [
            SimpleNamespace(nodeid=f"tests/test_{file}.py::test_case[{case}]")
            for file in "abcnew"
            for case in range(3)
        ]
        weights = {"tests/test_a.py": 10, "tests/deleted.py": 100}
        seen, fingerprints, owners = [], set(), {}
        for index in range(1, 4):
            plugin = BackendShard(index, 3, weights)
            config = SimpleNamespace(hook=SimpleNamespace(pytest_deselected=Mock()))
            items = original.copy()
            plugin.pytest_collection_modifyitems(config, items)
            seen.extend(item.nodeid for item in items)
            self.assertEqual(items, [item for item in original if item in items])
            omitted = config.hook.pytest_deselected.call_args.kwargs["items"]
            self.assertEqual(len(items) + len(omitted), len(original))
            fingerprints.add(plugin.summary.split("collection_sha256=")[1])
            for item in items:
                path = item.nodeid.split("::")[0]
                self.assertEqual(owners.setdefault(path, index), index)
        self.assertCountEqual(seen, [item.nodeid for item in original])
        self.assertEqual(len(seen), len(set(seen)))
        self.assertEqual(len(fingerprints), 1)

    def test_single_shard_keeps_all_selected_tests(self):
        items = [SimpleNamespace(nodeid="tests/test_new.py::test_new")]
        before = items.copy()
        config = SimpleNamespace(hook=SimpleNamespace(pytest_deselected=Mock()))
        BackendShard(1, 1, {}).pytest_collection_modifyitems(config, items)
        self.assertEqual(items, before)
        config.hook.pytest_deselected.assert_called_once_with(items=[])

    def test_invalid_shard_settings_and_weights_fail(self):
        for index, count in [(0, 3), (4, 3), (1, 0)]:
            with self.subTest(index=index, count=count), self.assertRaises(ValueError):
                BackendShard(index, count, {})
        for weight in [0, -1, float("nan"), float("inf")]:
            with self.subTest(weight=weight), self.assertRaises(ValueError):
                assign_files({"test.py": 1}, {"test.py": weight}, 3)

    def test_pytest_failure_and_empty_collection_are_not_masked(self):
        for code in [1, 5]:
            pytest = SimpleNamespace(main=Mock(return_value=code))
            with (
                self.subTest(code=code),
                patch.dict(sys.modules, {"pytest": pytest}),
                patch.object(
                    sys,
                    "argv",
                    [
                        "backend_shard.py",
                        "--index",
                        "1",
                        "--count",
                        "1",
                        "--durations=15",
                    ],
                ),
                patch.dict(os.environ, {"BACKEND_TESTS": '["tests/test_health.py"]'}),
                patch("backend_shard.require_test_database") as database_guard,
            ):
                self.assertEqual(main(), code)
                database_guard.assert_called_once()
                self.assertEqual(
                    pytest.main.call_args.args[0],
                    ["tests/test_health.py", "--durations=15"],
                )


if __name__ == "__main__":
    unittest.main()
