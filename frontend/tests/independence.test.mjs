import assert from "node:assert/strict";
import test from "node:test";
import { canonicalDataUrl, pageFromHash } from "../src/navigation.ts";
import { requestData } from "../src/api.ts";

for (const selection of [undefined, "demo", "collector", "data", "unexpected"]) {
  test(`source selection ${selection ?? "default"} resolves to collection data`, () => {
    const url = new URL("https://example.test/pongdang/?keep=1#water-quality");
    if (selection) url.searchParams.set("data", selection);
    const result = canonicalDataUrl(url.href);
    assert.equal(result.searchParams.get("data"), "data");
    assert.equal(result.searchParams.get("keep"), "1");
    assert.equal(result.hash, "#water-quality");
    assert.equal(result.pathname, "/pongdang/");
  });
}

test("data is the default while existing feature navigation remains accessible", () => {
  assert.equal(pageFromHash(""), "data");
  assert.equal(pageFromHash("#unknown"), "data");
  assert.equal(pageFromHash("#collector"), "info");
  for (const page of ["info", "water-index", "water-index-map", "water-forecast", "livecam", "tide", "first-swim", "water-quality"]) {
    assert.equal(pageFromHash(`#${page}`), page);
  }
});

test("collection reads preserve base path, abort signal and empty results", async () => {
  const controller = new AbortController();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ rows: [], total: 0 });
  };
  const result = await requestData("/pongdang/", "datasets/metrics?page_size=100", controller.signal, fetcher);
  assert.deepEqual(result, { rows: [], total: 0 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/pongdang/api/data/datasets/metrics?page_size=100");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.cache, "no-store");
});

test("failed data reads never request a fallback endpoint", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    return Response.json({ detail: "수집 DB 조회 불가" }, { status: 503 });
  };
  await assert.rejects(
    requestData("/pongdang/", "summary", new AbortController().signal, fetcher),
    /수집 DB 조회 불가/,
  );
  assert.deepEqual(calls, ["/pongdang/api/data/summary"]);
});


test("a late response cannot survive cancellation even when the transport ignores it", async () => {
  const controller = new AbortController();
  let release;
  const payload = new Promise((resolve) => { release = resolve; });
  const pending = requestData("/pongdang/", "summary", controller.signal,
    async () => ({ ok: true, json: () => payload }));
  controller.abort();
  release({ rows: [{ stale: true }] });
  await assert.rejects(pending, { name: "AbortError" });
});
