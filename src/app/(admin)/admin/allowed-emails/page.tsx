import Link from 'next/link';
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
        <h1 className="text-xl font-semibold text-slate-50">Student roster</h1>
        <p className="mt-1 text-sm text-slate-400">
          Anyone with a Google account can sign in and becomes a student. The roster is optional: it
          pre-registers students with a batch so tests can be assigned to them before their first sign-in.
          Roles and account access are managed on the{' '}
          <Link href="/admin/students" className="text-brand-300 hover:underline">
            Students
          </Link>{' '}
          page.
        </p>
      </div>
      <AllowedEmailsManager
        rows={entries.map((e) => ({
          id: e.id,
          email: e.email,
          batch: e.batch,
          note: e.note,
          createdAt: e.createdAt.toISOString(),
          hasAccount: accounts.has(e.email),
        }))}
        batches={batches}
      />
    </div>
  );
}
