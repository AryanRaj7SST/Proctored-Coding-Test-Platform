'use client';

import * as React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button, Tabs } from '@/components/ui';
import { PreviewFrame } from '@/components/editor/PreviewFrame';

type Source = { html: string; css: string; js: string };

/** Starter vs reference solution rendered in the same sandbox as the student's live preview. */
export function RenderedOutput({ starter, reference }: { starter: Source; reference: Source }) {
  const hasReference = Boolean(reference.html || reference.css || reference.js);
  const [which, setWhich] = React.useState<'starter' | 'reference'>(hasReference ? 'reference' : 'starter');
  const [refreshKey, setRefreshKey] = React.useState(1);
  const source = which === 'reference' ? reference : starter;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          tabs={[
            { id: 'starter', label: 'Starter code' },
            { id: 'reference', label: 'Reference solution (admin only)' },
          ]}
          active={which}
          onChange={(id) => {
            setWhich(id as 'starter' | 'reference');
            setRefreshKey((k) => k + 1);
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => setRefreshKey((k) => k + 1)}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Reload
        </Button>
      </div>
      <div className="h-72 overflow-hidden rounded-md bg-white border border-slate-200 shadow-xs">
        {which === 'reference' && !hasReference ? (
          <div className="flex h-full items-center justify-center bg-slate-50 px-6 text-center text-xs text-slate-500">
            No reference solution yet. Add one in the Starter code step.
          </div>
        ) : (
          <PreviewFrame html={source.html} css={source.css} js={source.js} refreshKey={refreshKey} />
        )}
      </div>
    </div>
  );
}
