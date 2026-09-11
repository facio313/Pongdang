import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("navigation and data source identify the independent project", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /데이터 정보/);
  assert.match(app, /value="data">Pongdang 수집 데이터/);
  assert.doesNotMatch(app, /Multtara|cksDB|value="collector"/);
  const info = readFileSync(new URL("../src/DataInfoPage.tsx", import.meta.url), "utf8");
  assert.match(info, /실제 제공처 미설정/);
  assert.match(info, /pongdang_data/);
  assert.match(info, /pongdang_demo/);
});
