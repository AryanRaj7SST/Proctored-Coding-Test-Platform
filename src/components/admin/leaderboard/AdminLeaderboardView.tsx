'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge, Card, CardBody, CardHeader, StatCard, Table, Td, Th, Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import type { AdminLeaderboardServiceResult } from '@/server/services/leaderboard';

interface AdminLeaderboardViewProps {
  initialData: AdminLeaderboardServiceResult;
  examId: string;
}

function formatSeconds(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDateTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString();
}

export function AdminLeaderboardView({ initialData, examId }: AdminLeaderboardViewProps) {
  const [data, setData] = React.useState<AdminLeaderboardServiceResult>(initialData);
  const [loading, setLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const toast = useToast();

  const refetch = React.useCallback(
    async (query = searchQuery) => {
      setLoading(true);
      try {
        const url = new URL(`/api/admin/exams/${examId}/leaderboard`, window.location.origin);
        if (query.trim()) url.searchParams.set('q', query.trim());
        url.searchParams.set('pageSize', '200');

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('Failed to load leaderboard data');
        const json = await res.json();
        setData(json);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error fetching leaderboard';
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [examId, searchQuery, toast],
  );

  // Debounce search
  React.useEffect(() => {
    const handler = setTimeout(() => {
      refetch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery, refetch]);

  const handleDisqualify = async (sessionId: string, currentDisqualified: boolean) => {
    const action = currentDisqualified ? 'undisqualify' : 'disqualify';
    const confirmPrompt = currentDisqualified
      ? 'Reinstate this student to the public scoreboard?'
      : 'Disqualify this student? They will be removed from the public scoreboard while their attempt history is preserved.';

    if (!confirm(confirmPrompt)) return;

    let reason: string | undefined;
    if (!currentDisqualified) {
      reason = prompt('Reason for disqualification (optional):') || 'Disqualified by administrator';
    }

    setActionLoading(`dq-${sessionId}`);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId, reason }),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.message || 'Action failed');

      toast.success(currentDisqualified ? 'Student reinstated.' : 'Student disqualified.');
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error modifying disqualification status';
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePlagiarismToggle = async (sessionId: string, isFlagged: boolean) => {
    const action = isFlagged ? 'clear_flag' : 'flag_plagiarism';
    const confirmPrompt = isFlagged
      ? 'Clear plagiarism flag for this student sitting?'
      : 'Flag this student sitting as PLAGIARISM? All questions in this sitting will be marked as plagiarized.';

    if (!confirm(confirmPrompt)) return;

    setActionLoading(`flag-${sessionId}`);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sessionId, note: 'Toggled from admin leaderboard' }),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.message || 'Action failed');

      toast.success(isFlagged ? 'Plagiarism flag cleared.' : 'Plagiarism flag set.');
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error toggling plagiarism flag';
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handleFreezeNow = async () => {
    if (
      !confirm(
        'Freeze the leaderboard at the current time? Submissions after this moment will not affect ranks.',
      )
    ) {
      return;
    }

    setActionLoading('freeze');
    try {
      const res = await fetch(`/api/admin/exams/${examId}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'freeze_now' }),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.message || 'Freeze failed');

      toast.success('Leaderboard frozen.');
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error freezing leaderboard';
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublishFinalResults = async () => {
    if (
      !confirm(
        'Publish final verified contest results? This freezes the board and permanently switches the public banner to "final". This action is audited.',
      )
    ) {
      return;
    }

    setActionLoading('publish-final');
    try {
      const res = await fetch(`/api/admin/exams/${examId}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish_final' }),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.message || 'Publishing final results failed');

      toast.success('Final contest results published successfully!');
      await refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error publishing final results';
      toast.error(msg);
    } finally {
      setActionLoading(null);
    }
  };

  const exam = data.exam;
  const rows = data.rows;
  const questions = data.questions;

  const totalParticipants = rows.length;
  const activeParticipants = rows.filter((r) => !r.disqualified).length;
  const disqualifiedCount = rows.filter((r) => r.disqualified).length;
  const topScore = rows[0]?.score ?? 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href={`/admin/exams/${examId}`} className="transition hover:text-white">
          &larr; Back to {exam.title}
        </Link>
        <span>&middot;</span>
        <Link href={`/admin/results?examId=${examId}`} className="transition hover:text-white">
          Standard Results
        </Link>
        <span>&middot;</span>
        <Link href={`/admin/exams/${examId}/similarity`} className="transition hover:text-white">
          Similarity Report
        </Link>
        <span>&middot;</span>
        <span className="text-slate-300">Admin Leaderboard</span>
      </div>

      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Contest Leaderboard & Moderation
            </h1>
            {exam.resultsPublishedAt && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                ✓ Final Results Published
              </span>
            )}
            {exam.frozenAt && !exam.resultsPublishedAt && (
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                ❄️ Frozen
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Authoritative leaderboard for <strong className="text-slate-700">{exam.title}</strong> with full
            emails, disqualification controls, plagiarism flags, and safe CSV export.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* CSV Export */}
          <Link
            href={`/api/admin/exams/${examId}/leaderboard?format=csv`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500"
          >
            <span>📥 Export CSV</span>
          </Link>

          {/* Freeze Now */}
          {!exam.frozenAt && (
            <Button
              variant="secondary"
              size="sm"
              loading={actionLoading === 'freeze'}
              onClick={handleFreezeNow}
            >
              ❄️ Freeze Board
            </Button>
          )}

          {/* Publish Final Results */}
          {!exam.resultsPublishedAt && (
            <Button
              variant="primary"
              size="sm"
              loading={actionLoading === 'publish-final'}
              onClick={handlePublishFinalResults}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              🏁 Publish Final Results
            </Button>
          )}

          <Link
            href={`/admin/exams/${examId}/similarity`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <span>🔍 Similarity Scan</span>
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Submissions"
          value={totalParticipants}
          hint={`${activeParticipants} active on public board`}
        />
        <StatCard label="Disqualified" value={disqualifiedCount} hint="Removed from public board" />
        <StatCard label="Top Score" value={topScore} hint="Standard ICPC / DSA penalty" />
        <StatCard
          label="Leaderboard Status"
          value={exam.resultsPublishedAt ? 'FINAL' : exam.frozenAt ? 'FROZEN' : exam.leaderboardMode}
          hint={exam.resultsPublishedAt ? formatDateTime(exam.resultsPublishedAt) : 'Formula Safe CSV'}
        />
      </div>

      {/* Filter and Table Card */}
      <Card>
        <CardHeader
          title={`All Participants (${rows.length})`}
          subtitle="Real student emails and audited actions (flag as plagiarized, clear flag, disqualify/reinstate)."
        />
        <div className="border-b border-slate-100 p-4">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, email, or handle..."
            className="max-w-md text-xs"
          />
        </div>

        <CardBody className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {loading ? 'Loading participants…' : 'No contest participants found.'}
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Rank</Th>
                  <Th>Student</Th>
                  <Th>Score</Th>
                  <Th>Effective Time</Th>
                  {questions.map((q) => (
                    <Th key={q.id} className="text-center">
                      Q{q.order}
                    </Th>
                  ))}
                  <Th>Status</Th>
                  <Th className="text-right">Admin Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hasPlagiarismFlag =
                    row.flags.some((f) => f.kind === 'PLAGIARISM') ||
                    Object.values(row.questions).some((c) => c.state === 'PLAGIARIZED');

                  return (
                    <tr
                      key={row.sessionId}
                      className={row.disqualified ? 'bg-rose-50/30' : 'hover:bg-slate-50/50'}
                    >
                      <Td>
                        {row.disqualified ? (
                          <Badge tone="bad">DQ</Badge>
                        ) : row.rank ? (
                          <Badge tone={row.rank === 1 ? 'ok' : row.rank <= 3 ? 'warn' : 'neutral'}>
                            #{row.rank}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </Td>

                      <Td>
                        <div className="text-xs">
                          <p className="font-semibold text-slate-900">{row.name || row.handle}</p>
                          <p className="font-mono text-slate-600">{row.email}</p>
                          <p className="text-[11px] text-slate-400">@{row.handle}</p>
                        </div>
                      </Td>

                      <Td>
                        <div className="text-xs">
                          <span className="font-mono font-bold text-slate-900">{row.score}</span>
                          <span className="ml-1 text-slate-500">({row.attemptsCount} tries)</span>
                        </div>
                      </Td>

                      <Td>
                        <span className="font-mono text-xs text-slate-700">
                          {formatSeconds(row.effectiveSeconds)}
                        </span>
                      </Td>

                      {/* Per-question cells */}
                      {questions.map((q) => {
                        const cell = row.questions[q.id];
                        if (!cell || cell.state === 'NOT_ATTEMPTED') {
                          return (
                            <Td key={q.id} className="text-center font-mono text-xs text-slate-300">
                              —
                            </Td>
                          );
                        }
                        if (cell.state === 'PLAGIARIZED') {
                          return (
                            <Td key={q.id} className="text-center">
                              <span
                                className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
                                title="Plagiarized submission"
                              >
                                ⚠ PLAG
                              </span>
                            </Td>
                          );
                        }
                        if (cell.state === 'ACCEPTED') {
                          return (
                            <Td key={q.id} className="text-center">
                              <span
                                className="inline-flex items-center gap-0.5 font-mono text-xs font-semibold text-emerald-700"
                                title={`${cell.tries} tries, ${cell.seconds}s`}
                              >
                                ✓ +{cell.tries > 1 ? cell.tries - 1 : 0}
                              </span>
                            </Td>
                          );
                        }
                        return (
                          <Td key={q.id} className="text-center">
                            <span
                              className="inline-flex items-center gap-0.5 font-mono text-xs text-rose-600"
                              title={`${cell.tries} wrong tries`}
                            >
                              ✕ ({cell.tries})
                            </span>
                          </Td>
                        );
                      })}

                      {/* Status */}
                      <Td>
                        {row.disqualified ? (
                          <div>
                            <Badge tone="bad">Disqualified</Badge>
                            {row.disqualifiedReason && (
                              <p
                                className="mt-0.5 max-w-[120px] truncate text-[10px] text-rose-700"
                                title={row.disqualifiedReason}
                              >
                                {row.disqualifiedReason}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Badge tone="ok">Active</Badge>
                        )}
                      </Td>

                      {/* Row Actions */}
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1.5 text-xs">
                          {/* Flag Plagiarism Toggle */}
                          <button
                            type="button"
                            onClick={() => handlePlagiarismToggle(row.sessionId, hasPlagiarismFlag)}
                            disabled={actionLoading === `flag-${row.sessionId}`}
                            className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                              hasPlagiarismFlag
                                ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            title={
                              hasPlagiarismFlag ? 'Clear plagiarism flag' : 'Flag sitting as plagiarized'
                            }
                          >
                            {hasPlagiarismFlag ? '✓ Flagged' : 'Flag Plagiarism'}
                          </button>

                          {/* Disqualify / Reinstate Toggle */}
                          <button
                            type="button"
                            onClick={() => handleDisqualify(row.sessionId, row.disqualified)}
                            disabled={actionLoading === `dq-${row.sessionId}`}
                            className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                              row.disqualified
                                ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                : 'border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            }`}
                            title={
                              row.disqualified
                                ? 'Reinstate to public scoreboard'
                                : 'Disqualify and remove from public board'
                            }
                          >
                            {row.disqualified ? 'Reinstate' : 'Disqualify'}
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
