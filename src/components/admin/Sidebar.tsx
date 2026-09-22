'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/monitor', label: 'Live monitor' },
  { href: '/admin/exams', label: 'Exams' },
  { href: '/admin/questions', label: 'Questions' },
  { href: '/admin/attempts', label: 'Attempts' },
  { href: '/admin/results', label: 'Results' },
  { href: '/admin/students', label: 'Students' },
  { href: '/admin/allowed-emails', label: 'Allowlist' },
  { href: '/admin/test-logs', label: 'Test logs' },
  { href: '/admin/settings', label: 'Settings' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="w-full shrink-0 lg:w-52">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {LINKS.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block whitespace-nowrap rounded-md px-3 py-2 text-sm transition',
                  active ? 'bg-ink-800 font-medium text-white' : 'text-slate-400 hover:bg-ink-850 hover:text-slate-200',
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
