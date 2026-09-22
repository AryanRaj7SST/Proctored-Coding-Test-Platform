'use client';

import * as React from 'react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface StudentQuestion {
  id: string;
  title: string;
  description: string;
  instructions: string | null;
  mediaUrl: string | null;
  difficulty: string;
  points: number;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  publicTests: { id: string; name: string; description: string | null; points: number }[];
  hiddenTestCount: number;
}

/**
 * Render the question text.
 *
 * The body is plain text with light structure (blank lines make paragraphs,
 * `- ` makes bullets). It is rendered as React text nodes -- never
 * dangerouslySetInnerHTML -- so an admin-authored description cannot inject
 * markup into the exam page.
 */
function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
        if (isList) {
          return (
            <ul key={i} className="my-2 list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\s*[-*]\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="my-2 whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </>
  );
}

export function QuestionPanel({
  question,
  earned,
  maxScore,
  order = 1,
  bookmarked = false,
  onToggleBookmark,
}: {
  question: StudentQuestion;
  earned: number | null;
  maxScore: number;
  order?: number;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white text-slate-800">
      {/* Top Tab Bar */}
      <div className="border-b border-slate-200 px-5 flex items-center bg-white">
        <div className="border-b-2 border-blue-600 py-2 text-xs font-semibold text-blue-600 flex items-center gap-1">
          <span>Question</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
        {/* Question Title & Save for later */}
        <div className="space-y-3">
          <h1 className="text-sm font-semibold text-slate-900 tracking-tight">
            {order}. {question.title}
          </h1>

          <div>
            <button
              type="button"
              onClick={onToggleBookmark}
              className={cn(
                'inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition select-none',
                bookmarked
                  ? 'border-blue-300 bg-blue-50/50 text-blue-600 font-medium'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800',
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <span>{bookmarked ? 'Saved for later' : 'Save for later'}</span>
            </button>
          </div>
        </div>

        {/* Problem Description */}
        <div className="pt-2">
          <h2 className="text-xs font-bold text-slate-900 tracking-wide">Problem Description:</h2>
          <div className="mt-2.5 text-[13px] leading-[1.55] text-[#334155]">
            <RichText text={question.description} />
          </div>
        </div>

        {question.instructions ? (
          <div className="rounded-md bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-700 border border-slate-200">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">Requirements</p>
            <RichText text={question.instructions} />
          </div>
        ) : null}

        {question.mediaUrl ? (
          <figure className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={question.mediaUrl}
              alt={`Reference for ${question.title}`}
              className="w-full rounded-md border border-slate-200 shadow-sm"
              loading="lazy"
            />
            <figcaption className="mt-1 text-[11px] text-slate-500">Expected layout reference</figcaption>
          </figure>
        ) : null}
      </div>
    </div>
  );
}
