/* eslint-disable no-console */
/**
 * Runner Capacity & js-fn Engine Load Test Harness
 *
 * Simulates N concurrent students (default N=200) submitting code every ~20s
 * for a configurable duration (default 10 minutes = 600s), with a realistic
 * submission mix:
 *   - 70% Correct solutions
 *   - 25% Wrong answer solutions
 *   - 2.5% Infinite loops (hits per-test timeout)
 *   - 2.5% Memory bombs (hits 64MB isolate heap limit)
 *   (Together 5% hostile submissions)
 *
 * Usage:
 *   npx tsx scripts/loadtest/runner-capacity.ts [options]
 *
 * Options:
 *   --runner-url <url>      Runner URL (default: http://127.0.0.1:4000)
 *   --secret <secret>       RUNNER_SECRET (defaults to env or local dev secret)
 *   --students <N>          Number of concurrent students (default: 200)
 *   --interval-seconds <S>  Interval between runs per student (default: 20)
 *   --duration-seconds <D>  Total duration in seconds (default: 600)
 *   --quick                 Quick dry-run (10 students, 10s)
 */

import { createHmac } from 'node:crypto';
import type { RunnerSpec } from '../../shared/test-spec';

export interface SubmissionType {
  kind: 'correct' | 'wrong' | 'infinite-loop' | 'memory-bomb';
  code: string;
}

export const JS_FN_SPEC: RunnerSpec = {
  version: 1,
  kind: 'js-fn',
  viewport: { width: 800, height: 600 },
  tests: [
    {
      id: 'test-1',
      name: 'Basic test case',
      points: 10,
      hidden: false,
      assertions: [
        {
          type: 'fn',
          fn: 'twoSum',
          args: [[2, 7, 11, 15], 9],
          expected: [0, 1],
          compare: 'deepEqual',
        },
      ],
    },
    {
      id: 'test-2',
      name: 'Unordered elements',
      points: 10,
      hidden: false,
      assertions: [
        {
          type: 'fn',
          fn: 'twoSum',
          args: [[3, 2, 4], 6],
          expected: [1, 2],
          compare: 'deepEqual',
        },
      ],
    },
    {
      id: 'test-3',
      name: 'Duplicate values',
      points: 10,
      hidden: false,
      assertions: [
        {
          type: 'fn',
          fn: 'twoSum',
          args: [[3, 3], 6],
          expected: [0, 1],
          compare: 'deepEqual',
        },
      ],
    },
    {
      id: 'test-4',
      name: 'Negative numbers',
      points: 10,
      hidden: false,
      assertions: [
        {
          type: 'fn',
          fn: 'twoSum',
          args: [[-1, -2, -3, -4, -5], -8],
          expected: [2, 4],
          compare: 'deepEqual',
        },
      ],
    },
  ],
};

export const SUBMISSION_TEMPLATES = {
  correct: `
    function twoSum(nums, target) {
      const map = new Map();
      for (let i = 0; i < nums.length; i++) {
        const comp = target - nums[i];
        if (map.has(comp)) return [map.get(comp), i];
        map.set(nums[i], i);
      }
      return [];
    }
  `,
  wrong: `
    function twoSum(nums, target) {
      return [0, 0];
    }
  `,
  infiniteLoop: `
    function twoSum(nums, target) {
      while (true) {}
    }
  `,
  memoryBomb: `
    function twoSum(nums, target) {
      const chunks = [];
      while (true) {
        chunks.push(new Array(1000000).fill(1));
      }
    }
  `,
};

export function selectSubmissionType(rand: number): SubmissionType {
  if (rand < 0.70) {
    return { kind: 'correct', code: SUBMISSION_TEMPLATES.correct };
  }
  if (rand < 0.95) {
    return { kind: 'wrong', code: SUBMISSION_TEMPLATES.wrong };
  }
  if (rand < 0.975) {
    return { kind: 'infinite-loop', code: SUBMISSION_TEMPLATES.infiniteLoop };
  }
  return { kind: 'memory-bomb', code: SUBMISSION_TEMPLATES.memoryBomb };
}

export function computePercentiles(values: number[]): {
  min: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
} {
  if (values.length === 0) {
    return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const p = (pct: number) => {
    const idx = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
    return sorted[idx] ?? 0;
  };
  return {
    min: sorted[0] ?? 0,
    p50: p(50),
    p90: p(90),
    p95: p(95),
    p99: p(99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

export interface RunRecord {
  studentIndex: number;
  kind: SubmissionType['kind'];
  durationMs: number;
  status: number;
  ok: boolean;
  is429: boolean;
  isError: boolean;
}

export class CapacityMetrics {
  records: RunRecord[] = [];
  startTime = Date.now();
  endTime = Date.now();
  initialMemoryMb: { rss: number; heapUsed: number; heapTotal: number } | null = null;
  finalMemoryMb: { rss: number; heapUsed: number; heapTotal: number } | null = null;

  record(item: RunRecord) {
    this.records.push(item);
  }

  summary() {
    const total = this.records.length;
    const durations = this.records.map((r) => r.durationMs);
    const overallPct = computePercentiles(durations);

    const busy429 = this.records.filter((r) => r.is429).length;
    const errors5xx = this.records.filter((r) => r.isError).length;
    const success2xx = this.records.filter((r) => r.ok).length;

    const byKind = (kind: SubmissionType['kind']) => {
      const subset = this.records.filter((r) => r.kind === kind);
      return {
        count: subset.length,
        pct: computePercentiles(subset.map((r) => r.durationMs)),
      };
    };

    const elapsedSeconds = Math.max(1, (this.endTime - this.startTime) / 1000);
    const rps = (total / elapsedSeconds).toFixed(1);

    return {
      total,
      elapsedSeconds,
      rps,
      success2xx,
      busy429,
      busyRate: total > 0 ? ((busy429 / total) * 100).toFixed(2) : '0.00',
      errors5xx,
      errorRate: total > 0 ? ((errors5xx / total) * 100).toFixed(2) : '0.00',
      overallPct,
      correct: byKind('correct'),
      wrong: byKind('wrong'),
      infiniteLoop: byKind('infinite-loop'),
      memoryBomb: byKind('memory-bomb'),
      initialMemoryMb: this.initialMemoryMb,
      finalMemoryMb: this.finalMemoryMb,
    };
  }

  printReport() {
    const s = this.summary();
    console.log('\n========================================================================================');
    console.log(`RUNNER CAPACITY PERFORMANCE REPORT (${s.elapsedSeconds.toFixed(1)}s elapsed, ${s.total} runs)`);
    console.log('========================================================================================');
    console.log(`Throughput:           ${s.rps} runs/sec`);
    console.log(`Successful (200 OK):  ${s.success2xx} (${s.total > 0 ? ((s.success2xx / s.total) * 100).toFixed(1) : 0}%)`);
    console.log(`429 Runner Busy:      ${s.busy429} (${s.busyRate}%)`);
    console.log(`Errors (5xx / Net):   ${s.errors5xx} (${s.errorRate}%)`);
    console.log('----------------------------------------------------------------------------------------');
    console.log('Latency Percentiles (ms):');
    console.log(`  Overall:      min=${s.overallPct.min}ms | p50=${s.overallPct.p50}ms | p90=${s.overallPct.p90}ms | p95=${s.overallPct.p95}ms | p99=${s.overallPct.p99}ms | max=${s.overallPct.max}ms`);
    console.log(`  Correct (70%): p50=${s.correct.pct.p50}ms | p95=${s.correct.pct.p95}ms | max=${s.correct.pct.max}ms (n=${s.correct.count})`);
    console.log(`  Wrong   (25%): p50=${s.wrong.pct.p50}ms | p95=${s.wrong.pct.p95}ms | max=${s.wrong.pct.max}ms (n=${s.wrong.count})`);
    console.log(`  InfLoop(2.5%): p50=${s.infiniteLoop.pct.p50}ms | p95=${s.infiniteLoop.pct.p95}ms | max=${s.infiniteLoop.pct.max}ms (n=${s.infiniteLoop.count})`);
    console.log(`  MemBomb(2.5%): p50=${s.memoryBomb.pct.p50}ms | p95=${s.memoryBomb.pct.p95}ms | max=${s.memoryBomb.pct.max}ms (n=${s.memoryBomb.count})`);
    if (this.initialMemoryMb && this.finalMemoryMb) {
      console.log('----------------------------------------------------------------------------------------');
      console.log('Runner Memory Tracking:');
      console.log(`  Initial RSS:  ${this.initialMemoryMb.rss} MB (Heap: ${this.initialMemoryMb.heapUsed}/${this.initialMemoryMb.heapTotal} MB)`);
      console.log(`  Final RSS:    ${this.finalMemoryMb.rss} MB (Heap: ${this.finalMemoryMb.heapUsed}/${this.finalMemoryMb.heapTotal} MB)`);
      const delta = this.finalMemoryMb.rss - this.initialMemoryMb.rss;
      console.log(`  Delta RSS:    ${delta >= 0 ? '+' : ''}${delta} MB`);
    }
    console.log('========================================================================================\n');
  }
}

function signedHeaders(body: string, secret: string): Record<string, string> {
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${secret}`,
    'x-runner-timestamp': timestamp,
    'x-runner-signature': signature,
  };
}

export async function runLoadSimulation(options: {
  runnerUrl: string;
  secret: string;
  students: number;
  intervalSeconds: number;
  durationSeconds: number;
}): Promise<CapacityMetrics> {
  const metrics = new CapacityMetrics();
  metrics.startTime = Date.now();
  const endTime = metrics.startTime + options.durationSeconds * 1000;

  console.log(`Simulating N=${options.students} students every ~${options.intervalSeconds}s for ${options.durationSeconds}s...`);

  try {
    const health = await fetch(`${options.runnerUrl.replace(/\/+$/, '')}/health`).then((r) => r.json());
    if (health?.memoryMb) metrics.initialMemoryMb = health.memoryMb;
  } catch {}

  // Stagger student starting times evenly across interval to avoid artificial step-function spike
  const intervalMs = options.intervalSeconds * 1000;

  const studentPromises = Array.from({ length: options.students }).map(async (_, idx) => {
    // Initial stagger within the first interval
    const initialDelay = (idx / options.students) * intervalMs;
    await new Promise((r) => setTimeout(r, initialDelay));

    while (Date.now() < endTime) {
      const submission = selectSubmissionType(Math.random());
      const runId = `load-${idx}-${Date.now().toString(36)}`;
      const payload = JSON.stringify({
        runId,
        userId: `student-${idx}`,
        html: '',
        css: '',
        js: submission.code,
        spec: JS_FN_SPEC,
      });

      const headers = signedHeaders(payload, options.secret);
      const start = performance.now();
      let status = 0;
      let ok = false;

      try {
        const res = await fetch(`${options.runnerUrl.replace(/\/+$/, '')}/run`, {
          method: 'POST',
          headers,
          body: payload,
          signal: AbortSignal.timeout(30_000),
        });
        status = res.status;
        ok = res.ok;
      } catch {
        status = 0;
        ok = false;
      }

      const durationMs = Math.round(performance.now() - start);
      metrics.record({
        studentIndex: idx,
        kind: submission.kind,
        durationMs,
        status,
        ok,
        is429: status === 429,
        isError: status >= 500 || status === 0,
      });

      // Next interval with +/- 10% jitter
      const jitter = (Math.random() - 0.5) * 0.2 * intervalMs;
      const sleepMs = Math.max(1000, intervalMs + jitter);
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  });

  await Promise.all(studentPromises);
  metrics.endTime = Date.now();

  try {
    const health = await fetch(`${options.runnerUrl.replace(/\/+$/, '')}/health`).then((r) => r.json());
    if (health?.memoryMb) metrics.finalMemoryMb = health.memoryMb;
  } catch {}

  return metrics;
}

// CLI entry point
if (process.argv[1]?.endsWith('runner-capacity.ts') || process.argv[1]?.endsWith('runner-capacity.js')) {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const isQuick = args.includes('--quick');
  const runnerUrl = getArg('--runner-url') || process.env.RUNNER_URL || 'http://127.0.0.1:4000';
  const secret = getArg('--secret') || process.env.RUNNER_SECRET || 'dev-runner-secret-change-me-0123456789';
  const students = parseInt(getArg('--students') || (isQuick ? '10' : '200'), 10);
  const intervalSeconds = parseInt(getArg('--interval-seconds') || (isQuick ? '5' : '20'), 10);
  const durationSeconds = parseInt(getArg('--duration-seconds') || (isQuick ? '10' : '600'), 10);

  runLoadSimulation({
    runnerUrl,
    secret,
    students,
    intervalSeconds,
    durationSeconds,
  })
    .then((metrics) => {
      metrics.printReport();
    })
    .catch((err) => {
      console.error('Simulation error:', err);
      process.exit(1);
    });
}
