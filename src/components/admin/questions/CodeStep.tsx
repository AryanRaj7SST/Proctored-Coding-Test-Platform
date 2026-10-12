'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { Button, Tabs } from '@/components/ui';
import { CodeEditor, type CodeLanguage } from '@/components/editor/CodeEditor';
import { PreviewFrame } from '@/components/editor/PreviewFrame';
import { cn } from '@/lib/utils';
import type { StepFieldProps } from './BasicInfoStep';
import type { QuestionDraft } from './types';

type Part = 'html' | 'css' | 'js' | 'rendered';

const LANGUAGE: Record<Exclude<Part, 'rendered'>, CodeLanguage> = {
  html: 'html',
  css: 'css',
  js: 'javascript',
};

type CodeKey = keyof Pick<
  QuestionDraft,
  'starterHtml' | 'starterCss' | 'starterJs' | 'referenceHtml' | 'referenceCss' | 'referenceJs'
>;

function CodeSet({
  id,
  title,
  description,
  tone,
  keys,
  draft,
  set,
  errors,
  readOnly,
  action,
}: StepFieldProps & {
  id: string;
  title: React.ReactNode;
  description: string;
  tone: 'neutral' | 'secret';
  keys: Record<Exclude<Part, 'rendered'>, CodeKey>;
  action?: React.ReactNode;
}) {
  const [part, setPart] = React.useState<Part>('html');
  const [refreshKey, setRefreshKey] = React.useState(1);
  const values = { html: draft[keys.html], css: draft[keys.css], js: draft[keys.js] };
  const partErrors = [keys.html, keys.css, keys.js].map((k) => errors[k]).filter(Boolean);
  const dot = (value: string) =>
    value ? (
      <>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ok" />
        <span className="sr-only">(has content)</span>
      </>
    ) : undefined;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        'space-y-3 rounded-lg p-4 border transition-all',
        tone === 'secret' ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-slate-200 shadow-xs',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        {action}
      </div>
      <Tabs
        tabs={[
          { id: 'html', label: 'HTML', badge: dot(values.html) },
          { id: 'css', label: 'CSS', badge: dot(values.css) },
          { id: 'js', label: 'JS', badge: dot(values.js) },
          { id: 'rendered', label: 'Rendered' },
        ]}
        active={part}
        onChange={(next) => {
          setPart(next as Part);
          if (next === 'rendered') setRefreshKey((k) => k + 1);
        }}
      />
      <div className="h-[340px] overflow-hidden rounded-md border border-slate-200 shadow-xs">
        {part === 'rendered' ? (
          <PreviewFrame html={values.html} css={values.css} js={values.js} refreshKey={refreshKey} />
        ) : (
          <CodeEditor
            key={`${id}-${part}`}
            value={values[part]}
            language={LANGUAGE[part]}
            readOnly={readOnly}
            onChange={(next) => set(keys[part], next)}
          />
        )}
      </div>
      {partErrors.length ? (
        <p className="text-xs font-medium text-rose-600" role="alert">
          {partErrors.join(' ')}
        </p>
      ) : null}
    </section>
  );
}

/** Step 3: the starter code students begin with, and the admin-only reference solution. */
export function CodeStep(props: StepFieldProps) {
  const { draft, set, readOnly } = props;
  const referenceEmpty = !draft.referenceHtml && !draft.referenceCss && !draft.referenceJs;
  const starterEmpty = !draft.starterHtml && !draft.starterCss && !draft.starterJs;

  return (
    <div className="space-y-5">
      <CodeSet
        {...props}
        id="starter"
        title="Starter code"
        description="What every student sees in the editor when they open the question."
        tone="neutral"
        keys={{ html: 'starterHtml', css: 'starterCss', js: 'starterJs' }}
      />
      <CodeSet
        {...props}
        id="reference"
        title={
          <>
            <Lock className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
            Reference solution — never shown to students
          </>
        }
        description="A complete, correct answer. “Validate Question” runs every enabled test case against it; it is required before publishing."
        tone="secret"
        keys={{ html: 'referenceHtml', css: 'referenceCss', js: 'referenceJs' }}
        action={
          referenceEmpty && !starterEmpty && !readOnly ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                set('referenceHtml', draft.starterHtml);
                set('referenceCss', draft.starterCss);
                set('referenceJs', draft.starterJs);
              }}
            >
              Start from the starter code
            </Button>
          ) : null
        }
      />
    </div>
  );
}
