'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Select,
  Table,
  Td,
  Th,
  StatCard,
} from '@/components/ui';
import { formatDateTime, percentage, statusTone } from '@/lib/utils';

export interface AttemptRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  userBatch: string | null;
  examId: string;
  examTitle: string;
  questionId: string;
  questionTitle: string;
  status: string;
  score: number;
  maxScore: number;
  updatedAt: string;
  submittedAt: string | null;
  manuallyGraded: boolean;
  manualFeedback: string | null;
  /** Submitted, but grading was deferred (runner failure) -- no score yet. */
  gradingPending: boolean;
}

export function AttemptsTable({
  attempts,
  exams,
  questions,
  batches,
  initialExamId = '',
  initialUserId = '',
}: {
  attempts: AttemptRow[];
  exams: { id: string; title: string }[];
  questions: { id: string; title: string }[];
  batches: string[];
  initialExamId?: string;
  initialUserId?: string;
}) {
  const [examId, setExamId] = React.useState(initialExamId);
  const [questionId, setQuestionId] = React.useState('');
  const [batch, setBatch] = React.useState('');
  const [status, setStatus] = React.useState('ALL');
  const [reviewFilter, setReviewFilter] = React.useState<'ALL' | 'MANUAL' | 'AUTO'>('ALL');
  const [search, setSearch] = React.useState('');

  const filtered = React.useMemo(() => {
    return attempts.filter((a) => {
      if (initialUserId && a.userId !== initialUserId) return false;
      if (examId && a.examId !== examId) return false;
      if (questionId && a.questionId !== questionId) return false;
      if (batch && a.userBatch !== batch) return false;

      if (status === 'SUBMITTED_ANY') {
        if (a.status !== 'SUBMITTED' && a.status !== 'AUTO_SUBMITTED') return false;
      } else if (status !== 'ALL' && a.status !== status) {
        return false;
      }

      if (reviewFilter === 'MANUAL' && !a.manuallyGraded) return false;
      if (reviewFilter === 'AUTO' && a.manuallyGraded) return false;

      if (search) {
        const q = search.toLowerCase();
        const matchesName = a.userName?.toLowerCase().includes(q);
        const matchesEmail = a.userEmail.toLowerCase().includes(q);
        const matchesQuestion = a.questionTitle.toLowerCase().includes(q);
        const matchesExam = a.examTitle.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesQuestion && !matchesExam) return false;
      }

      return true;
    });
  }, [attempts, initialUserId, examId, questionId, batch, status, reviewFilter, search]);

  const submittedCount = filtered.filter(
    (a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED',
  ).length;
  const gradedWithMax = filtered.filter(
    (a) => a.maxScore > 0 && a.status !== 'IN_PROGRESS' && !a.gradingPending,
  );
  const avgScore =
    gradedWithMax.length > 0
      ? Math.round(
          (gradedWithMax.reduce((acc, a) => acc + (a.score / a.maxScore) * 100, 0) / gradedWithMax.length) *
            10,
        ) / 10
      : 0;
  const manualCount = filtered.filter((a) => a.manuallyGraded).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total attempts" value={filtered.length} hint={`of ${attempts.length} total`} />
        <StatCard
          label="Submitted"
          value={submittedCount}
          hint={`${percentage(submittedCount, filtered.length || 1)}%`}
        />
        <StatCard label="Average score" value={`${avgScore}%`} hint="for completed attempts" />
        <StatCard
          label="Manually checked"
          value={manualCount}
          hint={
            manualCount > 0 ? `${percentage(manualCount, submittedCount || 1)}% of submissions` : 'None yet'
          }
        />
      </div>

      <Card>
        <CardHeader
          title="Student submissions"
          subtitle={`Showing ${filtered.length} attempts · Click "Review Code" to inspect student source code and grade`}
          action={
            initialUserId || initialExamId ? (
              <Link
                href="/admin/attempts"
                className="hover:text-brand-200 text-xs text-brand-300 hover:underline"
              >
                Clear URL filters
              </Link>
            ) : undefined
          }
        />
        <CardBody className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Input
                placeholder="Search student, email, question..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search attempts"
              />
            </div>

            <Select value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">All tests</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </Select>

            <Select value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
              <option value="">All questions</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                </option>
              ))}
            </Select>

            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ALL">All statuses</option>
              <option value="SUBMITTED_ANY">Submitted (Any)</option>
              <option value="SUBMITTED">Submitted (Manual)</option>
              <option value="AUTO_SUBMITTED">Auto-submitted</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="EXPIRED">Expired</option>
            </Select>

            <Select
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value as 'ALL' | 'MANUAL' | 'AUTO')}
            >
              <option value="ALL">All grading types</option>
              <option value="MANUAL">Manually reviewed</option>
              <option value="AUTO">Auto-graded only</option>
            </Select>
          </div>

          {batches.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-slate-400">Batch:</span>
              <button
                type="button"
                onClick={() => setBatch('')}
                className={`rounded px-2 py-0.5 text-xs transition ${
                  batch === ''
                    ? 'bg-brand-600 font-medium text-white'
                    : 'bg-ink-800 text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              {batches.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBatch(b)}
                  className={`rounded px-2 py-0.5 text-xs transition ${
                    batch === b
                      ? 'bg-brand-600 font-medium text-white'
                      : 'bg-ink-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <EmptyState
              title="No student attempts match these filters"
              description="Try adjusting your search criteria or clear filters to see all submissions."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Question</Th>
                  <Th>Test</Th>
                  <Th>Status</Th>
                  <Th>Score</Th>
                  <Th>Submitted</Th>
                  <Th className="text-right">Code Inspection</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const pct = a.maxScore > 0 ? percentage(a.score, a.maxScore) : 0;
                  return (
                    <tr key={a.id} className="transition-colors hover:bg-ink-850/50">
                      <Td>
                        <p className="font-medium text-slate-100">{a.userName ?? a.userEmail}</p>
                        <p className="text-xs text-slate-500">
                          {a.userEmail}
                          {a.userBatch ? ` · ${a.userBatch}` : ''}
                        </p>
                      </Td>
                      <Td className="font-medium text-slate-300">{a.questionTitle}</Td>
                      <Td className="text-slate-400">{a.examTitle}</Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={statusTone(a.status)}>
                            {a.status.replace('_', ' ').toLowerCase()}
                          </Badge>
                          {a.manuallyGraded ? (
                            <Badge tone="info" className="py-0 text-[10px]">
                              manually graded
                            </Badge>
                          ) : null}
                        </div>
                      </Td>
                      <Td>
                        {a.status === 'IN_PROGRESS' ? (
                          <span className="text-slate-500">—</span>
                        ) : a.gradingPending ? (
                          <Badge tone="warn">grading pending</Badge>
                        ) : (
                          <div>
                            <span className="font-semibold text-slate-100">
                              {a.score}/{a.maxScore}
                            </span>
                            <span className="ml-1 text-xs text-slate-400">({pct}%)</span>
                          </div>
                        )}
                      </Td>
                      <Td className="text-xs text-slate-400">
                        {a.submittedAt ? formatDateTime(a.submittedAt) : formatDateTime(a.updatedAt)}
                      </Td>
                      <Td className="text-right">
                        <Link
                          href={`/admin/attempts/${a.id}`}
                          className="inline-flex items-center gap-1 rounded-md bg-ink-800 px-2.5 py-1.5 text-xs font-medium text-brand-300 ring-1 ring-inset ring-ink-600 transition hover:bg-brand-600 hover:text-white"
                        >
                          Review Code &rarr;
                        </Link>
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
