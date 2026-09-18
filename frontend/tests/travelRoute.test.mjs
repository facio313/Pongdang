import assert from 'node:assert/strict';
import test from 'node:test';
import { kakaoRouteLink, originFromPlace, routePaths } from '../src/travelApi.ts';

function leg(polyline) {
  return { from_spot_id: null, to_spot_id: 7, duration_minutes: 12, geometry: polyline === null ? undefined : { polyline } };
}

function result(legs) {
  return {
    status: 'partial', route_calculated: true, reason_codes: [],
    route: { items: [], legs, travel_minutes: 12, return_at: '2026-09-18T18:00:00+09:00' },
  };
}

test('provider longitude/latitude objects become the SDK\'s longitude-first pairs in order', () => {
  const paths = routePaths(result([leg([
    { longitude: 128.910210247605, latitude: 37.8034055083125 },
    { longitude: 128.915, latitude: 37.799 },
    { longitude: 128.919175274112, latitude: 37.7948207421998 },
  ])]));
  assert.deepEqual(paths, [[
    [128.910210247605, 37.8034055083125],
    [128.915, 37.799],
    [128.919175274112, 37.7948207421998],
  ]]);
});

test('a missing route, missing geometry or an unavailable leg draws no line at all', () => {
  assert.deepEqual(routePaths(undefined), []);
  assert.deepEqual(routePaths(null), []);
  assert.deepEqual(routePaths({ status: 'clarification', route_calculated: false, reason_codes: [], route: null }), []);
  assert.deepEqual(routePaths(result([leg(null)])), []);
  assert.deepEqual(routePaths(result([{ ...leg([]), geometry: { polyline: [], status: 'unavailable' } }])), []);
  // A single point cannot describe a road segment.
  assert.deepEqual(routePaths(result([leg([{ longitude: 128.9, latitude: 37.8 }])])), []);
});

const gyeongpo = { latitude: 37.8034055083125, longitude: 128.910210247605 };
const gangmun = { latitude: 37.7948207421998, longitude: 128.919175274112 };
const sacheonjin = { latitude: 37.82, longitude: 128.89 };

test('the visiting order becomes Kakao\'s documented origin, waypoint and destination scheme', () => {
  const url = new URL(kakaoRouteLink(gyeongpo, [gangmun]));
  assert.equal(url.origin, 'https://m.map.kakao.com');
  assert.equal(url.pathname, '/scheme/route');
  assert.equal(url.searchParams.get('sp'), '37.8034055083125,128.910210247605');
  assert.equal(url.searchParams.get('ep'), '37.7948207421998,128.919175274112');
  assert.equal(url.searchParams.get('by'), 'car');
  assert.equal(url.searchParams.get('vp'), null);

  // Places between origin and destination are numbered vp, vp2 … in order.
  const three = new URL(kakaoRouteLink(gyeongpo, [gangmun, sacheonjin, gyeongpo]));
  assert.equal(three.searchParams.get('vp'), '37.7948207421998,128.919175274112');
  assert.equal(three.searchParams.get('vp2'), '37.82,128.89');
  assert.equal(three.searchParams.get('ep'), '37.8034055083125,128.910210247605');
  assert.equal(three.searchParams.get('vp3'), null);
});

test('an order that cannot be handed over completely produces no link at all', () => {
  assert.equal(kakaoRouteLink(gyeongpo, []), null);
  assert.equal(kakaoRouteLink(null, [gangmun]), null);
  assert.equal(kakaoRouteLink(undefined, [gangmun]), null);
  for (const unusable of [
    { latitude: null, longitude: 128.9 },
    { latitude: 37.8, longitude: null },
    { latitude: 91, longitude: 128.9 },
    { latitude: 37.8, longitude: 181 },
    { latitude: Number.NaN, longitude: 128.9 },
    { latitude: '37.8', longitude: 128.9 },
  ]) {
    assert.equal(kakaoRouteLink(unusable, [gangmun]), null);
    assert.equal(kakaoRouteLink(gyeongpo, [unusable]), null);
    assert.equal(kakaoRouteLink(gyeongpo, [gangmun, unusable]), null);
  }
  // Beyond the documented five waypoints, a trimmed order is not offered.
  assert.equal(
    kakaoRouteLink(gyeongpo, [gangmun, gangmun, gangmun, gangmun, gangmun, gangmun, gangmun]),
    null,
  );
  assert.notEqual(
    kakaoRouteLink(gyeongpo, [gangmun, gangmun, gangmun, gangmun, gangmun, gangmun]),
    null,
  );
});

test('a leg holding any unusable point is dropped whole instead of shortcutting the gap', () => {
  const usable = [
    { longitude: 128.910210247605, latitude: 37.8034055083125 },
    { longitude: 128.919175274112, latitude: 37.7948207421998 },
  ];
  for (const broken of [
    { longitude: 128.9, latitude: 91 },
    { longitude: 181, latitude: 37.8 },
    { longitude: Number.NaN, latitude: 37.8 },
    { longitude: Number.POSITIVE_INFINITY, latitude: 37.8 },
    { longitude: '128.9', latitude: 37.8 },
    { longitude: 128.9, latitude: null },
    {},
  ]) {
    const paths = routePaths(result([leg([...usable, broken]), leg(usable)]));
    assert.deepEqual(paths, [usable.map((point) => [point.longitude, point.latitude])]);
  }
  assert.deepEqual(routePaths(result([leg([usable[0], null, usable[1]])])), []);
});

test('a travel-catalog origin keeps its spot_id; another list keeps coordinates only', () => {
  const place = { id: 584, name: '송정해수욕장', lat: 37.776, lng: 128.934 };
  assert.deepEqual(originFromPlace(place, new Set([7, 9, 10])), {
    label: '송정해수욕장',
    latitude: 37.776,
    longitude: 128.934,
  });
  assert.deepEqual(originFromPlace({ ...place, id: 7 }, new Set([7, 9, 10])), {
    label: '송정해수욕장',
    latitude: 37.776,
    longitude: 128.934,
    spot_id: 7,
  });
  assert.equal(originFromPlace({ ...place, lat: null }, new Set([584])), null);
});
