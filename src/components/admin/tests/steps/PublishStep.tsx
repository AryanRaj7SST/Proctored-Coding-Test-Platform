'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiDelete, apiPost, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatInZone } from '../../exam-types';
import { effectiveWindow, type BuilderForm } from '../builder-state';
import { plural } from '../format';
import { ConfirmAction, Notice, PhaseBadge, SummaryRow } from '../shared';
import type { StatusAction, TestDetail, TestStatus } from '../types';

type PendingAction = StatusAction | 'delete';

const LIFECYCLE: { status: TestStatus; label: string }[] = [
  { status: 'DRAFT', label: 'Draft' },
  { status: 'PUBLISHED', label: 'Published' },
  { status: 'ENDED', label: 'Ended' },
  { status: 'ARCHIVED', label: 'Archived' },
];

const DONE_MESSAGE: Record<PendingAction, string> = {
  publish: 'Test published.',
  unpublish: 'Test moved back to draft.',
  close: 'Test closed. Open sittings were submitted for grading.',
  archive: 'Test archived.',
  unarchive: 'Test restored.',
  delete: 'Test deleted.',
};

function Consequences({ action, detail }: { action: PendingAction; detail: TestDetail }) {
  switch (action) {
    case 'publish':
      return (
        <>
          <p>Publishing makes the test visible to the students who can access it.</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
            <li>
              {detail.accessMode === 'ASSIGNED_USERS_ONLY'
                ? 'Only assigned students will see it.'
                : 'Every signed-in student will see it.'}
            </li>
            <li>
              {detail.startTime
                ? `Students can start from ${formatInZone(detail.startTime, detail.timezone)} (${detail.timezone}).`
                : 'Students can start immediately.'}
            </li>
            <li>
              Each question&apos;s current version is pinned now: later edits to those questions will not
              change this test.
            </li>
            <li>You can unpublish until the first student starts.</li>
          </ul>
        </>
      );
    case 'unpublish':
      return (
        <p>
          The test goes back to draft and disappears from student dashboards. Assignments are kept. This is
          only possible while nobody has started it.
        </p>
      );
    case 'close':
      return (
        <>
          <p>Closing ends the test now for everyone.</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
            <li>Students in the middle of a sitting are submitted and graded immediately.</li>
            <li>Nobody can start it again. The closed test cannot be reopened.</li>
            <li>Results are kept.</li>
          </ul>
        </>
      );
    case 'archive':
      return (
        <p>
          Archiving hides the test from students and from the active lists. Results are kept and it becomes
          read-only. You can restore it later.
        </p>
      );
    case 'unarchive':
      return (
        <p>
          The test is restored as {detail.publishedAt ? 'Ended (it had been published)' : 'a Draft'} and
          becomes editable again.
        </p>
      );
    case 'delete':
      return (
        <p>
          <strong className="font-semibold text-slate-900">{detail.title}</strong> will be permanently deleted
          with its question list and assignments. This cannot be undone.
        </p>
      );
  }
}

const TITLES: Record<
  PendingAction,
  { title: string; label: string; variant: 'primary' | 'danger' | 'success' }
> = {
  publish: { title: 'Publish this test?', label: 'Publish', variant: 'success' },
  unpublish: { title: 'Unpublish this test?', label: 'Unpublish', variant: 'primary' },
  close: { title: 'Close this test now?', label: 'Close now', variant: 'danger' },
  archive: { title: 'Archive this test?', label: 'Archive', variant: 'primary' },
  unarchive: { title: 'Restore this test?', label: 'Restore', variant: 'primary' },
  delete: { title: 'Delete this test?', label: 'Delete permanently', variant: 'danger' },
};

/** Step 8: status, what blocks publishing, and lifecycle actions. */
export function PublishStep({
  detail,
  form,
  dirty,
  assignedCount,
  onDetail,
}: {
  detail: TestDetail;
  form: BuilderForm;
  dirty: boolean;
  assignedCount: number;
  onDetail: (detail: TestDetail) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState<PendingAction | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { status, sittingCount } = detail;
  const started = sittingCount > 0;
  const { start, end } = effectiveWindow(form);

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending === 'delete') {
        await apiDelete(`/api/exams/${detail.id}`);
        toast.push(DONE_MESSAGE.delete, 'success');
        router.push('/admin/exams');
        return;
      }
      const next = await apiPost<TestDetail>(`/api/exams/${detail.id}/status`, { action: pending });
      onDetail(next);
      toast.push(DONE_MESSAGE[pending], 'success');
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.', 'error');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const warnings: string[] = [];
  if (form.accessMode === 'ASSIGNED_USERS_ONLY' && assignedCount === 0) {
    warnings.push('Nobody is assigned yet, so nobody can take this test. Assign students first.');
  }
  if (!end) warnings.push('There is no closing time: the test stays open until you close it.');
  if (!start && status === 'DRAFT')
    warnings.push('There is no start time: students can start as soon as it is published.');
  const noTests = form.questions.filter((q) => q.enabledTests === 0);
  if (noTests.length > 0) {
    warnings.push(
      `${plural(noTests.length, 'question has', 'questions have')} no enabled test cases and cannot award marks.`,
    );
  }

  const actionButton = (action: PendingAction, opts: { disabled?: boolean; reason?: string } = {}) => (
    <div key={action} className="space-y-1">
      <Button
        variant={
          TITLES[action].variant === 'danger' ? 'danger' : action === 'publish' ? 'success' : 'secondary'
        }
        disabled={opts.disabled || busy}
        onClick={() => setPending(action)}
      >
        {TITLES[action].label}
      </Button>
      {opts.disabled && opts.reason ? (
        <p className="max-w-[16rem] text-xs text-slate-500">{opts.reason}</p>
      ) : null}
    </div>
  );

  const saveFirst = dirty ? 'Save or discard your changes first.' : undefined;
  const deleteBlocked = started
    ? 'Students have started this test — archive it instead so results stay intact.'
    : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Status" />
        <CardBody className="space-y-4">
          <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Lifecycle">
            {LIFECYCLE.map((s, i) => (
              <li key={s.status} className="flex items-center gap-2">
                <span
                  aria-current={s.status === status ? 'step' : undefined}
                  className={cn(
                    'rounded-full px-3 py-1 ring-1 ring-inset',
                    s.status === status
                      ? 'shadow-xs bg-blue-600 font-semibold text-white ring-blue-600'
                      : 'bg-slate-100 text-slate-600 ring-slate-200',
                  )}
                >
                  {s.label}
                </span>
                {i < LIFECYCLE.length - 1 ? (
                  <span aria-hidden="true" className="text-slate-400">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <dl className="divide-y divide-slate-100 sm:max-w-md">
            <SummaryRow label="Phase">
              <PhaseBadge phase={detail.phase} />
            </SummaryRow>
            <SummaryRow label="Published">
              {detail.publishedAt
                ? `${formatInZone(detail.publishedAt, detail.timezone)} (${detail.timezone})`
                : 'Never'}
            </SummaryRow>
            <SummaryRow label="Students started">{sittingCount}</SummaryRow>
            <SummaryRow label="Questions & marks">
              {detail.locked ? 'Locked (students have started)' : 'Editable'}
            </SummaryRow>
          </dl>
        </CardBody>
      </Card>

      {status === 'DRAFT' ? (
        <Card>
          <CardHeader
            title="Ready to publish?"
            subtitle={
              dirty ? 'Checked against the last saved version — save to re-check.' : 'Checked by the server.'
            }
          />
          <CardBody className="space-y-3">
            {detail.blockers.length > 0 ? (
              <Notice tone="bad" title="Fix these before publishing">
                <ul className="list-disc space-y-1 pl-4">
                  {detail.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </Notice>
            ) : (
              <Notice tone="ok" title="No blockers">
                Every question is published and the schedule is valid.
              </Notice>
            )}
          </CardBody>
        </Card>
      ) : null}

      {warnings.length > 0 && status !== 'ARCHIVED' && status !== 'ENDED' ? (
        <Notice tone="warn" title="Worth checking">
          <ul className="list-disc space-y-1 pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <Card>
        <CardHeader title="Actions" />
        <CardBody>
          <div className="flex flex-wrap items-start gap-3">
            {status === 'DRAFT'
              ? actionButton('publish', {
                  disabled: dirty || detail.blockers.length > 0,
                  reason: saveFirst ?? 'Resolve the blockers above first.',
                })
              : null}
            {status === 'PUBLISHED'
              ? [
                  actionButton('unpublish', {
                    disabled: dirty || started,
                    reason: saveFirst ?? 'Students have started — close or archive it instead.',
                  }),
                  actionButton('close', { disabled: dirty, reason: saveFirst }),
                ]
              : null}
            {status === 'PUBLISHED' || status === 'ENDED'
              ? actionButton('archive', { disabled: dirty, reason: saveFirst })
              : null}
            {status === 'ARCHIVED' ? actionButton('unarchive') : null}
            {actionButton('delete', { disabled: started, reason: deleteBlocked })}
          </div>
        </CardBody>
      </Card>

      {pending ? (
        <ConfirmAction
          open
          title={TITLES[pending].title}
          confirmLabel={TITLES[pending].label}
          variant={TITLES[pending].variant}
          busy={busy}
          onConfirm={() => void run()}
          onCancel={() => setPending(null)}
        >
          <Consequences action={pending} detail={detail} />
        </ConfirmAction>
      ) : null}
    </div>
  );
}
