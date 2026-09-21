"""Partition normal pytest collection across isolated CI runners, never one DB."""

import argparse
import hashlib
import json
import math
import os
from collections import Counter
from pathlib import Path

from verify_local import require_test_database


def assign_files(counts, weights, shard_count):
    """Greedy duration balancing; new files participate without an allowlist."""
    if shard_count < 1:
        raise ValueError("Shard count must be positive")
    costs = {
        path: float(weights.get(path, max(1.0, count * 0.25)))
        for path, count in counts.items()
    }
    if any(not math.isfinite(cost) or cost <= 0 for cost in costs.values()):
        raise ValueError("Test weights must be finite positive seconds")
    loads = [0.0] * shard_count
    assigned = {}
    for path in sorted(counts, key=lambda name: (-costs[name], name)):
        shard = min(range(shard_count), key=lambda index: (loads[index], index))
        assigned[path] = shard + 1
        loads[shard] += costs[path]
    return assigned, loads


class BackendShard:
    def __init__(self, index, count, weights):
        if not 1 <= index <= count:
            raise ValueError("Shard index must be between 1 and shard count")
        self.index, self.count, self.weights = index, count, weights
        self.summary = ""

    def pytest_collection_modifyitems(self, config, items):
        counts = Counter(item.nodeid.split("::", 1)[0] for item in items)
        assigned, loads = assign_files(counts, self.weights, self.count)
        fingerprint = hashlib.sha256(
            "\n".join(sorted(item.nodeid for item in items)).encode()
        ).hexdigest()
        selected, deselected = [], []
        for item in items:
            target = assigned[item.nodeid.split("::", 1)[0]]
            (selected if target == self.index else deselected).append(item)
        self.summary = (
            f"Backend shard {self.index}/{self.count}: "
            f"{len(selected)}/{len(items)} tests; "
            f"estimated file loads={[round(load, 1) for load in loads]}; "
            f"collection_sha256={fingerprint}"
        )
        # Keep pytest's original order and file-scoped fixtures within each shard.
        config.hook.pytest_deselected(items=deselected)
        items[:] = selected

    def pytest_terminal_summary(self, terminalreporter):
        terminalreporter.write_line(self.summary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=int, required=True)
    parser.add_argument("--count", type=int, required=True)
    args, pytest_args = parser.parse_known_args()
    targets = json.loads(os.environ.get("BACKEND_TESTS", "[]"))
    if not isinstance(targets, list) or any(not isinstance(t, str) for t in targets):
        parser.error("BACKEND_TESTS must be a JSON list of pytest paths")
    weights = json.loads(
        Path(__file__).with_name("backend_test_weights.json").read_text()
    )["seconds"]
    try:
        plugin = BackendShard(args.index, args.count, weights)
        # Collection-only audits execute no fixtures or database operations.
        if "--collect-only" not in pytest_args:
            require_test_database(os.environ)
    except ValueError as error:
        parser.error(str(error))
    import pytest

    # Preserve every pytest exit code, including failures and empty collection.
    return pytest.main([*targets, *pytest_args], plugins=[plugin])


if __name__ == "__main__":
    raise SystemExit(main())
