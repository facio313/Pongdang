import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("navigation and data source identify the independent project", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(
    new URL("../src/DataWorkspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspace, /데이터 정보/);
  assert.match(workspace, /value="data">\{t\("Pongdang 수집 데이터"\)\}/);
  assert.doesNotMatch(app, /Multtara|cksDB|value="collector"/);
  assert.doesNotMatch(workspace, /Multtara|cksDB|value="collector"/);
  const info = readFileSync(new URL("../src/DataInfoPage.tsx", import.meta.url), "utf8");
  assert.match(info, /실제 활성 상태는 수집 현황 참조/);
  assert.doesNotMatch(app, /value="demo"|previewPages/);
  const resource = readFileSync(new URL("../src/useResource.ts", import.meta.url), "utf8");
  assert.match(resource, /const origin = "data"/);
  assert.match(info, /pongdang_data/);
  assert.match(info, /pongdang_demo/);
});

test("the root route enters the home screen", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  // 해시가 없거나 알 수 없는 해시는 홈으로 폴백합니다. readRoute 는 모르는
  // 해시를 data 로 떨어뜨리므로, 실제 해시가 #data 인지로 구분합니다.
  assert.match(
    app,
    /route\.page === "data" && rawPage !== "data"\)\s*\n\s*return \{ kind: "product", key: "home" \};/,
  );
  // 제품 5화면과 기능 데이터 화면이 같은 해시 라우터를 씁니다.
  for (const key of ["home", "today", "recommend", "map", "my-courses"])
    assert.match(app, new RegExp(`"?${key}"?:`));
  assert.match(app, /readRoute\(hash\)/);
});
