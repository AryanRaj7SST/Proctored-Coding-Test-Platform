import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Role and account management on the user account: the only way a role
 * changes, never a lock-out, and the student roster has no say in either.
 *
 * To isolate the "last administrator" rule this suite briefly deactivates the
 * other administrators, so it only ever runs against a local, disposable database.
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

describeDb('user roles and access (requires a local DATABASE_URL)', { timeout: 60_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let users: typeof import('@/server/services/users');
  let accounts: typeof import('@/server/services/accounts');
  let roster: typeof import('@/server/services/allowed-emails');
  const stamp = Date.now();
  const me = `it-us-me-${stamp}@example.test`;
  const other = `it-us-other-${stamp}@example.test`;
  const student = `it-us-student-${stamp}@example.test`;
  const all = [me, other, student];
  const ids: Record<string, string> = {};
  let adminsBefore: string[] = [];

  const byEmail = (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    users = await import('@/server/services/users');
    accounts = await import('@/server/services/accounts');
    roster = await import('@/server/services/allowed-emails');
    // Isolate the "last admin" rule from whatever else is in the database.
    adminsBefore = (
      await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } })
    ).map((u) => u.id);
    await prisma.user.updateMany({ where: { id: { in: adminsBefore } }, data: { active: false } });
    ids.me = (await prisma.user.create({ data: { email: me, role: 'ADMIN' } })).id;
    ids.student = (await prisma.user.create({ data: { email: student, role: 'STUDENT' } })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.allowedEmail.deleteMany({ where: { email: { in: all } } });
    await prisma.user.deleteMany({ where: { email: { in: all } } });
    await prisma.user.updateMany({ where: { id: { in: adminsBefore } }, data: { active: true } });
    await prisma.$disconnect();
  });

  it('an admin cannot demote or deactivate themselves', async () => {
    await expect(users.updateUserAccess(ids.me!, { role: 'STUDENT' }, { id: ids.me! })).rejects.toThrow(
      /your own/,
    );
    await expect(users.updateUserAccess(ids.me!, { active: false }, { id: ids.me! })).rejects.toThrow(
      /your own/,
    );
    expect(await byEmail(me)).toMatchObject({ role: 'ADMIN', active: true });
  });

  it('the last active administrator cannot be demoted or deactivated by anyone', async () => {
    await expect(users.updateUserAccess(ids.me!, { role: 'STUDENT' }, { id: 'someone' })).rejects.toThrow(
      /At least one/,
    );
    await expect(users.updateUserAccess(ids.me!, { active: false }, { id: 'someone' })).rejects.toThrow(
      /At least one/,
    );
  });

  it('promotes a student; the new role is what the next token refresh sees', async () => {
    const { before, after } = await users.updateUserAccess(ids.student!, { role: 'ADMIN' }, { id: ids.me! });
    expect([before.role, after.role]).toEqual(['STUDENT', 'ADMIN']);
    expect((await accounts.accountForToken(student))?.role).toBe('ADMIN');
    await users.updateUserAccess(ids.student!, { role: 'STUDENT' }, { id: ids.me! });
    expect((await accounts.accountForToken(student))?.role).toBe('STUDENT');
  });

  it('with a second admin, one admin may demote the other', async () => {
    ids.other = (await prisma.user.create({ data: { email: other, role: 'ADMIN' } })).id;
    const { after } = await users.updateUserAccess(ids.other, { role: 'STUDENT' }, { id: ids.me! });
    expect(after.role).toBe('STUDENT');
  });

  it('deactivation ends access on the next refresh and blocks sign-in; reactivation restores both', async () => {
    await users.updateUserAccess(ids.student!, { active: false }, { id: ids.me! });
    expect(await accounts.accountForToken(student)).toBeNull();
    expect(await accounts.acceptGoogleSignIn({ email: student, email_verified: true })).toMatchObject({
      ok: false,
      reason: 'AccountDisabled',
    });
    await users.updateUserAccess(ids.student!, { active: true }, { id: ids.me! });
    expect(await accounts.accountForToken(student)).toMatchObject({ role: 'STUDENT' });
    expect(await accounts.acceptGoogleSignIn({ email: student, email_verified: true })).toMatchObject({
      ok: true,
    });
  });

  it('an unknown user id is a not-found error', async () => {
    await expect(users.updateUserAccess('missing-user', { role: 'ADMIN' }, { id: ids.me! })).rejects.toThrow(
      /not found/i,
    );
  });

  it('the roster never changes an account: removing an entry does not deactivate or demote', async () => {
    const entry = await roster.addAllowedEmail({ email: student, batch: 'R1' });
    await roster.updateAllowedEmail(entry.id, { batch: 'R2' });
    expect(await byEmail(student)).toMatchObject({ batch: 'R2', role: 'STUDENT', active: true });
    await roster.removeAllowedEmail(entry.id);
    expect(await byEmail(student)).toMatchObject({ role: 'STUDENT', active: true });
  });

  it('a roster import cannot grant ADMIN', async () => {
    const summary = await roster.importAllowedEmails(`email,role,batch\n${student},ADMIN,X\n${other},,Y\n`);
    expect(summary.created + summary.updated).toBe(1);
    expect(summary.errors[0]?.message).toMatch(/cannot grant administrator access/i);
    expect((await byEmail(student)).role).toBe('STUDENT');
    expect(await prisma.allowedEmail.findUnique({ where: { email: student } })).toBeNull();
  });
});
