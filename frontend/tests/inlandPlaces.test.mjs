import assert from "node:assert/strict";
import test from "node:test";
import { parseWaterPlaceBrowserState } from "../src/waterPlaceBrowserState.ts";
import { waterPlacesPath } from "../src/waterPlaceApi.ts";
import { kindLabel } from "../src/placeDetails.ts";
import { waterQualityDescription, waterQualityLabel } from "../src/productData.ts";

test("lake and reservoir filters survive navigation with their correct labels", () => {
  for (const [kind, label] of [["lake", "호수"], ["reservoir", "저수지"]]) {
    const saved = parseWaterPlaceBrowserState(JSON.stringify({ kind, page: 2 }));
    assert.equal(saved.kind, kind);
    assert.equal(new URL(waterPlacesPath("", saved), "https://example.test").searchParams.get("kind"), kind);
    assert.equal(kindLabel({ type: kind }), label);
  }
});

test("freshwater samples remain observations without fabricated marine grades", () => {
  const data = { status: "historical", method_version: "inland-sampling.v1", grade: null, station_name: "OFFLINE 담수 관측소", observed_at: "2026-08-01T00:00:00Z", age_days: 30, measurements: [{ item: "water_temperature", value: 21, unit: "°C" }] };
  assert.equal(waterQualityLabel(data), "담수 검사값 · 등급 미산정");
  assert.match(waterQualityDescription(data), /30일 전/);
  assert.match(waterQualityDescription(data), /같은 수역/);
  assert.match(waterQualityDescription(data), /해양 WQI 등급을 적용하지 않습니다/);
  assert.equal(waterQualityLabel({ ...data, status: "no_data", measurements: [] }), "담수 검사 자료 없음");
});
