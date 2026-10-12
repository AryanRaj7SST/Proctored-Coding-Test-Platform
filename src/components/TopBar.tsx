import Link from 'next/link';
import { signOutAction } from '@/app/actions/auth';
import type { SessionUser } from '@/lib/authz';

/** Shared application header for the non-exam surfaces. */
export function TopBar({ user, title }: { user: SessionUser; title: string }) {
  return (
    <header className="shadow-xs sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href={user.role === 'ADMIN' ? '/admin' : '/dashboard'} className="flex items-center gap-2">
          <span className="shadow-xs flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-xs font-bold text-white">
            &lt;/&gt;
          </span>
          <span className="text-sm font-semibold text-slate-900">{title}</span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          {(user.role === 'ADMIN'
            ? [
                { href: '/admin', label: 'Admin' },
                { href: '/dashboard', label: 'Student view' },
              ]
            : [
                { href: '/dashboard', label: 'Dashboard' },
                { href: '/exams', label: 'My results' },
              ]
          ).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-2.5 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-xs font-semibold text-slate-800">{user.name ?? user.email}</p>
            <p className="text-[11px] text-slate-500">
              {user.email}
              {user.batch ? ` · ${user.batch}` : ''}
            </p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="shadow-xs rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
