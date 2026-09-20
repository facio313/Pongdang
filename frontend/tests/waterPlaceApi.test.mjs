import assert from "node:assert/strict";
import test from "node:test";
import { waterPlacesPath } from "../src/waterPlaceApi.ts";

test("the default place request is the first 100-row page for all Gangwon", () => {
  const path = new URL(waterPlacesPath(), "https://example.test/");
  assert.equal(path.pathname, "/places");
  assert.equal(path.searchParams.get("province"), "gangwon");
  assert.equal(path.searchParams.has("district"), false);
  assert.equal(path.searchParams.get("page"), "1");
  assert.equal(path.searchParams.get("page_size"), "100");
});

test("free text and administrative filters travel as distinct query parameters", () => {
  const path = new URL(waterPlacesPath("물 & 바다", { district: "sokcho", kind: "beach", page: 2 }), "https://example.test/");
  assert.equal(path.searchParams.get("q"), "물 & 바다");
  assert.equal(path.searchParams.get("district"), "sokcho");
  assert.equal(path.searchParams.get("kind"), "beach");
  assert.equal(path.searchParams.get("page"), "2");
  assert.equal(path.searchParams.get("page_size"), "100");
});
