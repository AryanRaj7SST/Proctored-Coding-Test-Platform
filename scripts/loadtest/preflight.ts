#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Load Test Preflight Verification Script
 *
 * Read-only health, latency, and credential check across candidate runners
 * before executing load tests or contest traffic:
 *  1. Validates runner URLs (HTTPS required unless private host)
 *  2. Pings /health with 10s timeout, flagging latency > 5s as likely cold start
 *  3. Verifies HMAC credentials via POST /auth-check using signedHeaders
 *  4. Pings /health a second time to capture warm latency
 *  5. Reports capacity and queue metrics, warning on configuration discrepancies
 *  6. Optionally probes --app-url status
 *
 * RUNNER_SECRET is sourced strictly from the environment; it is NEVER accepted
 * via CLI flags, printed to stdout/stderr, or persisted to disk.
 *
 * Usage:
 *   npx tsx scripts/loadtest/preflight.ts --runner-urls <comma-list> [--app-url <url>]
 *   npm run loadtest:preflight -- --runner-urls "http://localhost:4000"
 */

import { existsSync } from 'node:fs';
import { isPrivateHost, parseRunnerUrls } from '../../src/lib/env';
import { signedHeaders } from '../../src/lib/runner-client';

// Attempt to load .env for local CLI convenience without printing or writing
try {
  if (
    typeof (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile === 'function' &&
    existsSync('.env')
  ) {
    (process as unknown as { loadEnvFile: (path?: string) => void }).loadEnvFile('.env');
  }
} catch {
  // Ignore errors reading local .env
}

export interface RunnerCheckResult {
  url: string;
  valid: boolean;
  validationError?: string;
  firstLatencyMs?: number;
  warmLatencyMs?: number;
  isColdStart: boolean;
  healthOk: boolean;
  healthStatus?: number;
  healthError?: string;
  active?: number;
  queued?: number;
  capacity?: number;
  authStatus: 'OK' | 'secret mismatch' | 'not deployed (404)' | 'failed' | 'skipped';
  authDetail?: string;
  ok: boolean;
  summary: string;
}

export interface PreflightReport {
  runners: RunnerCheckResult[];
  appUrlStatus?: { url: string; status?: number; ok: boolean; error?: string };
  allHealthy: boolean;
  discrepancies: string[];
}

export interface PreflightOptions {
  runnerUrlsRaw: string;
  secret: string;
  appUrl?: string;
  fetchFn?: typeof fetch;
}

/** Check a single runner URL thoroughly and read-only. */
export async function checkRunner(
  rawUrl: string,
  secret: string,
  fetchFn: typeof fetch = fetch,
): Promise<RunnerCheckResult> {
  const normalized = rawUrl.trim().replace(/\/+$/, '');

  // 1. Validate URL protocol & host safety
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    return {
      url: normalized,
      valid: false,
      validationError: 'Not a valid URL',
      isColdStart: false,
      healthOk: false,
      authStatus: 'skipped',
      ok: false,
      summary: 'Invalid URL',
    };
  }

  if (parsedUrl.protocol !== 'https:' && !isPrivateHost(parsedUrl.hostname)) {
    return {
      url: normalized,
      valid: false,
      validationError: 'Must be https:// unless the host is private/local',
      isColdStart: false,
      healthOk: false,
      authStatus: 'skipped',
      ok: false,
      summary: 'Insecure URL (HTTP not permitted for public hosts)',
    };
  }

  // 2. First GET /health with 10s timeout
  const healthUrl = `${normalized}/health`;
  let firstLatencyMs = 0;
  let healthOk = false;
  let healthStatus: number | undefined;
  let healthError: string | undefined;
  let active: number | undefined;
  let queued: number | undefined;
  let capacity: number | undefined;

  try {
    const startFirst = performance.now();
    const res = await fetchFn(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    firstLatencyMs = Math.round(performance.now() - startFirst);
    healthStatus = res.status;
    healthOk = res.ok;

    if (res.ok) {
      try {
        const data = await res.json();
        if (data && typeof data === 'object') {
          if (typeof data.active === 'number' && Number.isFinite(data.active)) active = data.active;
          if (typeof data.queued === 'number' && Number.isFinite(data.queued)) queued = data.queued;
          if (typeof data.capacity === 'number' && Number.isFinite(data.capacity)) capacity = data.capacity;
        }
      } catch {
        // Defensive: ignore missing or non-JSON response bodies
      }
    } else {
      healthError = `HTTP ${res.status}`;
    }
  } catch (err) {
    healthOk = false;
    healthError = err instanceof Error ? err.message : String(err);
  }

  const isColdStart = firstLatencyMs > 5000;

  // 3. POST /auth-check with signedHeaders
  let authStatus: RunnerCheckResult['authStatus'] = 'skipped';
  let authDetail: string | undefined;

  if (healthOk) {
    const authUrl = `${normalized}/auth-check`;
    try {
      const body = '{}';
      const headers = signedHeaders(body, secret);
      const authRes = await fetchFn(authUrl, {
        method: 'POST',
        headers,
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });

      if (authRes.ok) {
        authStatus = 'OK';
      } else if (authRes.status === 401 || authRes.status === 403) {
        authStatus = 'secret mismatch';
        authDetail = `HTTP ${authRes.status}`;
      } else if (authRes.status === 404) {
        authStatus = 'not deployed (404)';
      } else {
        authStatus = 'failed';
        authDetail = `HTTP ${authRes.status}`;
      }
    } catch (err) {
      authStatus = 'failed';
      authDetail = err instanceof Error ? err.message : String(err);
    }
  }

  // 4. Second GET /health to capture warm latency
  let warmLatencyMs: number | undefined;
  if (healthOk) {
    try {
      const startWarm = performance.now();
      const warmRes = await fetchFn(healthUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      warmLatencyMs = Math.round(performance.now() - startWarm);

      // Opportunistically refresh capacity/queue if missing from first call
      if (warmRes.ok && capacity === undefined) {
        try {
          const warmData = await warmRes.json();
          if (warmData && typeof warmData === 'object') {
            if (typeof warmData.active === 'number' && Number.isFinite(warmData.active))
              active = warmData.active;
            if (typeof warmData.queued === 'number' && Number.isFinite(warmData.queued))
              queued = warmData.queued;
            if (typeof warmData.capacity === 'number' && Number.isFinite(warmData.capacity))
              capacity = warmData.capacity;
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // Keep first latency if warm check fails
    }
  }

  // Compute final verdict
  const authOk = authStatus === 'OK' || authStatus === 'not deployed (404)';
  const overallOk = healthOk && authOk;
  let summary = 'OK';
  if (!healthOk) {
    summary = `DOWN (${healthError ?? 'unreachable'})`;
  } else if (!authOk) {
    summary = authStatus === 'secret mismatch' ? 'SECRET MISMATCH' : 'AUTH FAILED';
  }

  return {
    url: normalized,
    valid: true,
    firstLatencyMs,
    warmLatencyMs,
    isColdStart,
    healthOk,
    healthStatus,
    healthError,
    active,
    queued,
    capacity,
    authStatus,
    authDetail,
    ok: overallOk,
    summary,
  };
}

/** Execute preflight checks across all runner URLs and optional app URL. */
export async function runPreflight(options: PreflightOptions): Promise<PreflightReport> {
  const { runnerUrlsRaw, secret, appUrl, fetchFn = fetch } = options;
  const urls = parseRunnerUrls(runnerUrlsRaw);

  const runners = await Promise.all(urls.map((u) => checkRunner(u, secret, fetchFn)));

  // Detect configuration discrepancies across healthy runners
  const discrepancies: string[] = [];
  const healthyRunners = runners.filter((r) => r.healthOk);

  if (healthyRunners.length > 1) {
    const capacities = new Set(
      healthyRunners.map((r) => r.capacity).filter((c): c is number => c !== undefined),
    );
    if (capacities.size > 1) {
      discrepancies.push(
        `Discrepancy: Runner capacities differ across pool: ${healthyRunners
          .map((r) => `${r.url} (cap: ${r.capacity ?? '?'})`)
          .join(', ')}`,
      );
    }

    const queues = new Set(healthyRunners.map((r) => r.queued).filter((q): q is number => q !== undefined));
    if (queues.size > 1) {
      discrepancies.push(
        `Discrepancy: Runner queued depths differ across pool: ${healthyRunners
          .map((r) => `${r.url} (queue: ${r.queued ?? '?'})`)
          .join(', ')}`,
      );
    }
  }

  // Optional app URL check
  let appUrlStatus: PreflightReport['appUrlStatus'];
  if (appUrl) {
    try {
      const res = await fetchFn(appUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      appUrlStatus = { url: appUrl, status: res.status, ok: res.ok };
    } catch (err) {
      appUrlStatus = {
        url: appUrl,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const allHealthy = runners.length > 0 && runners.every((r) => r.ok);

  return {
    runners,
    appUrlStatus,
    allHealthy,
    discrepancies,
  };
}

/** Print human-readable report table to console. */
export function printPreflightReport(report: PreflightReport): void {
  console.log(
    '================================================================================================',
  );
  console.log('RUNNER POOL PREFLIGHT VERIFICATION');
  console.log(
    '================================================================================================',
  );

  if (report.runners.length === 0) {
    console.log('No runner URLs provided.');
    return;
  }

  // Format table rows
  const headers = ['Runner URL', 'First Ping', 'Warm Ping', 'Auth Check', 'Cap', 'Queue', 'Active', 'Status'];
  const rows = report.runners.map((r) => {
    if (!r.valid) {
      return [r.url, '-', '-', '-', '-', '-', '-', `INVALID: ${r.validationError}`];
    }
    const coldTag = r.isColdStart ? ' (cold start)' : '';
    const firstPing = r.firstLatencyMs !== undefined ? `${r.firstLatencyMs}ms${coldTag}` : '-';
    const warmPing = r.warmLatencyMs !== undefined ? `${r.warmLatencyMs}ms` : '-';
    const auth = r.authDetail ? `${r.authStatus} (${r.authDetail})` : r.authStatus;
    const cap = r.capacity !== undefined ? String(r.capacity) : '-';
    const q = r.queued !== undefined ? String(r.queued) : '-';
    const act = r.active !== undefined ? String(r.active) : '-';
    const status = r.ok ? 'PASS' : `FAIL: ${r.summary}`;

    return [r.url, firstPing, warmPing, auth, cap, q, act, status];
  });

  // Calculate column widths
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => (row[i] ? row[i]!.length : 0))),
  );

  const pad = (s: string, w: number) => s.padEnd(w, ' ');
  const sep = colWidths.map((w) => '-'.repeat(w)).join('  ');

  console.log(headers.map((h, i) => pad(h, colWidths[i]!)).join('  '));
  console.log(sep);
  for (const row of rows) {
    console.log(row.map((val, i) => pad(val, colWidths[i]!)).join('  '));
  }
  console.log(
    '================================================================================================',
  );

  // Cold start advisory
  const coldCount = report.runners.filter((r) => r.isColdStart).length;
  if (coldCount > 0) {
    console.log(
      `⚠️  ${coldCount} runner(s) exhibited latency > 5s on first ping (likely cold start / sleeping instance).`,
    );
  }

  // Discrepancy warnings
  for (const disc of report.discrepancies) {
    console.log(`⚠️  ${disc}`);
  }

  // App URL report
  if (report.appUrlStatus) {
    const { url, status, ok, error } = report.appUrlStatus;
    if (ok) {
      console.log(`\nApp status (${url}): HTTP ${status} (OK)`);
    } else {
      console.log(`\nApp status (${url}): ${status ? `HTTP ${status}` : `Unreachable (${error})`}`);
    }
  }

  console.log(
    report.allHealthy
      ? '\n✅ Preflight complete: all runners healthy and authenticated.\n'
      : '\n❌ Preflight failed: one or more runners are offline, invalid, or reject credentials.\n',
  );
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  // Guard: NEVER accept runner secret as a flag
  if (args.some((a) => a.startsWith('--runner-secret') || a === '-s')) {
    console.error(
      '\x1b[31m[SECURITY ERROR] RUNNER_SECRET must come from the environment only. Never pass secrets as command line flags.\x1b[0m',
    );
    process.exit(1);
  }

  const runnerUrlsRaw = getArg('--runner-urls');
  const appUrl = getArg('--app-url');
  const help = args.includes('--help') || args.includes('-h');

  return { runnerUrlsRaw, appUrl, help };
}

async function main() {
  const { runnerUrlsRaw, appUrl, help } = parseCliArgs();

  if (help) {
    console.log(`
Usage: npx tsx scripts/loadtest/preflight.ts --runner-urls <comma-separated URLs> [--app-url <url>]

Options:
  --runner-urls <list>   Comma-separated list of runner URLs to verify (required)
  --app-url <url>        Optional Next.js application URL to check status
  --help, -h             Show this help message

Environment:
  RUNNER_SECRET          Shared runner authentication secret (required, from environment only)
`);
    process.exit(0);
  }

  if (!runnerUrlsRaw || runnerUrlsRaw.trim() === '') {
    console.error('\x1b[31m[ERROR] --runner-urls is required.\x1b[0m');
    console.error('Example: npx tsx scripts/loadtest/preflight.ts --runner-urls "http://127.0.0.1:4000"');
    process.exit(1);
  }

  const secret = process.env.RUNNER_SECRET;
  if (!secret || secret.trim() === '') {
    console.error(
      '\x1b[31m[ERROR] RUNNER_SECRET environment variable is missing. It must be provided via the environment, not CLI flags.\x1b[0m',
    );
    process.exit(1);
  }

  const report = await runPreflight({
    runnerUrlsRaw,
    secret,
    appUrl,
  });

  printPreflightReport(report);

  if (!report.allHealthy) {
    process.exit(1);
  }
}

// Execute when invoked directly
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/loadtest/preflight.ts')) {
  main().catch((err) => {
    console.error('Fatal preflight error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
