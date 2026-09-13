import assert from "node:assert/strict";
import test from "node:test";
import { describeFeature, loadFeature } from "../src/featureApi.ts";

const twin = (value = null) => ({ contract_version: "water-spatial.v1", rows: [{ spot_id: 1, name: "공식 관측소", status: "available", layers: [{ name: "water_temperature", numeric_value: value, unit: "°C", status: value === null ? "missing" : "observation", station_id: 9, observed_at: "2026-09-13T10:00:00+09:00" }] }] });

test("missing temperature stays missing and zero stays a real zero", () => {
  assert.match(describeFeature("twin", twin()).detail, /미제공/);
  assert.doesNotMatch(describeFeature("twin", twin()).detail, /0 °C/);
  assert.match(describeFeature("twin", twin(0)).detail, /0 °C/);
  assert.throws(() => describeFeature("twin", twin("22")), /숫자/);
  assert.throws(() => describeFeature("twin", twin(NaN)), /숫자/);
});

test("unreleased scores and unknown contracts cannot become visible scores", () => {
  assert.throws(() => describeFeature("assessment", { contract_version: "water-assessment.v1-draft", rows: [{ score: 100, inputs: [] }] }), /검증되지 않은/);
  assert.throws(() => describeFeature("twin", { ...twin(), contract_version: "future-contract" }), /계약/);
});

test("missing issue times never become the current time", () => {
  const result = describeFeature("forecast", { contract_version: "water-forecast.v1", status: "available", rows: [{ provider: "official", target_start_at: "2026-09-14T00:00:00Z", state: "partial", issued_at: null }] }, "지점");
  assert.match(result.detail, /발표시각 미제공/);
});

test("features retain the deployment base, bounded parameters and cancellation signal", async () => {
  const controller = new AbortController();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.includes("water-twin") ? twin() : { contract_version: "water-assessment.v1-draft", rows: [] });
  };
  const result = await loadFeature("assessment", "/pongdang/", controller.signal, fetcher, new Date("2026-09-14T00:00:00Z"));
  assert.match(result.detail, /공식 관측소/);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.ok(call.url.startsWith("/pongdang/api/data/"));
    assert.equal(call.options.signal, controller.signal);
    assert.equal(call.options.cache, "no-store");
    assert.match(call.url, /page_size=1/);
  }
  assert.match(calls[1].url, /profile_id=general/);
  assert.match(calls[1].url, /mode=observation/);
});

test("an API failure never produces an empty success result", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({ detail: "DB unavailable" }, { status: 503 }); };
  await assert.rejects(loadFeature("forecast", "/", new AbortController().signal, fetcher), /DB unavailable/);
  assert.equal(calls, 1);
});

test("authenticated or signed camera URLs are rejected", () => {
  assert.throws(() => describeFeature("livecam", { contract_version: "livecams.v1", rows: [{ public_page: "https://example.org/?token=secret" }] }), /URL/);
});


test("explicit missing historical metadata and unevaluated diagnostics retain their reasons", () => {
  const spatial = twin(21);
  spatial.rows[0].name = null;
  spatial.rows[0].layers[0].unit = null;
  assert.match(describeFeature("twin", spatial).text, /지점 1/);
  assert.match(describeFeature("twin", spatial).detail, /단위 미제공/);
  const assessment = { contract_version: "water-assessment.v1-draft", rows: [{ score: null, inputs: [], assessment_status: "unknown", evaluated_at: null }] };
  assert.match(describeFeature("assessment", assessment).detail, /평가 미실행/);
});
