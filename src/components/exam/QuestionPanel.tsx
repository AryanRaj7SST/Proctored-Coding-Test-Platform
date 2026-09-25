'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { ExpectedTest } from './TestResults';

export interface StudentQuestion {
  id: string;
  title: string;
  description: string;
  instructions: string | null;
  constraints?: string | null;
  expectedBehavior?: string | null;
  mediaUrl: string | null;
  difficulty: string;
  points: number;
  starterHtml: string;
  starterCss: string;
  starterJs: string;
  /** Every test case, as a readable definition (see toStudentQuestion). */
  tests: ExpectedTest[];
}

/**
 * Helper to render inline markdown: `code`, **bold**, links, and plain text.
 */
function renderInline(str: string): React.ReactNode[] {
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = str.split(regex);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="rounded border border-slate-200/60 bg-slate-100 px-1 py-0.5 font-mono text-[11px] font-medium text-blue-600"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (linkMatch && linkMatch[1] && linkMatch[2]) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline hover:text-blue-700"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

interface ParsedBlock {
  type: 'heading' | 'image' | 'list' | 'paragraph';
  level?: number;
  alt?: string;
  url?: string;
  items?: string[];
  text?: string;
}

/**
 * Render structured question text safely without dangerouslySetInnerHTML.
 * Supports headings (# to ####), lists (- or *), markdown images (![alt](url)),
 * inline code, bold, and paragraphs.
 */
function RichText({ text }: { text: string }) {
  const blocks = React.useMemo(() => {
    const rawLines = text.replace(/\r\n/g, '\n').split('\n');
    const result: ParsedBlock[] = [];
    let currentList: string[] | null = null;
    let currentParagraph: string[] | null = null;

    const flushList = () => {
      if (currentList && currentList.length > 0) {
        result.push({ type: 'list', items: currentList });
        currentList = null;
      }
    };

    const flushParagraph = () => {
      if (currentParagraph && currentParagraph.length > 0) {
        result.push({ type: 'paragraph', text: currentParagraph.join(' ') });
        currentParagraph = null;
      }
    };

    for (const line of rawLines) {
      const trimmed = line.trim();

      // Blank line flushes lists/paragraphs
      if (!trimmed) {
        flushList();
        flushParagraph();
        continue;
      }

      // Image: ![alt](url)
      const imageMatch = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/);
      if (imageMatch && imageMatch[1] !== undefined && imageMatch[2]) {
        flushList();
        flushParagraph();
        result.push({ type: 'image', alt: imageMatch[1], url: imageMatch[2] });
        continue;
      }

      // Headings: # to ######
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        flushList();
        flushParagraph();
        result.push({
          type: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2],
        });
        continue;
      }

      // List items: - item or * item
      const listMatch = trimmed.match(/^[-*]\s+(.*)$/);
      if (listMatch && listMatch[1]) {
        flushParagraph();
        if (!currentList) currentList = [];
        currentList.push(listMatch[1]);
        continue;
      }

      // Regular text (accumulate into paragraph)
      flushList();
      if (!currentParagraph) currentParagraph = [];
      currentParagraph.push(trimmed);
    }

    flushList();
    flushParagraph();
    return result;
  }, [text]);

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === 'image' && block.url) {
          const isHttp = block.url.startsWith('http://') || block.url.startsWith('https://');
          if (!isHttp) return null;
          return (
            <div
              key={i}
              className="shadow-xs my-3 overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.url}
                alt={block.alt || 'Question diagram'}
                className="mx-auto max-h-96 w-auto max-w-full rounded object-contain"
                loading="lazy"
              />
            </div>
          );
        }

        if (block.type === 'heading' && block.text) {
          const content = renderInline(block.text);
          if (block.level === 1 || block.level === 2 || block.level === 3) {
            return (
              <h3
                key={i}
                className="mb-1.5 mt-4 border-b border-slate-100 pb-1 text-xs font-bold uppercase tracking-wider text-slate-900"
              >
                {content}
              </h3>
            );
          }
          if (block.level === 4) {
            return (
              <h4 key={i} className="mb-1 mt-3 text-xs font-semibold text-slate-800">
                {content}
              </h4>
            );
          }
          if (block.level === 5) {
            return (
              <h5 key={i} className="mb-1 mt-2.5 text-xs font-semibold text-slate-700">
                {content}
              </h5>
            );
          }
          return (
            <h6 key={i} className="mb-1 mt-2 text-xs font-medium text-slate-700">
              {content}
            </h6>
          );
        }

        if (block.type === 'list' && block.items) {
          return (
            <ul key={i} className="my-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
              {block.items.map((item, j) => (
                <li key={j} className="leading-relaxed">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'paragraph' && block.text) {
          return (
            <p key={i} className="my-1.5 text-xs leading-relaxed text-slate-600">
              {renderInline(block.text)}
            </p>
          );
        }

        return null;
      })}
    </div>
  );
}

export function QuestionPanel({
  question,
  earned: _earned,
  maxScore: _maxScore,
  order = 1,
  bookmarked = false,
  onToggleBookmark,
}: {
  question: StudentQuestion;
  earned?: number | null;
  maxScore?: number;
  order?: number;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white text-slate-800">
      {/* Top Tab Bar */}
      <div className="flex items-center border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-1 border-b-2 border-blue-600 py-2 text-xs font-semibold text-blue-600">
          <span>Question</span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
        {/* Question Title & Save for later */}
        <div className="space-y-3">
          <h1 className="text-sm font-semibold tracking-tight text-slate-900">
            {order}. {question.title}
          </h1>

          <div>
            <button
              type="button"
              onClick={onToggleBookmark}
              className={cn(
                'inline-flex select-none items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition',
                bookmarked
                  ? 'border-blue-300 bg-blue-50/50 font-medium text-blue-600'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800',
              )}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              <span>{bookmarked ? 'Saved for later' : 'Save for later'}</span>
            </button>
          </div>
        </div>

        {/* Problem Description */}
        <div className="pt-2">
          <h2 className="text-xs font-bold tracking-wide text-slate-900">Problem Description:</h2>
          <div className="mt-2.5 text-[13px] leading-[1.55] text-[#334155]">
            <RichText text={question.description} />
          </div>
        </div>

        {question.instructions ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-700">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">Requirements</p>
            <RichText text={question.instructions} />
          </div>
        ) : null}

        {question.expectedBehavior ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-700">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Expected behaviour
            </p>
            <RichText text={question.expectedBehavior} />
          </div>
        ) : null}

        {question.constraints ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-slate-700">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">Constraints</p>
            <RichText text={question.constraints} />
          </div>
        ) : null}

        {question.tests.length > 0 ? (
          <p className="text-[11px] text-slate-500">
            {question.points} marks · {question.tests.length} test case
            {question.tests.length === 1 ? '' : 's'}, each worth an equal share. The Test Cases tab shows
            exactly what each one checks.
          </p>
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
