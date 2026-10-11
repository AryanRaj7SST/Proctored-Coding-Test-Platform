/**
 * Latency and throughput metric tracker for load test endpoints.
 * Pure TypeScript / Node 20, zero dependencies.
 */

export interface Sample {
  endpoint: string;
  durationMs: number;
  status: number;
  ok: boolean;
  error?: string;
}

export class MetricsCollector {
  private samples: Sample[] = [];
  private startEpoch = Date.now();

  record(endpoint: string, durationMs: number, status: number, ok: boolean, error?: string) {
    this.samples.push({ endpoint, durationMs, status, ok, error });
  }

  getSamples(): Sample[] {
    return this.samples;
  }

  summary() {
    const elapsedSeconds = Math.max(0.001, (Date.now() - this.startEpoch) / 1000);
    const byEndpoint = new Map<string, Sample[]>();

    for (const s of this.samples) {
      const list = byEndpoint.get(s.endpoint) ?? [];
      list.push(s);
      byEndpoint.set(s.endpoint, list);
    }

    const rows: {
      endpoint: string;
      total: number;
      success: number;
      errors: number;
      rps: number;
      p50: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
    }[] = [];

    for (const [endpoint, list] of byEndpoint.entries()) {
      const durations = list.map((s) => s.durationMs).sort((a, b) => a - b);
      const total = list.length;
      const success = list.filter((s) => s.ok).length;
      const errors = total - success;

      rows.push({
        endpoint,
        total,
        success,
        errors,
        rps: Math.round((total / elapsedSeconds) * 10) / 10,
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        p99: percentile(durations, 0.99),
        min: durations[0] ?? 0,
        max: durations[durations.length - 1] ?? 0,
      });
    }

    // Sort by endpoint name
    rows.sort((a, b) => a.endpoint.localeCompare(b.endpoint));

    return {
      elapsedSeconds: Math.round(elapsedSeconds * 10) / 10,
      totalRequests: this.samples.length,
      totalErrors: this.samples.filter((s) => !s.ok).length,
      rows,
    };
  }

  printReport() {
    const { elapsedSeconds, totalRequests, totalErrors, rows } = this.summary();

    console.log('\n========================================================================================');
    console.log(`LOAD TEST PERFORMANCE REPORT (${elapsedSeconds}s elapsed, ${totalRequests} total requests, ${totalErrors} errors)`);
    console.log('========================================================================================');
    console.log(
      rpad('Endpoint', 32) +
        rpad('Count', 8) +
        rpad('RPS', 8) +
        rpad('p50 (ms)', 10) +
        rpad('p95 (ms)', 10) +
        rpad('p99 (ms)', 10) +
        rpad('Max (ms)', 10) +
        'Errors'
    );
    console.log('-'.repeat(96));

    for (const r of rows) {
      console.log(
        rpad(r.endpoint, 32) +
          rpad(String(r.total), 8) +
          rpad(String(r.rps), 8) +
          rpad(String(r.p50), 10) +
          rpad(String(r.p95), 10) +
          rpad(String(r.p99), 10) +
          rpad(String(r.max), 10) +
          (r.errors > 0 ? `\x1b[31m${r.errors}\x1b[0m` : '0')
      );
    }
    console.log('========================================================================================\n');
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Math.round(sorted[idx]!);
}

function rpad(str: string, length: number): string {
  return str.padEnd(length, ' ');
}
