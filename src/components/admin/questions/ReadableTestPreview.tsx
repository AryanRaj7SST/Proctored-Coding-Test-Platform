'use client';

import * as React from 'react';
import { readableTest } from './student-view';

/**
 * "What students see" for one test case: the same fields, in the same order,
 * as the student's test list (name, expected behaviour or description, the
 * interactions and the checks in words).
 */
export function ReadableTestPreview({
  name,
  description,
  expectedBehavior,
  testCode,
  shareText,
}: {
  name: string;
  description: string;
  expectedBehavior: string;
  testCode: string;
  shareText: string | null;
}) {
  const readable = React.useMemo(() => readableTest(testCode), [testCode]);
  const summary = expectedBehavior.trim() || description.trim();

  return (
    <div className="shadow-xs space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-slate-900">{name.trim() || 'Untitled test case'}</p>
        {shareText ? (
          <span className="shrink-0 font-mono text-[11px] font-medium text-slate-500">{shareText}</span>
        ) : null}
      </div>
      {summary ? <p className="leading-relaxed text-slate-600">{summary}</p> : null}
      {readable ? (
        <>
          {readable.steps.length > 0 ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Steps</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-slate-700">
                {readable.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Checks</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
              {readable.checks.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="text-slate-500">The readable version appears once the test body is valid.</p>
      )}
    </div>
  );
}
