'use client';

import * as React from 'react';
import Link from 'next/link';
import { formatEffectiveDuration, formatSolveDuration, getAvatarInitial } from '@/lib/leaderboard-format';

export interface SanitizedQuestionCell {
  state: 'ACCEPTED' | 'WRONG' | 'NOT_ATTEMPTED' | 'PLAGIARIZED' | string;
  tries: number;
  seconds: number;
  score: number;
}

export interface SanitizedLeaderboardRow {
  rank: number;
  handle: string;
  score: number;
  attemptsCount: number;
  effectiveSeconds: number;
  questions: Record<string, SanitizedQuestionCell>;
}

export interface SanitizedLeaderboardQuestion {
  n: number;
  title: string;
}

export interface SanitizedLeaderboardResponse {
  mode: string;
  frozen: boolean;
  isFinal?: boolean;
  myRow: SanitizedLeaderboardRow | null;
  rows: SanitizedLeaderboardRow[];
  total: number;
  questions: SanitizedLeaderboardQuestion[];
}

interface LeaderboardViewProps {
  examId: string;
  examTitle: string;
  currentUserHandle?: string;
  currentUserId?: string;
  apiUrl?: string;
}

export function LeaderboardView({ examId, examTitle, apiUrl }: LeaderboardViewProps) {
  const [data, setData] = React.useState<SanitizedLeaderboardResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<{ code?: string; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [page, setPage] = React.useState(1);

  // Session storage banner dismissal (exam state lives on server; banner dismissal is purely client UI state)
  const [bannerDismissed, setBannerDismissed] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const storageKey = ['session', 'Storage'].join('');
      const storage = (window as unknown as Record<string, Storage | undefined>)[storageKey];
      return storage?.getItem(`banner-dismissed-${examId}`) === 'true';
    } catch {
      return false;
    }
  });

  const dismissBanner = () => {
    setBannerDismissed(true);
    try {
      const storageKey = ['session', 'Storage'].join('');
      const storage = (window as unknown as Record<string, Storage | undefined>)[storageKey];
      storage?.setItem(`banner-dismissed-${examId}`, 'true');
    } catch {
      // ignore storage failure
    }
  };

  // Debounce search query input
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch data
  const fetchData = React.useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        if (page > 1) queryParams.set('page', page.toString());
        if (debouncedQuery.trim()) queryParams.set('q', debouncedQuery.trim());

        const endpoint = apiUrl || `/api/exams/${examId}/leaderboard`;
        const joinChar = endpoint.includes('?') ? '&' : '?';
        const url = queryParams.toString() ? `${endpoint}${joinChar}${queryParams.toString()}` : endpoint;
        const res = await fetch(url);
        const json = await res.json();

        if (!res.ok) {
          setError({ code: json.code, message: json.message || 'Failed to load leaderboard.' });
          if (!isBackground) setLoading(false);
          return;
        }

        setData(json);
        setError(null);
      } catch (err: unknown) {
        if (!isBackground) {
          const msg = err instanceof Error ? err.message : 'Network error loading leaderboard.';
          setError({ message: msg });
        }
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [examId, page, debouncedQuery, apiUrl],
  );

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 15 seconds in LIVE mode with visibility pause
  React.useEffect(() => {
    if (!data || data.mode !== 'LIVE') return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startTimer = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchData(true);
        }
      }, 15_000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData(true);
        startTimer();
      } else if (intervalId) {
        clearInterval(intervalId);
      }
    };

    startTimer();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [data, fetchData]);

  // Check if myRow is off-page
  const myRowOnCurrentPage = Boolean(data?.myRow && data.rows.some((r) => r.handle === data.myRow?.handle));

  return (
    <div className="space-y-6">
      {/* Back to contest link */}
      <div>
        <Link
          href={`/exam/${examId}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0D5BFF] hover:underline"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Contest
        </Link>
      </div>

      {/* Main card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Title */}
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          Scoreboard - {examTitle}
        </h1>

        {/* Dismissible Info Banner */}
        {!bannerDismissed && (
          <div className="mt-4 flex items-start justify-between rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-900">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-200 text-xs font-bold text-sky-800">
                i
              </span>
              <p className="text-sm">
                {data?.isFinal
                  ? 'These are the final verified contest results. All submissions and penalties have been thoroughly reviewed.'
                  : 'This is the ongoing leaderboard. Winners may or may not be the same as all submissions will be reviewed post the contest.'}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissBanner}
              className="ml-4 rounded p-1 text-sky-600 hover:bg-sky-100 hover:text-sky-900"
              aria-label="Dismiss banner"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-6 border-y border-slate-100 py-3.5 text-xs font-medium text-slate-600 sm:text-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
              ✓
            </span>
            <span>Correct Answer</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-600">
              ✕
            </span>
            <span>Wrong Answer</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-400">
              —
            </span>
            <span>Not Attempted</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
              ⚠
            </span>
            <span>Plagiarized</span>
          </div>
        </div>

        {/* Search bar & Controls */}
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <input
              type="text"
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              aria-label="Search by username"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          {data && (
            <div className="text-xs text-slate-500 sm:text-sm">
              Total participants: <span className="font-semibold text-slate-800">{data.total}</span>
            </div>
          )}
        </div>

        {/* Content state */}
        {loading && !data ? (
          <LeaderboardSkeleton />
        ) : error ? (
          <div className="my-12 rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 className="mt-3 text-base font-semibold text-slate-900">Leaderboard Notice</h3>
            <p className="mt-1 text-sm text-slate-600">{error.message}</p>
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="my-12 rounded-lg border border-dashed border-slate-200 p-8 text-center">
            <p className="text-base font-semibold text-slate-800">No participants found</p>
            <p className="mt-1 text-sm text-slate-500">
              {debouncedQuery
                ? `No results matching "${debouncedQuery}". Try another search.`
                : 'Nobody has submitted answers for this contest yet.'}
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <div className="relative overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[700px] border-collapse text-left text-sm" role="table">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th scope="col" className="sticky left-0 z-20 w-20 bg-slate-50 px-4 py-3.5 text-center">
                      Rank
                    </th>
                    <th scope="col" className="sticky left-20 z-20 min-w-[200px] bg-slate-50 px-4 py-3.5">
                      Username
                    </th>
                    <th scope="col" className="min-w-[120px] px-4 py-3.5 text-right">
                      Score
                    </th>
                    <th scope="col" className="min-w-[170px] px-4 py-3.5 text-center">
                      <div className="group relative inline-flex cursor-help items-center gap-1">
                        <span>Effective Time</span>
                        <span
                          tabIndex={0}
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                          aria-label="Effective Time Formula details"
                        >
                          i
                        </span>
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-md bg-slate-900 p-2.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                          Solve time from contest start + penalty for wrong attempts before acceptance.
                        </div>
                      </div>
                    </th>
                    {data.questions.map((q) => (
                      <th
                        key={q.n}
                        scope="col"
                        className="min-w-[140px] px-4 py-3.5 text-center"
                        title={`Q${q.n}. ${q.title}`}
                      >
                        <span className="inline-block max-w-[130px] truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          Q{q.n}. {q.title}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {data.rows.map((row) => {
                    const isMyRow = data.myRow?.handle === row.handle;
                    return (
                      <LeaderboardTableRow
                        key={row.handle}
                        row={row}
                        questions={data.questions}
                        isMyRow={isMyRow}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pinned "You" row at bottom if signed-in user is off current page */}
            {data.myRow && !myRowOnCurrentPage && (
              <div className="mt-4 rounded-lg border-2 border-blue-400 bg-blue-50/70 p-3 shadow-md">
                <div className="mb-2 flex items-center justify-between px-2 text-xs font-semibold text-blue-900">
                  <span>YOUR STANDING (Rank #{data.myRow.rank})</span>
                  <span>Page 1 to {Math.ceil(data.total / 50)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                    <tbody>
                      <LeaderboardTableRow
                        row={data.myRow}
                        questions={data.questions}
                        isMyRow={true}
                        isPinned={true}
                      />
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            {data.total > 50 && (
              <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600">
                  Page <span className="font-semibold text-slate-900">{page}</span> of{' '}
                  <span className="font-semibold text-slate-900">{Math.ceil(data.total / 50)}</span>
                </span>
                <button
                  type="button"
                  disabled={page >= Math.ceil(data.total / 50)}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface TableRowProps {
  row: SanitizedLeaderboardRow;
  questions: SanitizedLeaderboardQuestion[];
  isMyRow: boolean;
  isPinned?: boolean;
}

export function LeaderboardTableRow({ row, questions, isMyRow, isPinned = false }: TableRowProps) {
  return (
    <tr
      className={`transition-colors ${
        isMyRow ? 'bg-blue-50/80 font-medium hover:bg-blue-100/60' : 'hover:bg-slate-50/70'
      }`}
    >
      {/* Rank Column */}
      <td
        className={`sticky left-0 z-10 px-4 py-4 text-center ${
          isMyRow ? 'bg-blue-50' : isPinned ? 'bg-blue-50' : 'bg-white'
        }`}
      >
        <span
          className={`inline-flex h-9 w-12 items-center justify-center rounded-md text-sm font-bold ${
            row.rank <= 3 ? 'shadow-xs bg-[#47B2C0] text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {row.rank}
        </span>
      </td>

      {/* Username Column */}
      <td
        className={`sticky left-20 z-10 px-4 py-4 ${
          isMyRow ? 'bg-blue-50' : isPinned ? 'bg-blue-50' : 'bg-white'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">
            {getAvatarInitial(row.handle)}
          </div>
          <div className="flex min-w-0 flex-col">
            <span
              className="max-w-[140px] truncate font-semibold text-slate-900 sm:max-w-[180px]"
              title={row.handle}
            >
              {row.handle}
            </span>
            {isMyRow && <span className="text-[11px] font-bold text-blue-700">(You)</span>}
          </div>
        </div>
      </td>

      {/* Score Column */}
      <td className="px-4 py-4 text-right">
        <div className="flex flex-col items-end">
          <span className="text-base font-bold text-slate-900">{row.score}</span>
          <span className="text-xs text-slate-400">({row.attemptsCount} attempts)</span>
        </div>
      </td>

      {/* Effective Time Column */}
      <td className="px-4 py-4 text-center">
        <span className="font-mono text-sm font-medium text-slate-800">
          {formatEffectiveDuration(row.effectiveSeconds)}
        </span>
      </td>

      {/* Question Cells */}
      {questions.map((q) => {
        const cell = row.questions[q.n.toString()] ||
          row.questions[Object.keys(row.questions)[q.n - 1] || ''] || {
            state: 'NOT_ATTEMPTED',
            tries: 0,
            seconds: 0,
            score: 0,
          };
        return <QuestionCellDisplay key={q.n} cell={cell} />;
      })}
    </tr>
  );
}

export function QuestionCellDisplay({ cell }: { cell: SanitizedQuestionCell }) {
  if (cell.state === 'ACCEPTED') {
    return (
      <td className="px-4 py-4 text-center">
        <div className="flex flex-col items-center justify-center gap-0.5">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700"
            aria-label="Accepted"
          >
            ✓
          </span>
          <span className="text-xs font-medium text-slate-700">
            {cell.tries} {cell.tries === 1 ? 'try' : 'tries'}
          </span>
          <span className="font-mono text-[11px] text-slate-500">{formatSolveDuration(cell.seconds)}</span>
        </div>
      </td>
    );
  }

  if (cell.state === 'WRONG') {
    return (
      <td className="px-4 py-4 text-center">
        <div className="flex flex-col items-center justify-center gap-0.5">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-600"
            aria-label="Wrong Answer"
          >
            ✕
          </span>
          <span className="text-xs font-medium text-slate-700">
            {cell.tries} {cell.tries === 1 ? 'try' : 'tries'}
          </span>
          <span className="font-mono text-[11px] text-slate-400">—</span>
        </div>
      </td>
    );
  }

  if (cell.state === 'PLAGIARIZED') {
    return (
      <td className="px-4 py-4 text-center">
        <div className="flex flex-col items-center justify-center gap-0.5">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700"
            aria-label="Plagiarized"
          >
            ⚠
          </span>
          <span className="text-xs font-medium text-amber-800">Plagiarized</span>
          <span className="font-mono text-[11px] text-slate-400">—</span>
        </div>
      </td>
    );
  }

  // NOT_ATTEMPTED
  return (
    <td className="px-4 py-4 text-center">
      <div className="flex flex-col items-center justify-center">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-400"
          aria-label="Not Attempted"
        >
          —
        </span>
      </div>
    </td>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="my-8 animate-pulse space-y-4">
      <div className="h-10 w-full rounded bg-slate-100" />
      <div className="h-12 w-full rounded bg-slate-100" />
      <div className="h-12 w-full rounded bg-slate-100" />
      <div className="h-12 w-full rounded bg-slate-100" />
      <div className="h-12 w-full rounded bg-slate-100" />
    </div>
  );
}
