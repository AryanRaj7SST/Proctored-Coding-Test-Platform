import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authz';
import { TopBar } from '@/components/TopBar';

export const dynamic = 'force-dynamic';

/**
 * Server-side gate for every student surface. The middleware only redirects
 * unauthenticated visitors for UX; this is the check that matters.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen">
      <TopBar user={user} title="Coding Assessment" />
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
