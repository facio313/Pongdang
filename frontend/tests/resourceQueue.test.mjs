import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { createReadQueue } from '../src/resourceQueue.ts';

test('page reads run in bounded FIFO groups instead of overwhelming DB slots', async () => {
  const queue = createReadQueue(3), started = [], finish = [];
  const jobs = Array.from({ length: 8 }, (_, i) => queue(new AbortController().signal, () => {
    started.push(i);
    return new Promise(resolve => { finish[i] = () => resolve(i); });
  }));
  await setImmediate();
  assert.deepEqual(started, [0, 1, 2]);
  finish[0]();
  await setImmediate();
  assert.deepEqual(started, [0, 1, 2, 3]);
  for (let i = 1; i < 8; i++) { finish[i](); await setImmediate(); }
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('unmounted queued reads are cancelled and failing reads release their slot', async () => {
  const queue = createReadQueue(1), abort = new AbortController();
  let finish, called = false;
  const first = queue(new AbortController().signal, () => new Promise(resolve => { finish = resolve; }));
  const cancelled = queue(abort.signal, async () => { called = true; });
  abort.abort(new Error('cancelled'));
  await assert.rejects(cancelled, /cancelled/);
  await setImmediate();
  finish(1);
  assert.equal(await first, 1);
  await assert.rejects(queue(new AbortController().signal, async () => { throw new Error('unavailable'); }), /unavailable/);
  assert.equal(await queue(new AbortController().signal, async () => 2), 2);
  assert.equal(called, false);
});
