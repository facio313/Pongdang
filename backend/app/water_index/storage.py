"""Trusted append-only writes and bounded read-only assessment projections.

No provider calls, target inference, evaluator execution or HTTP write routes.
Publication requires an explicit read manifest, not merely an assessment row.
"""

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from psycopg import sql
from psycopg.types.json import Jsonb

from app.config import Settings
from app.schema import connect

MAX_ITEMS = 100
MAX_TARGETS = 100_000
SELECTION_POLICY = "stored-selection.v1"


class StorageReadError(Exception):
    def __init__(self, status_code: int, code: str, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class TargetRecord:
    assessment: Any
    request_mode: str


@dataclass(frozen=True)
class InputManifest:
    manifest_id: str
    inputs: list[dict]
    evaluation_request: dict | None = None
    provenance: dict | None = None


@dataclass(frozen=True)
class ReadManifest:
    manifest_id: str
    spot_id: int
    activity: str
    profile_id: str
    mode: str
    scope_start_at: datetime
    scope_end_at: datetime
    read_valid_until: datetime
    selections: dict[str, str | None]
    supported_windows: list[dict]
    support_rows: list[dict] = field(default_factory=list)
    selection_policy_version: str = SELECTION_POLICY


@dataclass(frozen=True)
class StorageBundle:
    targets: list[TargetRecord] = field(default_factory=list)
    input_manifests: list[InputManifest] = field(default_factory=list)
    assessments: list[Any] = field(default_factory=list)
    read_manifests: list[ReadManifest] = field(default_factory=list)


def _time(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError("Timezone-aware datetime required")
    return value.astimezone(UTC)


def _json(value):
    return json.loads(
        json.dumps(
            value,
            default=lambda x: _time(x).isoformat(),
            allow_nan=False,
            sort_keys=True,
        )
    )


def _id(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        raise ValueError("A bounded immutable identifier is required")
    return value


def _assessment(value):
    from app.water_index.models import AssessmentDTO

    if not isinstance(value, AssessmentDTO):
        raise TypeError("Trusted storage accepts AssessmentDTO outputs only")
    result = AssessmentDTO.model_validate(value.model_dump(mode="json"))
    payload = result.model_dump(mode="json")
    if payload["score"] is not None or payload["environment"]["score"] is not None:
        raise ValueError("Numeric models are not enabled for storage/publication")
    return payload


def _identity(payload):
    model = payload["model"]
    return (
        payload["target_id"],
        payload["spot_id"],
        payload["activity"],
        payload["target"],
        payload["context"],
        model["model_id"],
        model["model_version"],
        model["parameter_set_version"],
    )


def _append(c, table, key_name, key, payload, columns):
    _id(key)
    payload = _json(payload)
    # queried_at is a response field, not an evaluation revision.
    hashed = {
        "payload": {k: v for k, v in payload.items() if k != "queried_at"},
        "columns": _json(columns),
    }
    digest = hashlib.sha256(
        json.dumps(
            hashed,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()
    existing = c.execute(
        sql.SQL("SELECT digest FROM {} WHERE {}=%s").format(
            sql.Identifier("pongdang_data", table),
            sql.Identifier(key_name),
        ),
        [key],
    ).fetchone()
    if existing:
        if existing[0] != digest:
            raise ValueError("Immutable identity already has different content")
        return 0
    values = {key_name: key, **columns, "payload": Jsonb(payload), "digest": digest}
    c.execute(
        sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
            sql.Identifier("pongdang_data", table),
            sql.SQL(",").join(map(sql.Identifier, values)),
            sql.SQL(",").join(sql.Placeholder() for _ in values),
        ),
        list(values.values()),
    )
    return 1


def _target(c, item):
    from app.water_index.engine import diagnostic_assessment

    p = _assessment(item.assessment)
    _id(p["context"]["profile_id"])
    if any(
        p[k] is not None
        for k in (
            "assessment_id",
            "input_manifest_id",
            "as_of",
            "evaluated_at",
            "score",
        )
    ) or any(i["used_by"] for i in p["inputs"]):
        raise ValueError("Target manifest requires a non-evaluated diagnostic DTO")
    if item.request_mode not in {"observation", "forecast"}:
        raise ValueError("Invalid requested mode")
    expected = diagnostic_assessment(
        target_id=p["target_id"],
        spot_id=p["spot_id"],
        activity=p["activity"],
        target=item.assessment.target,
        context=item.assessment.context,
    ).model_dump(mode="json")
    if {k: v for k, v in p.items() if k != "queried_at"} != {
        k: v for k, v in expected.items() if k != "queried_at"
    }:
        raise ValueError("Target payload must be the pure diagnostic output")
    return _append(
        c,
        "water_index_target",
        "target_id",
        p["target_id"],
        p,
        {
            "spot_id": p["spot_id"],
            "activity": p["activity"],
            "profile_id": p["context"]["profile_id"],
            "request_mode": item.request_mode,
            "start_at": _time(p["target"]["start_at"]),
            "end_at": _time(p["target"]["end_at"]) if p["target"]["end_at"] else None,
        },
    )


def _store_assessment(c, value, now):
    from app.water_index.engine import evaluate
    from app.water_index.models import EvaluationRequest

    p = _assessment(value)
    _id(p["assessment_id"])
    if p["as_of"] is None or _time(p["as_of"]) > now:
        raise ValueError("A stored assessment needs an existing knowledge cutoff")
    if p["evaluated_at"] and _time(p["evaluated_at"]) > now:
        raise ValueError("Assessment cannot be generated in the future")
    references = [
        *p["inputs"],
        *p["support"]["source_evidence"],
        *p["safety"]["warnings"],
        *p["safety"]["restrictions"],
    ]
    for reference in references:
        for field_name in ("fetched_at", "issued_at"):
            if reference.get(field_name) and _time(reference[field_name]) > now:
                raise ValueError("Public reference was not available at storage time")
        if (
            reference.get("mode") == "observation"
            and _time(reference["observed_at"]) > now
        ):
            raise ValueError("Public observation cannot be from the future")
    target = c.execute(
        "SELECT payload FROM pongdang_data.water_index_target WHERE target_id=%s",
        [p["target_id"]],
    ).fetchone()
    if not target or _identity(target[0]) != _identity(p):
        raise ValueError("Assessment must match an immutable target and model context")
    if p["input_manifest_id"]:
        manifest = c.execute(
            "SELECT payload FROM pongdang_data.water_index_input_manifest "
            "WHERE manifest_id=%s",
            [p["input_manifest_id"]],
        ).fetchone()
        if not manifest or manifest[0]["inputs"] != p["inputs"]:
            raise ValueError("Assessment input manifest does not match")
        if manifest[0].get("evaluation_request") is None:
            raise ValueError("Stored evaluation requires its complete request snapshot")
        request = EvaluationRequest.model_validate(manifest[0]["evaluation_request"])
        expected = evaluate(request).model_dump(mode="json")
        if {k: v for k, v in p.items() if k != "queried_at"} != {
            k: v for k, v in expected.items() if k != "queried_at"
        }:
            raise ValueError("Assessment differs from the pure evaluator output")
    else:
        raise ValueError("Stored evaluation requires an immutable request manifest")
    return _append(
        c,
        "water_index_assessment",
        "assessment_id",
        p["assessment_id"],
        p,
        {
            "target_id": p["target_id"],
            "input_manifest_id": p["input_manifest_id"],
            "as_of": _time(p["as_of"]),
            "evaluated_at": _time(p["evaluated_at"]) if p["evaluated_at"] else None,
        },
    )


def _store_read_manifest(c, manifest, now):
    from app.water_index.models import SupportDTO, Target

    # Retry identity checks precede expiry validation: a duplicate must not extend
    # its creation time, including when the original view has already expired.
    columns = {
        "spot_id": manifest.spot_id,
        "activity": manifest.activity,
        "profile_id": manifest.profile_id,
        "request_mode": manifest.mode,
        "scope_start_at": _time(manifest.scope_start_at),
        "scope_end_at": _time(manifest.scope_end_at),
        "read_valid_until": _time(manifest.read_valid_until),
        "selection_policy_version": manifest.selection_policy_version,
    }
    if c.execute(
        "SELECT 1 FROM pongdang_data.water_index_read_manifest WHERE manifest_id=%s",
        [manifest.manifest_id],
    ).fetchone():
        return _append(
            c,
            "water_index_read_manifest",
            "manifest_id",
            manifest.manifest_id,
            asdict(manifest),
            columns,
        )
    if manifest.selection_policy_version != SELECTION_POLICY:
        raise ValueError("Unapproved selection policy")
    start, end = _time(manifest.scope_start_at), _time(manifest.scope_end_at)
    if not start < end or end - start > timedelta(days=31):
        raise ValueError("Read manifest scope must be a bounded positive interval")
    if _time(manifest.read_valid_until) <= now:
        raise ValueError("Read manifest must have a future expiry at creation")
    if len(manifest.selections) > MAX_TARGETS:
        raise ValueError("Read manifest has too many targets")
    if max(len(manifest.supported_windows), len(manifest.support_rows)) > MAX_ITEMS:
        raise ValueError("Read manifest nested collection too large")
    if manifest.mode not in {"observation", "forecast"}:
        raise ValueError("Invalid requested mode")
    for window in manifest.supported_windows:
        if set(window) != {"start_at", "end_at"}:
            raise ValueError("Coverage permits only original interval endpoints")
        if not _time(window["start_at"]) < _time(window["end_at"]):
            raise ValueError("Invalid coverage window")
    for target_id, assessment_id in manifest.selections.items():
        target = c.execute(
            "SELECT spot_id,activity,profile_id,request_mode,payload FROM "
            "pongdang_data.water_index_target WHERE target_id=%s",
            [target_id],
        ).fetchone()
        if not target or tuple(target[:4]) != (
            manifest.spot_id,
            manifest.activity,
            manifest.profile_id,
            manifest.mode,
        ):
            raise ValueError("Read selection does not match the target scope")
        if assessment_id is not None:
            a = c.execute(
                "SELECT target_id,payload FROM pongdang_data.water_index_assessment "
                "WHERE assessment_id=%s",
                [assessment_id],
            ).fetchone()
            if not a or a[0] != target_id:
                raise ValueError("Read selection references another target")
            # No caller can lengthen the lifetime of a computed result.
            until = a[1].get("valid_until")
            if until and _time(manifest.read_valid_until) > _time(until):
                raise ValueError("Read view outlives its selected assessment")
    for support in manifest.support_rows:
        if set(support) != {"target_id", "spot_id", "activity", "target", "support"}:
            raise ValueError("Unexpected support projection fields")
        if (support["spot_id"], support["activity"]) != (
            manifest.spot_id,
            manifest.activity,
        ):
            raise ValueError("Support row is outside the read scope")
        _id(support["target_id"])
        support_target = Target.model_validate(support["target"])
        support_value = SupportDTO.model_validate(support["support"])
        if support_value.status != "unknown":
            if not support_value.evidence_refs or support_value.valid_from is None:
                raise ValueError("Known support requires evidence and applicability")
            if (support_target.start_at, support_target.end_at) != (
                support_value.valid_from,
                support_value.valid_until,
            ):
                raise ValueError("Support target must preserve its original interval")
            if _time(manifest.read_valid_until) > support_value.valid_until:
                raise ValueError("Read view outlives its support evidence")
            for evidence in support_value.source_evidence:
                if (
                    not evidence.authoritative
                    or evidence.source_status != "active"
                    or evidence.state != "current"
                    or evidence.fetched_at > now
                    or (evidence.spot_id, evidence.activity)
                    != (
                        manifest.spot_id,
                        manifest.activity,
                    )
                    or evidence.valid_from is None
                    or evidence.valid_from > support_target.start_at
                    or evidence.valid_until < support_target.end_at
                ):
                    raise ValueError("Support must retain verified applicable evidence")
    if len({s["target_id"] for s in manifest.support_rows}) != len(
        manifest.support_rows
    ):
        raise ValueError("Duplicate support identity")
    return _append(
        c,
        "water_index_read_manifest",
        "manifest_id",
        manifest.manifest_id,
        asdict(manifest),
        {
            "spot_id": manifest.spot_id,
            "activity": manifest.activity,
            "profile_id": manifest.profile_id,
            "request_mode": manifest.mode,
            "scope_start_at": start,
            "scope_end_at": end,
            "read_valid_until": _time(manifest.read_valid_until),
            "selection_policy_version": manifest.selection_policy_version,
        },
    )


def store_bundle_on_connection(c, bundle: StorageBundle, now: datetime) -> int:
    """Store a validated bundle inside a caller-owned atomic producer transaction."""
    inserted = 0
    for target in bundle.targets:
        inserted += _target(c, target)
    for manifest in bundle.input_manifests:
        from app.water_index.models import EvaluationRequest, InputDTO
        from app.water_index.registry import provenance_manifest

        if len(manifest.inputs) > MAX_ITEMS:
            raise ValueError("Input manifest exceeds the contract limit")
        for item in manifest.inputs:
            InputDTO.model_validate(item)
        if len({i["input_id"] for i in manifest.inputs}) != len(manifest.inputs):
            raise ValueError("Duplicate input identity")
        payload = asdict(manifest)
        if manifest.evaluation_request is not None:
            request = EvaluationRequest.model_validate(manifest.evaluation_request)
            if request.input_manifest_id != manifest.manifest_id:
                raise ValueError("Request snapshot references another manifest")
            if request.evaluated_at > now or request.as_of > now:
                raise ValueError("Request snapshot cannot be from the future")
            if manifest.provenance != provenance_manifest():
                raise ValueError("Request provenance is not the bundled registry")
            payload["evaluation_request"] = request.model_dump(mode="json")
        inserted += _append(
            c,
            "water_index_input_manifest",
            "manifest_id",
            manifest.manifest_id,
            payload,
            {},
        )
    for assessment in bundle.assessments:
        inserted += _store_assessment(c, assessment, now)
    for manifest in bundle.read_manifests:
        inserted += _store_read_manifest(c, manifest, now)
    return inserted


def store_bundle(settings: Settings, bundle: StorageBundle) -> int:
    """Atomically store explicit trusted outputs; duplicates never refresh age."""
    with connect(settings) as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext('pongdang-water-index'))")
        now = c.execute("SELECT clock_timestamp()").fetchone()[0]
        return store_bundle_on_connection(c, bundle, now)


def _overlaps(target, start, end):
    left = _time(target["start_at"])
    right = _time(target["end_at"]) if target["end_at"] else None
    return left < end and (right > start if right else left >= start)


def _empty_coverage():
    return {
        "status": "unknown",
        "supported_windows": [],
        "uncovered_windows": [],
        "missing_targets": [],
        "reason_codes": ["target_manifest_unavailable"],
    }


def _coverage(windows, missing, start, end, mode):
    spans = sorted((_time(w["start_at"]), _time(w["end_at"])) for w in windows)
    cursor, gaps = start, []
    for left, right in spans:
        if right <= cursor or left >= end:
            continue
        if left > cursor:
            gaps.append({"start_at": cursor.isoformat(), "end_at": left.isoformat()})
        cursor = max(cursor, min(right, end))
    if cursor < end:
        gaps.append({"start_at": cursor.isoformat(), "end_at": end.isoformat()})
    none = (
        len(gaps) == 1
        and _time(gaps[0]["start_at"]) == start
        and _time(gaps[0]["end_at"]) == end
    )
    reasons = ["outside_forecast_horizon"] if gaps and mode == "forecast" else []
    if missing:
        reasons.append("input_missing")
    return {
        "status": "unavailable"
        if none
        else "partial"
        if gaps or missing
        else "available",
        "supported_windows": windows,
        "uncovered_windows": gaps,
        "missing_targets": missing,
        "reason_codes": reasons,
    }


async def read_projection(
    connection,
    *,
    spot_id,
    activity,
    profile_id,
    mode,
    from_at,
    until_at,
    as_of,
    historical=False,
    page=1,
    page_size=25,
    route="assessments",
):
    """Use the caller's existing repeatable-read, read-only connection only."""
    start, end, cutoff = _time(from_at), _time(until_at), _time(as_of)
    if (
        not isinstance(spot_id, int)
        or isinstance(spot_id, bool)
        or spot_id <= 0
        or not start < end
        or end - start > timedelta(days=31)
        or not 1 <= page <= 1000
        or not 1 <= page_size <= MAX_ITEMS
        or mode not in {"observation", "forecast"}
        or route not in {"assessments", "support", "coverage"}
    ):
        raise StorageReadError(422, "invalid_query", "조회 조건을 확인해 주세요.")
    spot = await (
        await connection.execute(
            "SELECT id FROM pongdang_data.spots_waterspot WHERE id=%s",
            [spot_id],
        )
    ).fetchone()
    if not spot:
        raise StorageReadError(404, "spot_not_found", "등록된 장소가 없습니다.")
    manifest = await (
        await connection.execute(
            "SELECT manifest_id,payload-'selections' AS payload,scope_start_at,"
            "scope_end_at,read_valid_until,"
            "payload->'selections'='{}'::jsonb AS empty_targets FROM "
            "pongdang_data.water_index_read_manifest WHERE spot_id=%s AND activity=%s "
            "AND profile_id=%s AND request_mode=%s AND available_at<=%s "
            "AND scope_start_at<%s AND scope_end_at>%s "
            "ORDER BY available_at DESC,manifest_id DESC LIMIT 1",
            [spot_id, activity, profile_id, mode, cutoff, end, start],
        )
    ).fetchone()
    if not manifest or (
        manifest["read_valid_until"] <= cutoff
        or manifest["scope_start_at"] > start
        or manifest["scope_end_at"] < end
    ):
        if historical:
            raise StorageReadError(
                422,
                "history_not_reproducible",
                "요청한 기준 시각의 이력을 재현할 수 없습니다.",
            )
        return {"rows": [], "total": 0, "coverage": _empty_coverage()}
    mid, metadata = manifest["manifest_id"], manifest["payload"]
    # A stored evaluation remains immutable, but its current publication cannot
    # outlive a correction of the reviewed station relationship. This also covers
    # activities/periods removed so completely that the producer has no new group.
    changed_mapping = await (
        await connection.execute(
            "SELECT EXISTS (SELECT 1 FROM "
            "pongdang_data.water_index_read_manifest r "
            "CROSS JOIN LATERAL jsonb_each_text(r.payload->'selections') selected "
            "JOIN pongdang_data.water_index_assessment a "
            "ON a.assessment_id=selected.value "
            "CROSS JOIN LATERAL jsonb_array_elements(a.payload->'inputs') i "
            "JOIN pongdang_data.water_index_station_mapping old "
            "ON old.mapping_id=i->>'mapping_evidence_ref' "
            "JOIN pongdang_data.water_index_station_mapping newer "
            "ON newer.supersedes_id=old.mapping_id "
            "WHERE r.manifest_id=%s AND newer.available_at<=%s) AS changed",
            [mid, cutoff],
        )
    ).fetchone()
    if changed_mapping["changed"]:
        coverage = _empty_coverage()
        coverage["reason_codes"] = ["station_mapping_changed"]
        return {"rows": [], "total": 0, "coverage": coverage}
    source = (
        " FROM pongdang_data.water_index_read_manifest m "
        "CROSS JOIN LATERAL jsonb_each_text(m.payload->'selections') s "
        "JOIN pongdang_data.water_index_target t ON t.target_id=s.key "
        "LEFT JOIN pongdang_data.water_index_assessment a "
        "ON a.assessment_id=s.value AND a.target_id=t.target_id "
        "AND a.available_at<=%s AND a.as_of<=%s "
        "WHERE m.manifest_id=%s AND t.available_at<=%s "
        "AND t.start_at<%s AND (t.end_at>%s OR "
        "(t.end_at IS NULL AND t.start_at>=%s))"
    )
    params = [cutoff, cutoff, mid, cutoff, end, start, start]
    missing = await (
        await connection.execute(
            "SELECT t.target_id,t.payload->'target' AS target"
            + source
            + " AND a.assessment_id IS NULL ORDER BY t.start_at,t.target_id LIMIT 101",
            params,
        )
    ).fetchall()
    if len(missing) > MAX_ITEMS:
        raise StorageReadError(
            422,
            "response_scope_too_large",
            "결손 대상 목록이 큽니다. 조회 기간을 줄여 주세요.",
        )
    missing_targets = [{"target_id": x["target_id"], **x["target"]} for x in missing]
    coverage = (
        _empty_coverage()
        if manifest["empty_targets"]
        else _coverage(metadata["supported_windows"], missing_targets, start, end, mode)
    )
    if route == "coverage":
        return {"rows": [], "total": 0, "coverage": coverage}
    if route == "support":
        rows = [
            x for x in metadata["support_rows"] if _overlaps(x["target"], start, end)
        ]
        rows.sort(key=lambda x: (_time(x["target"]["start_at"]), x["target_id"]))
        return {
            "rows": rows[(page - 1) * page_size : page * page_size],
            "total": len(rows),
            "coverage": coverage,
        }
    count = await (
        await connection.execute("SELECT count(*) AS total" + source, params)
    ).fetchone()
    selected = await (
        await connection.execute(
            "SELECT coalesce(a.payload,t.payload) AS payload"
            + source
            + " ORDER BY t.start_at,t.end_at NULLS FIRST,t.target_id "
            "LIMIT %s OFFSET %s",
            [*params, page_size, (page - 1) * page_size],
        )
    ).fetchall()
    return {
        "rows": [x["payload"] for x in selected],
        "total": count["total"],
        "coverage": coverage,
    }
