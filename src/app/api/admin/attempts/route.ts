import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { paginationInput, parseOrThrow } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request): Promise<NextResponse> => {
  await requireAdmin();
  const url = new URL(req.url);
  const { page, pageSize, q } = parseOrThrow(paginationInput, Object.fromEntries(url.searchParams));
  const examId = url.searchParams.get('examId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;

  const where = {
    ...(examId ? { examId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(q
      ? {
          user: {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        score: true,
        maxScore: true,
        startedAt: true,
        submittedAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, email: true, batch: true } },
        exam: { select: { id: true, title: true } },
        question: { select: { id: true, title: true } },
      },
    }),
  ]);

  return ok({ items, total, page, pageSize });
});
