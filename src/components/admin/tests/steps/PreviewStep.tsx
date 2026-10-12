'use client';

import { Badge, Card, CardBody, CardHeader } from '@/components/ui';
import { testPhase } from '@/lib/timing';
import type { Tone } from '@/lib/utils';
import { formatInZone, utcOffsetLabel } from '../../exam-types';
import { effectiveWindow, totalMarksOf, type BuilderForm } from '../builder-state';
import {
  ACCESS_LABEL,
  DIFFICULTY_TONE,
  formatMarks,
  passMarkText,
  plural,
  scheduleSummary,
  VISIBILITY_LABEL,
} from '../format';
import { Notice, SummaryRow, useNow } from '../shared';
import type { TestPhase, TestStatus } from '../types';

const STUDENT_VIEW: Record<TestPhase, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Not visible to students (draft)', tone: 'neutral' },
  UPCOMING: { label: 'Not open yet', tone: 'neutral' },
  ACTIVE: { label: 'Ready to start', tone: 'ok' },
  ENDED: { label: 'Closed', tone: 'bad' },
  ARCHIVED: { label: 'Hidden (archived)', tone: 'neutral' },
};

/** Step 7: read-only view of the test as students will experience it (unsaved edits included). */
export function PreviewStep({
  form,
  status,
  dirty,
}: {
  form: BuilderForm;
  status: TestStatus | null;
  dirty: boolean;
}) {
  const now = useNow();
  const { start, end } = effectiveWindow(form);
  const total = totalMarksOf(form.questions);
  const duration = Number(form.durationMinutes);
  const tz = form.timezone;
  const zoneAt = new Date(start || end || 0).getTime();
  const phase =
    now === null
      ? null
      : testPhase(
          {
            status: status ?? 'DRAFT',
            startTime: start ? new Date(start) : null,
            endTime: end ? new Date(end) : null,
          },
          new Date(now),
        );
  const view = phase ? STUDENT_VIEW[phase] : null;
  const violations = Number(form.maxViolations);

  return (
    <div className="space-y-4">
      {dirty ? <Notice tone="warn">This preview includes changes you have not saved yet.</Notice> : null}

      <section aria-label="Student dashboard card">
        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">On the student dashboard</p>
        <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{form.title.trim() || 'Untitled test'}</h2>
              {view ? <Badge tone={view.tone}>{view.label}</Badge> : null}
            </div>
            {form.description.trim() ? (
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{form.description}</p>
            ) : null}
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
              <div>
                <dt className="inline">Duration: </dt>
                <dd className="inline font-medium text-slate-700">
                  {Number.isFinite(duration) ? `${duration} min` : '--'}
                </dd>
              </div>
              <div>
                <dt className="inline">Questions: </dt>
                <dd className="inline font-medium text-slate-700">{form.questions.length}</dd>
              </div>
              <div>
                <dt className="inline">Total marks: </dt>
                <dd className="inline font-medium text-slate-700">{formatMarks(total)}</dd>
              </div>
              {start ? (
                <div>
                  <dt className="inline">Opens: </dt>
                  <dd className="inline font-medium text-slate-700">{formatInZone(start, tz)}</dd>
                </div>
              ) : null}
              {end ? (
                <div>
                  <dt className="inline">Closes: </dt>
                  <dd className="inline font-medium text-slate-700">{formatInZone(end, tz)}</dd>
                </div>
              ) : null}
              {start || end ? (
                <div>
                  <dt className="sr-only">Time zone: </dt>
                  <dd className="inline text-slate-500">
                    {tz} ({utcOffsetLabel(tz, zoneAt)})
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
          <span
            aria-hidden="true"
            className="shadow-xs shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white"
          >
            Start test
          </span>
        </Card>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Rules at a glance" />
          <CardBody>
            <dl className="divide-y divide-slate-100">
              <SummaryRow label="When">
                {scheduleSummary({ startIso: start, endIso: end, timeZone: tz, durationMinutes: duration })}
              </SummaryRow>
              <SummaryRow label="Who">{ACCESS_LABEL[form.accessMode]}</SummaryRow>
              <SummaryRow label="Attempts">
                {Number(form.maxAttempts) > 1 ? `${form.maxAttempts} (best score counts)` : '1'}
              </SummaryRow>
              <SummaryRow label="Passing">{passMarkText(total, form.passingPercentage)}</SummaryRow>
              <SummaryRow label="Results">{VISIBILITY_LABEL[form.resultVisibility]}</SummaryRow>
              <SummaryRow label="Proctoring">
                {violations > 0
                  ? `Auto-submit after ${violations} violations`
                  : 'Violations recorded, no auto-submit'}
              </SummaryRow>
              <SummaryRow label="Order">
                {form.shuffleQuestions ? 'Shuffled per student' : 'As listed'}
              </SummaryRow>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Instructions" subtitle="Shown before the student starts." />
          <CardBody>
            {form.instructions.trim() ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {form.instructions}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                No instructions. Consider adding rules and grading notes.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Questions"
          subtitle={`${plural(form.questions.length, 'question')} · ${formatMarks(total)} marks${form.shuffleQuestions ? ' · order shuffled per student' : ''}`}
        />
        <CardBody className="p-0">
          {form.questions.length === 0 ? (
            <p className="p-4 text-xs text-slate-500">No questions yet.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {form.questions.map((q, i) => (
                <li
                  key={q.questionId}
                  className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50"
                >
                  <span className="w-5 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                    {q.title}
                  </span>
                  <Badge tone={DIFFICULTY_TONE[q.difficulty]}>{q.difficulty.toLowerCase()}</Badge>
                  <span className="w-20 text-right text-xs font-medium tabular-nums text-slate-600">
                    {formatMarks(Number(q.marks) || 0)} marks
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
