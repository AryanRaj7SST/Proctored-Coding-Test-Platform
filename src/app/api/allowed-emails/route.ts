import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { created, handler, ok, readJson } from '@/lib/http';
import { allowedEmailCreateInput, paginationInput, parseOrThrow } from '@/lib/validation';
import { addAllowedEmail, exportAllowedEmailsCsv } from '@/server/services/allowed-emails';
import { recordAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request): Promise<NextResponse> => {
  await requireAdmin();
  const url = new URL(req.url);

  if (url.searchParams.get('format') === 'csv') {
    const csv = await exportAllowedEmailsCsv();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="student-roster.csv"',
      },
    });
  }

  const { page, pageSize, q } = parseOrThrow(paginationInput, Object.fromEntries(url.searchParams));
  const batch = url.searchParams.get('batch') ?? undefined;
  const where = {
    ...(q ? { email: { contains: q.toLowerCase() } } : {}),
    ...(batch ? { batch } : {}),
  };

  const [total, items, batches] = await Promise.all([
    prisma.allowedEmail.count({ where }),
    prisma.allowedEmail.findMany({
      where,
      orderBy: [{ batch: 'asc' }, { email: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.allowedEmail.findMany({
      where: { batch: { not: null } },
      distinct: ['batch'],
      select: { batch: true },
      orderBy: { batch: 'asc' },
    }),
  ]);

  return ok({
    items,
    total,
    page,
    pageSize,
    batches: batches.map((b) => b.batch).filter((b): b is string => Boolean(b)),
  });
});

export const POST = handler(async (req: Request): Promise<NextResponse> => {
  const admin = await requireAdmin();
  const body = parseOrThrow(allowedEmailCreateInput, await readJson(req, 8192));
  const entry = await addAllowedEmail(body);
  await recordAudit({
    userId: admin.id,
    action: 'allowlist.added',
    entity: 'AllowedEmail',
    entityId: entry.id,
    metadata: { email: entry.email, batch: entry.batch },
  });
  return created(entry);
});
