/* eslint-disable no-console */
/**
 * Contest Preflight Verification Script
 *
 * Verifies critical production security invariants before running a graded contest:
 *  1. Upstash Redis rate limiting is configured (or explicitly overridden)
 *  2. OPEN_ACCESS_EMAILS is empty (no unproctored/early-start backdoor accounts)
 *  3. Runner /auth-check succeeds (HMAC auth verified)
 *  4. All active contest exams are ASSIGNED_USERS_ONLY, have maxViolations > 0, and have assigned students
 *
 * Usage:
 *   npm run contest:preflight
 *   npx tsx scripts/contest-preflight.ts
 */

import { existsSync } from 'node:fs';
import { runContestPreflight } from '../src/server/contest-preflight';

// Attempt to load .env if process.loadEnvFile is available
try {
  if (
    typeof (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile === 'function' &&
    existsSync('.env')
  ) {
    (process as unknown as { loadEnvFile: (path?: string) => void }).loadEnvFile('.env');
  }
} catch {
  // Ignore
}

async function main(): Promise<void> {
  console.log('Running contest preflight security verification...\n');

  const result = await runContestPreflight();

  if (result.ok) {
    console.log('✅ ALL PREFLIGHT CHECKS PASSED. Contest environment is hardened and ready.\n');
    process.exit(0);
  }

  console.error('❌ CONTEST PREFLIGHT FAILED:');
  for (const err of result.errors) {
    console.error(`  - ${err}`);
  }
  console.error('\nPlease fix the issues above before starting the contest.\n');
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal preflight error:', err);
  process.exit(1);
});
