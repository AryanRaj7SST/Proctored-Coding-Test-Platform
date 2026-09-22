import { NextResponse } from 'next/server';
import type { Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { handler, ok } from '@/lib/http';
import { paginationInput, parseOrThrow } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Registered users (people who have actually signed in at least once).
 * Returns the minimum an admin needs -- no tokens, no session material.
 */
export const GET = handler(async (req: Request): Promise<NextResponse> => {
  await requireAdmin();
  const url = new URL(req.url);
  const { page, pageSize, q } = parseOrThrow(paginationInput, Object.fromEntries(url.searchParams));
  const batch = url.searchParams.get('batch') ?? undefined;

  const roleParam = url.searchParams.get('role');
  const role: Role | undefined = roleParam === 'ADMIN' || roleParam === 'STUDENT' ? roleParam : undefined;

  const where: Prisma.UserWhereInput = {
    ...(batch ? { batch } : {}),
    ...(role ? { role } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        batch: true,
        active: true,
        lastLogin: true,
        createdAt: true,
        _count: { select: { attempts: true, assignments: true } },
      },
    }),
  ]);

  return ok({ items, total, page, pageSize });
});
