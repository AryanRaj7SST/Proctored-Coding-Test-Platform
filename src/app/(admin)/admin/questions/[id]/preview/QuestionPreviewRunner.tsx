'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { Button, Card, CardBody, CardHeader } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiPost, ApiError } from '@/lib/api';
import { Notice } from '@/components/admin/questions/bits';
import { RenderedOutput } from '@/components/admin/questions/RenderedOutput';
import { ValidationResults, isRunnerErrorCode } from '@/components/admin/questions/ValidationResults';
import type { ValidationRun } from '@/components/admin/questions/types';

type Source = { html: string; css: string; js: string };

/**
 * Render the saved starter and reference solutions in the same sandbox
 * students get, and run "Validate Question" without leaving the page.
 */
export function QuestionPreviewRunner({
  questionId,
  canValidate,
  cannotValidateReason,
  starter,
  reference,
}: {
  questionId: string;
  canValidate: boolean;
  cannotValidateReason?: string;
  starter: Source;
  reference: Source;
}) {
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = React.useState(false);
  const [run, setRun] = React.useState<ValidationRun | null>(null);
  const [runnerNotice, setRunnerNotice] = React.useState<string | null>(null);

  const validate = async () => {
    setRunning(true);
    setRunnerNotice(null);
    try {
      const result = await apiPost<ValidationRun>(`/api/questions/${questionId}/validate`);
      setRun(result);
      toast.push(
        result.ok ? 'Validation passed: every enabled test case passes.' : 'Validation failed.',
        result.ok ? 'success' : 'error',
      );
      // Status, validation and publish blockers on this page come from the server.
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && isRunnerErrorCode(err.code)) setRunnerNotice(err.message);
      else toast.push(err instanceof ApiError ? err.message : 'Validation could not run.', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Rendered output & validation"
        subtitle="Same sandbox as the student preview. Validation runs the saved question."
        action={
          <Button
            size="sm"
            onClick={() => void validate()}
            loading={running}
            disabled={!canValidate}
            title={canValidate ? undefined : cannotValidateReason}
          >
            {!running ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            Validate Question
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {!canValidate && cannotValidateReason ? (
          <p className="text-xs text-slate-400">{cannotValidateReason}</p>
        ) : null}
        <RenderedOutput starter={starter} reference={reference} />
        {runnerNotice ? (
          <Notice tone="warn" title="The test runner is not available right now" role="alert">
            <p>{runnerNotice}</p>
            <p>
              This is an infrastructure problem, not a verdict on the question: its validation state is
              unchanged.
            </p>
          </Notice>
        ) : null}
        {run ? <ValidationResults run={run} /> : null}
      </CardBody>
    </Card>
  );
}
