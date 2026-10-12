'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input, Select, Spinner } from '@/components/ui';
import { questionListHref, type QuestionListFilters } from './list-href';
import { DIFFICULTIES } from './types';

/**
 * Search + difficulty / category / tag filters. The URL is the state, so the
 * admin nav can deep-link (e.g. ?status=DRAFT) and the server renders the list.
 */
export function QuestionFilters({
  filters,
  categories,
  tags,
}: {
  filters: QuestionListFilters;
  categories: string[];
  tags: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [q, setQ] = React.useState(filters.q ?? '');
  // Follow the URL when it changes from outside (back button, status tabs, clear).
  const [syncedQ, setSyncedQ] = React.useState(filters.q ?? '');
  if ((filters.q ?? '') !== syncedQ) {
    setSyncedQ(filters.q ?? '');
    if (q.trim() !== (filters.q ?? '')) setQ(filters.q ?? '');
  }

  const apply = React.useCallback(
    (patch: Partial<QuestionListFilters>) => {
      startTransition(() => router.push(questionListHref({ ...filters, ...patch, page: 1 })));
    },
    [filters, router],
  );

  // Debounced so typing does not trigger a request per keystroke.
  React.useEffect(() => {
    if (q.trim() === (filters.q ?? '')) return;
    const id = setTimeout(() => apply({ q: q.trim() }), 350);
    return () => clearTimeout(id);
  }, [q, filters.q, apply]);

  const withCurrent = (options: string[], current?: string) =>
    current && !options.includes(current) ? [current, ...options] : options;
  const hasFilters = Boolean(filters.q || filters.difficulty || filters.category || filters.tag);

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          aria-hidden="true"
        />
        <Input
          aria-label="Search questions by title or slug"
          placeholder="Search title or slug…"
          value={q}
          maxLength={120}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>
      <Select
        aria-label="Filter by difficulty"
        value={filters.difficulty ?? ''}
        onChange={(e) => apply({ difficulty: e.target.value })}
      >
        <option value="">All difficulties</option>
        {DIFFICULTIES.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by category"
        value={filters.category ?? ''}
        onChange={(e) => apply({ category: e.target.value })}
      >
        <option value="">All categories</option>
        {withCurrent(categories, filters.category).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Filter by tag"
        value={filters.tag ?? ''}
        onChange={(e) => apply({ tag: e.target.value })}
      >
        <option value="">All tags</option>
        {withCurrent(tags, filters.tag).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      <div className="flex items-center gap-2">
        {pending ? <Spinner className="h-4 w-4 text-slate-400" /> : null}
        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setQ('');
              startTransition(() => router.push(questionListHref({ status: filters.status })));
            }}
            className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
