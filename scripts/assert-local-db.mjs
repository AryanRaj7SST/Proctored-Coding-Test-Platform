#!/usr/bin/env node
/**
 * Refuse to continue unless DATABASE_URL points at a local, disposable
 * PostgreSQL. Guards every destructive command (migrate reset, the stack
 * validator's deploy + seed) against a shared or remote database.
 *
 *   node scripts/assert-local-db.mjs && prisma migrate reset --force
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const raw = process.env.DATABASE_URL ?? '';
let host = '';
try {
  host = new URL(raw).hostname;
} catch {
  console.error('assert-local-db: DATABASE_URL is missing or not a valid URL.');
  process.exit(1);
}

if (!LOCAL_HOSTS.has(host)) {
  console.error(
    `assert-local-db: refusing to run a destructive database command against "${host}".\n` +
      'Point DATABASE_URL at a local disposable database (localhost) for this command.',
  );
  process.exit(1);
}

console.log(`assert-local-db: target is local (${host}).`);
