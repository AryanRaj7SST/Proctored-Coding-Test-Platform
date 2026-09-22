'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardBody, CardHeader, Input, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiPatch, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

export interface TestResultItem {
  id: string;
  testName: string;
  passed: boolean;
  points: number;
  pointsAwarded: number;
  message?: string | null;
}

export function ManualGradingCard({
  attemptId,
  currentScore,
  maxScore,
  initialFeedback = '',
  reviewedAt,
  reviewerName,
  originalScore,
  testResults: initialTestResults,
}: {
  attemptId: string;
  currentScore: number;
  maxScore: number;
  initialFeedback?: string;
  reviewedAt?: string | null;
  reviewerName?: string | null;
  originalScore?: number | null;
  testResults: TestResultItem[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [score, setScore] = React.useState<number>(currentScore);
  const [feedback, setFeedback] = React.useState<string>(initialFeedback);
  const [testResults, setTestResults] = React.useState<TestResultItem[]>(initialTestResults);
  const [showTests, setShowTests] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const autoScore = originalScore ?? currentScore;

  const handleTestChange = (id: string, updates: Partial<TestResultItem>) => {
    setTestResults((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    );
  };

  const handleSumFromTests = () => {
    const sum = testResults.reduce((acc, t) => acc + (t.pointsAwarded || 0), 0);
    setScore(Math.min(sum, maxScore));
    toast.push(`Score set to ${sum} from test cases`, 'info');
  };

  const handleSave = async () => {
    if (score < 0 || score > maxScore) {
      toast.push(`Score must be between 0 and ${maxScore}.`, 'error');
      return;
    }

    setLoading(true);
    try {
      await apiPatch(`/api/admin/attempts/${attemptId}`, {
        score,
        feedback,
        testResults: testResults.map((t) => ({
          id: t.id,
          pointsAwarded: t.pointsAwarded,
          passed: t.passed,
        })),
      });

      toast.push('Manual grading and feedback saved successfully.', 'success');
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to save manual grade.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-brand-500/30">
      <CardHeader
        title="Manual Checking & Grading"
        subtitle="Override the automated score, adjust test marks, and write instructor feedback"
        action={
          reviewedAt ? (
            <Badge tone="ok">
              Reviewed {reviewerName ? `by ${reviewerName}` : ''}
            </Badge>
          ) : (
            <Badge tone="neutral">Auto-Graded</Badge>
          )
        }
      />
      <CardBody className="space-y-4">
        {reviewedAt ? (
          <div className="rounded-md bg-ink-850 p-3 text-xs text-slate-300 ring-1 ring-ink-700">
            <span className="font-medium text-brand-300">Previous Review:</span> Reviewed on{' '}
            {formatDateTime(reviewedAt)}
            {reviewerName ? ` by ${reviewerName}` : ''}.
            {originalScore !== undefined && originalScore !== null ? (
              <span className="ml-1 text-slate-400">(Original auto score: {originalScore}/{maxScore})</span>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="manual-score-input" className="text-xs font-semibold text-slate-200">
              Assigned Score (0 - {maxScore})
            </label>
            <span className="text-xs text-slate-400">
              Percentage: <strong className="text-white">{maxScore > 0 ? Math.round((score / maxScore) * 100) : 0}%</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-32">
              <Input
                id="manual-score-input"
                type="number"
                min={0}
                max={maxScore}
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
              />
            </div>
            <span className="text-sm text-slate-400">/ {maxScore} pts</span>

            <div className="ml-auto flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setScore(maxScore)}
                className="rounded bg-ink-800 px-2 py-1 text-xs text-slate-300 hover:bg-ink-700 hover:text-white transition ring-1 ring-ink-700"
              >
                Full Score ({maxScore})
              </button>
              <button
                type="button"
                onClick={() => setScore(Math.round(maxScore / 2))}
                className="rounded bg-ink-800 px-2 py-1 text-xs text-slate-300 hover:bg-ink-700 hover:text-white transition ring-1 ring-ink-700"
              >
                Half ({Math.round(maxScore / 2)})
              </button>
              <button
                type="button"
                onClick={() => setScore(Math.min(maxScore, score + 5))}
                className="rounded bg-ink-800 px-2 py-1 text-xs text-slate-300 hover:bg-ink-700 hover:text-white transition ring-1 ring-ink-700"
              >
                +5
              </button>
              <button
                type="button"
                onClick={() => setScore(Math.max(0, score - 5))}
                className="rounded bg-ink-800 px-2 py-1 text-xs text-slate-300 hover:bg-ink-700 hover:text-white transition ring-1 ring-ink-700"
              >
                -5
              </button>
              <button
                type="button"
                onClick={() => setScore(autoScore)}
                className="rounded bg-ink-800 px-2 py-1 text-xs text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition ring-1 ring-ink-700"
                title="Reset to automated test run score"
              >
                Reset ({autoScore})
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="instructor-feedback" className="text-xs font-semibold text-slate-200">
            Instructor Feedback & Checking Notes
          </label>
          <Textarea
            id="instructor-feedback"
            rows={3}
            placeholder="Write comments on student's coding style, structure, CSS styling, logic bugs, or grading rationale..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>

        {testResults.length > 0 ? (
          <div className="space-y-2 border-t border-ink-800 pt-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowTests((v) => !v)}
                className="text-xs font-medium text-brand-300 hover:underline flex items-center gap-1"
              >
                <span>{showTests ? '▼ Hide' : '▶ Show'} Individual Test Points ({testResults.length})</span>
              </button>
              {showTests ? (
                <button
                  type="button"
                  onClick={handleSumFromTests}
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  Recalculate total score from tests
                </button>
              ) : null}
            </div>

            {showTests ? (
              <div className="space-y-2 rounded-md bg-ink-900 p-3 ring-1 ring-ink-800">
                {testResults.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800/60 pb-2 text-xs last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`test-pass-${t.id}`}
                          checked={t.passed}
                          onChange={(e) =>
                            handleTestChange(t.id, {
                              passed: e.target.checked,
                              pointsAwarded: e.target.checked ? t.points : 0,
                            })
                          }
                          className="rounded border-ink-600 text-brand-600 focus:ring-brand-500"
                        />
                        <label htmlFor={`test-pass-${t.id}`} className="font-medium text-slate-200">
                          {t.testName}
                        </label>
                      </div>
                      {t.message ? <p className="ml-5 text-[11px] text-slate-500">{t.message}</p> : null}
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={t.points}
                        value={t.pointsAwarded}
                        onChange={(e) =>
                          handleTestChange(t.id, {
                            pointsAwarded: Math.min(t.points, Math.max(0, Number(e.target.value))),
                            passed: Number(e.target.value) > 0,
                          })
                        }
                        className="w-14 rounded bg-ink-950 px-2 py-1 text-right text-xs text-white ring-1 ring-ink-700"
                      />
                      <span className="text-slate-400">/ {t.points} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-800">
          <Button
            variant="primary"
            onClick={handleSave}
            loading={loading}
            className="w-full sm:w-auto"
          >
            Save Manual Grade & Feedback
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
