import assert from "node:assert/strict";
import test from "node:test";
import { parseProductPlaceSelection } from "../src/productPlaceSelection.ts";

test("reference place state round trips selected ID and query without locale coupling", () => {
  const selected = { mode: "selected", spotId: 1234, district: "sokcho", search: "해변", page: 2 };
  assert.deepEqual(parseProductPlaceSelection(JSON.stringify(selected)), selected);
});

test("invalid or unavailable browser storage returns default scope without invented place ID", () => {
  for (const raw of [null, "", "null", "[]", "broken", JSON.stringify({ mode: "selected", spotId: -1, district: "sokcho", search: "", page: 1 }), JSON.stringify({ mode: "selected", spotId: 1, district: "sokcho", search: "", page: 10001 })]) {
    assert.deepEqual(parseProductPlaceSelection(raw), { mode: "default", spotId: null, district: "", search: "", page: 1 });
  }
});

test("a pending manual selection survives navigation without reviving the server default", () => {
  const pending = { mode: "selected", spotId: null, district: "yanggu", search: "", page: 1 };
  assert.deepEqual(parseProductPlaceSelection(JSON.stringify(pending)), pending);
});
