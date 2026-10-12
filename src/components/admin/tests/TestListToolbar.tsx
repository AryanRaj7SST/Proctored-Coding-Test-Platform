'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Tabs } from '@/components/ui';
import { PHASE_TABS, testsHref } from './format';
import type { TestPhase } from './types';

/** Phase tabs (deep-linkable via ?phase=) and title search for the test list. */
export function TestListToolbar({ phase, q }: { phase: '' | TestPhase; q: string }) {
  const router = useRouter();
  const [query, setQuery] = React.useState(q);
  React.useEffect(() => setQuery(q), [q]);

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200">
      <Tabs
        tabs={PHASE_TABS.map((t) => ({ id: t.id || 'ALL', label: t.label }))}
        active={phase || 'ALL'}
        onChange={(id) => router.push(testsHref({ phase: id === 'ALL' ? '' : id, q: query.trim() }))}
        className="overflow-x-auto"
      />
      <form
        role="search"
        className="mb-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(testsHref({ phase, q: query.trim() }));
        }}
      >
        <label htmlFor="tests-search" className="sr-only">
          Search tests by title
        </label>
        <Input
          id="tests-search"
          type="search"
          value={query}
          placeholder="Search by title…"
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-56"
        />
        <Button type="submit" size="sm" variant="secondary">
          Search
        </Button>
      </form>
    </div>
  );
}
