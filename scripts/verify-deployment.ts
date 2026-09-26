/* eslint-disable no-console */
/**
 * Automated Deployment Verification Script
 *
 * Runs read-only health and configuration checks against deployed or staging infrastructure:
 *  a. Runner health: GET {RUNNER_URL}/health -> 200 OK and { ok: true }
 *  b. App health: GET {APP_URL}/api/health -> 200 OK and both database & runner healthy
 *  c. Migration status: npx prisma migrate status over DIRECT_URL (read-only)
 *  d. Env var presence: check that all 11 required production app vars are set and non-empty (never prints secrets)
 *  e. Connection strings: verify DATABASE_URL contains "-pooler" and DIRECT_URL does not
 *
 * Usage:
 *   npx tsx scripts/verify-deployment.ts [APP_URL]
 *   npm run verify:deploy -- https://your-app.vercel.app
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// Attempt to load local .env if present and process.loadEnvFile is available
try {
  if (
    typeof (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile === 'function' &&
    existsSync('.env')
  ) {
    (process as unknown as { loadEnvFile: (path?: string) => void }).loadEnvFile('.env');
  }
} catch {
  // Ignore errors loading .env; environment may be provided purely through the shell
}

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const REQUIRED_APP_ENV_VARS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'AUTH_URL',
  'AUTH_TRUST_HOST',
  'RUNNER_URL',
  'RUNNER_SECRET',
  'CRON_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const;

function printUsage(): void {
  console.log(`
Usage:
  npm run verify:deploy [APP_URL]
  npx tsx scripts/verify-deployment.ts [APP_URL]

Arguments:
  APP_URL       The public URL of the deployed Next.js application
                (optional, falls back to AUTH_URL or APP_URL env vars)

Required Shell / .env Variables:
  RUNNER_URL    Base URL of the runner service (e.g. https://runner.onrender.com)
  DATABASE_URL  PostgreSQL pooled connection string (must contain "-pooler")
  DIRECT_URL    PostgreSQL direct unpooled connection string (must NOT contain "-pooler")
`);
}

async function checkRunnerHealth(runnerBaseUrl: string): Promise<CheckResult> {
  const checkName = 'a. Runner health';
  if (!runnerBaseUrl) {
    return {
      name: checkName,
      passed: false,
      message: 'FAIL: RUNNER_URL is not set or empty.',
    };
  }

  const endpoint = `${runnerBaseUrl.replace(/\/+$/, '')}/health`;
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    const bodyText = await res.text();
    let bodyJson: Record<string, unknown> | null = null;
    try {
      bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      // not JSON
    }

    if (res.status === 200 && bodyJson?.ok === true) {
      return {
        name: checkName,
        passed: true,
        message: `PASS: Runner returned 200 OK with ok=true (${endpoint})`,
      };
    }

    return {
      name: checkName,
      passed: false,
      message: `FAIL: Runner health check failed with HTTP ${res.status}.\nEndpoint: ${endpoint}\nResponse Body:\n${bodyText || '(empty)'}`,
    };
  } catch (err) {
    return {
      name: checkName,
      passed: false,
      message: `FAIL: Could not reach runner at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function checkAppHealth(appBaseUrl: string): Promise<CheckResult> {
  const checkName = 'b. App health';
  if (!appBaseUrl) {
    return {
      name: checkName,
      passed: false,
      message:
        'FAIL: No App URL provided. Pass as argument (e.g. npm run verify:deploy https://app.vercel.app) or set AUTH_URL/APP_URL.',
    };
  }

  const endpoint = `${appBaseUrl.replace(/\/+$/, '')}/api/health`;
  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    const bodyText = await res.text();
    let bodyJson: { status?: string; checks?: Record<string, string> } | null = null;
    try {
      bodyJson = JSON.parse(bodyText) as { status?: string; checks?: Record<string, string> };
    } catch {
      // not JSON
    }

    const isHttpOk = res.status === 200;
    const isDbOk = bodyJson?.checks?.database === 'ok';
    const isRunnerOk = bodyJson?.checks?.runner === 'ok';
    const isStatusOk = bodyJson?.status === 'ok';

    if (isHttpOk && isDbOk && isRunnerOk && isStatusOk) {
      return {
        name: checkName,
        passed: true,
        message: `PASS: App health returned 200 OK with healthy database and runner (${endpoint})`,
      };
    }

    return {
      name: checkName,
      passed: false,
      message: `FAIL: App health check failed! HTTP status: ${res.status}, database: ${bodyJson?.checks?.database ?? 'unknown'}, runner: ${bodyJson?.checks?.runner ?? 'unknown'}.\nEndpoint: ${endpoint}\nResponse Body:\n${bodyText || '(empty)'}`,
    };
  } catch (err) {
    return {
      name: checkName,
      passed: false,
      message: `FAIL: Could not reach app health endpoint at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function checkMigrationStatus(directUrl: string): CheckResult {
  const checkName = 'c. Migration status';
  if (!directUrl) {
    return {
      name: checkName,
      passed: false,
      message:
        'FAIL: DIRECT_URL is not set or empty. Cannot check migration status without direct connection string.',
    };
  }

  console.log('\n--- Running: npx prisma migrate status (read-only) ---');
  const result = spawnSync('npx', ['prisma', 'migrate', 'status'], {
    env: {
      ...process.env,
      DATABASE_URL: directUrl,
      DIRECT_URL: directUrl,
    },
    encoding: 'utf8',
    shell: true,
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const combinedOutput = `${stdout}\n${stderr}`.trim();

  console.log(combinedOutput);
  console.log('--- End of prisma migrate status output ---\n');

  const isUpToDate = result.status === 0 && /up to date/i.test(combinedOutput);

  if (isUpToDate) {
    return {
      name: checkName,
      passed: true,
      message: 'PASS: Database schema is up to date (no unapplied migrations).',
    };
  }

  return {
    name: checkName,
    passed: false,
    message:
      'FAIL: Database schema is not up to date or migration status check exited with an error.\n' +
      '      NOTE: This check is read-only. If migrations are pending, back up the database and run `prisma migrate deploy` manually.',
  };
}

function checkRequiredEnvVars(): CheckResult {
  const checkName = "d. App's required env vars presence";
  const missing: string[] = [];

  console.log('\nEnvironment variable presence:');
  for (const name of REQUIRED_APP_ENV_VARS) {
    const val = process.env[name];
    const isSet = typeof val === 'string' && val.trim().length > 0;
    if (isSet) {
      console.log(`  [OK] ${name}: set`);
    } else {
      console.log(`  [MISSING] ${name}: MISSING: ${name}`);
      missing.push(name);
    }
  }

  if (missing.length === 0) {
    return {
      name: checkName,
      passed: true,
      message: `PASS: All ${REQUIRED_APP_ENV_VARS.length} required app environment variables are set and non-empty.`,
    };
  }

  return {
    name: checkName,
    passed: false,
    message: `FAIL: Missing required environment variable(s): ${missing.join(', ')}`,
  };
}

function checkConnectionStrings(databaseUrl: string, directUrl: string): CheckResult {
  const checkName = 'e. Connection string routing sanity';
  const errors: string[] = [];

  if (!databaseUrl) {
    errors.push('DATABASE_URL is missing or empty.');
  } else if (!databaseUrl.includes('-pooler')) {
    errors.push(
      'DATABASE_URL does NOT contain "-pooler". The running app requires Neon\'s pooled connection string to prevent connection pool exhaustion.',
    );
  }

  if (!directUrl) {
    errors.push('DIRECT_URL is missing or empty.');
  } else if (directUrl.includes('-pooler')) {
    errors.push(
      'DIRECT_URL contains "-pooler". Prisma migrations require Neon\'s unpooled direct connection string (no "-pooler") to avoid advisory locking issues.',
    );
  }

  if (errors.length === 0) {
    return {
      name: checkName,
      passed: true,
      message: 'PASS: DATABASE_URL contains "-pooler" and DIRECT_URL does not contain "-pooler".',
    };
  }

  return {
    name: checkName,
    passed: false,
    message: `FAIL: Connection string configuration error:\n      - ${errors.join('\n      - ')}`,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const appUrlArg = args.find((arg) => !arg.startsWith('-'));
  const appUrl = (appUrlArg || process.env.APP_URL || process.env.AUTH_URL || '').trim();
  const runnerUrl = (process.env.RUNNER_URL || '').trim();
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  const directUrl = (process.env.DIRECT_URL || '').trim();

  console.log('=================================================================');
  console.log('            DEPLOYMENT VERIFICATION CHECKS');
  console.log('=================================================================');
  console.log(`Target App URL   : ${appUrl || '(not provided)'}`);
  console.log(`Target Runner URL: ${runnerUrl || '(not set)'}`);
  console.log('Mode             : Read-only verification (no state changes)\n');

  const results: CheckResult[] = [];

  // Check a: Runner health
  console.log('[Check 1/5] Checking Runner Health...');
  const runnerResult = await checkRunnerHealth(runnerUrl);
  results.push(runnerResult);
  console.log(runnerResult.message + '\n');

  // Check b: App health
  console.log('[Check 2/5] Checking App Health...');
  const appResult = await checkAppHealth(appUrl);
  results.push(appResult);
  console.log(appResult.message + '\n');

  // Check c: Migration status
  console.log('[Check 3/5] Checking Prisma Migration Status...');
  const migrationResult = checkMigrationStatus(directUrl);
  results.push(migrationResult);
  console.log(migrationResult.message + '\n');

  // Check d: Env var presence
  console.log('[Check 4/5] Checking Required App Environment Variables...');
  const envResult = checkRequiredEnvVars();
  results.push(envResult);
  console.log('\n' + envResult.message + '\n');

  // Check e: Connection string sanity
  console.log('[Check 5/5] Checking Connection String Routing (-pooler)...');
  const connResult = checkConnectionStrings(databaseUrl, directUrl);
  results.push(connResult);
  console.log(connResult.message + '\n');

  // Summary
  console.log('=================================================================');
  console.log('                     VERIFICATION SUMMARY');
  console.log('=================================================================');
  let passCount = 0;
  for (const r of results) {
    const mark = r.passed ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${r.name}`);
    if (r.passed) passCount++;
  }
  console.log('-----------------------------------------------------------------');
  console.log(
    `Total checks: ${results.length} | Passed: ${passCount} | Failed: ${results.length - passCount}`,
  );
  console.log('=================================================================');

  if (passCount === results.length) {
    console.log('\nAll deployment verification checks PASSED.\n');
    process.exit(0);
  } else {
    console.error('\nOne or more deployment verification checks FAILED. Review output above.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error during verification:', err);
  process.exit(1);
});
