'use client';

import * as React from 'react';
import { Badge, Button, Card, CardBody, CardHeader, Tabs } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { PreviewFrame } from '@/components/editor/PreviewFrame';
import { apiPost, ApiError } from '@/lib/api';

interface ValidationRunResult {
  ok: boolean;
  passedCount: number;
  totalCount: number;
  results: { testName: string; passed: boolean; message?: string }[];
}

type Source = { html: string; css: string; js: string };

/**
 * Render the starter and reference solutions in the same sandbox students get,
 * and re-run validation without leaving the page.
 */
export function QuestionPreviewRunner({
  questionId,
  hasReference,
  starter,
  reference,
}: {
  questionId: string;
  hasReference: boolean;
  starter: Source;
  reference: Source;
}) {
  const toast = useToast();
  const [which, setWhich] = React.useState<'starter' | 'reference'>(hasReference ? 'reference' : 'starter');
  const [key, setKey] = React.useState(1);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<ValidationRunResult | null>(null);

  const source = which === 'reference' ? reference : starter;

  const run = async () => {
    setRunning(true);
    try {
      const res = await apiPost<ValidationRunResult>(`/api/questions/${questionId}/validate`, { useReference: true });
      setResult(res);
      toast.push(res.ok ? 'Reference solution passes every test.' : 'Validation failed.', res.ok ? 'success' : 'error');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Validation could not run.', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Rendered output"
        subtitle="Same sandbox as the student preview"
        action={
          <Button size="sm" onClick={() => void run()} loading={running} disabled={!hasReference}>
            Re-validate
          </Button>
        }
      />
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <Tabs
            tabs={[
              { id: 'starter', label: 'Starter' },
              { id: 'reference', label: 'Reference' },
            ]}
            active={which}
            onChange={(id) => {
              setWhich(id as 'starter' | 'reference');
              setKey((k) => k + 1);
            }}
          />
          <button
            type="button"
            onClick={() => setKey((k) => k + 1)}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-ink-800 hover:text-white"
          >
            Refresh
          </button>
        </div>

        <div className="h-64 overflow-hidden rounded-md bg-white ring-1 ring-ink-700">
          <PreviewFrame html={source.html} css={source.css} js={source.js} refreshKey={key} />
        </div>

        {result ? (
          <div className="space-y-1.5">
            <Badge tone={result.ok ? 'ok' : 'bad'}>
              {result.passedCount}/{result.totalCount} passed
            </Badge>
            <ul className="space-y-1 text-xs">
              {result.results.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className={r.passed ? 'text-ok' : 'text-bad'}>{r.passed ? '✓' : '✕'}</span>
                  <span className="text-slate-300">{r.testName}</span>
                  {r.message ? <span className="text-slate-500">— {r.message}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
