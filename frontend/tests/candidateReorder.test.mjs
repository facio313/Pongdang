import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateDragPreview, candidateRowOffsets } from '../src/candidateReorder.ts';

const rows = [1, 2, 3, 4, 5].map((id, index) => ({ id, top: 200 + index * 100, height: 100 }));

test('a neighbour moves aside at its midpoint before the dragged row is released', () => {
  assert.deepEqual(candidateDragPreview(rows, 2, 49), { to: 2, offsets: [0, 49, 0, 0, 0] });
  assert.deepEqual(candidateDragPreview(rows, 2, 51), { to: 3, offsets: [0, 51, -100, 0, 0] });
  assert.deepEqual(candidateDragPreview(rows, 4, -151), { to: 2, offsets: [0, 100, 100, -151, 0] });
});

test('dragging is bounded by the list and can return to its original slot', () => {
  assert.deepEqual(candidateDragPreview(rows, 2, 999), { to: 5, offsets: [0, 300, -100, -100, -100] });
  assert.deepEqual(candidateDragPreview(rows, 4, -999), { to: 1, offsets: [100, 100, 100, -300, 0] });
  assert.deepEqual(candidateDragPreview(rows, 2, 0), { to: 2, offsets: [0, 0, 0, 0, 0] });
});

test('the drop settles into an exact gap even when rows have different heights', () => {
  const uneven = [{ id: 1, top: 0, height: 180 }, { id: 2, top: 180, height: 60 }, { id: 3, top: 240, height: 120 }];
  assert.equal(candidateDragPreview(uneven, 1, 31).to, 2);
  assert.deepEqual(candidateRowOffsets(uneven, 1, 3), [180, -180, -180]);
  assert.deepEqual(candidateRowOffsets(uneven, 3, 1), [120, 120, -240]);
});

test('cancelled, missing and single-row moves preserve their original slots', () => {
  assert.deepEqual(candidateRowOffsets(rows, 2, 2), [0, 0, 0, 0, 0]);
  assert.deepEqual(candidateRowOffsets(rows, 99, 2), [0, 0, 0, 0, 0]);
  assert.deepEqual(candidateDragPreview([], 1, 20), { to: 1, offsets: [] });
  assert.deepEqual(candidateDragPreview(rows.slice(0, 1), 1, 20), { to: 1, offsets: [0] });
});
