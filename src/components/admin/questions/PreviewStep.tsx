'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { StudentQuestion } from '@/components/exam/QuestionPanel';
import { RenderedOutput } from './RenderedOutput';
import { StudentPreview } from './StudentPreview';
import type { QuestionDraft } from './types';

/** Step 6: the student view of the current (possibly unsaved) question, plus the rendered code. */
export function PreviewStep({
  questionId,
  studentQuestion,
  summary,
  draft,
  dirty,
}: {
  questionId: string | null;
  studentQuestion: StudentQuestion;
  summary: string;
  draft: QuestionDraft;
  dirty: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {dirty ? 'Showing your unsaved changes. ' : ''}Disabled test cases are hidden from students and not
          counted.
        </p>
        {questionId ? (
          <Link
            href={`/admin/questions/${questionId}/preview`}
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-medium"
          >
            Open the saved version’s preview page
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <StudentPreview question={studentQuestion} summary={summary} />

      <section aria-labelledby="rendered-title" className="space-y-2">
        <h3 id="rendered-title" className="text-sm font-semibold text-slate-800">
          Rendered output
        </h3>
        <RenderedOutput
          starter={{ html: draft.starterHtml, css: draft.starterCss, js: draft.starterJs }}
          reference={{ html: draft.referenceHtml, css: draft.referenceCss, js: draft.referenceJs }}
        />
      </section>
    </div>
  );
}
