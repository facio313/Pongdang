import assert from 'node:assert/strict';
import test from 'node:test';
import { WAVE_LOOP_PATH } from '../src/waveShape.ts';

// Read the actual SVG's relative cubic segments as absolute control points.
function curves() {
  let start = WAVE_LOOP_PATH.match(/^M([\d.]+)\s+([\d.]+)/).slice(1).map(Number);
  return [...WAVE_LOOP_PATH.matchAll(/c\s+([-\d.\s]+)/g)].map(match => {
    const values = match[1].trim().split(/\s+/).map(Number);
    assert.equal(values.length, 6);
    const points = [start, ...[0, 2, 4].map(index => [start[0] + values[index], start[1] + values[index + 1]])];
    start = points[3];
    return points;
  });
}
const subtract = (a, b) => a.map((value, index) => value - b[index]);
const curvature = (a, b, c) => a.map((value, index) => value - 2 * b[index] + c[index]);

test('wave height, tangent and curvature remain continuous at every join and loop boundary', () => {
  const segments = curves();
  assert.ok(segments.length > 1);
  for (let i = 0; i < segments.length; i += 1) {
    const current = segments[i];
    const next = segments[(i + 1) % segments.length];
    assert.equal(current[3][1], next[0][1], 'matching height');
    if (i < segments.length - 1) assert.equal(current[3][0], next[0][0], 'no horizontal gap');
    assert.deepEqual(subtract(current[3], current[2]), subtract(next[1], next[0]), 'matching tangent');
    assert.deepEqual(curvature(current[3], current[2], current[1]), curvature(next[2], next[1], next[0]), 'matching curvature');
  }
});

test('shifting the double wave by half its width gives exactly the same curve', () => {
  const segments = curves();
  assert.equal(segments.length % 2, 0);
  const half = segments.length / 2;
  const width = segments.at(-1)[3][0] - segments[0][0][0];
  assert.ok(width > 0);
  for (let i = 0; i < half; i += 1) {
    assert.deepEqual(segments[i + half].map(([x, y]) => [x - width / 2, y]), segments[i]);
  }
});
