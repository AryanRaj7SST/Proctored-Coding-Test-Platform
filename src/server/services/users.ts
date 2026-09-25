import type { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { conflict, notFound } from '@/lib/errors';

export interface UserAccessChange {
  role?: Role;
  active?: boolean;
}

export interface UserAccessSnapshot {
  id: string;
  email: string;
  role: Role;
  active: boolean;
}

/**
 * Change an account's role or active state -- the only way a role ever
 * changes. Callers must already be administrators (the route checks
 * requireAdmin); signing in never changes a role.
 *
 * Administrator access can never be lost by accident: nobody demotes or
 * deactivates themselves, and the last active administrator cannot be demoted
 * or deactivated by anyone. The active administrators are locked for the
 * duration, so two concurrent demotions cannot both pass the check.
 * A change applies on the account's next request (lib/auth-callbacks re-reads
 * the role and active state on every token refresh).
 */
export async function updateUserAccess(
  id: string,
  change: UserAccessChange,
  actor: { id: string },
): Promise<{ before: UserAccessSnapshot; after: UserAccessSnapshot }> {
  return prisma.$transaction(async (tx) => {
    const select = { id: true, email: true, role: true, active: true } as const;
    const before = await tx.user.findUnique({ where: { id }, select });
    if (!before) throw notFound('User not found.');

    const losesAdmin =
      before.role === 'ADMIN' && before.active && (change.role === 'STUDENT' || change.active === false);
    if (losesAdmin) {
      if (before.id === actor.id) {
        throw conflict('You cannot remove your own administrator access. Ask another administrator.');
      }
      const admins = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM users WHERE role = 'ADMIN' AND active = true FOR UPDATE`;
      if (!admins.some((a) => a.id !== before.id)) {
        throw conflict('At least one active administrator is required.');
      }
    }
    if (before.id === actor.id && change.active === false) {
      throw conflict('You cannot deactivate your own account.');
    }

    const after = await tx.user.update({
      where: { id },
      data: {
        ...(change.role ? { role: change.role } : {}),
        ...(change.active !== undefined ? { active: change.active } : {}),
      },
      select,
    });
    return { before, after };
  });
}
