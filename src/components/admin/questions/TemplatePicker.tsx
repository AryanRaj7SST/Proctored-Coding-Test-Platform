'use client';

import * as React from 'react';
import { Modal } from '@/components/ui';
import { TEST_TEMPLATES, type TestTemplate } from './test-templates';

/** Choose a starting point for a new test case (or start blank). */
export function TemplatePicker({
  open,
  onClose,
  onPick,
  onOpenJsonModal,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (template: TestTemplate | null) => void;
  onOpenJsonModal?: () => void;
}) {
  return (
    <Modal open={open} title="Add a test case" onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">
        Pick a template below, start blank, or import via JSON and AI prompts.
      </p>
      {onOpenJsonModal ? (
        <div className="shadow-2xs mb-3 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
          <div>
            <p className="text-xs font-semibold text-blue-950">Have test cases from AI or JSON?</p>
            <p className="text-[11px] text-blue-800">
              Import structured JSON or copy a pre-made prompt for ChatGPT/Claude.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenJsonModal();
            }}
            className="shadow-xs shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
          >
            Import JSON / AI
          </button>
        </div>
      ) : null}
      <ul className="-mx-1 max-h-[55vh] space-y-1.5 overflow-y-auto px-1">
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="shadow-xs w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <span className="block text-sm font-semibold text-slate-900">Blank test case</span>
            <span className="block text-xs text-slate-500">One empty check to fill in yourself.</span>
          </button>
        </li>
        {TEST_TEMPLATES.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onPick(t)}
              className="shadow-xs w-full rounded-md border border-slate-200 bg-white px-3.5 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
              <span className="block text-xs text-slate-500">{t.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
