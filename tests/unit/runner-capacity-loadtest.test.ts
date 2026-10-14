import { describe, it, expect, vi } from 'vitest';
import {
  selectSubmissionType,
  computePercentiles,
  CapacityMetrics,
  runLoadSimulation,
} from '../../scripts/loadtest/runner-capacity';

describe('Runner Capacity Load Test Harness', () => {
  it('generates the exact traffic mix (70% correct, 25% wrong, 2.5% loop, 2.5% bomb = 5% hostile)', () => {
    expect(selectSubmissionType(0.1).kind).toBe('correct');
    expect(selectSubmissionType(0.69).kind).toBe('correct');

    expect(selectSubmissionType(0.70).kind).toBe('wrong');
    expect(selectSubmissionType(0.94).kind).toBe('wrong');

    expect(selectSubmissionType(0.95).kind).toBe('infinite-loop');
    expect(selectSubmissionType(0.974).kind).toBe('infinite-loop');

    expect(selectSubmissionType(0.975).kind).toBe('memory-bomb');
    expect(selectSubmissionType(0.999).kind).toBe('memory-bomb');
  });

  it('accurately computes latency percentiles', () => {
    // 100 values from 1 to 100
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const p = computePercentiles(values);

    expect(p.min).toBe(1);
    expect(p.p50).toBe(51);
    expect(p.p90).toBe(91);
    expect(p.p95).toBe(96);
    expect(p.p99).toBe(100);
    expect(p.max).toBe(100);
  });

  it('tracks 429 busy rates, error rates, and per-kind breakdowns', () => {
    const metrics = new CapacityMetrics();
    metrics.startTime = 1000;
    metrics.endTime = 11000; // 10 seconds

    // Record 70 correct (10ms), 25 wrong (10ms), 2 loop (2000ms), 2 bomb (500ms), 1 429 (5ms)
    for (let i = 0; i < 70; i++) {
      metrics.record({
        studentIndex: i,
        kind: 'correct',
        durationMs: 10,
        status: 200,
        ok: true,
        is429: false,
        isError: false,
      });
    }
    for (let i = 0; i < 25; i++) {
      metrics.record({
        studentIndex: i,
        kind: 'wrong',
        durationMs: 12,
        status: 200,
        ok: true,
        is429: false,
        isError: false,
      });
    }
    metrics.record({
      studentIndex: 1,
      kind: 'infinite-loop',
      durationMs: 2010,
      status: 200,
      ok: true,
      is429: false,
      isError: false,
    });
    metrics.record({
      studentIndex: 2,
      kind: 'infinite-loop',
      durationMs: 2015,
      status: 200,
      ok: true,
      is429: false,
      isError: false,
    });
    metrics.record({
      studentIndex: 3,
      kind: 'memory-bomb',
      durationMs: 450,
      status: 200,
      ok: true,
      is429: false,
      isError: false,
    });
    metrics.record({
      studentIndex: 4,
      kind: 'memory-bomb',
      durationMs: 480,
      status: 200,
      ok: true,
      is429: false,
      isError: false,
    });
    metrics.record({
      studentIndex: 5,
      kind: 'correct',
      durationMs: 5,
      status: 429,
      ok: false,
      is429: true,
      isError: false,
    });

    const summary = metrics.summary();
    expect(summary.total).toBe(100);
    expect(summary.busy429).toBe(1);
    expect(summary.busyRate).toBe('1.00');
    expect(summary.errors5xx).toBe(0);
    expect(summary.infiniteLoop.count).toBe(2);
    expect(summary.memoryBomb.count).toBe(2);
    expect(summary.infiniteLoop.pct.p50).toBeGreaterThanOrEqual(2000);
  });

  it('runs load simulation and collects metrics against runner endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          status: 'SUCCESS',
          durationMs: 12,
          results: [{ passed: true, pointsAwarded: 10, durationMs: 2 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const metrics = await runLoadSimulation({
      runnerUrl: 'http://127.0.0.1:4000',
      secret: '01234567890123456789',
      students: 5,
      intervalSeconds: 1,
      durationSeconds: 2,
    });

    const summary = metrics.summary();
    expect(summary.total).toBeGreaterThanOrEqual(5);
    expect(summary.success2xx).toBe(summary.total);
    expect(summary.errors5xx).toBe(0);
  });
});
