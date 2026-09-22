import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoundedQueue } from '../src/queue.ts';

/**
 * The runner has no Redis and no external broker -- concurrency is bounded in
 * process memory (product requirement #33). These tests are the proof that
 * the bound is real: a flood of requests must not spawn unlimited Chromium
 * pages, and once both the run slots and the wait line are full, the caller
 * must get a fast, cheap rejection instead of piling up.
 */

function later<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

test('runs tasks immediately while under the concurrency limit', async () => {
  const q = new BoundedQueue(2, 2);
  const order: number[] = [];
  await Promise.all([
    q.run(async () => {
      order.push(1);
    }),
    q.run(async () => {
      order.push(2);
    }),
  ]);
  assert.deepEqual(order.sort(), [1, 2]);
});

test('never runs more than maxConcurrency tasks at the same time', async () => {
  const q = new BoundedQueue(2, 10);
  let concurrent = 0;
  let peak = 0;

  const task = async () => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await later(null, 20);
    concurrent -= 1;
  };

  await Promise.all([task, task, task, task, task].map((fn) => q.run(fn)));
  assert.equal(peak <= 2, true, `peak concurrency was ${peak}, expected at most 2`);
});

test('queues excess work rather than dropping it, up to maxQueue', async () => {
  const q = new BoundedQueue(1, 2);
  const results: number[] = [];
  const make = (n: number) => q.run(async () => {
    await later(null, 5);
    results.push(n);
  });

  await Promise.all([make(1), make(2), make(3)]);
  // All three eventually ran; order is FIFO because capacity is 1.
  assert.deepEqual(results, [1, 2, 3]);
});

test('rejects with QUEUE_FULL once both capacity and the wait line are exhausted', async () => {
  const q = new BoundedQueue(1, 1);

  // Slot 1: running, and deliberately held open. Its promise executor runs
  // synchronously inside q.run() (active was 0), so `releaseFirst` is already
  // assigned by the time this line returns.
  let releaseFirst: () => void = () => {};
  const first = q.run(() => new Promise<void>((resolve) => { releaseFirst = resolve; }));

  // Slot 2: queued behind the first -- its task does not run yet, so it needs
  // no blocker of its own; it will complete as soon as a slot frees up.
  const second = q.run(async () => {});

  // Slot 3: both capacity and the one queue slot are taken, so this must be
  // rejected synchronously rather than joining the wait line.
  await assert.rejects(
    q.run(async () => {
      /* never reached */
    }),
    (err: Error & { code?: string }) => {
      assert.equal(err.code, 'QUEUE_FULL');
      return true;
    },
  );

  releaseFirst();
  await Promise.all([first, second]);
});

test('reports accurate stats while work is in flight', async () => {
  const q = new BoundedQueue(1, 5);
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const running = q.run(() => gate);
  await later(null, 5); // let the task actually start

  assert.equal(q.stats.active, 1);
  assert.equal(q.stats.capacity, 1);

  release?.();
  await running;
  assert.equal(q.stats.active, 0);
});

test('a task that throws still frees its slot for the next one', async () => {
  const q = new BoundedQueue(1, 5);
  await assert.rejects(
    q.run(async () => {
      throw new Error('boom');
    }),
  );
  // If the slot were not freed, this would hang until the test times out.
  let ran = false;
  await q.run(async () => {
    ran = true;
  });
  assert.equal(ran, true);
});
