'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiPost, ApiError } from '@/lib/api';

/**
 * Grade attempts whose grading was deferred because the runner failed.
 * With `attemptId` it grades that attempt; otherwise every pending attempt
 * (optionally limited to `examId`).
 */
export function RegradeButton({
  attemptId,
  examId,
  label = 'Grade now',
}: {
  attemptId?: string;
  examId?: string;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (attemptId) {
        const res = await apiPost<{ graded: boolean; skipped: boolean; error: string | null }>(
          `/api/admin/attempts/${attemptId}/regrade`,
          { reason: 'Grading pending: retry from the attempt page' },
        );
        toast.push(
          res.graded
            ? 'Attempt graded.'
            : res.skipped
              ? 'Already full marks; nothing to regrade.'
              : `Grading failed again: ${res.error ?? 'runner unavailable'}`,
          res.graded || res.skipped ? 'success' : 'error',
        );
      } else {
        const res = await apiPost<{ attempted: number; graded: number; failed: number; error?: string }>(
          '/api/admin/attempts/regrade',
          examId ? { examId } : {},
        );
        toast.push(
          res.failed > 0
            ? `Graded ${res.graded} of ${res.attempted}. ${res.failed} still pending: ${res.error ?? 'runner unavailable'}`
            : `Graded ${res.graded} pending attempt(s).`,
          res.failed > 0 ? 'error' : 'success',
        );
      }
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not start grading.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="secondary" loading={busy} onClick={() => void run()}>
      {label}
    </Button>
  );
}
