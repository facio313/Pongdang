import assert from 'node:assert/strict';
import test from 'node:test';
import { createKakaoMapScene } from '../src/kakaoMapScene.ts';

function fixture() {
  const maps = [], overlays = [], lines = [];
  const element = {
    clientWidth: 1200, clientHeight: 800, cleared: 0,
    ownerDocument: { createElement: () => ({ offsetHeight: 30 }) },
    replaceChildren() { this.cleared++; },
  };
  class LatLng {
    constructor(lat, lng) { this.lat = lat; this.lng = lng; }
    getLat() { return this.lat; }
    getLng() { return this.lng; }
  }
  class LatLngBounds {
    points = [];
    extend(point) { this.points.push(point); }
    isEmpty() { return this.points.length === 0; }
    getSouthWest() { return new LatLng(Math.min(...this.points.map(p => p.lat)), Math.min(...this.points.map(p => p.lng))); }
    getNorthEast() { return new LatLng(Math.max(...this.points.map(p => p.lat)), Math.max(...this.points.map(p => p.lng))); }
  }
  const sdk = {
    LatLng, LatLngBounds,
    Map: class {
      fits = [];
      constructor(container, options) { this.container = container; Object.assign(this, options); maps.push(this); }
      setCenter(center) { this.center = center; }
      setLevel(level) { this.level = level; }
      setBounds(...args) { this.fits.push(args); }
      relayout() {}
    },
    CustomOverlay: class {
      constructor(options) { Object.assign(this, options); overlays.push(this); }
      setMap(map) { this.map = map; }
      setPosition(position) { this.position = position; }
      setContent(content) { this.content = content; }
    },
    Polyline: class {
      constructor(options) { Object.assign(this, options); lines.push(this); }
      setMap(map) { this.map = map; }
    },
  };
  return { scene: createKakaoMapScene(element, sdk), sdk, element, maps, overlays, lines };
}

const beach = { id: '7', latitude: 37.8, longitude: 128.9 };
const nextBeach = { id: '9', latitude: 37.79, longitude: 128.92 };
const road = [[128.9, 37.8], [128.91, 37.795], [128.92, 37.79]];

test('reordering keeps the map, marker DOM, road overlays and user camera', () => {
  const f = fixture();
  const before = f.scene.update([beach, nextBeach], [road]);
  f.scene.fit();
  const camera = new f.sdk.LatLng(37.7, 128.7);
  f.scene.map.setCenter(camera);
  f.scene.map.setLevel(4);
  const after = f.scene.update([{ ...nextBeach }, { ...beach }], [road.map(p => [...p])]);
  f.scene.refreshMarkers();
  assert.equal(f.maps.length, 1);
  assert.equal(f.element.cleared, 0);
  assert.equal(after.markers, before.markers);
  assert.equal(after.boundsKey, before.boundsKey);
  assert.equal(f.overlays.length, 2);
  assert.equal(f.lines.length, 1);
  assert.equal(f.scene.map.center, camera);
  assert.equal(f.scene.map.level, 4);
  assert.equal(f.scene.map.fits.length, 1);
});

test('editing updates origin and removes excluded stops and old roads without replacing the map', () => {
  const f = fixture();
  const before = f.scene.update([{ ...beach, id: 'origin' }, beach, nextBeach], [road]);
  const remaining = before.markers.find(m => m.id === beach.id);
  const removed = before.markers.find(m => m.id === nextBeach.id);
  const origin = before.markers.find(m => m.id === 'origin');
  const after = f.scene.update([{ ...nextBeach, id: 'origin' }, beach], []);
  assert.equal(after.markers.length, 2);
  assert.equal(after.markers.find(m => m.id === beach.id), remaining);
  assert.equal(after.markers.find(m => m.id === 'origin'), origin);
  assert.equal(origin.overlay.position.getLat(), nextBeach.latitude);
  assert.equal(removed.overlay.map, null);
  assert.equal(f.lines[0].map, null);
  assert.equal(f.maps.length, 1);
  assert.equal(f.element.cleared, 0);
  assert.equal(f.scene.map.fits.length, 0);
});

test('new route geometry replaces only roads; explicit fitting includes roads and panel insets', () => {
  const f = fixture();
  f.scene.update([beach, nextBeach], [road]);
  const revised = [[128.9, 37.8], [128.85, 37.85], [128.92, 37.79]];
  f.scene.update([beach, nextBeach], [revised]);
  assert.equal(f.lines.length, 2);
  assert.equal(f.lines[0].map, null);
  assert.equal(f.lines[1].map, f.scene.map);
  f.scene.fit({ top: 84, right: 392, bottom: 24, left: 392 });
  const [bounds, ...insets] = f.scene.map.fits[0];
  assert.equal(bounds.getNorthEast().getLat(), 37.85);
  assert.equal(bounds.getSouthWest().getLng(), 128.85);
  assert.deepEqual(insets, [130, 392, 24, 392]);
  assert.equal(f.scene.hasFitted(), true);
  assert.equal(f.overlays.length, 2);
});

test('invalid or missing route geometry never creates a line; disposal removes all SDK content', () => {
  const f = fixture();
  f.scene.update([beach], [road, [[128.9, 37.8]], [[128.9, 37.8], [NaN, 37.79]], [[128.9, 37.8], [128.92, 91]]]);
  assert.equal(f.lines.length, 1);
  f.scene.update([beach], []);
  assert.equal(f.lines[0].map, null);
  f.scene.destroy();
  assert.ok(f.overlays.every(overlay => overlay.map === null));
  assert.equal(f.element.cleared, 1);
});
