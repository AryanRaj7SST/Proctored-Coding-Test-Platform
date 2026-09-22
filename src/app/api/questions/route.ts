import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { created, handler, ok, readJson } from '@/lib/http';
import { paginationInput, parseOrThrow, questionCreateInput } from '@/lib/validation';
import { createQuestion } from '@/server/services/questions';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request): Promise<NextResponse> => {
  await requireAdmin();
  const url = new URL(req.url);
  const { page, pageSize, q } = parseOrThrow(paginationInput, Object.fromEntries(url.searchParams));

  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { slug: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [total, items] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        slug: true,
        difficulty: true,
        type: true,
        points: true,
        active: true,
        version: true,
        validation: true,
        validatedAt: true,
        updatedAt: true,
        _count: { select: { tests: true } },
      },
    }),
  ]);

  return ok({ items, total, page, pageSize });
});

export const POST = handler(async (req: Request): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const body = parseOrThrow(questionCreateInput, await readJson(req));
  const question = await createQuestion(body, admin.id);
  await recordAudit({
    userId: admin.id,
    action: 'question.created',
    entity: 'Question',
    entityId: question.id,
    metadata: { title: question.title },
  });
  return created(question);
});
