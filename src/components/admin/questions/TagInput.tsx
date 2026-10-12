'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 30;

/**
 * Chip-style tag entry: Enter or comma adds, Backspace on an empty input
 * removes the last tag. Enforces the server limits (12 tags, 30 chars each).
 */
export function TagInput({
  id,
  value,
  onChange,
  suggestions = [],
  invalid,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  invalid?: boolean;
}) {
  const [text, setText] = React.useState('');
  const listId = `${id}-suggestions`;
  const full = value.length >= MAX_TAGS;

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((t) => t.trim().slice(0, MAX_TAG_LENGTH))
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const tag of parts) {
      if (next.length >= MAX_TAGS) break;
      if (!next.some((t) => t.toLowerCase() === tag.toLowerCase())) next.push(tag);
    }
    onChange(next);
    setText('');
  };

  return (
    <div
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 border shadow-xs transition-colors focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600',
        invalid ? 'border-rose-500' : 'border-slate-300',
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 py-0.5 pl-2 pr-1 text-xs font-medium text-blue-700"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            aria-label={`Remove tag ${tag}`}
            className="rounded p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-800 transition"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        list={suggestions.length ? listId : undefined}
        disabled={full}
        maxLength={MAX_TAG_LENGTH * 3}
        placeholder={full ? 'Tag limit reached' : value.length ? 'Add another…' : 'e.g. flexbox, dom, forms'}
        onChange={(e) => {
          const next = e.target.value;
          if (next.includes(',')) add(next);
          else setText(next);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(text)}
        className="h-6 min-w-[8rem] flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
      />
      {suggestions.length ? (
        <datalist id={listId}>
          {suggestions
            .filter((s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      ) : null}
    </div>
  );
}
