'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { ConsoleLine } from './PreviewFrame';

const LEVEL_CLASS: Record<string, string> = {
  error: 'text-rose-400',
  warn: 'text-amber-300',
  info: 'text-sky-300',
  debug: 'text-slate-400',
  log: 'text-slate-300',
};

export function ConsolePanel({ lines, onClear }: { lines: ConsoleLine[]; onClear: () => void }) {
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);

  return (
    <div className="flex h-full flex-col bg-[#0d1724] text-slate-200">
      <div className="flex items-center justify-between border-b border-[#1b2b40] px-3 py-1 bg-[#09101a] text-xs select-none">
        <span className="text-[11px] font-mono text-slate-400">Console</span>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="rounded px-2 py-0.5 text-[11px] text-slate-400 hover:bg-[#16253a] hover:text-white transition"
            aria-label="Clear console"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-5">
        {lines.length === 0 ? (
          <p className="text-slate-500 italic font-sans text-xs">Console output from your code appears here.</p>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={cn('whitespace-pre-wrap break-words font-mono', LEVEL_CLASS[line.level] ?? 'text-slate-300')}>
              {line.text}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
