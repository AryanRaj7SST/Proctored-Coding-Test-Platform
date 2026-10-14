'use client';

import * as React from 'react';
import { useToast } from '@/components/ui/Toast';

interface SimilarityPromotionButtonProps {
  examId: string;
  attemptAId: string;
  attemptBId: string;
}

export function SimilarityPromotionButton({
  examId,
  attemptAId,
  attemptBId,
}: SimilarityPromotionButtonProps) {
  const [loading, setLoading] = React.useState(false);
  const [flagged, setFlagged] = React.useState(false);
  const toast = useToast();

  const handlePromote = async () => {
    if (flagged || loading) return;

    if (!confirm('Promote this similarity pair to a PLAGIARISM flag on both submissions?')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'promote_similarity_pair',
          attemptAId,
          attemptBId,
          note: 'One-click promotion from similarity report',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to promote similarity pair');
      }

      setFlagged(true);
      toast.success('Successfully flagged pair as PLAGIARISM.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error promoting similarity pair';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (flagged) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
        ✓ Flagged Plagiarism
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handlePromote}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100 hover:text-rose-800 disabled:opacity-50"
      title="Promote pair to PLAGIARISM flag (audited, reversible)"
    >
      <span>🚩</span>
      <span>{loading ? 'Flagging…' : 'Promote to Plagiarism'}</span>
    </button>
  );
}
