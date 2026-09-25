import { describe, it, expect, vi } from 'vitest';

// The pure policy functions never touch auth or the database.
vi.mock('@/lib/auth', () => ({ auth: async () => null }));

const { accessFromAssignment, isTestVisibleToStudents, studentCanAccessTest } = await import('@/lib/authz');

const test = (over: Partial<Parameters<typeof studentCanAccessTest>[0]> = {}) => ({
  active: true,
  status: 'PUBLISHED' as const,
  accessMode: 'ASSIGNED_USERS_ONLY' as const,
  ...over,
});

describe('test visibility', () => {
  it('hides drafts, archived and deactivated tests from students', () => {
    expect(isTestVisibleToStudents(test())).toBe(true);
    expect(isTestVisibleToStudents(test({ status: 'ENDED' }))).toBe(true);
    expect(isTestVisibleToStudents(test({ status: 'DRAFT' }))).toBe(false);
    expect(isTestVisibleToStudents(test({ status: 'ARCHIVED' }))).toBe(false);
    expect(isTestVisibleToStudents(test({ active: false }))).toBe(false);
  });
});

const assigned = { assigned: true, revoked: false };
const none = { assigned: false, revoked: false };
const revoked = { assigned: false, revoked: true };

describe('studentCanAccessTest', () => {
  it('ASSIGNED_USERS_ONLY admits assigned students only', () => {
    expect(studentCanAccessTest(test(), assigned)).toBe(true);
    expect(studentCanAccessTest(test(), none)).toBe(false);
  });

  it('ANY_AUTHENTICATED_USER admits every signed-in student', () => {
    expect(studentCanAccessTest(test({ accessMode: 'ANY_AUTHENTICATED_USER' }), none)).toBe(true);
  });

  it('a revoked student is refused in either access mode', () => {
    expect(studentCanAccessTest(test({ accessMode: 'ANY_AUTHENTICATED_USER' }), revoked)).toBe(false);
    expect(studentCanAccessTest(test(), revoked)).toBe(false);
  });

  it('an open test is still closed while it is a draft or archived', () => {
    const open = { accessMode: 'ANY_AUTHENTICATED_USER' as const };
    expect(studentCanAccessTest(test({ ...open, status: 'DRAFT' }), assigned)).toBe(false);
    expect(studentCanAccessTest(test({ ...open, status: 'ARCHIVED' }), assigned)).toBe(false);
  });
});

describe('accessFromAssignment', () => {
  it('no row: not assigned, not revoked; a live row assigns; a revoked row only revokes', () => {
    expect(accessFromAssignment(null)).toEqual(none);
    expect(accessFromAssignment({ revokedAt: null })).toEqual(assigned);
    expect(accessFromAssignment({ revokedAt: new Date() })).toEqual(revoked);
  });
});
