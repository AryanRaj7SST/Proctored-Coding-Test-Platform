'use client';

import * as React from 'react';
import { Card, CardBody, CardHeader, Tabs, Badge } from '@/components/ui';
import { PreviewFrame } from '@/components/editor/PreviewFrame';
import { CodeEditor, type CodeLanguage } from '@/components/editor/CodeEditor';

export interface StarterCode {
  html?: string;
  css?: string;
  js?: string;
}

/**
 * Enhanced AttemptCodeViewer with CodeMirror syntax highlighting, starter code comparison,
 * copy-to-clipboard, responsive sandbox viewports (Desktop/Tablet/Mobile), and code metrics.
 */
export function AttemptCodeViewer({
  html,
  css,
  js,
  starter = {},
}: {
  html: string;
  css: string;
  js: string;
  starter?: StarterCode;
}) {
  const [tab, setTab] = React.useState<'preview' | 'html' | 'css' | 'js'>('preview');
  const [codeMode, setCodeMode] = React.useState<'submitted' | 'starter' | 'side-by-side'>('submitted');
  const [viewport, setViewport] = React.useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [key, setKey] = React.useState(1);
  const [copied, setCopied] = React.useState(false);

  const submittedCode = tab === 'html' ? html : tab === 'css' ? css : js;
  const starterCode =
    tab === 'html' ? (starter.html ?? '') : tab === 'css' ? (starter.css ?? '') : (starter.js ?? '');

  const language: CodeLanguage = tab === 'html' ? 'html' : tab === 'css' ? 'css' : 'javascript';

  const lineCount = (submittedCode || '').split('\n').length;
  const charCount = (submittedCode || '').length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(submittedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const hasStarterDiff = Boolean(starterCode && starterCode.trim() !== (submittedCode || '').trim());

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Student Code & Live Preview"
        subtitle={
          tab === 'preview'
            ? 'Sandboxed iframe with zero privileges'
            : `${lineCount} lines · ${charCount} chars ${hasStarterDiff ? '· modified from starter' : '· identical to starter'}`
        }
        action={
          <div className="flex items-center gap-2">
            {tab === 'preview' ? (
              <div className="flex items-center gap-1 rounded bg-ink-850 p-0.5 text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => setViewport('desktop')}
                  className={`rounded px-2 py-0.5 transition ${
                    viewport === 'desktop' ? 'bg-ink-700 font-medium text-white' : 'hover:text-white'
                  }`}
                  title="Desktop (100%)"
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('tablet')}
                  className={`rounded px-2 py-0.5 transition ${
                    viewport === 'tablet' ? 'bg-ink-700 font-medium text-white' : 'hover:text-white'
                  }`}
                  title="Tablet (768px)"
                >
                  Tablet
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('mobile')}
                  className={`rounded px-2 py-0.5 transition ${
                    viewport === 'mobile' ? 'bg-ink-700 font-medium text-white' : 'hover:text-white'
                  }`}
                  title="Mobile (375px)"
                >
                  Mobile
                </button>
                <button
                  type="button"
                  onClick={() => setKey((k) => k + 1)}
                  className="ml-1 rounded px-2 py-0.5 text-xs text-brand-300 hover:bg-ink-800 hover:text-white"
                  title="Reload sandbox preview"
                >
                  ↻ Reload
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {starterCode ? (
                  <div className="flex items-center gap-1 rounded bg-ink-850 p-0.5 text-xs text-slate-400">
                    <button
                      type="button"
                      onClick={() => setCodeMode('submitted')}
                      className={`rounded px-2 py-0.5 transition ${
                        codeMode === 'submitted' ? 'bg-ink-700 font-medium text-white' : 'hover:text-white'
                      }`}
                    >
                      Submitted
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodeMode('starter')}
                      className={`rounded px-2 py-0.5 transition ${
                        codeMode === 'starter' ? 'bg-ink-700 font-medium text-white' : 'hover:text-white'
                      }`}
                    >
                      Starter
                    </button>
                    <button
                      type="button"
                      onClick={() => setCodeMode('side-by-side')}
                      className={`rounded px-2 py-0.5 transition ${
                        codeMode === 'side-by-side' ? 'bg-ink-700 font-medium text-white' : 'hover:text-white'
                      }`}
                    >
                      Compare
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded px-2.5 py-1 text-xs font-medium text-slate-300 ring-1 ring-ink-700 transition hover:bg-ink-800 hover:text-white"
                >
                  {copied ? '✓ Copied' : 'Copy Code'}
                </button>
              </div>
            )}
          </div>
        }
      />
      <CardBody className="space-y-3">
        <Tabs
          tabs={[
            { id: 'preview', label: 'Live Preview' },
            { id: 'html', label: 'HTML' },
            { id: 'css', label: 'CSS' },
            { id: 'js', label: 'JavaScript' },
          ]}
          active={tab}
          onChange={(id) => setTab(id as typeof tab)}
        />

        {tab === 'preview' ? (
          <div className="flex justify-center overflow-auto rounded-md bg-ink-950 p-3 ring-1 ring-ink-700">
            <div
              style={{
                width: viewport === 'mobile' ? '375px' : viewport === 'tablet' ? '768px' : '100%',
                height: '420px',
                transition: 'width 0.2s ease',
              }}
              className="overflow-hidden rounded-md bg-white shadow-2xl ring-1 ring-ink-800"
            >
              <PreviewFrame html={html} css={css} js={js} refreshKey={key} />
            </div>
          </div>
        ) : codeMode === 'side-by-side' && starterCode ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-slate-400">Original Starter Code</span>
                <Badge tone="neutral">starter</Badge>
              </div>
              <div className="h-96 overflow-hidden rounded-md bg-ink-900 ring-1 ring-ink-700">
                <CodeEditor
                  value={starterCode}
                  language={language}
                  onChange={() => {}}
                  readOnly={true}
                  height="100%"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-brand-300">Student Submitted Code</span>
                <Badge tone="ok">student submission</Badge>
              </div>
              <div className="h-96 overflow-hidden rounded-md bg-ink-900 ring-1 ring-ink-700">
                <CodeEditor
                  value={submittedCode}
                  language={language}
                  onChange={() => {}}
                  readOnly={true}
                  height="100%"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="h-96 overflow-hidden rounded-md bg-ink-900 ring-1 ring-ink-700">
            <CodeEditor
              value={codeMode === 'starter' ? starterCode : submittedCode}
              language={language}
              onChange={() => {}}
              readOnly={true}
              height="100%"
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
