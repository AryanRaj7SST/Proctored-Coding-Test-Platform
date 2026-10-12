'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge, EmptyState, Tabs } from '@/components/ui';
import { AttemptCodeViewer } from '@/app/(admin)/admin/attempts/[id]/AttemptCodeViewer';
import { cn } from '@/lib/utils';
import { formatInZone, formatScore, questionStatus } from './format';
import { FeedbackEditor } from './FeedbackEditor';
import { RegradeAttemptDialog } from './RegradeAttemptDialog';
import { TestCaseList } from './TestCaseList';
import type { SittingQuestion } from './types';

type Tab = 'tests' | 'code' | 'feedback';

/**
 * One question of a sitting: its server-computed score and status, and on
 * expand the graded test cases, the submitted code (read-only), per-answer
 * regrade and reviewer feedback.
 */
export function QuestionResultCard({
  question: q,
  index,
  timeZone,
}: {
  question: SittingQuestion;
  index: number;
  timeZone: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>('tests');
  const status = questionStatus(q);
  const label = `Q${index + 1}`;
  const panelId = `question-panel-${q.attemptId}`;
  const scored = status.submitted && !status.pending && q.score !== null;

  const subline = !status.submitted
    ? 'Not submitted'
    : status.pending
      ? 'Not scored yet: grading pending'
      : `${q.passedCount}/${q.enabledCount} test${q.enabledCount === 1 ? '' : 's'} passed`;

  return (
    <li className="shadow-xs rounded-lg border border-slate-200 bg-white">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <span
            aria-hidden="true"
            className={cn('font-bold text-slate-400 transition-transform', open ? 'rotate-90' : undefined)}
          >
            ›
          </span>
          <span className="w-8 shrink-0 font-mono text-xs text-slate-400">{label}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{q.title}</span>
            <span className="block text-xs text-slate-500">
              {subline}
              {q.reviewFeedback ? ' · feedback given' : ''}
            </span>
          </span>
          <span
            className={cn(
              'shrink-0 font-mono text-sm font-semibold',
              scored ? 'text-slate-900' : 'text-slate-400',
            )}
            title={scored ? `${q.score} of ${q.maxScore} marks` : 'No score recorded'}
          >
            {formatScore(scored ? q.score : null, q.maxScore)}
          </span>
          <Badge tone={status.tone} className="w-32 shrink-0 justify-center">
            {status.label}
          </Badge>
        </button>
      </h3>

      {open ? (
        <div id={panelId} className="space-y-3 border-t border-slate-200 px-4 pb-4 pt-3">
          <GradingNotice question={q} pending={status.pending} />

          <p className="text-xs text-slate-500">
            {q.submittedAt ? `Submitted ${formatInZone(q.submittedAt, timeZone)}` : 'Not submitted'}
            {q.gradedAt ? ` · graded ${formatInZone(q.gradedAt, timeZone)}` : ''} · question v
            {q.questionVersion}
            {' · '}
            {q.runCount} test run{q.runCount === 1 ? '' : 's'}
          </p>

          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200">
            <Tabs
              tabs={[
                {
                  id: 'tests',
                  label: 'Test cases',
                  badge: <span className="text-slate-500">{q.testCases.length}</span>,
                },
                { id: 'code', label: 'Submitted code' },
                {
                  id: 'feedback',
                  label: 'Feedback',
                  badge: q.reviewFeedback ? (
                    <span aria-label="has feedback" className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                  ) : undefined,
                },
              ]}
              active={tab}
              onChange={(id) => setTab(id as Tab)}
            />
            <div className="flex items-center gap-3 pb-1.5">
              <Link
                href={`/admin/attempts/${q.attemptId}`}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Run history &amp; proctoring &rarr;
              </Link>
              <RegradeAttemptDialog
                attemptId={q.attemptId}
                questionLabel={`${label}: ${q.title}`}
                maxScore={q.maxScore}
                fullMarks={q.graded && q.resultStatus === 'PASSED'}
                disabled={!status.submitted}
              />
            </div>
          </div>

          <div
            role="tabpanel"
            aria-label={tab === 'tests' ? 'Test cases' : tab === 'code' ? 'Submitted code' : 'Feedback'}
          >
            {tab === 'tests' ? (
              q.testCases.length > 0 ? (
                <TestCaseList testCases={q.testCases} />
              ) : (
                <EmptyState
                  title={
                    !status.submitted
                      ? 'Not submitted yet'
                      : status.pending
                        ? 'No graded test results yet'
                        : 'No test results recorded'
                  }
                  description={
                    status.pending
                      ? 'Grading is pending. Regrade once the runner is available.'
                      : !status.submitted
                        ? 'Test results appear once this answer is submitted and graded.'
                        : q.enabledCount === 0
                          ? 'This question had no enabled test cases when the attempt started.'
                          : undefined
                  }
                />
              )
            ) : tab === 'code' ? (
              <AttemptCodeViewer html={q.code.html} css={q.code.css} js={q.code.js} starter={q.starter} />
            ) : (
              <FeedbackEditor
                attemptId={q.attemptId}
                initialFeedback={q.reviewFeedback}
                disabled={!status.submitted}
              />
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Admin-only grading state: pending explanation and the runner's error detail. */
function GradingNotice({ question: q, pending }: { question: SittingQuestion; pending: boolean }) {
  if (!pending && !q.gradingError) return null;
  return (
    <div
      role="status"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
    >
      <p className="font-medium">
        {pending
          ? 'Grading pending: the code is saved and no score is recorded yet.'
          : 'The last grading attempt could not finish. The grade shown is from the previous successful grading.'}
      </p>
      {q.gradingError ? (
        <p className="mt-1 text-amber-200/80">
          Runner detail (admins only): <code className="font-mono text-amber-100">{q.gradingError}</code>
        </p>
      ) : null}
      {pending ? <p className="mt-1 text-amber-200/80">Use Regrade once the runner is available.</p> : null}
    </div>
  );
}
