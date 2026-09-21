"""Select CI jobs against verified history, never merely the previous push."""

import json
import os
import re
import subprocess
from pathlib import Path

JOBS = ("frontend", "backend", "browser", "smoke")
BACKEND_CORE = ("tests/test_health.py", "tests/test_independence.py")
# Only server-authored display copy has a bounded production-code fast path.
# Authentication, storage, collection, scoring and unknown modules stay full.
BACKEND_RELATED = {
    "backend/app/travel/language.py": (
        "tests/test_travel_rules.py",
        "tests/test_travel_integration.py",
        "tests/test_travel_keywords_routes.py",
        "tests/test_ai_chat.py",
    ),
}


def documentation(path):
    return (path.startswith("docs/") and Path(path).suffix == ".md") or path in {
        "AGENTS.md",
        "README.md",
        "LICENSE",
        "frontend/tests/browser/README.md",
    }


def backend_tests(paths):
    """Return explicit related tests, or [] for the complete backend suite."""
    targets = set(BACKEND_CORE)
    for path in paths:
        if not path.startswith("backend/") or documentation(path):
            continue
        if path in BACKEND_RELATED:
            targets.update(BACKEND_RELATED[path])
        elif re.fullmatch(r"backend/tests/test_[\w]+\.py", path):
            if Path(path).is_file():
                targets.add(path.removeprefix("backend/"))
            else:
                return []  # A deleted test must not produce an empty selection.
        else:
            return []
    return sorted(targets)


def profile(paths):
    if paths is None:
        return "full"
    for path in paths:
        if documentation(path):
            continue
        if path.startswith("frontend/src/") and (
            Path(path).suffix in {".tsx", ".css"}
            or path.startswith("frontend/src/locales/")
        ):
            continue
        if path.startswith(("frontend/public/", "frontend/src/assets/")):
            continue
        # Test/config changes run the entire browser suite, including new tests.
        if path in BACKEND_RELATED or re.fullmatch(
            r"backend/tests/test_[\w]+\.py", path
        ):
            continue
        return "full"
    return "fast"


def classify(paths):
    selected = dict.fromkeys(JOBS, False)
    for path in paths:
        if documentation(path):
            continue
        if path.startswith("frontend/"):
            selected.update(frontend=True, browser=True, smoke=True)
        elif path.startswith("backend/"):
            selected.update(backend=True, browser=True, smoke=True)
        else:
            # Workflow, Compose, ops, or unrecognized paths require all checks.
            return dict.fromkeys(JOBS, True)
    return selected


def changed_paths(event_name, event, repository):
    if event_name == "workflow_dispatch":
        return None
    if event_name == "pull_request":
        base = event["pull_request"]["base"]["sha"]
    else:
        # A failed backend push followed by a CSS-only push must still run backend.
        result = subprocess.check_output(
            [
                "gh",
                "api",
                (
                    f"repos/{repository}/actions/workflows/ci.yml/runs"
                    "?branch=main&event=push&status=success&per_page=1"
                ),
            ],
            text=True,
        )
        runs = json.loads(result)["workflow_runs"]
        if not runs:
            return None
        base = runs[0]["head_sha"]
    if not re.fullmatch(r"[0-9a-f]{40}", base):
        return None
    subprocess.run(["git", "merge-base", "--is-ancestor", base, "HEAD"], check=True)
    return (
        subprocess.check_output(
            ["git", "diff", "--name-only", "--no-renames", "-z", base, "HEAD"],
        )
        .decode()
        .split("\0")[:-1]
    )


def main():
    if (
        os.environ.get("GITHUB_REF") == "refs/heads/dev"
        or os.environ.get("GITHUB_HEAD_REF") == "dev"
    ):
        raise SystemExit("dev is excluded from CI and deployment")
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    try:
        paths = changed_paths(
            os.environ["GITHUB_EVENT_NAME"], event, os.environ["GITHUB_REPOSITORY"]
        )
    except (subprocess.SubprocessError, KeyError, ValueError) as error:
        # Missing history or an unavailable API must never cause checks to be skipped.
        print(
            f"::warning::CI history unavailable ({type(error).__name__}); "
            "running full checks"
        )
        paths = None
    selected = dict.fromkeys(JOBS, True) if paths is None else classify(paths)
    mode = profile(paths)
    targets = backend_tests(paths) if paths is not None and mode == "fast" else []
    output = "".join(
        f"{name}={str(enabled).lower()}\n" for name, enabled in selected.items()
    )
    output += f"profile={mode}\n"
    output += f"backend_tests={json.dumps(targets)}\n"
    output += f"browser_shards={json.dumps([1, 2] if mode == 'full' else [1])}\n"
    with Path(os.environ["GITHUB_OUTPUT"]).open("a") as target:
        target.write(output)
    print(output, end="")


if __name__ == "__main__":
    main()
