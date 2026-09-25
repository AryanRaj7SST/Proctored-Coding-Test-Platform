'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiPatch, ApiError } from '@/lib/api';

const MAX_FEEDBACK = 5000;

/**
 * Reviewer feedback on one answer, shown to the student with their result
 * (when the test's result visibility is the full breakdown).
 * Scores are never edited here: a wrong grade is fixed by regrading.
 */
export function FeedbackEditor({
  attemptId,
  initialFeedback,
  disabled,
}: {
  attemptId: string;
  initialFeedback: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [feedback, setFeedback] = React.useState(initialFeedback ?? '');
  const [saving, setSaving] = React.useState(false);
  const id = `feedback-${attemptId}`;
  const dirty = feedback.trim() !== (initialFeedback ?? '').trim();

  const save = async () => {
    setSaving(true);
    try {
      await apiPatch(`/api/admin/attempts/${attemptId}`, { feedback });
      toast.push(feedback.trim() ? 'Feedback saved.' : 'Feedback cleared.', 'success');
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not save feedback.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wide text-slate-400">
        Reviewer feedback
      </label>
      <Textarea
        id={id}
        rows={4}
        maxLength={MAX_FEEDBACK}
        value={feedback}
        disabled={disabled || saving}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder={disabled ? 'Available once the answer is submitted.' : 'Write feedback for the student…'}
        aria-describedby={`${id}-hint`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          Shown to the student with their result when the test shares the full breakdown · {feedback.length}/
          {MAX_FEEDBACK}
        </p>
        <Button size="sm" loading={saving} disabled={disabled || !dirty} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save feedback'}
        </Button>
      </div>
    </div>
  );
}
