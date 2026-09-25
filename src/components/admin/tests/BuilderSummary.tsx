'use client';

import { Card, CardBody, CardHeader } from '@/components/ui';
import { utcOffsetLabel } from '../exam-types';
import { effectiveWindow, totalMarksOf, type BuilderForm } from './builder-state';
import { ACCESS_LABEL, formatMarks, passMarkShort, scheduleRange, VISIBILITY_LABEL } from './format';
import { SummaryRow, useNow } from './shared';

/** Live summary next to the builder: totals update as the admin edits. */
export function BuilderSummary({ form, assignedCount }: { form: BuilderForm; assignedCount: number | null }) {
  const total = totalMarksOf(form.questions);
  const now = useNow();
  const { start, end } = effectiveWindow(form);
  // DST-correct offset for the test's own dates; today's offset (after mount) otherwise.
  const zoneAt = start ? new Date(start).getTime() : end ? new Date(end).getTime() : (now ?? 0);
  return (
    <Card>
      <CardHeader title="Summary" subtitle="Updates as you edit" />
      <CardBody className="py-2">
        <dl className="divide-y divide-ink-800">
          <SummaryRow label="Questions">{form.questions.length}</SummaryRow>
          <SummaryRow label="Total marks">
            <span className="font-semibold tabular-nums">{formatMarks(total)}</span>
          </SummaryRow>
          <SummaryRow label="Pass mark">
            <span className="text-slate-300">{passMarkShort(total, form.passingPercentage) || '--'}</span>
          </SummaryRow>
          <SummaryRow label="Duration">
            {Number(form.durationMinutes) > 0 ? `${form.durationMinutes} min` : '--'}
          </SummaryRow>
          <SummaryRow label="Window">
            <span className="block">{scheduleRange(start, end, form.timezone)}</span>
            <span className="block text-slate-500">
              {form.timezone} ({utcOffsetLabel(form.timezone, zoneAt)})
            </span>
          </SummaryRow>
          <SummaryRow label="Access">{ACCESS_LABEL[form.accessMode]}</SummaryRow>
          {assignedCount !== null ? <SummaryRow label="Assigned">{assignedCount}</SummaryRow> : null}
          <SummaryRow label="Attempts">{form.maxAttempts}</SummaryRow>
          <SummaryRow label="Results">{VISIBILITY_LABEL[form.resultVisibility]}</SummaryRow>
        </dl>
      </CardBody>
    </Card>
  );
}
