"""Check explicitly changed files without scanning/copying the iCloud repository."""

import argparse
import os
import shlex
import subprocess
import time
from pathlib import Path

from ci_scope import BACKEND_RELATED, documentation

ROOT = Path(__file__).resolve().parents[1]


def normalized(value):
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    relative = path.resolve().relative_to(ROOT).as_posix()
    if path.is_dir():
        raise ValueError("Specify changed files, not whole directories")
    return relative


def require_test_database(environ):
    if (
        environ.get("PONGDANG_TEST_DISPOSABLE") != "1"
        or environ.get("POSTGRES_HOST") not in {"127.0.0.1", "localhost"}
        or environ.get("POSTGRES_DB") != "pongdang_test"
        or not all(
            environ.get(name)
            for name in (
                "POSTGRES_PORT",
                "POSTGRES_USER",
                "POSTGRES_PASSWORD",
            )
        )
    ):
        raise ValueError(
            "Set PONGDANG_TEST_DISPOSABLE=1 and explicit POSTGRES_HOST/PORT/DB/"
            "USER/PASSWORD for your own disposable loopback pongdang_test database."
        )


def plan(paths, tests=()):
    commands = []
    frontend = [p for p in paths if p.startswith("frontend/") and not documentation(p)]
    if frontend:
        typed = [
            p.removeprefix("frontend/")
            for p in frontend
            if Path(p).suffix in {".ts", ".tsx"} and (ROOT / p).is_file()
        ]
        if typed:
            commands.append(
                (
                    "frontend",
                    ["npx", "--no-install", "eslint", "--max-warnings=0", *typed],
                )
            )
        # This small Node suite is cheaper than maintaining an import-based selector.
        commands.append(("frontend", ["npm", "test"]))
        if any(Path(p).suffix in {".ts", ".tsx", ".json"} for p in frontend):
            commands.append(("frontend", ["npm", "run", "typecheck"]))

    backend = [p for p in paths if p.startswith("backend/") and not documentation(p)]
    python_paths = [
        p.removeprefix("backend/")
        for p in backend
        if Path(p).suffix == ".py" and (ROOT / p).is_file()
    ]
    if python_paths:
        commands.extend(
            ("backend", ["uv", "run", "--frozen", "ruff", *args, *python_paths])
            for args in (["check"], ["format", "--check"])
        )
    targets = set(tests)
    for path in backend:
        if (
            path.startswith("backend/tests/test_")
            and path.endswith(".py")
            and (ROOT / path).is_file()
        ):
            targets.add(path)
        elif path in BACKEND_RELATED:
            targets.update("backend/" + test for test in BACKEND_RELATED[path])
        elif path.startswith("backend/app/") and not tests:
            raise ValueError(
                "Backend behavior changes require related --test "
                "backend/tests/test_….py paths; full regression runs in CI."
            )
    if targets:
        for target in targets:
            if (
                not target.startswith("backend/tests/test_")
                or not target.endswith(".py")
                or not (ROOT / target).is_file()
            ):
                raise ValueError(f"Not an existing backend test file: {target}")
        commands.append(
            (
                "backend",
                [
                    "uv",
                    "run",
                    "--frozen",
                    "pytest",
                    *sorted(p.removeprefix("backend/") for p in targets),
                ],
            )
        )
    return commands


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "files", nargs="+", help="Repository-relative changed files; no Git scan"
    )
    parser.add_argument(
        "--test",
        action="append",
        default=[],
        help="Related backend test file (repeatable)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Print checks without running them"
    )
    args = parser.parse_args()
    try:
        paths = [normalized(path) for path in args.files]
        commands = plan(paths, [normalized(path) for path in args.test])
        if not args.dry_run and any("pytest" in command for _, command in commands):
            require_test_database(os.environ)
    except ValueError as error:
        parser.error(str(error))
    started = time.monotonic()
    for directory, command in commands:
        print(f"[{directory}] {shlex.join(command)}", flush=True)
        if not args.dry_run:
            subprocess.run(command, cwd=ROOT / directory, check=True)
    if args.dry_run:
        print("Plan only; checks have not run.")
    else:
        print(
            f"{len(commands)} local checks completed in "
            f"{time.monotonic() - started:.1f}s."
        )
    if any(not documentation(p) for p in paths):
        print(
            "Run the affected UI test when needed; Docker/build and "
            "full release checks remain in CI."
        )


if __name__ == "__main__":
    main()
