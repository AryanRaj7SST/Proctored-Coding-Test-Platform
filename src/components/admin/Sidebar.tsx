'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavLink {
  href: string;
  label: string;
  /** Active only on this exact path (and query), not on sub-paths. */
  exact?: boolean;
}

interface NavGroup {
  label?: string;
  links: NavLink[];
}

const NAV: NavGroup[] = [
  { links: [{ href: '/admin', label: 'Dashboard', exact: true }] },
  {
    label: 'Questions',
    links: [
      { href: '/admin/questions', label: 'All questions', exact: true },
      { href: '/admin/questions/new', label: 'Create question', exact: true },
      { href: '/admin/questions?status=DRAFT', label: 'Drafts', exact: true },
      { href: '/admin/questions?status=PUBLISHED', label: 'Published', exact: true },
    ],
  },
  {
    label: 'Tests',
    links: [
      { href: '/admin/exams', label: 'All tests', exact: true },
      { href: '/admin/exams/new', label: 'Create test', exact: true },
      { href: '/admin/exams?phase=UPCOMING', label: 'Upcoming', exact: true },
      { href: '/admin/exams?phase=ACTIVE', label: 'Active', exact: true },
      { href: '/admin/exams?phase=ENDED', label: 'Completed', exact: true },
    ],
  },
  {
    label: 'Grading',
    links: [
      { href: '/admin/attempts', label: 'Submissions' },
      { href: '/admin/results', label: 'Results' },
      { href: '/admin/monitor', label: 'Live monitor' },
    ],
  },
  {
    label: 'People',
    links: [
      { href: '/admin/students', label: 'Users' },
      { href: '/admin/allowed-emails', label: 'Student roster' },
      { href: '/admin/assignments', label: 'Assignments' },
    ],
  },
  {
    label: 'System',
    links: [
      { href: '/admin/settings', label: 'Settings' },
      { href: '/admin/audit-logs', label: 'Audit logs' },
      { href: '/admin/test-logs', label: 'Runner logs' },
    ],
  },
];

function isActive(link: NavLink, pathname: string, search: URLSearchParams): boolean {
  const [path, query] = link.href.split('?');
  if (!link.exact) return pathname.startsWith(path!);
  if (pathname !== path) return false;
  const wanted = new URLSearchParams(query ?? '');
  // "All" links are active only when no filter is applied.
  if (!query) return !search.get('status') && !search.get('phase');
  return [...wanted.entries()].every(([k, v]) => search.get(k) === v);
}

export function Sidebar() {
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <nav aria-label="Admin sections" className="w-full shrink-0 lg:w-52">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-4 lg:overflow-visible">
        {NAV.map((group, g) => (
          <li key={group.label ?? g} className="shrink-0">
            {group.label ? (
              <p className="hidden px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 lg:block">
                {group.label}
              </p>
            ) : null}
            <ul className="flex gap-1 lg:flex-col">
              {group.links.map((link) => {
                const active = isActive(link, pathname, search);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'block whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition',
                        active
                          ? 'bg-blue-50 font-semibold text-blue-700 shadow-xs border-l-2 border-blue-600 pl-2.5'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium',
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
