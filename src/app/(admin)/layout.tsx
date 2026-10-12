import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authz';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/admin/Sidebar';

export const dynamic = 'force-dynamic';

/** Hard server-side admin gate for every /admin surface. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login?callbackUrl=%2Fadmin');
  if (user.role !== 'ADMIN') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopBar user={user} title="Admin console" />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row">
        {/* The sidebar reads the query string (filtered links), so it renders client-side. */}
        <Suspense fallback={<div className="w-full shrink-0 lg:w-52" />}>
          <Sidebar />
        </Suspense>
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
