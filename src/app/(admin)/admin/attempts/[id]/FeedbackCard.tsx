'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardBody, CardHeader, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiPatch, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

/**
 * Written feedback for the student. Scores are not editable here: they come
 * only from the grading formula, and a wrong grade is fixed by regrading.
 */
export function FeedbackCard({
  attemptId,
  submitted,
  initialFeedback,
  reviewedAt,
  reviewerName,
}: {
  attemptId: string;
  submitted: boolean;
  initialFeedback: string;
  reviewedAt?: string | null;
  reviewerName?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [feedback, setFeedback] = React.useState(initialFeedback);
  const [saving, setSaving] = React.useState(false);

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
    <Card>
      <CardHeader
        title="Reviewer feedback"
        subtitle={
          reviewedAt
            ? `Last saved ${formatDateTime(reviewedAt)}${reviewerName ? ` by ${reviewerName}` : ''}`
            : 'Visible to the student with their result'
        }
      />
      <CardBody className="space-y-3">
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={4}
          maxLength={5000}
          disabled={!submitted || saving}
          placeholder={
            submitted ? 'Write feedback for the student...' : 'Available once the attempt is submitted.'
          }
          aria-label="Reviewer feedback"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!submitted || saving || feedback === initialFeedback}
          >
            {saving ? 'Saving...' : 'Save feedback'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
