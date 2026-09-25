import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/**
 * scripts/seed-admins.ts run as the operator would run it (a real process),
 * against the local test database only. A pre-seeded administrator keeps
 * ADMIN at their first Google sign-in.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const isLocal = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(DATABASE_URL ?? '').hostname);
  } catch {
    return false;
  }
})();
const describeDb = DATABASE_URL && isLocal ? describe : describe.skip;
const ROOT = path.resolve(__dirname, '../..');

function seed(args: string[], databaseUrl = DATABASE_URL!) {
  const res = spawnSync('npx', ['tsx', 'scripts/seed-admins.ts', ...args], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

describeDb('seed-admins script (requires a local DATABASE_URL)', { timeout: 180_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  const stamp = Date.now();
  const fresh = `it-sa-new-${stamp}@example.test`;
  const student = `it-sa-student-${stamp}@example.test`;

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    await prisma.user.create({ data: { email: student, role: 'STUDENT', active: false } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.auditLog.deleteMany({
      where: { metadata: { path: ['email'], string_contains: `-${stamp}@` } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [fresh, student] } } });
    await prisma.$disconnect();
  });

  it('a dry run changes nothing', async () => {
    const res = seed(['--dry-run', fresh, student]);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/would create/);
    expect(await prisma.user.findUnique({ where: { email: fresh } })).toBeNull();
  });

  it('creates missing admins, promotes (and reactivates) a student, and audits both', async () => {
    const res = seed([fresh, student]);
    expect(res.code).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { email: fresh } })).toMatchObject({
      role: 'ADMIN',
      active: true,
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { email: student } })).toMatchObject({
      role: 'ADMIN',
      active: true,
    });
    const audits = await prisma.auditLog.findMany({
      where: {
        action: { in: ['user.admin_seeded', 'user.role_changed'] },
        metadata: { path: ['email'], string_contains: `-${stamp}@` },
      },
    });
    expect(audits.map((a) => a.action).sort()).toEqual(['user.admin_seeded', 'user.role_changed']);
  });

  it('is idempotent', () => {
    const res = seed([fresh, student]);
    expect(res.code).toBe(0);
    expect(res.out.match(/unchanged/g)).toHaveLength(2);
  });

  it('a pre-seeded administrator keeps ADMIN at the first Google sign-in', async () => {
    const accounts = await import('@/server/services/accounts');
    const signIn = await accounts.acceptGoogleSignIn({
      email: fresh,
      email_verified: true,
      name: 'New Admin',
    });
    expect(signIn).toMatchObject({ ok: true, user: { role: 'ADMIN' } });
  });

  it('refuses invalid addresses, and a non-local database without --yes', () => {
    expect(seed(['not-an-email']).code).toBe(1);
    const remote = seed([fresh], 'postgresql://u:p@db.example.com:5432/x');
    expect(remote.code).toBe(1);
    expect(remote.out).toMatch(/re-run with --yes/);
  });
});
