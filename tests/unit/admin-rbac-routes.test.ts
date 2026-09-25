import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Administrator-only routes at the HTTP boundary. The session is whatever
 * lib/auth returns; requireAdmin() and body validation are the real ones, and
 * both run before any database access, so this needs no database. What a
 * signed-in student's session contains (always the database role) is covered
 * end to end in tests/integration/auth-flow.test.ts.
 */
const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));
vi.mock('@/lib/auth', () => ({ auth: async () => session.current }));

const student = { id: 'u-student', email: 'student@example.test', role: 'STUDENT' };
const admin = { id: 'u-admin', email: 'admin@example.test', role: 'ADMIN' };
const id = 'c0000000000000000000000000';
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

const json = (method: string, body?: unknown) =>
  new Request('http://localhost/api/x', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

type Call = () => Promise<Response>;

const adminCalls: Record<string, Call> = {
  'PATCH /api/users/[id] (promote to ADMIN)': async () =>
    (await import('@/app/api/users/[id]/route')).PATCH(
      json('PATCH', { role: 'ADMIN' }),
      ctx({ id: student.id }),
    ),
  'GET /api/users': async () => (await import('@/app/api/users/route')).GET(json('GET')),
  'POST /api/allowed-emails': async () =>
    (await import('@/app/api/allowed-emails/route')).POST(json('POST', { email: 'x@example.test' })),
  'PATCH /api/allowed-emails/[id]': async () =>
    (await import('@/app/api/allowed-emails/[id]/route')).PATCH(json('PATCH', { batch: 'B' }), ctx({ id })),
  'POST /api/exams/[id]/assignments': async () =>
    (await import('@/app/api/exams/[id]/assignments/route')).POST(
      json('POST', { allStudents: true }),
      ctx({ id }),
    ),
  'GET /api/admin/results': async () => (await import('@/app/api/admin/results/route')).GET(json('GET')),
  'GET /api/admin/audit-logs': async () =>
    (await import('@/app/api/admin/audit-logs/route')).GET(json('GET')),
  'POST /api/questions': async () => (await import('@/app/api/questions/route')).POST(json('POST', {})),
  'PATCH /api/exams/[id]/assignments (revoke access)': async () =>
    (await import('@/app/api/exams/[id]/assignments/route')).PATCH(
      json('PATCH', { email: 'other@example.test', revoked: true }),
      ctx({ id }),
    ),
  'PATCH /api/admin/attempts/[id] (feedback)': async () =>
    (await import('@/app/api/admin/attempts/[id]/route')).PATCH(
      json('PATCH', { feedback: 'x' }),
      ctx({ id }),
    ),
};

describe('administrator-only routes', () => {
  beforeEach(() => {
    session.current = null;
  });

  for (const [name, call] of Object.entries(adminCalls)) {
    it(`${name}: 401 signed out, 403 for a student`, async () => {
      const anonymous = await call();
      expect(anonymous.status).toBe(401);
      expect(await anonymous.json()).toMatchObject({ code: 'UNAUTHORIZED' });

      session.current = { user: student };
      const res = await call();
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: 'FORBIDDEN' });
    });
  }

  it('a session whose role is anything but exactly ADMIN is treated as a student', async () => {
    for (const role of ['admin', 'Admin', 'SUPERADMIN', 'ADMIN ', undefined, ['ADMIN']]) {
      session.current = { user: { ...student, role } };
      const res = await adminCalls['PATCH /api/users/[id] (promote to ADMIN)']!();
      expect(res.status).toBe(403);
    }
  });

  it('a signed-in account without an id (deactivated) is signed out, not a student', async () => {
    session.current = { user: { ...student, id: '' } };
    expect((await adminCalls['GET /api/users']!()).status).toBe(401);
  });
});

describe('role fields in request bodies are rejected, never silently applied', () => {
  beforeEach(() => {
    session.current = { user: admin };
  });

  it('PATCH /api/users/[id] accepts only role and active', async () => {
    const { PATCH } = await import('@/app/api/users/[id]/route');
    const extra = await PATCH(json('PATCH', { role: 'STUDENT', email: 'other@example.test' }), ctx({ id }));
    expect(extra.status).toBe(400);
    expect(await extra.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await PATCH(json('PATCH', {}), ctx({ id }))).status).toBe(400);
    expect((await PATCH(json('PATCH', { role: 'OWNER' }), ctx({ id }))).status).toBe(400);
  });

  it('the student roster has no role: a role in the body is a 400', async () => {
    const create = (await import('@/app/api/allowed-emails/route')).POST;
    const res = await create(json('POST', { email: 'new@example.test', role: 'ADMIN' }));
    expect(res.status).toBe(400);
    const update = (await import('@/app/api/allowed-emails/[id]/route')).PATCH;
    expect((await update(json('PATCH', { role: 'ADMIN' }), ctx({ id }))).status).toBe(400);
    expect((await update(json('PATCH', { active: false }), ctx({ id }))).status).toBe(400);
  });

  it('revoking test access takes exactly { email, revoked }', async () => {
    const { PATCH } = await import('@/app/api/exams/[id]/assignments/route');
    const extra = await PATCH(
      json('PATCH', { email: 'a@example.test', revoked: true, role: 'ADMIN' }),
      ctx({ id }),
    );
    expect(extra.status).toBe(400);
    expect(
      (await PATCH(json('PATCH', { email: 'a@example.test', revoked: 'yes' }), ctx({ id }))).status,
    ).toBe(400);
  });

  it('reviewer feedback never carries a score: an extra field is a 400', async () => {
    const { PATCH } = await import('@/app/api/admin/attempts/[id]/route');
    const res = await PATCH(json('PATCH', { feedback: 'Well done', score: 10 }), ctx({ id }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
