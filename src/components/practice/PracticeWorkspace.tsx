'use client';

import * as React from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';
import { CodeEditor, type CodeLanguage } from '@/components/editor/CodeEditor';
import { PreviewFrame } from '@/components/editor/PreviewFrame';
import { TestResults, type RunOutcome } from '@/components/exam/TestResults';
import { QuestionPanel, type StudentQuestion } from '@/components/exam/QuestionPanel';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { apiPost, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Play, RotateCcw, ArrowLeft, Eye, CheckSquare, Terminal } from 'lucide-react';

interface PracticeWorkspaceProps {
  attemptId: string;
  question: StudentQuestion;
  examTitle: string;
  initialCode: {
    html: string;
    css: string;
    js: string;
  };
}

export function PracticeWorkspace({ attemptId, question, examTitle, initialCode }: PracticeWorkspaceProps) {
  const toast = useToast();

  const [code, setCode] = React.useState(initialCode);
  const [pane, setPane] = React.useState<CodeLanguage>('html');
  const [bottomTab, setBottomTab] = React.useState<'preview' | 'results' | 'console'>('preview');
  const [running, setRunning] = React.useState(false);
  const [outcome, setOutcome] = React.useState<RunOutcome | null>(null);
  const [testError, setTestError] = React.useState<string | null>(null);
  const [consoleLogs, setConsoleLogs] = React.useState<string[]>([]);
  const [previewKey, setPreviewKey] = React.useState(1);

  // Resizable split dimensions
  const [leftWidth, setLeftWidth] = React.useState(42); // percentage
  const [editorHeight, setEditorHeight] = React.useState(50); // percentage

  const handleConsole = React.useCallback((line: { level: string; text: string }) => {
    setConsoleLogs((prev) => [...prev.slice(-99), `[${line.level}] ${line.text}`]);
  }, []);

  const runTests = async () => {
    if (running) return;
    setRunning(true);
    setTestError(null);
    try {
      const res = await apiPost<RunOutcome>(`/api/practice/${attemptId}/run`, code);
      setOutcome(res);
      setBottomTab('results');
      if (res.passedCount === res.totalCount && res.totalCount > 0) {
        toast.push(`All ${res.totalCount} tests passed! Excellent work.`, 'success');
      } else {
        toast.push(`${res.passedCount}/${res.totalCount} tests passed.`, 'info');
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Test execution failed.';
      setTestError(message);
      setBottomTab('results');
      toast.push(message, 'error');
    } finally {
      setRunning(false);
    }
  };

  const resetToSubmitted = () => {
    if (
      window.confirm(
        'Reset code to your original submitted version? Current practice changes will be discarded.',
      )
    ) {
      setCode(initialCode);
      setPreviewKey((k) => k + 1);
      toast.push('Code reset to your original submitted version.', 'info');
    }
  };

  // Keyboard shortcut Ctrl/Cmd + ' to run tests
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "'") {
        e.preventDefault();
        void runTests();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        toast.push('Practice changes are held in-memory and do not modify your graded attempt.', 'info');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, running]);

  return (
    <div className="flex h-[calc(100vh-125px)] min-h-[700px] w-full flex-col overflow-hidden rounded-xl border border-ink-800 bg-[#0d1424] text-slate-100 shadow-2xl">
      {/* Top Practice Mode Banner */}
      <div className="flex shrink-0 items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
        <div className="flex items-center gap-2">
          <Badge tone="warn">Practice Mode</Badge>
          <span className="font-medium">
            Proctoring is OFF. Your edits and test runs are for practice only and will NEVER modify your
            graded submission.
          </span>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 font-medium text-amber-100 transition hover:bg-amber-500/30"
        >
          <ArrowLeft className="h-3 w-3" />
          <span>Exit Practice</span>
        </Link>
      </div>

      {/* Main Top Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-ink-800 bg-[#0f172a] px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded bg-white px-1.5 py-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/scaler-logo.png" alt="Scaler" className="h-4 w-auto object-contain" />
            </div>
            <span className="text-slate-500">/</span>
            <span className="text-xs font-medium text-slate-400">{examTitle}</span>
            <span className="text-slate-500">/</span>
            <h1 className="text-xs font-semibold text-slate-200">{question.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetToSubmitted}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-ink-800/80 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-ink-700 hover:text-white"
            title="Reset code to your original submitted version"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset to Submitted</span>
          </button>

          <button
            type="button"
            onClick={() => void runTests()}
            disabled={running}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3.5 py-1 text-xs font-medium text-white transition',
              running ? 'cursor-not-allowed bg-blue-600/70' : 'bg-blue-600 shadow-sm hover:bg-blue-500',
            )}
            title="Run test cases (Ctrl + ')"
          >
            <Play className={cn('h-3.5 w-3.5 fill-current', running && 'animate-spin')} />
            <span>{running ? 'Running Tests…' : 'Run Test Cases'}</span>
          </button>

          <Link
            href="/dashboard"
            className="ml-2 inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Question Description and Tests */}
        <div
          style={{ width: `${leftWidth}%` }}
          className="flex h-full flex-col overflow-hidden border-r border-ink-800 bg-[#0f172a]"
        >
          <QuestionPanel question={question} />
        </div>

        {/* Draggable Horizontal Resize Handle */}
        <ResizeHandle
          direction="horizontal"
          onResize={(delta) => {
            const containerWidth = window.innerWidth;
            if (containerWidth > 0) {
              setLeftWidth((prev) => Math.max(25, Math.min(65, prev + (delta / containerWidth) * 100)));
            }
          }}
        />

        {/* Right Column: Code Editor & Preview/Results Panel */}
        <div style={{ width: `${100 - leftWidth}%` }} className="flex h-full flex-col overflow-hidden">
          {/* Top Half: Code Editor */}
          <div
            style={{ height: `${editorHeight}%` }}
            className="flex flex-col overflow-hidden border-b border-ink-800 bg-[#131f30]"
          >
            {/* Editor Language Tabs */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-ink-800 bg-[#0e1626] px-3">
              <div className="flex items-center gap-1">
                {(['html', 'css', 'javascript'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setPane(lang)}
                    className={cn(
                      'rounded px-2.5 py-1 text-xs font-medium uppercase tracking-wider transition',
                      pane === lang
                        ? 'bg-[#1e293b] text-blue-400'
                        : 'text-slate-400 hover:bg-[#1e293b]/50 hover:text-slate-200',
                    )}
                  >
                    {lang === 'javascript' ? 'JS' : lang}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[11px] text-slate-500">Untracked practice buffer</span>
            </div>

            {/* CodeMirror Editor */}
            <div className="flex-1 overflow-hidden">
              <CodeEditor
                value={code[pane === 'javascript' ? 'js' : pane]}
                language={pane}
                preventPaste={false}
                onChange={(next) =>
                  setCode((prev) => ({
                    ...prev,
                    [pane === 'javascript' ? 'js' : pane]: next,
                  }))
                }
                onRunShortcut={() => void runTests()}
              />
            </div>
          </div>

          {/* Draggable Vertical Resize Handle */}
          <ResizeHandle
            direction="vertical"
            onResize={(delta) => {
              const rightHeight = window.innerHeight - 80;
              if (rightHeight > 0) {
                setEditorHeight((prev) => Math.max(25, Math.min(75, prev + (delta / rightHeight) * 100)));
              }
            }}
          />

          {/* Bottom Half: Tabs for Output / Test Results / Console */}
          <div
            style={{ height: `${100 - editorHeight}%` }}
            className="flex flex-col overflow-hidden bg-[#0e1626]"
          >
            {/* Bottom Tabs Header */}
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-ink-800 bg-[#0a101d] px-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBottomTab('preview')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition',
                    bottomTab === 'preview'
                      ? 'bg-[#1e293b] text-slate-100'
                      : 'text-slate-400 hover:bg-[#1e293b]/50 hover:text-slate-200',
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Output</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('results')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition',
                    bottomTab === 'results'
                      ? 'bg-[#1e293b] text-slate-100'
                      : 'text-slate-400 hover:bg-[#1e293b]/50 hover:text-slate-200',
                  )}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>Test Results</span>
                  {outcome && (
                    <span
                      className={cn(
                        'ml-1 rounded px-1 text-[10px] font-semibold',
                        outcome.passedCount === outcome.totalCount
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400',
                      )}
                    >
                      {outcome.passedCount}/{outcome.totalCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('console')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition',
                    bottomTab === 'console'
                      ? 'bg-[#1e293b] text-slate-100'
                      : 'text-slate-400 hover:bg-[#1e293b]/50 hover:text-slate-200',
                  )}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Console</span>
                  {consoleLogs.length > 0 && (
                    <span className="ml-1 rounded bg-slate-700 px-1 text-[10px] text-slate-300">
                      {consoleLogs.length}
                    </span>
                  )}
                </button>
              </div>

              {bottomTab === 'preview' && (
                <button
                  type="button"
                  onClick={() => setPreviewKey((k) => k + 1)}
                  className="rounded px-2 py-0.5 text-xs text-slate-400 transition hover:bg-ink-800 hover:text-white"
                >
                  Refresh View
                </button>
              )}

              {bottomTab === 'console' && (
                <button
                  type="button"
                  onClick={() => setConsoleLogs([])}
                  className="rounded px-2 py-0.5 text-xs text-slate-400 transition hover:bg-ink-800 hover:text-white"
                >
                  Clear Console
                </button>
              )}
            </div>

            {/* Bottom Content Area */}
            <div className="flex-1 overflow-auto p-2">
              {bottomTab === 'preview' && (
                <div className="h-full w-full overflow-hidden rounded bg-white">
                  <PreviewFrame
                    html={code.html}
                    css={code.css}
                    js={code.js}
                    refreshKey={previewKey}
                    onConsole={handleConsole}
                  />
                </div>
              )}

              {bottomTab === 'results' && (
                <div className="h-full overflow-auto">
                  <TestResults
                    outcome={outcome}
                    expectedTests={question.tests}
                    running={running}
                    error={testError}
                  />
                </div>
              )}

              {bottomTab === 'console' && (
                <div className="h-full overflow-auto rounded bg-[#090d16] p-3 font-mono text-xs text-slate-300">
                  {consoleLogs.length === 0 ? (
                    <p className="italic text-slate-500">No console output recorded.</p>
                  ) : (
                    consoleLogs.map((log, idx) => (
                      <div key={idx} className="border-b border-slate-800/60 py-1 font-mono">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
