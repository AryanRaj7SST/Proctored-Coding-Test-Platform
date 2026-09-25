import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';

/**
 * Server-side helpers for the test pages. Callers must have run
 * requireAdmin() first (the admin layout also gates every /admin route).
 */

/**
 * Serialise a service result exactly as the JSON API would (Dates become ISO
 * strings), so client components share one set of types with API responses.
 */
export function asJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Run a service read; a missing test (AppError 404) renders the not-found page. */
export async function orNotFound<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
}

/** Categories and tags of published questions, for the question picker's filters. */
export async function loadQuestionFacets(): Promise<{ categories: string[]; tags: string[] }> {
  const rows = await prisma.question.findMany({
    where: { status: 'PUBLISHED' },
    select: { category: true, tags: true },
  });
  const categories = new Set<string>();
  const tags = new Set<string>();
  for (const row of rows) {
    if (row.category) categories.add(row.category);
    row.tags.forEach((t) => tags.add(t));
  }
  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return { categories: sort(categories), tags: sort(tags) };
}

/**
 * Batches students belong to (roster and signed-in accounts), plus how many
 * people "all students" covers: active student accounts and roster addresses
 * that have not signed in yet.
 */
export async function loadStudentScope(): Promise<{ batches: string[]; studentCount: number }> {
  const [roster, users, counted] = await Promise.all([
    prisma.allowedEmail.findMany({
      where: { batch: { not: null } },
      distinct: ['batch'],
      select: { batch: true },
    }),
    prisma.user.findMany({
      where: { role: 'STUDENT', active: true, batch: { not: null } },
      distinct: ['batch'],
      select: { batch: true },
    }),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM (
        SELECT email FROM users WHERE role = 'STUDENT' AND active = true
        UNION
        SELECT a.email FROM allowed_emails a
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = a.email)
      ) scope`,
  ]);
  const batches = new Set<string>();
  [...roster, ...users].forEach((r) => r.batch && batches.add(r.batch));
  const studentCount = Number(counted[0]?.count ?? 0);
  return { batches: [...batches].sort((a, b) => a.localeCompare(b)), studentCount };
}
