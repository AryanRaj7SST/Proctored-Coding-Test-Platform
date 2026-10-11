'use client';

import * as React from 'react';
import { Badge, Button, ConfirmDialog, StatusBadge } from '@/components/ui';
import { cn, formatDateTime } from '@/lib/utils';
import { Notice } from './bits';
import type { AdminQuestion, QuestionStatus } from './types';

export type StatusAction = 'publish' | 'unpublish' | 'archive' | 'unarchive';

const STATUS_MEANING: Record<QuestionStatus, string> = {
  DRAFT: 'Being written. It cannot be added to a test until it is validated and published.',
  VALIDATED:
    'Every enabled test case passes against the reference solution. Publish it to make it available.',
  PUBLISHED: 'Available to add to tests. Tests that already use it keep the version they pinned.',
  ARCHIVED:
    'Retired. It cannot be edited or added to tests; past results are unaffected. Restore it to work on it again.',
};

const LIFECYCLE: QuestionStatus[] = ['DRAFT', 'VALIDATED', 'PUBLISHED'];

type Confirm = {
  kind: StatusAction | 'delete';
  title: string;
  message: string;
  label: string;
  danger?: boolean;
};

const CONFIRMS: Record<'unpublish' | 'archive' | 'delete', Confirm> = {
  unpublish: {
    kind: 'unpublish',
    title: 'Unpublish this question?',
    message:
      'It goes back to Validated and can no longer be added to new tests. Tests that already use it keep their pinned version.',
    label: 'Unpublish',
  },
  archive: {
    kind: 'archive',
    title: 'Archive this question?',
    message:
      'Archived questions cannot be edited or added to tests. Tests and results that already use it are not affected. You can restore it later.',
    label: 'Archive',
  },
  delete: {
    kind: 'delete',
    title: 'Delete this question permanently?',
    message:
      'This cannot be undone. A question that is used by a test or has been attempted cannot be deleted; archive it instead.',
    label: 'Delete question',
    danger: true,
  },
};

/** Step 7: lifecycle status, the server's publish blockers, and the status actions. */
export function PublishStep({
  question,
  dirty,
  busy,
  onAction,
  onDelete,
  onSave,
  onRepublishAndRegrade,
  regrading,
}: {
  question: AdminQuestion;
  dirty: boolean;
  busy: StatusAction | 'delete' | null;
  onAction: (action: StatusAction) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onSave: () => void;
  onRepublishAndRegrade?: () => void;
  regrading?: boolean;
}) {
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const status = question.status;
  const canPublish =
    (status === 'DRAFT' || status === 'VALIDATED') && question.blockers.length === 0 && !dirty;

  const runConfirmed = async () => {
    if (!confirm) return;
    if (confirm.kind === 'delete') await onDelete();
    else await onAction(confirm.kind);
    setConfirm(null);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg bg-ink-900 p-4 ring-1 ring-ink-700">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <Badge
            tone={question.validation === 'PASSED' ? 'ok' : question.validation === 'FAILED' ? 'bad' : 'warn'}
          >
            validation {question.validation.replace('_', ' ').toLowerCase()}
          </Badge>
          <span className="text-xs text-slate-500">
            version {question.version}
            {question.updatedAt ? ` · updated ${formatDateTime(question.updatedAt)}` : ''}
          </span>
        </div>
        <p className="text-sm text-slate-300">{STATUS_MEANING[status]}</p>
        <ol aria-label="Question lifecycle" className="flex flex-wrap items-center gap-1.5 text-xs">
          {LIFECYCLE.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              <span
                aria-current={s === status ? 'step' : undefined}
                className={cn(
                  'rounded px-2 py-0.5',
                  s === status ? 'bg-brand-600 font-medium text-white' : 'bg-ink-800 text-slate-400',
                )}
              >
                {s.toLowerCase()}
              </span>
              {i < LIFECYCLE.length - 1 ? <span className="text-slate-600">→</span> : null}
            </li>
          ))}
          <li className="ml-2 flex items-center gap-1.5">
            <span className="text-slate-600">·</span>
            <span
              aria-current={status === 'ARCHIVED' ? 'step' : undefined}
              className={cn(
                'rounded px-2 py-0.5',
                status === 'ARCHIVED' ? 'bg-brand-600 font-medium text-white' : 'bg-ink-800 text-slate-400',
              )}
            >
              archived
            </span>
          </li>
        </ol>
      </div>

      {dirty ? (
        <Notice
          tone="warn"
          title="You have unsaved changes"
          action={
            <Button size="sm" variant="secondary" onClick={onSave}>
              Save now
            </Button>
          }
        >
          <p>The server checks the saved version. Save before publishing.</p>
        </Notice>
      ) : null}

      {status === 'DRAFT' || status === 'VALIDATED' ? (
        question.blockers.length > 0 ? (
          <Notice tone="warn" title="Before this question can be published:">
            <ul className="list-disc space-y-0.5 pl-4">
              {question.blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </Notice>
        ) : (
          <Notice tone="ok" title="Ready to publish">
            <p>Validated against the reference solution with every enabled test case passing.</p>
          </Notice>
        )
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {status === 'DRAFT' || status === 'VALIDATED' ? (
          <Button
            onClick={() => void onAction('publish')}
            loading={busy === 'publish'}
            disabled={!canPublish || busy !== null || regrading}
          >
            Publish
          </Button>
        ) : null}
        {onRepublishAndRegrade && status !== 'ARCHIVED' ? (
          <Button
            variant="secondary"
            className="hover:bg-brand-950/40 hover:text-brand-200 border-brand-500/50 text-brand-300"
            onClick={onRepublishAndRegrade}
            loading={regrading}
            disabled={busy !== null || regrading}
          >
            Save & Republish (recalculate affected students)
          </Button>
        ) : null}
        {status === 'PUBLISHED' ? (
          <Button variant="secondary" onClick={() => setConfirm(CONFIRMS.unpublish)} disabled={busy !== null}>
            Unpublish
          </Button>
        ) : null}
        {status === 'ARCHIVED' ? (
          <Button
            onClick={() => void onAction('unarchive')}
            loading={busy === 'unarchive'}
            disabled={busy !== null}
          >
            Restore
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setConfirm(CONFIRMS.archive)} disabled={busy !== null}>
            Archive
          </Button>
        )}
        <Button
          variant="danger"
          className="ml-auto"
          onClick={() => setConfirm(CONFIRMS.delete)}
          disabled={busy !== null}
        >
          Delete
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Only published questions can be added to tests. Editing the content or test cases of a validated or
        published question returns it to Draft; tests that already use it keep their pinned version.
      </p>

      <ConfirmDialog
        open={confirm !== null}
        theme="dark"
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label}
        danger={confirm?.danger}
        busy={busy !== null}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirmed()}
      />
    </div>
  );
}
