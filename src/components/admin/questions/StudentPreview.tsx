'use client';

import * as React from 'react';
import { QuestionPanel, type StudentQuestion } from '@/components/exam/QuestionPanel';
import { TestResults } from '@/components/exam/TestResults';

/**
 * The question exactly as a student gets it: the exam's question panel and its
 * test case list (every enabled test case, in words, with its equal share of
 * the marks). Uses the student components themselves, not look-alikes.
 */
export function StudentPreview({ question, summary }: { question: StudentQuestion; summary?: string }) {
  return (
    <div className="space-y-3">
      {summary ? <p className="text-sm font-semibold text-slate-800">{summary}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Question panel as students see it" className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question panel</p>
          <div className="h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
            <QuestionPanel question={question} />
          </div>
        </section>
        <section aria-label="Test cases as students see them" className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Test cases ({question.tests.length})
          </p>
          <div className="h-[560px] overflow-hidden rounded-lg bg-white border border-slate-200 shadow-xs">
            {question.tests.length > 0 ? (
              <TestResults outcome={null} running={false} error={null} expectedTests={question.tests} />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-xs text-slate-500">
                No enabled test cases yet. Students would see an empty test list.
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Students expand “What this test checks” to read each test case’s steps and checks.
          </p>
        </section>
      </div>
    </div>
  );
}
