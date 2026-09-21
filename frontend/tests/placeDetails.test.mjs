import assert from 'node:assert/strict';
import test from 'node:test';
import { placeDetailsPath, placeDetailsStatusText, placeDetailsMissingText, placeHomepageUrl } from '../src/placeDetails.ts';
import { distanceLabel, hasPlaceCoordinates, placeDistanceKm } from '../src/placeDistance.ts';

test('stored detail reads batch stable unique positive IDs and enforce the page bound', () => {
  assert.equal(placeDetailsPath([]), null);
  assert.equal(placeDetailsPath([NaN, Infinity, 0, -1, 3.5]), null);
  assert.equal(placeDetailsPath([8, 2, 8, 1]), 'place-details?spot_ids=1,2,8');
  const ids = placeDetailsPath(Array.from({ length: 250 }, (_, index) => index + 1)).split('=')[1].split(',');
  assert.equal(ids.length, 100);
  assert.equal(ids.at(-1), '100');
});

test('missing provider values, no collection, and failed collection remain distinct', () => {
  assert.equal(placeDetailsStatusText('available'), null);
  assert.match(placeDetailsStatusText('empty'), /제공하지/);
  assert.match(placeDetailsStatusText('pending'), /아직 수집하지/);
  assert.match(placeDetailsStatusText('failed'), /실패/);
  assert.equal(placeDetailsMissingText('available'), '정보 미제공');
  assert.equal(placeDetailsMissingText('empty'), '정보 미제공');
  assert.equal(placeDetailsMissingText('pending'), '미수집');
  assert.equal(placeDetailsMissingText('failed'), '수집 실패');
  assert.notEqual(placeDetailsStatusText('unmatched'), placeDetailsStatusText('unsupported'));
});

test('provider website links require an unauthenticated HTTPS URL', () => {
  assert.equal(placeHomepageUrl('https://example.test/place'), 'https://example.test/place');
  for (const value of [null, '', 'javascript:alert(1)', 'data:text/html,test', 'http://example.test', '//example.test', 'https://user:pass@example.test', '<a href="https://example.test">homepage</a>']) {
    assert.equal(placeHomepageUrl(value), undefined);
  }
});

test('straight-line distances use coordinates including zero and never manufacture missing locations', () => {
  assert.equal(placeDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  const oneDegree = placeDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(Math.abs(oneDegree - 111.195) < 0.001);
  const dateline = placeDistanceKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 });
  assert.ok(Math.abs(dateline - 22.239) < 0.001);
  for (const point of [null, undefined, { lat: null, lng: 128 }, { lat: NaN, lng: 128 }, { lat: 91, lng: 128 }, { lat: 37, lng: -181 }]) {
    assert.equal(hasPlaceCoordinates(point), false);
    assert.equal(placeDistanceKm(point, { lat: 37.8, lng: 128.9 }), null);
  }
  assert.equal(distanceLabel(null), '–');
  assert.equal(distanceLabel(NaN), '–');
  assert.equal(distanceLabel(0), '0 m');
  assert.equal(distanceLabel(0.54), '540 m');
  assert.equal(distanceLabel(oneDegree), '111.2 km');
});
