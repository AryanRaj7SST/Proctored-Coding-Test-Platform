import { describe, it, expect } from 'vitest';
import { SaveQueue, isTransientSaveError } from '@/lib/save-queue';
import { ApiError } from '@/lib/api';

/**
 * B6 regression: an autosave queued for question 1 must never be written to
 * question 2's attempt, whatever the timing of question switches.
 */

type Call = { key: string; value: string };

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A save function whose calls stay in flight until released. */
function controllableSave() {
  const calls: Call[] = [];
  const pending: ReturnType<typeof deferred>[] = [];
  const save = (key: string, value: string) => {
    calls.push({ key, value });
    const d = deferred();
    pending.push(d);
    return d.promise;
  };
  /** Release in-flight saves one by one until the queue has nothing left. */
  const releaseAll = async (queue: SaveQueue<string>) => {
    for (let i = 0; i < 100 && !queue.idle; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
      pending.shift()?.resolve();
    }
  };
  return { calls, save, releaseAll, pending };
}

const noSleep = () => Promise.resolve();
/** Let a just-enqueued save actually start (become "in flight"). */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('SaveQueue keeps every save bound to its own attempt', () => {
  it('type -> switch question immediately: Q1 code goes to Q1, Q2 code to Q2', async () => {
    const c = controllableSave();
    const q = new SaveQueue<string>(c.save, { sleep: noSleep });
    const a = q.enqueue('attempt-q1', 'q1 code');
    await tick(); // Q1's save is in flight when the student switches
    const b = q.enqueue('attempt-q2', 'q2 code'); // queued while Q1 is saving
    await c.releaseAll(q);
    await Promise.all([a, b]);
    expect(c.calls).toEqual([
      { key: 'attempt-q1', value: 'q1 code' },
      { key: 'attempt-q2', value: 'q2 code' },
    ]);
  });

  it('type -> wait -> switch: saves complete in order with the right keys', async () => {
    const calls: Call[] = [];
    const q = new SaveQueue<string>(async (key, value) => void calls.push({ key, value }));
    await q.enqueue('attempt-q1', 'v1');
    await q.enqueue('attempt-q2', 'v2');
    expect(calls).toEqual([
      { key: 'attempt-q1', value: 'v1' },
      { key: 'attempt-q2', value: 'v2' },
    ]);
  });

  it('type -> submit immediately: drain() resolves only after the save has landed', async () => {
    const c = controllableSave();
    const q = new SaveQueue<string>(c.save);
    void q.enqueue('attempt-q1', 'final code');
    let drained = false;
    const flush = q.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false); // submit must still be waiting
    await c.releaseAll(q);
    await flush;
    expect(drained).toBe(true);
    expect(c.calls).toEqual([{ key: 'attempt-q1', value: 'final code' }]);
  });

  it('multiple queued saves for one attempt coalesce to the latest value', async () => {
    const c = controllableSave();
    const q = new SaveQueue<string>(c.save);
    const p = q.enqueue('attempt-q1', 'v1');
    await tick(); // v1 is now in flight
    void q.enqueue('attempt-q1', 'v2');
    void q.enqueue('attempt-q1', 'v3');
    await c.releaseAll(q);
    await p;
    await q.drain();
    expect(c.calls.map((x) => x.value)).toEqual(['v1', 'v3']);
    expect(c.calls.every((x) => x.key === 'attempt-q1')).toBe(true);
  });

  it('rapid question switching never pairs a value with the wrong key', async () => {
    const c = controllableSave();
    const q = new SaveQueue<string>(c.save);
    void q.enqueue('A', 'A1');
    await tick(); // A1 is now in flight
    void q.enqueue('B', 'B1');
    void q.enqueue('A', 'A2');
    void q.enqueue('B', 'B2');
    void q.enqueue('A', 'A3');
    await c.releaseAll(q);
    await q.drain();
    expect(c.calls).toEqual([
      { key: 'A', value: 'A1' },
      { key: 'B', value: 'B2' },
      { key: 'A', value: 'A3' },
    ]);
    for (const call of c.calls) expect(call.value.startsWith(call.key)).toBe(true);
  });

  it('network delay: a slow save is never overtaken by a later one', async () => {
    const order: string[] = [];
    const q = new SaveQueue<string>(async (key, value) => {
      await new Promise((r) => setTimeout(r, value === 'slow' ? 30 : 1));
      order.push(`${key}:${value}`);
    });
    void q.enqueue('A', 'slow');
    void q.enqueue('B', 'fast');
    await q.drain();
    expect(order).toEqual(['A:slow', 'B:fast']);
    expect(q.idle).toBe(true);
  });
});

describe('SaveQueue failure handling', () => {
  it('retries when api() throws ApiError(0, ..., NETWORK_ERROR) with backoff and then succeeds', async () => {
    let n = 0;
    const events: string[] = [];
    const delays: number[] = [];
    const q = new SaveQueue<string>(
      async () => {
        n += 1;
        if (n < 3) throw new ApiError(0, 'Network request failed.', 'NETWORK_ERROR');
      },
      {
        retryDelayMs: (attempt) => {
          const d = 100 * 2 ** (attempt - 1);
          delays.push(d);
          return d;
        },
        sleep: noSleep,
        onEvent: (e) => events.push(e.type),
      },
    );
    await q.enqueue('A', 'v');
    expect(n).toBe(3);
    expect(delays).toEqual([100, 200]);
    expect(events).toContain('retrying');
    expect(events.at(-1)).toBe('saved');
  });

  it('retries a plain TypeError from fetch and then succeeds', async () => {
    let n = 0;
    const events: string[] = [];
    const delays: number[] = [];
    const q = new SaveQueue<string>(
      async () => {
        n += 1;
        if (n < 3) throw new TypeError('Failed to fetch');
      },
      {
        retryDelayMs: (attempt) => {
          const d = 50 * attempt;
          delays.push(d);
          return d;
        },
        sleep: noSleep,
        onEvent: (e) => events.push(e.type),
      },
    );
    await q.enqueue('A', 'v');
    expect(n).toBe(3);
    expect(delays).toEqual([50, 100]);
    expect(events).toContain('retrying');
    expect(events.at(-1)).toBe('saved');
  });

  it('does not retry a 4xx verdict (e.g. attempt already submitted) and reports the error', async () => {
    let n = 0;
    const events: string[] = [];
    const q = new SaveQueue<string>(
      async () => {
        n += 1;
        throw Object.assign(new Error('This attempt can no longer be edited.'), { status: 409 });
      },
      { sleep: noSleep, onEvent: (e) => events.push(e.type) },
    );
    await q.enqueue('A', 'v');
    expect(n).toBe(1);
    expect(events.at(-1)).toBe('error');
  });

  it('gives up after the retry budget and drain() still resolves', async () => {
    let n = 0;
    const q = new SaveQueue<string>(
      async () => {
        n += 1;
        throw Object.assign(new Error('Server error'), { status: 503 });
      },
      { retries: 2, sleep: noSleep },
    );
    await expect(q.enqueue('A', 'v')).resolves.toBeUndefined();
    expect(n).toBe(3);
  });

  it('a failed save superseded by a newer value is not retried with stale code', async () => {
    const calls: string[] = [];
    let queue!: SaveQueue<string>;
    queue = new SaveQueue<string>(
      async (_key, value) => {
        calls.push(value);
        if (value === 'old') {
          void queue.enqueue('A', 'new'); // student kept typing while the save failed
          throw new TypeError('Failed to fetch');
        }
      },
      { sleep: noSleep },
    );
    await queue.enqueue('A', 'old');
    await queue.drain();
    expect(calls).toEqual(['old', 'new']);
  });

  it('classifies errors: network/5xx/429 transient, other 4xx final', () => {
    expect(isTransientSaveError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isTransientSaveError(new ApiError(0, 'Network request failed', 'NETWORK_ERROR'))).toBe(true);
    expect(isTransientSaveError({ status: 0 })).toBe(true);
    expect(isTransientSaveError({ code: 'NETWORK_ERROR' })).toBe(true);
    expect(isTransientSaveError({ status: 502 })).toBe(true);
    expect(isTransientSaveError({ status: 429 })).toBe(true);
    expect(isTransientSaveError({ status: 408 })).toBe(true);
    expect(isTransientSaveError({ status: 400 })).toBe(false);
    expect(isTransientSaveError({ status: 401 })).toBe(false);
    expect(isTransientSaveError({ status: 403 })).toBe(false);
    expect(isTransientSaveError({ status: 404 })).toBe(false);
    expect(isTransientSaveError({ status: 409 })).toBe(false);
  });
});
