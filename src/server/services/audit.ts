import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger, sanitize } from '@/lib/logger';

export async function recordAudit(params: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        metadata: params.metadata ? (sanitize(params.metadata) as object) : undefined,
        ip: params.ip ?? null,
      },
    });
  } catch {
    // Auditing must never break the request it is describing.
    logger.warn('audit.write_failed', { action: params.action, entity: params.entity });
  }
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return (fwd.split(',')[0] ?? '').trim() || null;
  return req.headers.get('x-real-ip');
}

export interface AuditFilter {
  page: number;
  pageSize: number;
  /** Action prefix, e.g. "question." or "exam.published". */
  action?: string;
  entity?: string;
  entityId?: string;
  /** Matches the actor's email or name. */
  q?: string;
}

/** Paginated audit trail, newest first. Metadata was sanitised when written. */
export async function listAuditLogs(filter: AuditFilter) {
  const where: Prisma.AuditLogWhereInput = {
    ...(filter.action ? { action: { startsWith: filter.action } } : {}),
    ...(filter.entity ? { entity: filter.entity } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
    ...(filter.q
      ? {
          user: {
            OR: [
              { email: { contains: filter.q, mode: 'insensitive' } },
              { name: { contains: filter.q, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      include: { user: { select: { name: true, email: true, role: true } } },
    }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      actor: r.user ? { name: r.user.name, email: r.user.email, role: r.user.role } : null,
      metadata: r.metadata,
      ip: r.ip,
    })),
    total,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}
