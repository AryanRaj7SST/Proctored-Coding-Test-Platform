'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui';
import { STATE_OPTIONS, resultsQueryString, type ResultsQuery, type SittingState } from './format';

interface FilterValue {
  examId: string;
  batch: string;
  q: string;
  state: SittingState | '';
  view: 'best' | 'all';
}

/**
 * Results filters, kept in the URL so a filtered view can be shared and the
 * page stays a server component. Dropdowns apply immediately; search applies
 * on Enter or "Apply".
 */
export function ResultsFilters({
  exams,
  batches,
  value,
  pageSize,
}: {
  exams: { id: string; title: string }[];
  batches: string[];
  value: FilterValue;
  pageSize?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState<FilterValue>(value);

  // Re-sync when the URL changes underneath us (Reset, back/forward).
  const valueKey = JSON.stringify(value);
  const [syncedKey, setSyncedKey] = React.useState(valueKey);
  if (syncedKey !== valueKey) {
    setSyncedKey(valueKey);
    setDraft(value);
  }

  const navigate = (next: FilterValue) => {
    const query: ResultsQuery = { ...next, state: next.state || undefined, pageSize };
    const qs = resultsQueryString(query);
    startTransition(() => router.push(`/admin/results${qs ? `?${qs}` : ''}`));
  };

  const update = <K extends keyof FilterValue>(key: K, v: FilterValue[K], apply = true) => {
    const next = { ...draft, [key]: v };
    setDraft(next);
    if (apply) navigate(next);
  };

  const filtered = Boolean(value.examId || value.batch || value.q || value.state || value.view === 'all');

  return (
    <form
      role="search"
      aria-label="Filter results"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(draft);
      }}
      className="grid gap-3 rounded-xl bg-white p-4 border border-slate-200 shadow-xs sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr_auto]"
    >
      <Field label="Test" htmlFor="results-exam">
        <Select id="results-exam" value={draft.examId} onChange={(e) => update('examId', e.target.value)}>
          <option value="">All tests</option>
          {exams.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Batch" htmlFor="results-batch">
        <Select id="results-batch" value={draft.batch} onChange={(e) => update('batch', e.target.value)}>
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" htmlFor="results-state">
        <Select
          id="results-state"
          value={draft.state}
          onChange={(e) => update('state', e.target.value as FilterValue['state'])}
        >
          <option value="">Any status</option>
          {STATE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Sittings" htmlFor="results-view">
        <Select
          id="results-view"
          value={draft.view}
          onChange={(e) => update('view', e.target.value === 'all' ? 'all' : 'best')}
        >
          <option value="best">Best per student</option>
          <option value="all">Every sitting</option>
        </Select>
      </Field>
      <Field label="Student" htmlFor="results-q">
        <Input
          id="results-q"
          type="search"
          placeholder="Name or email"
          maxLength={120}
          value={draft.q}
          onChange={(e) => update('q', e.target.value, false)}
        />
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" size="md" loading={pending}>
          Apply
        </Button>
        {filtered ? (
          <Link
            href="/admin/results"
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            Reset
          </Link>
        ) : null}
      </div>
    </form>
  );
}
