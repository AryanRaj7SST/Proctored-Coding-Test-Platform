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
