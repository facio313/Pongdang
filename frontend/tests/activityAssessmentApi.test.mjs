import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITIES, calculateConditionScore, criteriaFromDrafts, loadActivities, loadConditions, loadPlaces,
  parseActivityCatalog, parseConditions, parseConditionScore,
} from "../src/activityAssessmentApi.ts";

const instant = "2026-09-14T00:00:00Z";
const model = { model_id: "explicit-range-match", model_version: "1.0.0", score_meaning: "user_defined_condition_match", scientific_validation: "not_evaluated", formula: "100 * matched_weight / total_weight" };
const catalog = () => ({ contract_version: "water-conditions.v1", model, rows: ACTIVITIES.map((activity) => ({ activity, label: activity, description: "test contract", metrics: [{ name: "water_temperature", label: "수온", unit: "°C", description: "test contract" }], required_evidence: ["공식 활동 지원 근거"], environment_model_status: "unimplemented" })) });
const selection = { spot_id: 1, activity: "swim", mode: "observation", at: instant, as_of: instant };
const criterion = { metric: "water_temperature", station_id: 9, minimum: 0, maximum: 20, weight: 2 };
const conditions = (activity = "swim", value = 0) => ({
  contract_version: "water-conditions.v1", spot_id: 1, place_name: "관측 지점", activity, mode: "observation", at: instant, as_of: instant, model,
  support_status: "unknown", safety_status: "unknown", restriction_refs: [], environment_score: null,
  metrics: [{ name: "water_temperature", label: "수온", unit: "°C", value, station_id: 9, station_name: null, relation: "station_observation_point", mapping_id: null, spatial_scope: "관측 지점", status: value === null ? "missing" : "available", reason_codes: [], evidence: [{ metric_id: 10, snapshot_id: 11, provider: "official", provider_record_id: "record:1", source_record_id: null, name: "water_temperature", numeric_value: value, unit: "°C", observed_at: instant, issued_at: null, fetched_at: instant, valid_until: "2026-09-14T01:00:00Z", mode: "observation", spatial_scope: "관측 지점", valid_from: instant, text_value: null, is_missing: value === null, source_state: "current", metric_state: "current" }] }],
  missing_metrics: [], required_evidence: ["공식 활동 지원 근거"], reason_codes: [],
});
const score = (activity = "swim", value = 0) => ({
  contract_version: "water-conditions.v1", model, evidence: conditions(activity, value),
  criteria: [{ ...criterion, status: "matched", value, unit: "°C", matched: true, weighted_points: 2, reason_codes: [] }],
  status: "evaluated", score: 100, score_label: "종합 조건 일치 점수", total_weight: 2, matched_weight: 2, reason_codes: [], calculation_id: "test-calculation",
});

test("all six activities share the explicit condition contract without being scientifically validated", () => {
  const parsed = parseActivityCatalog(catalog());
  assert.deepEqual(parsed.rows.map((row) => row.activity), ACTIVITIES);
  assert.equal(parsed.model.scientific_validation, "not_evaluated");
  for (const activity of ACTIVITIES) {
    assert.equal(parseConditions(conditions(activity)).activity, activity);
    assert.equal(parseConditionScore(score(activity)).score, 100);
  }
  const incomplete = catalog();
  incomplete.rows.pop();
  assert.throws(() => parseActivityCatalog(incomplete), /6개 활동/);
  const duplicated = catalog();
  duplicated.rows[5] = duplicated.rows[0];
  assert.throws(() => parseActivityCatalog(duplicated), /6개 활동/);
});

test("missing, zero, original provenance and unknown issue times stay distinct", () => {
  const missing = parseConditions(conditions("swim", null));
  assert.equal(missing.metrics[0].value, null);
  assert.equal(missing.metrics[0].evidence[0].issued_at, null);
  assert.equal(missing.metrics[0].evidence[0].provider_record_id, "record:1");
  assert.equal(parseConditions(conditions()).metrics[0].value, 0);
  assert.throws(() => parseConditions(conditions("swim", "0")), /숫자/);
  assert.throws(() => parseConditions({ ...conditions(), environment_score: 80 }), /검증되지 않은/);
  assert.throws(() => parseConditions({ ...conditions(), contract_version: "future.v2" }), /계약/);
});

test("only evidence-backed complete matching scores become displayable", () => {
  for (const invalid of [
    { ...score(), status: "incomplete" },
    { ...score(), status: "blocked" },
    { ...score(), score: 101 },
    { ...score(), score: 0 },
    { ...score(), total_weight: 1 },
    { ...score(), matched_weight: 0 },
    { ...score(), evidence: { ...conditions(), support_status: "unsupported" } },
    { ...score(), evidence: { ...conditions(), safety_status: "restricted" } },
    { ...score(), evidence: conditions("swim", 4) },
    { ...score(), evidence: { ...conditions(), metrics: [{ ...conditions().metrics[0], status: "stale" }] } },
    { ...score(), criteria: [{ ...score().criteria[0], matched: false }] },
    { ...score(), criteria: [{ ...score().criteria[0], minimum: 5 }] },
  ]) assert.throws(() => parseConditionScore(invalid));
  const unavailable = { ...score(), status: "incomplete", score: null, matched_weight: null,
    evidence: conditions("swim", null), criteria: [{ ...score().criteria[0], status: "unavailable", value: null, matched: null, weighted_points: null }] };
  assert.equal(parseConditionScore(unavailable).score, null);
});

test("a real zero matching score is retained and inclusive boundaries count", () => {
  assert.equal(parseConditionScore(score("swim", 20)).score, 100);
  const unmatched = score("swim", 21);
  unmatched.score = 0;
  unmatched.matched_weight = 0;
  unmatched.criteria[0] = { ...unmatched.criteria[0], status: "not_matched", matched: false, weighted_points: 0 };
  assert.equal(parseConditionScore(unmatched).score, 0);
});

test("criteria require deliberate station, bounds and positive importance with no defaults", () => {
  const draft = { enabled: true, stationId: "9", minimum: "0", maximum: "20", weight: "2" };
  assert.deepEqual(criteriaFromDrafts({ water_temperature: draft }), [criterion]);
  for (const change of [{ stationId: "" }, { minimum: "", maximum: "" }, { minimum: "21" }, { weight: "" }, { weight: "0" }, { weight: "-1" }, { weight: "1001" }, { minimum: "Infinity" }]) {
    assert.throws(() => criteriaFromDrafts({ water_temperature: { ...draft, ...change } }));
  }
  assert.throws(() => criteriaFromDrafts({ water_temperature: { ...draft, enabled: false } }), /조건/);
});

test("reads preserve production base and bounded place pagination", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.includes("activities") ? catalog() : url.includes("water-twin") ? { contract_version: "water-spatial.v1", rows: [{ spot_id: 1, name: null }], has_more: true } : conditions());
  };
  await loadActivities("/pongdang/", signal, fetcher);
  assert.equal((await loadPlaces("/pongdang/", 2, signal, fetcher)).has_more, true);
  await loadConditions("/pongdang/", selection, signal, fetcher);
  assert.match(calls[1].url, /page=2&page_size=25/);
  assert.equal(new URL(calls[2].url, "https://example.test").searchParams.get("activity"), "swim");
  for (const call of calls) {
    assert.ok(call.url.startsWith("/pongdang/api/data/"));
    assert.equal(call.options.signal, signal);
    assert.equal(call.options.cache, "no-store");
  }
});

test("score sends only user criteria and location, never editable measurement values", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const fetcher = async (url, options) => { calls.push({ url, options }); return Response.json(score()); };
  await calculateConditionScore("/pongdang/", selection, [criterion], signal, fetcher);
  assert.equal(calls[0].url, "/pongdang/api/data/water-index/condition-score");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.signal, signal);
  assert.deepEqual(JSON.parse(calls[0].options.body), { ...selection, criteria: [criterion] });
});

test("responses for a different activity, cutoff or requested criterion are rejected", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(loadConditions("/", { ...selection, activity: "surf" }, signal, async () => Response.json(conditions())), /일치하지/);
  await assert.rejects(loadConditions("/", { ...selection, as_of: "2026-09-13T00:00:00Z" }, signal, async () => Response.json(conditions())), /일치하지/);
  await assert.rejects(calculateConditionScore("/", selection, [{ ...criterion, maximum: 10 }], signal, async () => Response.json(score())), /조건과 응답/);
});

test("failure and cancellation never return an empty success or an old numeric score", async () => {
  await assert.rejects(loadConditions("/", selection, new AbortController().signal, async () => Response.json({ detail: "자료 조회 불가" }, { status: 503 })), /자료 조회 불가/);
  const controller = new AbortController();
  let release;
  const payload = new Promise((resolve) => { release = resolve; });
  const pending = calculateConditionScore("/", selection, [criterion], controller.signal, async () => ({ ok: true, json: () => payload }));
  controller.abort();
  release(score());
  await assert.rejects(pending, { name: "AbortError" });
});


test("subnormal positive importance values retain a finite proportional result", () => {
  const result = score();
  result.criteria[0].weight = 5e-324;
  result.criteria[0].weighted_points = 5e-324;
  result.total_weight = 5e-324;
  result.matched_weight = 5e-324;
  assert.equal(parseConditionScore(result).score, 100);
});

test("corrected-away measurements preserve a nullable metric ID and original missing state", () => {
  const payload = conditions("swim", null);
  payload.metrics[0].evidence[0].metric_id = null;
  assert.equal(parseConditions(payload).metrics[0].evidence[0].metric_id, null);
  assert.equal(parseConditions(payload).metrics[0].evidence[0].is_missing, true);
});

test("the server decimal half-up boundary is accepted despite binary floating-point drift", () => {
  const payload = score();
  payload.criteria[0].weight = 2.01;
  payload.criteria[0].weighted_points = 2.01;
  payload.evidence.metrics.push({ ...payload.evidence.metrics[0], name: "air_temperature", label: "기온", value: 30 });
  payload.criteria.push({ ...payload.criteria[0], metric: "air_temperature", weight: 1.99, weighted_points: 0, value: 30, matched: false, status: "not_matched" });
  payload.total_weight = 4;
  payload.matched_weight = 2.01;
  payload.score = 50.3;
  assert.equal(parseConditionScore(payload).score, 50.3);
});
