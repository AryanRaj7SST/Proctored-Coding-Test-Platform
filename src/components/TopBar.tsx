import Link from 'next/link';
import { signOutAction } from '@/app/actions/auth';
import type { SessionUser } from '@/lib/authz';

/** Shared application header for the non-exam surfaces. */
export function TopBar({ user, title }: { user: SessionUser; title: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-700 bg-ink-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href={user.role === 'ADMIN' ? '/admin' : '/dashboard'} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-brand-600 text-xs font-bold text-white">
            &lt;/&gt;
          </span>
          <span className="text-sm font-semibold text-slate-100">{title}</span>
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
              className="rounded-md px-2.5 py-1.5 text-slate-400 hover:bg-ink-800 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-xs font-medium text-slate-200">{user.name ?? user.email}</p>
            <p className="text-[11px] text-slate-500">
              {user.email}
              {user.batch ? ` · ${user.batch}` : ''}
            </p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-xs text-slate-300 ring-1 ring-inset ring-ink-600 hover:bg-ink-800 hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
