import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/proctor-events at the HTTP boundary (B4). Authentication and body
 * validation both happen before any database access, so this runs without a
 * database. The DB-backed behaviour (persistence, ownership, ended sittings)
 * is covered in tests/integration/grading-lifecycle.test.ts.
 */
const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }));

vi.mock('@/lib/auth', () => ({ auth: async () => session.current }));

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/proctor-events/route');
  return POST(
    new Request('http://localhost/api/proctor-events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
};

describe('POST /api/proctor-events', () => {
  beforeEach(() => {
    session.current = null;
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await post({ examId: 'c0000000000000000000000000', type: 'PAGE_RELOAD' });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects an unknown event type with 400', async () => {
    session.current = { user: { id: 'u1', email: 'student@example.test', role: 'STUDENT' } };
    const res = await post({ examId: 'c0000000000000000000000000', type: 'TOTALLY_FAKE' });
    expect(res.status).toBe(400);
  });

  it('rejects server-only event types sent by a client', async () => {
    session.current = { user: { id: 'u1', email: 'student@example.test', role: 'STUDENT' } };
    const res = await post({ examId: 'c0000000000000000000000000', type: 'EXAM_SUBMITTED' });
    expect(res.status).toBe(400);
  });
});
