import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authz';

export const dynamic = 'force-dynamic';

/** Single entry point: route people to the surface their role belongs to. */
export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  redirect(user.role === 'ADMIN' ? '/admin' : '/dashboard');
}
