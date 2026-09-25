import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * The authentication model end to end against a real database:
 *
 *   Google profile -> signIn callback -> users row -> jwt callback -> session
 *   callback -> getSessionUser / requireAdmin
 *
 * Google authenticates; the users table decides the role. There is no invite
 * list: any Google-verified address signs in, new accounts are STUDENTs, and
 * nothing from the profile or a stale/forged token claim can raise a role.
 */

// requireAdmin() reads the session through lib/auth; hand it whatever the callbacks produced.
const current = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('@/lib/auth', () => ({ auth: async () => current.session }));

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('auth flow (requires DATABASE_URL)', { timeout: 60_000 }, () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let callbacks: typeof import('@/lib/auth-callbacks').authCallbacks;
  let authz: typeof import('@/lib/authz');

  const stamp = Date.now();
  const addr = (label: string) => `it-auth-${label}-${stamp}@example.test`;
  const emails = {
    fresh: addr('fresh'),
    unknown: `any-other-google-account-${stamp}@gmail.example.test`,
    student: addr('student'),
    admin: addr('admin'),
    disabled: addr('disabled'),
    rosterAdmin: addr('roster-admin'),
    claimsAdmin: addr('claims-admin'),
    unverified: addr('unverified'),
    pending: addr('pending'),
  };
  const all = Object.values(emails);
  const examId = `it-auth-exam-${stamp}`;

  const google = { provider: 'google', type: 'oidc', providerAccountId: 'g' };
  const signInWith = (profile: Record<string, unknown>, account: unknown = google) =>
    callbacks.signIn({ account, profile, user: { email: profile.email } } as never);
  const verified = (email: string, extra: Record<string, unknown> = {}) =>
    signInWith({
      email,
      email_verified: true,
      name: 'Google Name',
      picture: 'https://example.test/p.png',
      ...extra,
    });

  /** The full Auth.js chain for a token that carries `claims`, as the browser would present it. */
  async function sessionFor(email: string, claims: Record<string, unknown> = {}) {
    const token = await callbacks.jwt({ token: { email, ...claims } } as never);
    const session = await callbacks.session({
      session: { user: { email, name: null }, expires: new Date(Date.now() + 3600_000).toISOString() },
      token,
    } as never);
    return { token, session: session as { user: { id: string; role: string; batch: string | null } } };
  }

  const user = (email: string) => prisma.user.findUnique({ where: { email } });

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    callbacks = (await import('@/lib/auth-callbacks')).authCallbacks;
    authz = await import('@/lib/authz');

    await prisma.user.create({
      data: { email: emails.student, role: 'STUDENT', name: 'Old Name', batch: 'B-OLD' },
    });
    await prisma.user.create({ data: { email: emails.admin, role: 'ADMIN' } });
    await prisma.user.create({ data: { email: emails.disabled, role: 'STUDENT', active: false } });
    // A roster entry pre-registers a batch; it has no say in sign-in or role.
    await prisma.allowedEmail.create({
      data: { email: emails.rosterAdmin, batch: 'B-ROSTER' },
    });
    await prisma.exam.create({ data: { id: examId, title: 'Auth flow' } });
    await prisma.examAssignment.create({ data: { examId, email: emails.pending } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.exam.deleteMany({ where: { id: examId } });
    await prisma.allowedEmail.deleteMany({ where: { email: { in: all } } });
    await prisma.user.deleteMany({ where: { email: { in: all } } });
    await prisma.$disconnect();
  });

  it('first sign-in: a new Google user is created as an active STUDENT, no roster row needed', async () => {
    expect(await prisma.allowedEmail.count({ where: { email: emails.fresh } })).toBe(0);
    expect(await verified(emails.fresh)).toBe(true);
    expect(await user(emails.fresh)).toMatchObject({
      role: 'STUDENT',
      active: true,
      name: 'Google Name',
      image: 'https://example.test/p.png',
    });
    expect((await user(emails.fresh))?.lastLogin).toBeInstanceOf(Date);
  });

  it('an unknown Google account is not rejected by the application', async () => {
    expect(await user(emails.unknown)).toBeNull();
    expect(await verified(emails.unknown)).toBe(true);
    const { session } = await sessionFor(emails.unknown);
    expect(session.user.role).toBe('STUDENT');
    expect(session.user.id).toBe((await user(emails.unknown))!.id);
  });

  it('an existing student stays a STUDENT; name refreshes, batch is kept', async () => {
    expect(await verified(emails.student)).toBe(true);
    expect(await user(emails.student)).toMatchObject({
      role: 'STUDENT',
      active: true,
      name: 'Google Name',
      batch: 'B-OLD',
    });
  });

  it('an existing ADMIN stays ADMIN and gets an admin session', async () => {
    expect(await verified(emails.admin)).toBe(true);
    expect((await user(emails.admin))?.role).toBe('ADMIN');
    const { session } = await sessionFor(emails.admin);
    expect(session.user.role).toBe('ADMIN');
    current.session = session;
    await expect(authz.requireAdmin()).resolves.toMatchObject({ email: emails.admin, role: 'ADMIN' });
  });

  it('a roster entry only supplies a batch: the newcomer is still a STUDENT', async () => {
    expect(await verified(emails.rosterAdmin)).toBe(true);
    expect(await user(emails.rosterAdmin)).toMatchObject({ role: 'STUDENT', batch: 'B-ROSTER' });
  });

  it('role-looking fields in the Google profile are ignored', async () => {
    expect(await verified(emails.claimsAdmin, { role: 'ADMIN', roles: ['ADMIN'], hd: 'example.test' })).toBe(
      true,
    );
    expect((await user(emails.claimsAdmin))?.role).toBe('STUDENT');
  });

  it('a deactivated account is refused and stays deactivated (signing in never re-enables it)', async () => {
    expect(await verified(emails.disabled)).toBe('/login?error=AccountDisabled');
    expect(await user(emails.disabled)).toMatchObject({ active: false, lastLogin: null });
    const { token, session } = await sessionFor(emails.disabled, { userId: 'stale', role: 'STUDENT' });
    expect(token).toMatchObject({ userId: undefined, role: undefined });
    expect(session.user.id).toBe('');
    current.session = session;
    await expect(authz.getSessionUser()).resolves.toBeNull();
    await expect(authz.requireAuth()).rejects.toMatchObject({ status: 401 });
  });

  it('only Google-verified identities are accepted', async () => {
    expect(await signInWith({ email: emails.unverified, email_verified: false })).toBe(
      '/login?error=EmailNotVerified',
    );
    expect(await signInWith({ email: emails.unverified })).toBe('/login?error=EmailNotVerified');
    expect(await signInWith({ email: 'not-an-email', email_verified: true })).toBe(
      '/login?error=AccessDenied',
    );
    expect(await signInWith({ email_verified: true })).toBe('/login?error=AccessDenied');
    expect(await signInWith({ email: emails.unverified, email_verified: true }, { provider: 'github' })).toBe(
      false,
    );
    expect(await user(emails.unverified)).toBeNull();
  });

  it('links tests assigned to the address before the first sign-in', async () => {
    expect(await verified(emails.pending)).toBe(true);
    const me = await user(emails.pending);
    const assignment = await prisma.examAssignment.findFirstOrThrow({
      where: { examId, email: emails.pending },
    });
    expect(assignment.userId).toBe(me!.id);
  });

  it('the session role is the database role: a token claiming ADMIN cannot escalate a student', async () => {
    const student = (await user(emails.student))!;
    const { token, session } = await sessionFor(emails.student, { role: 'ADMIN', userId: 'someone-else' });
    expect(token).toMatchObject({ role: 'STUDENT', userId: student.id });
    expect(session.user).toMatchObject({ id: student.id, role: 'STUDENT' });
    current.session = session;
    await expect(authz.requireAdmin()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('a role change by an administrator applies on the next token refresh', async () => {
    const users = await import('@/server/services/users');
    const admin = (await user(emails.admin))!;
    const student = (await user(emails.student))!;
    await users.updateUserAccess(student.id, { role: 'ADMIN' }, admin);
    expect((await sessionFor(emails.student)).session.user.role).toBe('ADMIN');
    await users.updateUserAccess(student.id, { role: 'STUDENT' }, admin);
    expect((await sessionFor(emails.student)).session.user.role).toBe('STUDENT');
    // Signing in again leaves the administrator-set role alone.
    expect(await verified(emails.student)).toBe(true);
    expect((await user(emails.student))?.role).toBe('STUDENT');
  });
});
