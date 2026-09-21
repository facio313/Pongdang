import assert from "node:assert/strict";
import test from "node:test";
import { placeMatchesId, productPlaces } from "../src/productData.ts";

test("a default source ID selects its representative in the current page", () => {
  const rows = productPlaces([
    { id: 7, name: "경포해수욕장", place_kind: "beach", alias_ids: [582, 7728] },
    { id: 9, name: "강문해변", place_kind: "beach", alias_ids: [7702] },
  ]).rows;
  for (const id of [7, 582, 7728]) {
    assert.equal(rows.find((place) => placeMatchesId(place, id))?.id, 7);
  }
  assert.equal(rows.find((place) => placeMatchesId(place, 7702))?.id, 9);
  assert.equal(rows.find((place) => placeMatchesId(place, undefined)), undefined);
  assert.equal(rows.find((place) => placeMatchesId(place, 99)), undefined);
  assert.equal(rows.slice(1).find((place) => placeMatchesId(place, 582)), undefined);
});

test("old API records remain selectable without alias metadata", () => {
  assert.equal(placeMatchesId({ id: 7 }, 7), true);
  assert.equal(placeMatchesId({ id: 7 }, 582), false);
});
