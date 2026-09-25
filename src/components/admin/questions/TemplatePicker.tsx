'use client';

import * as React from 'react';
import { Modal } from '@/components/ui';
import { TEST_TEMPLATES, type TestTemplate } from './test-templates';

/** Choose a starting point for a new test case (or start blank). */
export function TemplatePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (template: TestTemplate | null) => void;
}) {
  return (
    <Modal open={open} title="Add a test case" onClose={onClose}>
      <p className="mb-3 text-xs text-slate-400">
        Pick a starting point, then adapt the selectors and values to your question in the builder.
      </p>
      <ul className="-mx-1 max-h-[60vh] space-y-1 overflow-y-auto px-1">
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="w-full rounded-md bg-ink-900 px-3 py-2 text-left ring-1 ring-ink-700 transition hover:bg-ink-800 hover:ring-brand-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <span className="block text-sm font-medium text-slate-100">Blank test case</span>
            <span className="block text-xs text-slate-400">One empty check to fill in yourself.</span>
          </button>
        </li>
        {TEST_TEMPLATES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onPick(t)}
              className="w-full rounded-md bg-ink-900 px-3 py-2 text-left ring-1 ring-ink-700 transition hover:bg-ink-800 hover:ring-brand-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <span className="block text-sm font-medium text-slate-100">{t.label}</span>
              <span className="block text-xs text-slate-400">{t.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
