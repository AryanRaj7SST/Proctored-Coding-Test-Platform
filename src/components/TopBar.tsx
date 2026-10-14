import Link from 'next/link';
import { signOutAction } from '@/app/actions/auth';
import type { SessionUser } from '@/lib/authz';

export interface TopBarProps {
  user: SessionUser;
  title: string;
  variant?: 'default' | 'scaler';
}

/** Shared application header for the non-exam surfaces and contest pages. */
export function TopBar({ user, title, variant = 'default' }: TopBarProps) {
  const firstName = (user.name ?? user.email.split('@')[0] ?? 'User').split(' ')[0];

  if (variant === 'scaler') {
    return (
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
          {/* Brand Logo left */}
          <Link href="/dashboard" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/scaler-logo.png" alt="Scaler" className="h-7 w-auto object-contain" />
          </Link>

          {/* Right actions: Bell + Hi, Name dropdown */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="relative rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-blue-600"
              aria-label="Notifications"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                />
              </svg>
            </button>

            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100">
                <span>Hi, {firstName}</span>
                <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
                <div className="border-b border-slate-100 px-4 py-2">
                  <p className="text-xs font-medium text-slate-900">{user.name ?? user.email}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
                <Link href="/dashboard" className="block px-4 py-2 text-xs text-slate-700 hover:bg-slate-100">
                  Dashboard
                </Link>
                <Link href="/exams" className="block px-4 py-2 text-xs text-slate-700 hover:bg-slate-100">
                  My results
                </Link>
                <form action={signOutAction} className="border-t border-slate-100">
                  <button
                    type="submit"
                    className="block w-full px-4 py-2 text-left text-xs text-rose-600 hover:bg-slate-50"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="shadow-xs sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
        <Link href={user.role === 'ADMIN' ? '/admin' : '/dashboard'} className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/scaler-logo.png" alt="Scaler" className="h-7 w-auto object-contain" />
          <span className="text-slate-300">|</span>
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
