import assert from "node:assert/strict";
import test from "node:test";
import { configureArchive, canonicalArchivePath, dataNow, initializeArchive, isArchiveMode, readArchiveData } from "../src/archiveRuntime.ts";
import { conditionTargetInRange, sessionNow } from "../src/productData.ts";
import { travelJson } from "../src/travelApi.ts";
import { requestWebcamPreview } from "../src/livecamPreviewApi.ts";

const captured = "2026-11-02T07:00:00Z";
const records = {
  "places?locale=ko&page=1&page_size=100": { rows: [
    { id: 11, name: "강문", place_kind: "beach", province_code: "gangwon", district_code: "gangneung", alias_ids: [91] },
    { id: 12, name: "계곡", place_kind: "valley", province_code: "gangwon", district_code: "inje" },
  ], total: 3 },
  "places?locale=ko&page=2&page_size=100": { rows: [
    { id: 13, name: "감추", place_kind: "beach", province_code: "gangwon", district_code: "donghae" },
  ], total: 3 },
  "water-index/recommendation?spot_id=11&mode=observation": {
    spot_id: 11, at: captured, conditions: [{ spot_id: 11, activity: "swim", mode: "observation", at: captured, metrics: [], condition_score: { score: 63 } }],
  },
  "water-index/conditions/summary?spot_ids=11,12&activity=swim": { activity: "swim", mode: "observation", as_of: captured, rows: [{ spot_id: 11, condition_score: { score: 63 } }], unavailable: [{ spot_id: 12, reason: "missing" }] },
  "water-index/conditions/summary?spot_ids=13&activity=swim": { activity: "swim", mode: "observation", as_of: captured, rows: [{ spot_id: 13, condition_score: { score: 41 } }], unavailable: [] },
  "water-index/conditions/series?spot_id=11&activity=swim&targets=a,b": { spot_id: 11, activity: "swim", as_of: captured, rows: [{ at: captured, spot_id: 11 }, { at: "2026-11-03T03:00:00Z", spot_id: 11 }] },
  "datasets/spots?page=1&page_size=100": { rows: [{ id: 11, name: "강문" }, { id: 13, name: "감추" }], total: 10000 },
  "attachments?spot_ids=11,12": { items: [{ id: 42, spot_id: 11, url: "/api/data/attachments/42/file" }] },
  "place-details?spot_ids=11&locale=ko": { items: [{ spot_id: 11, name: "강문", provider_record_id: "official-11" }] },
  "travel/signals": { rows: [{ id: "private-never-published" }] },
};
const files = new Map();
const requests = Object.fromEntries(Object.entries(records).map(([key, value], index) => {
  const file = `responses/${index}.json`;
  files.set(`/pongdang/archive/${file}`, value);
  return [canonicalArchivePath(key), file];
}));
const calls = [];
const fetcher = async (url) => {
  calls.push(url);
  assert.ok(files.has(url), `unexpected network access ${url}`);
  return Response.json(files.get(url));
};
test.beforeEach(() => {
  calls.length = 0;
  configureArchive({ version: 1, captured_at: captured, requests });
});
test.afterEach(() => configureArchive(undefined));

test("archive time preserves original targets after the real calendar advances", t => {
  t.mock.method(Date, "now", () => Date.parse("2027-05-01T00:00:00Z"));
  assert.equal(dataNow(), Date.parse(captured));
  assert.equal(sessionNow(), new Date(captured).toISOString());
  assert.equal(conditionTargetInRange(captured), true);
  assert.equal(conditionTargetInRange("2027-05-01T00:00:00Z"), false);
  configureArchive(undefined);
  assert.equal(dataNow(), Date.now());
});

test("places filter and paginate the actual captured catalog, preserving identifiers", async () => {
  const found = await readArchiveData("/pongdang/", "places?kind=beach&page=2&page_size=1&locale=ko", "GET", undefined, fetcher);
  assert.deepEqual(found, { rows: [records["places?locale=ko&page=2&page_size=100"].rows[0]], total: 2, page: 2, page_size: 1, has_more: false });
  const search = await readArchiveData("/pongdang/", "places?q=강문&district=gangneung", "GET", undefined, fetcher);
  assert.equal(search.rows[0].id, 11);
  assert.deepEqual(search.rows[0].alias_ids, [91]);
  assert.equal(calls.length, 2, "the original static files are cached");
});

test("selected place lookup reads the same archived place rows", async () => {
  const found = await readArchiveData("/pongdang/", "livecams/preview/places?spot_id=11", "GET", undefined, fetcher);
  assert.deepEqual(found, [records["places?locale=ko&page=1&page_size=100"].rows[0]]);
});

test("conditions reuse the matching real recommendation without shifting its timestamp", async () => {
  const condition = await readArchiveData("/pongdang/", "water-index/conditions?activity=swim&spot_id=11&mode=observation", "GET", undefined, fetcher);
  assert.deepEqual(condition, records["water-index/recommendation?spot_id=11&mode=observation"].conditions[0]);
  await assert.rejects(readArchiveData("/pongdang/", "water-index/conditions?activity=swim&spot_id=11&at=2026-11-03T03%3A00%3A00Z", "GET", undefined, fetcher), /보관하지 않았습니다/);
  await assert.rejects(readArchiveData("/pongdang/", "water-index/conditions?activity=surf&spot_id=11", "GET", undefined, fetcher), /보관하지 않았습니다/);
});

test("summary batches retain their scores and explicit missing-place reasons", async () => {
  const summary = await readArchiveData("/pongdang/", "water-index/conditions/summary?spot_ids=11,12,13,99&activity=swim", "GET", undefined, fetcher);
  assert.deepEqual(summary.rows.map(row => row.spot_id), [11, 13]);
  assert.deepEqual(summary.unavailable, [{ spot_id: 12, reason: "missing" }, { spot_id: 99, reason: "archive_not_captured" }]);
  assert.equal(summary.as_of, captured);
});

test("series select exact equivalent instants rather than inventing missing forecasts", async () => {
  const result = await readArchiveData("/pongdang/", "water-index/conditions/series?spot_id=11&activity=swim&targets=2026-11-02T16%3A00%3A00%2B09%3A00,2026-11-04T03%3A00%3A00Z", "GET", undefined, fetcher);
  assert.deepEqual(result.rows, [{ at: captured, spot_id: 11 }]);
});

test("developer tables report the captured subset rather than pretending all DB rows remain", async () => {
  const page = await readArchiveData("/pongdang/", "datasets/spots?page=1&page_size=100&sort=id&direction=asc", "GET", undefined, fetcher);
  assert.equal(page.total, 2);
  assert.equal(page.archive_original_total, 10000);
  assert.deepEqual(page.rows.map(row => row.id), [11, 13]);
});

test("photos and details only expose the requested captured IDs", async () => {
  assert.deepEqual(await readArchiveData("/pongdang/", "attachments?spot_ids=12", "GET", undefined, fetcher), { items: [] });
  const detail = await readArchiveData("/pongdang/", "place-details?spot_ids=11&locale=ko", "GET", undefined, fetcher);
  assert.equal(detail.items[0].provider_record_id, "official-11");
});

test("mutations, private reads, provider previews and unknown queries never contact live APIs", async () => {
  for (const [path, method] of [["refresh", "POST"], ["travel/signals", "GET"], ["ai/chat", "POST"], ["notifications/events", "GET"], ["livecams/preview", "POST"], ["unrecorded", "GET"]]) {
    await assert.rejects(travelJson("/pongdang/", path, method, undefined, undefined, fetcher), /보관/);
  }
  await assert.rejects(requestWebcamPreview("/pongdang/", undefined, new AbortController().signal, fetcher), /보관 모드/);
  assert.equal(calls.length, 0);
});

test("invalid manifest file paths cannot turn an archive read into remote access", () => {
  for (const file of ["../private.json", "/private.json", "https://provider.test/key", "responses/../../private.json"]) {
    assert.throws(() => configureArchive({ version: 1, captured_at: captured, requests: { regions: file } }), /경로/);
  }
});

test("missing manifest leaves live mode intact, corrupt manifest does not silently fall back", async () => {
  configureArchive(undefined);
  await initializeArchive("/pongdang/", async () => new Response("missing", { status: 404 }));
  assert.equal(isArchiveMode(), false);
  await initializeArchive("/pongdang/", async () => new Response("<html>", { headers: { "content-type": "text/html" } }));
  assert.equal(isArchiveMode(), false);
  await assert.rejects(initializeArchive("/pongdang/", async () => Response.json({ version: 1, captured_at: "bad" })), /기준 시각/);
});
