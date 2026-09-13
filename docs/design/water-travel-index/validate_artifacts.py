"""Check design artifacts only; no product imports, network, DB, or model execution.

Run: python3 docs/design/water-travel-index/validate_artifacts.py
Writes validation_report.json next to this file. This is not product test coverage
or empirical validation of any model, threshold, safety claim, or preference.
"""

import csv
import hashlib
import json
import re
import subprocess
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote
from zoneinfo import ZoneInfo


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RESEARCH = ROOT / "docs/research/water-travel-index"
errors = []
checks = Counter()


def check(condition, message, category):
    checks[category] += 1
    if not condition:
        errors.append(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    check(parsed.tzinfo is not None, f"offset missing: {value}", "example_times")
    return parsed


baseline = read_json(HERE / "source_baseline.json")
for name, expected in baseline["files"].items():
    path = ROOT / name
    check(path.is_file() and digest(path) == expected, f"protected file changed: {name}", "source_preservation")

for command, key in [(["git", "branch", "--show-current"], "branch"), (["git", "rev-parse", "HEAD"], "head")]:
    actual = subprocess.check_output(command, cwd=ROOT, text=True).strip()
    check(actual == baseline[key], f"git {key} changed", "source_preservation")

present = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT).decode().split("\0")
unexpected_new = sorted({name for name in present if name and (ROOT / name).is_file() and name not in baseline["files"] and not name.startswith("docs/design/water-travel-index/")})
check(not unexpected_new, f"new files outside design scope: {unexpected_new}", "source_preservation")

with (RESEARCH / "evidence_matrix.csv").open(encoding="utf-8", newline="") as handle:
    evidence = list(csv.DictReader(handle))
evidence_ids = {row["evidence_id"] for row in evidence}
with (HERE / "parameter_evidence.csv").open(encoding="utf-8", newline="") as handle:
    reader = csv.DictReader(handle)
    fields = reader.fieldnames
    parameters = list(reader)
check(len(fields) == 20, "parameter CSV does not have 20 columns", "parameter_schema")
parameter_ids = {row["parameter_id"] for row in parameters}
check(len(parameter_ids) == len(parameters), "duplicate parameter IDs", "parameter_schema")
statuses = {"adopted_design_constraint", "experimental_offline", "draft_operational_policy", "unresolved", "retired_or_not_adopted"}
origins = {"원문직접", "연구종합", "설계가정", "미검증기존"}
for row in parameters:
    pid = row["parameter_id"]
    check(None not in row and all(value is not None for value in row.values()), f"CSV column mismatch: {pid}", "parameter_schema")
    check(row["status"] in statuses and row["origin_type"] in origins, f"parameter enum invalid: {pid}", "parameter_schema")
    for field in ("value", "live_default"):
        try:
            parsed = json.loads(row[field])
            check(field != "live_default" or parsed is None, f"live default is not null: {pid}", "parameter_schema")
            if field == "value" and row["status"] == "unresolved":
                check(parsed is None, f"unresolved value not null: {pid}", "parameter_schema")
        except ValueError:
            check(False, f"invalid JSON {pid}.{field}", "parameter_schema")
    for eid in filter(None, row["evidence_ids"].split(";")):
        check(eid in evidence_ids, f"missing evidence ID: {pid} -> {eid}", "evidence_links")
    for field in ("purpose", "unit", "scope", "adoption_reason", "alternatives", "uncertainty", "sensitivity", "calibration", "model_version", "source_locator"):
        check(bool(row[field].strip()), f"parameter required field empty: {pid}.{field}", "parameter_schema")
legacy_links = set(re.findall(r"L-\d{2}", ";".join(row["legacy_rule_ids"] for row in parameters)))
check(set(f"L-{n:02d}" for n in range(1, 21)) <= legacy_links, "legacy L-01..L-20 linkage gap", "evidence_links")

for path in HERE.glob("*.md"):
    content = path.read_text(encoding="utf-8")
    for pid in set(re.findall(r"\bPAR_[A-Z0-9_]+\b", content)):
        if pid.endswith("_") or pid in {"PAR_VALIDATION", "PAR_LEGACY", "PAR_HCI"}:
            continue  # family or wildcard, not an individual reference
        check(pid in parameter_ids, f"unregistered parameter {path.name}: {pid}", "parameter_references")
    for eid in set(re.findall(r"\b(?:HC|SW|AC|KR)\d{2}\b", content)):
        check(eid in evidence_ids, f"unknown evidence reference {path.name}: {eid}", "evidence_links")
    for target in re.findall(r"\]\(([^)]+)\)", content):
        target = target.strip("<>")
        if re.match(r"[a-z]+://", target) or target.startswith("#"):
            continue
        target = re.sub(r":\d+$", "", unquote(target.split("#")[0]))
        check((path.parent / target).resolve().exists(), f"broken local link {path.name}: {target}", "document_links")

artifact = read_json(HERE / "api_examples.json")
check(artifact["documentation_only"] and artifact["not_actual_records"] and artifact["not_seed_or_runtime_fixture"], "example use boundary missing", "example_schema")
row_count = numeric_count = 0


def bound_lists(value, path):
    if isinstance(value, dict):
        for key, child in value.items():
            bound_lists(child, f"{path}.{key}")
    elif isinstance(value, list):
        check(len(value) <= 100, f"nested list exceeds 100: {path}", "example_bounds")
        for index, child in enumerate(value):
            bound_lists(child, f"{path}[{index}]")


for example in artifact["examples"]:
    label = example["example_id"]
    response = example["response"]
    check(example["documentation_only"] is True, f"example not labelled: {label}", "example_schema")
    bound_lists(response, label)
    if example["http_status"] != 200:
        check(isinstance(response.get("detail"), str) and bool(response.get("error_code")), f"error fields missing: {label}", "example_schema")
        continue
    cutoff = timestamp(response["as_of"])
    check(cutoff <= timestamp(response["queried_at"]), f"future envelope cutoff: {label}", "example_times")
    check(len(response["rows"]) <= response["page_size"] <= 100, f"page bound: {label}", "example_bounds")
    keys = []
    for row in response["rows"]:
        row_count += 1
        check(isinstance(row.get("target_id"), str) and bool(row["target_id"]), f"target identity missing: {label}", "example_schema")
        keys.append((row.get("target_id"), json.dumps(row["context"], sort_keys=True), row["model"]["model_id"], row["model"]["model_version"], row["model"]["parameter_set_version"]))
        row_cutoff = timestamp(row["as_of"]) if row["as_of"] else None
        check(row_cutoff is None or row_cutoff <= cutoff, f"row cutoff after query: {label}", "example_times")
        check(row["score"] == row["environment"]["score"], f"score mirror: {label}", "example_states")
        check(row["safety_status"] == row["safety"]["status"], f"safety mirror: {label}", "example_states")
        check(row["preference"]["ranking"] is None and row["recommendation"]["ranking"] is None, f"invented ranking: {label}", "example_states")
        check(row["preference"]["score"] is None and row["preference"]["status"] == "not_modelled", f"invented preference: {label}", "example_states")
        support, safety = row["support"]["status"], row["safety"]["status"]
        if support != "supported" or safety in {"restricted", "unknown", "not_assessed"}:
            check(row["score"] is None, f"gating bypass: {label}", "example_states")
        if safety == "no_known_restriction":
            check(row["safety"]["required_checks_complete"] and len(row["safety"]["checked_rule_ids"]) > 0 and not row["safety"]["missing_check_ids"], f"empty safety approval: {label}", "example_states")
        if row["score"] is not None:
            numeric_count += 1
            check(0 <= row["score"] <= 100 and row["assessment_status"] == row["environment"]["status"] == "evaluated", f"numeric score semantics: {label}", "example_states")
            check(example["offline_only"] and "contract-fixture-only" in json.dumps(row["model"]), f"unvalidated numeric public example: {label}", "example_states")
        if support == "unsupported":
            expected_status, expected_message = "unsupported", "not_supported"
        elif support == "unknown":
            expected_status, expected_message = "support_unknown", "check_required"
        elif safety == "restricted":
            expected_status, expected_message = "withheld", "do_not_proceed"
        elif safety in {"unknown", "not_assessed"}:
            expected_status, expected_message = "withheld", "check_required"
        else:
            expected_status = row["assessment_status"]
            expected_message = "conditional_information" if safety == "caution" else ("information_only" if row["environment"]["status"] == "evaluated" else "unavailable")
        check(row["assessment_status"] == expected_status and row["recommendation"]["status"] == expected_message, f"example priority: {label}", "example_states")
        for quality in [row["data_quality"], *row["data_quality"]["by_layer"].values()]:
            if quality["status"] == "sufficient":
                check(quality["required_total"] is not None and quality["required_total"] > 0 and quality["required_total"] == quality["required_usable"], f"empty sufficient quality: {label}", "example_states")
            for kind in ("required", "optional"):
                total, usable = quality[f"{kind}_total"], quality[f"{kind}_usable"]
                check((total is None and usable is None) or (isinstance(total, int) and isinstance(usable, int) and 0 <= usable <= total), f"quality count: {label}", "example_states")
        target = row["target"]
        if target["kind"] == "interval":
            check(timestamp(target["start_at"]) < timestamp(target["end_at"]), f"empty interval: {label}", "example_times")
        else:
            check(target["end_at"] is None, f"instant has end: {label}", "example_times")
        used_modes = set()
        for item in row["inputs"]:
            used = bool(item["used_by"])
            check(not used or row_cutoff is not None, f"used input without evaluation cutoff: {label}", "example_times")
            time_limit = row_cutoff if used else cutoff
            if used:
                used_modes.add(item["mode"])
            if time_limit is not None:
                check(timestamp(item["fetched_at"]) <= time_limit, f"future fetched input: {label}", "example_times")
                if item["issued_at"]:
                    check(timestamp(item["issued_at"]) <= time_limit, f"future issued input: {label}", "example_times")
                if item["mode"] == "observation":
                    check(timestamp(item["observed_at"]) <= time_limit, f"future observation: {label}", "example_times")
            check(item["numeric_value"] is None or type(item["numeric_value"]) in {int, float}, f"non-numeric input: {label}", "example_schema")
            check(item["boolean_value"] is None or type(item["boolean_value"]) is bool, f"non-boolean input: {label}", "example_schema")
        expected_mode = "none" if not used_modes else (next(iter(used_modes)) if len(used_modes) == 1 else "mixed")
        check(row["mode"] == expected_mode, f"used mode mismatch: {label}", "example_states")
        check(bool(used_modes) == bool(row["input_manifest_id"]), f"input manifest usage mismatch: {label}", "example_states")
    check(len(keys) == len(set(keys)), f"duplicate target/context/model row: {label}", "example_schema")

source_manifest = read_json(HERE / "source_manifest.json")
for group in ("evidence_files", "design_files", "reviewed_source_files"):
    for name, expected in source_manifest[group].items():
        check(digest(ROOT / name) == expected, f"manifest hash mismatch: {name}", "version_manifest")

case_ids = re.findall(r"^\| (V-[SDTA]\d{2}) \|", (HERE / "validation_plan.md").read_text(), re.MULTILINE)
check(len(case_ids) == len(set(case_ids)), "duplicate planned verification case IDs", "document_schema")
report = {
    "checked_at_kst": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
    "scope": "documentation_static_integrity_only",
    "product_tests_run": False,
    "api_or_database_called": False,
    "model_executed_or_empirically_validated": False,
    "branch": baseline["branch"], "head": baseline["head"],
    "protected_existing_files": len(baseline["files"]),
    "parameter_rows": len(parameters), "parameter_columns": len(fields),
    "parameter_status_counts": dict(Counter(row["status"] for row in parameters)),
    "evidence_ids_available": len(evidence_ids),
    "documentation_examples": len(artifact["examples"]),
    "documentation_assessment_rows": row_count,
    "offline_numeric_examples": numeric_count,
    "planned_implementation_verification_cases": len(case_ids),
    "checks_by_category": dict(checks),
    "errors": errors, "passed": not errors,
    "limitations": [
        "Narrative scientific accuracy, original studies, and completeness of the future implementation are not proved by these checks.",
        "Example state checks cover provided documentation cases; they do not replace all planned implementation tests.",
        "Hash preservation covers the recorded existing tracked/untracked files; ignored secrets are not read or inventoried.",
        "No model, product API, database, browser, application test suite, user study, or statistical validation was run.",
    ],
}
(HERE / "validation_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"passed": not errors, "checks": sum(checks.values()), "errors": errors, "parameters": len(parameters), "planned_cases": len(case_ids)}, ensure_ascii=False, indent=2))
raise SystemExit(0 if not errors else 1)
