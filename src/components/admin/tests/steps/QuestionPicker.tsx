'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge, Button, EmptyState, Input, Select, Skeleton } from '@/components/ui';
import { apiGet, ApiError } from '@/lib/api';
import { DIFFICULTY_TONE, formatMarks, plural } from '../format';
import { useDebounced } from '../shared';
import type { Difficulty, QuestionBankItem, QuestionBankResponse } from '../types';

const PAGE_SIZE = 10;

/**
 * Searchable list of PUBLISHED questions (only published questions can go
 * into a published test). Filtering happens on the server.
 */
export function QuestionPicker({
  selectedIds,
  onAdd,
  categories,
  tags,
  disabled,
}: {
  selectedIds: Set<string>;
  onAdd: (question: QuestionBankItem) => void;
  categories: string[];
  tags: string[];
  disabled?: boolean;
}) {
  const [q, setQ] = React.useState('');
  const [difficulty, setDifficulty] = React.useState<'' | Difficulty>('');
  const [category, setCategory] = React.useState('');
  const [tag, setTag] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<QuestionBankResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [reloadKey, setReloadKey] = React.useState(0);
  const query = useDebounced(q.trim(), 300);

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      status: 'PUBLISHED',
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (query) params.set('q', query);
    if (difficulty) params.set('difficulty', difficulty);
    if (category) params.set('category', category);
    if (tag) params.set('tag', tag);
    setLoading(true);
    setError(null);
    apiGet<QuestionBankResponse>(`/api/questions?${params.toString()}`)
      .then((res) => {
        if (!controller.signal.aborted) setData(res);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiError ? err.message : 'Could not load questions.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, difficulty, category, tag, page, reloadKey]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Boolean(query || difficulty || category || tag);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="qp-search" className="sr-only">
            Search questions
          </label>
          <Input
            id="qp-search"
            type="search"
            placeholder="Search title or slug…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label htmlFor="qp-difficulty" className="sr-only">
            Difficulty
          </label>
          <Select
            id="qp-difficulty"
            value={difficulty}
            onChange={(e) => {
              setDifficulty(e.target.value as '' | Difficulty);
              setPage(1);
            }}
          >
            <option value="">Any difficulty</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </Select>
        </div>
        <div>
          <label htmlFor="qp-category" className="sr-only">
            Category
          </label>
          <Select
            id="qp-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="qp-tag" className="sr-only">
            Tag
          </label>
          <Select
            id="qp-tag"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-bad/10 p-3 text-xs text-rose-200 ring-1 ring-bad/30">
          <span role="alert">{error}</span>
          <Button size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </Button>
        </div>
      ) : loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No published questions match' : 'No published questions yet'}
          description={
            filtered
              ? 'Try a different search or clear the filters.'
              : 'Only published questions can be added to a test. Publish a question in the question bank first.'
          }
          action={
            filtered ? undefined : (
              <Link href="/admin/questions" className="text-xs text-brand-300 hover:underline">
                Open the question bank
              </Link>
            )
          }
        />
      ) : (
        <ul
          className={`divide-y divide-ink-800 rounded-md ring-1 ring-ink-700 ${loading ? 'opacity-60' : ''}`}
          aria-busy={loading || undefined}
        >
          {data?.items.map((item) => {
            const added = selectedIds.has(item.id);
            return (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-100">{item.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <Badge tone={DIFFICULTY_TONE[item.difficulty]}>{item.difficulty.toLowerCase()}</Badge>
                    <span>{formatMarks(item.marks)} marks</span>
                    <span>· {plural(item.enabledTests, 'test')}</span>
                    <span>· v{item.version}</span>
                    {item.category ? <span>· {item.category}</span> : null}
                    {item.tags.slice(0, 3).map((t) => (
                      <span key={t} className="text-slate-400">
                        #{t}
                      </span>
                    ))}
                    {item.usedInTests > 0 ? <span>· used in {plural(item.usedInTests, 'test')}</span> : null}
                  </p>
                </div>
                {added ? (
                  <Badge tone="ok">Added</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => onAdd(item)}
                    aria-label={`Add ${item.title}`}
                  >
                    Add
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data && data.total > data.pageSize ? (
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            Page {data.page} of {pages} · {plural(data.total, 'question')}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
