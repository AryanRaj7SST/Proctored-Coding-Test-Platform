import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/authz';
import { AllowedEmailsManager } from '@/components/admin/AllowedEmailsManager';

export const dynamic = 'force-dynamic';

export default async function AllowedEmailsPage() {
  await requireAdmin();

  const [entries, users] = await Promise.all([
    prisma.allowedEmail.findMany({ orderBy: [{ batch: 'asc' }, { email: 'asc' }] }),
    prisma.user.findMany({ select: { email: true } }),
  ]);
  const accounts = new Set(users.map((u) => u.email));

  const batches = [...new Set(entries.map((e) => e.batch).filter((b): b is string => Boolean(b)))].sort();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">Allowlist</h1>
        <p className="mt-1 text-sm text-slate-400">
          Only these exact Google addresses can sign in. Revoking an entry deactivates the account immediately.
        </p>
      </div>
      <AllowedEmailsManager
        rows={entries.map((e) => ({
          id: e.id,
          email: e.email,
          role: e.role,
          batch: e.batch,
          active: e.active,
          note: e.note,
          createdAt: e.createdAt.toISOString(),
          hasAccount: accounts.has(e.email),
        }))}
        batches={batches}
      />
    </div>
  );
}
