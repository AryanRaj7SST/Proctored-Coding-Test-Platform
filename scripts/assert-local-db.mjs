#!/usr/bin/env node
/**
 * Refuse to continue unless every database Prisma would touch is a local,
 * disposable PostgreSQL. Guards every destructive command (migrate reset, the
 * stack validator's deploy + seed) against a shared or remote database.
 *
 *   node scripts/assert-local-db.mjs && prisma migrate reset --force
 *
 * Prisma migrations run against DIRECT_URL (schema.prisma `directUrl`) and
 * queries against DATABASE_URL, each taken from the shell first and `.env`
 * second -- so both are checked, resolved the same way.
 */
import { readFileSync } from 'node:fs';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function fromDotenv(name) {
  try {
    const text = readFileSync('.env', 'utf8');
    const line = text.split(/\r?\n/).find((l) => new RegExp(`^\\s*(export\\s+)?${name}\\s*=`).test(l));
    if (!line) return undefined;
    return line
      .slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
  } catch {
    return undefined;
  }
}

function hostOf(name) {
  const raw = process.env[name] ?? fromDotenv(name);
  if (raw === undefined || raw === '') return null;
  try {
    return new URL(raw).hostname;
  } catch {
    console.error(`assert-local-db: ${name} is not a valid URL.`);
    process.exit(1);
  }
}

const databaseHost = hostOf('DATABASE_URL');
if (databaseHost === null) {
  console.error('assert-local-db: DATABASE_URL is missing or not a valid URL.');
  process.exit(1);
}
// Unset DIRECT_URL is safe here: Prisma then refuses to migrate on its own.
const directHost = hostOf('DIRECT_URL');

for (const [name, host] of [
  ['DATABASE_URL', databaseHost],
  ['DIRECT_URL', directHost],
]) {
  if (host !== null && !LOCAL_HOSTS.has(host)) {
    console.error(
      `assert-local-db: refusing to run a destructive database command: ${name} points at "${host}".\n` +
        'Point DATABASE_URL and DIRECT_URL at a local disposable database (localhost) for this command.',
    );
    process.exit(1);
  }
}

console.log(`assert-local-db: target is local (${databaseHost}).`);
