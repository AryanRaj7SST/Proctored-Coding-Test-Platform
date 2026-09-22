'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { PreviewFrame, type ConsoleLine } from '@/components/editor/PreviewFrame';
import { ConsolePanel } from '@/components/editor/ConsolePanel';
import { QuestionPanel, type StudentQuestion } from './QuestionPanel';
import { TestResults, type RunOutcome } from './TestResults';
import { ExamTimer } from './ExamTimer';
import { TabSwitchModal } from '@/components/proctor/TabSwitchModal';
import { Button, ConfirmDialog, Spinner, ResizeHandle } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAutosave } from '@/hooks/useAutosave';
import { useProctor } from '@/hooks/useProctor';
import { apiPatch, apiPost, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  User,
  Info,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  RotateCcw,
  Eye,
  EyeOff,
  Maximize2,
  AlertTriangle,
  Settings,
} from 'lucide-react';

/* ------------------------------------------------------------------ types */

interface AttemptDto {
  id: string;
  html: string;
  css: string;
  js: string;
  status: string;
  score: number | null;
  maxScore: number;
  updatedAt: string;
}

interface QuestionSlot {
  order: number;
  points: number;
  question: StudentQuestion;
  attempt: AttemptDto;
}

interface StartResponse {
  exam: { id: string; title: string; description: string | null; durationMinutes: number; maxViolations: number };
  session: { startedAt: string; expiresAt: string; msRemaining: number; serverTime: string; availability: string };
  violationCount: number;
  questions: QuestionSlot[];
}

interface HeartbeatResponse {
  status: string;
  msRemaining: number;
  expired: boolean;
  violationCount: number;
}

type Pane = 'html' | 'css' | 'js';

const HEARTBEAT_MS = 12_000;

/* ------------------------------------------------------------- component */

export function ExamWorkspace({ examId }: { examId: string }) {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = React.useState(true);
  const [fatal, setFatal] = React.useState<string | null>(null);
  const [data, setData] = React.useState<StartResponse | null>(null);
  const [index, setIndex] = React.useState(0);

  const [code, setCode] = React.useState({ html: '', css: '', js: '' });
  const [pane, setPane] = React.useState<Pane>('html');
  const [previewKey, setPreviewKey] = React.useState(0);
  const [consoleLines, setConsoleLines] = React.useState<ConsoleLine[]>([]);
  const consoleId = React.useRef(1);

  const [outcome, setOutcome] = React.useState<RunOutcome | null>(null);
  const [running, setRunning] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [confirmSubmit, setConfirmSubmit] = React.useState(false);

  const [clock, setClock] = React.useState({ msRemaining: 0, syncedAt: Date.now() });
  const [expired, setExpired] = React.useState(false);
  const [bookmarked, setBookmarked] = React.useState<Record<string, boolean>>({});
  const [fullscreenPreview, setFullscreenPreview] = React.useState(false);
  const [currentView, setCurrentView] = React.useState<'workspace' | 'all'>('workspace');
  const [showPreview, setShowPreview] = React.useState(true);
  const [bottomTab, setBottomTab] = React.useState<'tests' | 'output'>('tests');
  const [section1Expanded, setSection1Expanded] = React.useState(true);

  // Adjustable section dimensions (with localStorage persistence)
  const [leftWidth, setLeftWidth] = React.useState(510);
  const [previewWidth, setPreviewWidth] = React.useState(380);
  const [bottomHeight, setBottomHeight] = React.useState(240);

  React.useEffect(() => {
    try {
      const savedLeft = localStorage.getItem('pcp_left_panel_w');
      if (savedLeft) setLeftWidth(Math.max(450, Math.min(750, Number(savedLeft))));
      const savedPreview = localStorage.getItem('pcp_preview_w');
      if (savedPreview) setPreviewWidth(Math.max(240, Math.min(800, Number(savedPreview))));
      const savedBottom = localStorage.getItem('pcp_bottom_panel_h');
      if (savedBottom) setBottomHeight(Math.max(140, Math.min(550, Number(savedBottom))));
    } catch {
      // ignore
    }
  }, []);

  // Auto-refresh preview on code changes (debounced 400ms)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewKey((k) => k + 1);
    }, 400);
    return () => clearTimeout(timer);
  }, [code]);

  const slot = data?.questions[index];
  const attempt = slot?.attempt;
  const locked = expired || (attempt ? attempt.status !== 'IN_PROGRESS' : true);

  /* ------------------------------------------------------------ bootstrap */

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiPost<StartResponse>(`/api/exams/${examId}/start`);
        if (cancelled) return;
        setData(res);
        setClock({ msRemaining: res.session.msRemaining, syncedAt: Date.now() });
        const first = res.questions[0];
        if (first) {
          setCode({
            html: first.attempt.html || first.question.starterHtml,
            css: first.attempt.css || first.question.starterCss,
            js: first.attempt.js || first.question.starterJs,
          });
        }
        setPreviewKey((k) => k + 1);
      } catch (err) {
        if (!cancelled) setFatal(err instanceof Error ? err.message : 'Could not open this exam.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  /* ------------------------------------------------------------- autosave */

  const saveCode = React.useCallback(
    async (value: { html: string; css: string; js: string }) => {
      if (!attempt || locked) return;
      await apiPatch(`/api/attempts/${attempt.id}`, value);
    },
    [attempt, locked],
  );

  const { state: saveState, flush } = useAutosave(code, saveCode, { enabled: Boolean(attempt) && !locked });

  /* ------------------------------------------------------------ heartbeat */

  const finish = React.useCallback(() => {
    setExpired(true);
    toast.push('Your time has expired. Your work was submitted automatically.', 'error');
    setTimeout(() => router.push(`/dashboard`), 2500);
  }, [router, toast]);

  const [violationCount, setViolationCount] = React.useState(0);
  React.useEffect(() => {
    if (data) setViolationCount(data.violationCount);
  }, [data]);

  React.useEffect(() => {
    if (!data || expired) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await apiPost<HeartbeatResponse>('/api/heartbeat', { examId });
        if (stop) return;
        setClock({ msRemaining: res.msRemaining, syncedAt: Date.now() });
        setViolationCount(res.violationCount);
        if (res.expired) finish();
      } catch {
        // Offline: keep the local countdown running; the server still owns the
        // deadline and will finalise the attempt regardless.
      }
    };
    void tick();
    const id = setInterval(() => void tick(), HEARTBEAT_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [data, examId, expired, finish]);

  /* ----------------------------------------------------------- proctoring */

  const { awayMessage, dismissAway, requestFullscreen } = useProctor({
    examId,
    attemptId: attempt?.id ?? null,
    enabled: Boolean(data) && !locked,
    onCountChange: setViolationCount,
  });

  React.useEffect(() => {
    if (!data) return;
    // Fullscreen must be requested from a gesture; the Start Exam click on the
    // dashboard is the gesture, so we try once and ignore a rejection.
    void requestFullscreen();
  }, [data, requestFullscreen]);

  const maxViolations = data?.exam.maxViolations ?? 0;
  React.useEffect(() => {
    if (maxViolations > 0 && violationCount >= maxViolations && !locked) {
      toast.push('Violation limit reached. Submitting your work…', 'error');
      void (async () => {
        if (!attempt) return;
        try {
          await apiPost(`/api/attempts/${attempt.id}/submit`, code);
        } finally {
          finish();
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [violationCount, maxViolations]);

  /* -------------------------------------------------------- question swap */

  const selectQuestion = React.useCallback(
    async (next: number) => {
      if (!data || next === index) return;
      await flush();
      setData((prev) => {
        if (!prev) return prev;
        const questions = prev.questions.slice();
        const current = questions[index];
        if (current) questions[index] = { ...current, attempt: { ...current.attempt, ...code } };
        return { ...prev, questions };
      });
      const target = data.questions[next];
      if (!target) return;
      setIndex(next);
      setCode({
        html: target.attempt.html || target.question.starterHtml,
        css: target.attempt.css || target.question.starterCss,
        js: target.attempt.js || target.question.starterJs,
      });
      setOutcome(null);
      setRunError(null);
      setConsoleLines([]);
      setPreviewKey((k) => k + 1);
      setPane('html');
    },
    [data, index, code, flush],
  );

  /* ------------------------------------------------------------ run/submit */

  const runTests = React.useCallback(async () => {
    if (!attempt || running || locked) return;
    setRunning(true);
    setRunError(null);
    try {
      await flush();
      const res = await apiPost<RunOutcome>(`/api/attempts/${attempt.id}/run`, code);
      setOutcome(res);
      setBottomTab('tests');
      toast.push(
        res.failedCount === 0 ? 'All test cases passed.' : `${res.passedCount}/${res.totalCount} test cases passed.`,
        res.failedCount === 0 ? 'success' : 'info',
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Test execution failed. Please try again.';
      setRunError(message);
      setBottomTab('tests');
      toast.push(message, 'error');
    } finally {
      setRunning(false);
    }
  }, [attempt, running, locked, code, flush, toast]);

  const submit = React.useCallback(async () => {
    if (!attempt || submitting || locked) return;
    setSubmitting(true);
    setConfirmSubmit(false);
    try {
      await flush();
      const res = await apiPost<RunOutcome & { alreadySubmitted: boolean }>(
        `/api/attempts/${attempt.id}/submit`,
        code,
      );
      setOutcome({ ...res, graded: true });
      setBottomTab('output');
      setData((prev) => {
        if (!prev) return prev;
        const questions = prev.questions.slice();
        const current = questions[index];
        if (current) {
          questions[index] = {
            ...current,
            attempt: { ...current.attempt, status: 'SUBMITTED', score: res.score, maxScore: res.maxScore },
          };
        }
        return { ...prev, questions };
      });
      toast.push(`Submitted. Score ${res.score}/${res.maxScore}.`, 'success');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Submission failed. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [attempt, submitting, locked, code, index, flush, toast]);

  const resetStarter = React.useCallback(() => {
    if (!slot || locked) return;
    setCode({
      html: slot.question.starterHtml,
      css: slot.question.starterCss,
      js: slot.question.starterJs,
    });
    setPreviewKey((k) => k + 1);
    toast.push('Starter code restored.', 'info');
  }, [slot, locked, toast]);

  const pushConsole = React.useCallback((line: { level: string; text: string }) => {
    setConsoleLines((prev) => [...prev.slice(-199), { id: consoleId.current++, ...line }]);
  }, []);

  /* --------------------------------------------------------------- render */

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-950 text-slate-400">
        <Spinner className="mr-2 h-5 w-5" /> Preparing your exam…
      </div>
    );
  }

  if (fatal || !data || !slot || !attempt) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-ink-950 px-6 text-center">
        <p className="text-sm text-rose-300">{fatal ?? 'This exam is not available.'}</p>
        <Button variant="secondary" onClick={() => router.push('/dashboard')}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  const editorValue = pane === 'html' ? code.html : pane === 'css' ? code.css : code.js;
  const language = pane === 'js' ? 'javascript' : pane;

  const attemptedCount = data.questions.filter((q) => q.attempt.status !== 'IN_PROGRESS').length;

  return (
    <div className="flex h-screen flex-col bg-white text-slate-800 font-sans">
      {/* ------------------------------------------------------------ top white header */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            {/* SCALER Logo */}
            <div className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-base font-black tracking-wider text-slate-900">SCALER</span>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <path d="M4 4H16L20 8V20H4V4Z" fill="#0066d6" />
                <path d="M10 8H16V14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 16L16 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-slate-300">|</span>
            <h1 className="text-xs sm:text-[13px] font-semibold text-slate-800 truncate max-w-xs md:max-w-md">
              {data.exam.title || 'Web Dev 101 Mid Term Exam 2029 Batch'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Circular Attempted Progress */}
          <div className="flex items-center gap-2 text-xs text-slate-700 font-medium select-none">
            <span className="w-3.5 h-3.5 rounded-full border border-blue-600 inline-block flex-shrink-0" />
            <span>
              {attemptedCount} / {data.questions.length} Attempted
            </span>
          </div>

          {/* Hidden Background Timer for Proctoring Auto-Submit */}
          <div className="sr-only">
            <ExamTimer serverMsRemaining={clock.msRemaining} syncedAt={clock.syncedAt} onExpire={finish} />
          </div>

          {violationCount > 0 ? (
            <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              <span>{violationCount}</span>
            </span>
          ) : null}

          {/* User Profile Avatar */}
          <button
            type="button"
            className="h-7 w-7 rounded-full border border-slate-300 flex items-center justify-center text-slate-600 hover:text-slate-900 bg-white shadow-xs transition"
          >
            <User className="h-4 w-4 stroke-[1.5]" />
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------ main body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Leftmost Vertical Navigation Bar (Width: 68px) */}
        <aside className="w-[68px] flex-shrink-0 flex flex-col items-center py-2.5 bg-white border-r border-slate-200 select-none">
          {/* Info button */}
          <button
            type="button"
            title="Exam Info"
            className="h-7 w-7 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 mb-2 transition"
          >
            <Info className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>

          {/* ALL Button */}
          <button
            type="button"
            onClick={() => setCurrentView('all')}
            className={cn(
              'w-full py-1.5 flex items-center justify-center text-[11px] font-bold tracking-wider relative transition',
              currentView === 'all'
                ? 'text-blue-600 bg-blue-50/70'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50',
            )}
            title="All Questions"
          >
            {currentView === 'all' && (
              <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-600" />
            )}
            ALL
          </button>

          {/* Section 1 Header */}
          <div className="w-full mt-2.5 mb-1 px-2 flex items-center justify-center gap-1 text-[11px] font-bold text-blue-600">
            <span>S1</span>
            <ChevronUp className="h-3 w-3 stroke-[2.5]" />
          </div>

          {/* Question Buttons Q1, Q2... */}
          <div className="w-full flex flex-col items-center">
            {data.questions.map((q, i) => {
              const isCurrent = currentView === 'workspace' && i === index;
              const isCompleted = q.attempt.status !== 'IN_PROGRESS';
              return (
                <button
                  key={q.question.id}
                  type="button"
                  onClick={() => {
                    void selectQuestion(i);
                    setCurrentView('workspace');
                  }}
                  className={cn(
                    'w-full h-8 px-2 flex items-center justify-between relative text-xs transition border-b border-slate-50',
                    isCurrent
                      ? 'text-blue-600 bg-blue-50/60 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
                  )}
                  title={`Question ${i + 1}: ${q.question.title}`}
                >
                  {isCurrent && (
                    <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-600" />
                  )}
                  <span className="text-[11px] font-medium">Q {i + 1}</span>
                  {isCompleted ? (
                    <span className="h-3.5 w-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs" title="Answered">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                  ) : (
                    <span className="h-3 w-3 rounded-full border border-slate-300" />
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* View 1: All Questions Overview (Screenshot 2) */}
        {currentView === 'all' ? (
          <div className="flex-1 flex flex-col overflow-auto bg-slate-50 p-4 sm:p-6 relative">
            {/* Info alert banner */}
            <div className="mb-4 rounded-md bg-blue-50 border border-blue-200 px-4 py-2.5 text-xs font-medium text-blue-700">
              This test is running in Proctored Mode. Submissions are saved and evaluated against test cases.
            </div>

            {/* Title & Section */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900">All Questions</h2>
              <span className="text-xs italic text-slate-500">* Mandatory sections</span>
            </div>

            {/* Collapsible Section Card */}
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div
                onClick={() => setSection1Expanded((v) => !v)}
                className="flex items-center justify-between px-4 py-3 bg-slate-50/80 border-b border-slate-200 cursor-pointer select-none"
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
                    SECTION 1 <span className="text-rose-500">*</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-bold text-slate-800">Default Section</span>
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 border border-blue-100">
                      {data.questions.length} questions
                    </span>
                  </div>
                </div>
                <button type="button" className="text-slate-400 hover:text-slate-600 transition">
                  {section1Expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>

              {section1Expanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <th className="py-2.5 px-4 w-12">#</th>
                        <th className="py-2.5 px-4">QUESTION</th>
                        <th className="py-2.5 px-4 w-32">TYPE</th>
                        <th className="py-2.5 px-4 w-24">SCORE</th>
                        <th className="py-2.5 px-4 w-44">STATUS</th>
                        <th className="py-2.5 px-4 w-32 text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.questions.map((q, i) => {
                        const isCompleted = q.attempt.status !== 'IN_PROGRESS';
                        return (
                          <tr key={q.question.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-3 px-4 font-mono text-slate-500">{i + 1}</td>
                            <td className="py-3 px-4 font-medium text-slate-900">{q.question.title}</td>
                            <td className="py-3 px-4 text-slate-600">
                              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                                <span className="text-[10px] font-bold text-orange-500">HTML</span>
                                Frontend
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-700">{q.points}</td>
                            <td className="py-3 px-4">
                              {isCompleted ? (
                                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                                  <span className="h-4 w-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                                  </span>
                                  Answered Successfully
                                </span>
                              ) : (
                                <span className="text-slate-400">Not Attempted</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  void selectQuestion(i);
                                  setCurrentView('workspace');
                                }}
                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition"
                              >
                                Solve now
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Blue edge toggle tab on the right */}
            <button
              type="button"
              onClick={() => setCurrentView('workspace')}
              className="fixed right-0 top-1/2 -translate-y-1/2 bg-blue-600 text-white rounded-l-md px-1 py-3 shadow-md hover:bg-blue-700 transition"
              title="Back to question workspace"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* View 2: Question Workspace (Screenshot 1) */
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left: Question Panel (Adjustable Width) */}
            <div
              style={{ width: `${leftWidth}px` }}
              className="flex-shrink-0 flex flex-col border-r border-slate-200 bg-white min-w-0"
            >
              <QuestionPanel
                question={slot.question}
                order={index + 1}
                earned={attempt.status === 'IN_PROGRESS' ? null : (attempt.score ?? 0)}
                maxScore={attempt.maxScore || slot.points}
                bookmarked={Boolean(bookmarked[slot.question.id])}
                onToggleBookmark={() => {
                  const cur = bookmarked[slot.question.id];
                  setBookmarked((p) => ({ ...p, [slot.question.id]: !cur }));
                  toast.push(!cur ? 'Question saved for later.' : 'Bookmark removed.', 'info');
                }}
              />
            </div>

            {/* Splitter: Left Question Panel vs Right Workspace */}
            <ResizeHandle
              direction="horizontal"
              onResize={(delta) => {
                setLeftWidth((w) => {
                  const nw = Math.max(260, Math.min(750, w + delta));
                  try {
                    localStorage.setItem('pcp_left_panel_w', String(nw));
                  } catch {}
                  return nw;
                });
              }}
            />

            {/* Right: Frontend Environment (Top) + Test Cases & Output (Bottom) */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#10233d]">
              {/* Upper Section: Frontend Environment */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#10233d]">
                {/* Top Environment Header (White bar) */}
                <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-white px-3 text-xs select-none">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5 text-xs">
                    <span className="text-blue-600 font-mono text-[12px] font-bold">&lt;/&gt;</span>
                    Frontend Environment
                  </span>
                  <div className="flex items-center gap-4 text-slate-500">
                    <button
                      type="button"
                      onClick={resetStarter}
                      disabled={locked}
                      className="hover:text-slate-900 transition flex items-center gap-1 text-xs"
                      title="Reset to starter code"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="hover:text-slate-900 transition flex items-center gap-1 text-xs"
                      title="Settings"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFullscreenPreview((v) => !v)}
                      className="hover:text-slate-900 transition flex items-center gap-1 text-[11px]"
                      title="Maximize Preview"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span>Maximize</span>
                    </button>
                  </div>
                </div>

                {/* Horizontal File Tabs Bar (Navy #142943) */}
                <div className="flex h-8 items-center justify-between bg-[#142943] border-b border-[#1b3456] px-2 text-xs select-none">
                  {/* File tabs */}
                  <div className="flex items-center h-full">
                    <button
                      type="button"
                      onClick={() => setPane('html')}
                      className={cn(
                        'h-full flex items-center gap-1.5 px-3 text-xs font-medium border-t-2 transition',
                        pane === 'html'
                          ? 'bg-[#1b3456] text-white border-blue-500'
                          : 'text-slate-400 hover:text-slate-200 border-transparent',
                      )}
                    >
                      <span className="h-3.5 w-3.5 rounded bg-orange-600 text-white text-[9px] font-bold flex items-center justify-center">5</span>
                      <span>index.html</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPane('css')}
                      className={cn(
                        'h-full flex items-center gap-1.5 px-3 text-xs font-medium border-t-2 transition',
                        pane === 'css'
                          ? 'bg-[#1b3456] text-white border-blue-500'
                          : 'text-slate-400 hover:text-slate-200 border-transparent',
                      )}
                    >
                      <span className="h-3.5 w-3.5 rounded bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">3</span>
                      <span>style.css</span>
                    </button>
                    {slot.question.starterJs ? (
                      <button
                        type="button"
                        onClick={() => setPane('js')}
                        className={cn(
                          'h-full flex items-center gap-1.5 px-3 text-xs font-medium border-t-2 transition',
                          pane === 'js'
                            ? 'bg-[#1b3456] text-white border-blue-500'
                            : 'text-slate-400 hover:text-slate-200 border-transparent',
                        )}
                      >
                        <span className="h-3.5 w-3.5 rounded bg-amber-500 text-black text-[9px] font-bold flex items-center justify-center">JS</span>
                        <span>script.js</span>
                      </button>
                    ) : null}
                  </div>

                  {/* Hide/Show Preview button */}
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className="text-slate-300 hover:text-white transition flex items-center gap-1 text-[11px] px-2 py-0.5"
                    title={showPreview ? 'Hide live preview' : 'Show live preview'}
                  >
                    {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{showPreview ? 'Hide Preview' : 'Show Preview'}</span>
                  </button>
                </div>

                {/* Editor & Preview Split */}
                <div className="flex-1 flex min-h-0">
                  {/* Project Sidebar (~210px, Navy #10233d) */}
                  <div className="w-52 flex-shrink-0 bg-[#10233d] border-r border-[#1a3150] flex flex-col select-none">
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-[#1a3150]/60">
                      PROJECT
                    </div>
                    <div className="space-y-0.5 p-1.5">
                      <button
                        type="button"
                        onClick={() => setPane('html')}
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] text-xs text-left transition',
                          pane === 'html'
                            ? 'bg-[#172b46] text-white font-medium ring-1 ring-[#203a5f]'
                            : 'text-slate-300 hover:bg-[#15273f] hover:text-white',
                        )}
                      >
                        <span className="h-3.5 w-3.5 rounded bg-orange-600 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">5</span>
                        <span className="truncate">index.html</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPane('css')}
                        className={cn(
                          'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] text-xs text-left transition',
                          pane === 'css'
                            ? 'bg-[#172b46] text-white font-medium ring-1 ring-[#203a5f]'
                            : 'text-slate-300 hover:bg-[#15273f] hover:text-white',
                        )}
                      >
                        <span className="h-3.5 w-3.5 rounded bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">3</span>
                        <span className="truncate">style.css</span>
                      </button>
                      {slot.question.starterJs ? (
                        <button
                          type="button"
                          onClick={() => setPane('js')}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] text-xs text-left transition',
                            pane === 'js'
                              ? 'bg-[#172b46] text-white font-medium ring-1 ring-[#203a5f]'
                              : 'text-slate-300 hover:bg-[#15273f] hover:text-white',
                          )}
                        >
                          <span className="h-3.5 w-3.5 rounded bg-amber-500 text-black text-[9px] font-bold flex items-center justify-center flex-shrink-0">JS</span>
                          <span className="truncate">script.js</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Code Area */}
                  <div className="flex-1 flex flex-col min-w-0 bg-[#131f30]">
                    <div className="flex-1 min-h-0">
                      <CodeEditor
                        key={`${attempt.id}-${pane}`}
                        value={editorValue}
                        language={language as 'html' | 'css' | 'javascript'}
                        readOnly={locked}
                        onChange={(next) => setCode((prev) => ({ ...prev, [pane === 'js' ? 'js' : pane]: next }))}
                        onSaveShortcut={() => void flush()}
                        onRunShortcut={() => void runTests()}
                      />
                    </div>
                    {/* Status footer */}
                    <div className="h-6 border-t border-[#1a2d46] px-3 flex items-center text-[11px] text-slate-400 bg-[#0d1724]">
                      <span>
                        {saveState === 'saving'
                          ? 'Saving…'
                          : saveState === 'error'
                            ? 'Save error'
                            : 'Your Code is Saved'}
                      </span>
                    </div>
                  </div>

                  {/* Side-by-Side Live Preview */}
                  {showPreview && (
                    <>
                      {/* Splitter: Editor vs Live Preview */}
                      <ResizeHandle
                        direction="horizontal"
                        className="bg-[#10233d]"
                        onResize={(delta) => {
                          setPreviewWidth((w) => {
                            const nw = Math.max(240, Math.min(800, w - delta));
                            try {
                              localStorage.setItem('pcp_preview_w', String(nw));
                            } catch {}
                            return nw;
                          });
                        }}
                      />
                      <div
                        style={{ width: `${previewWidth}px` }}
                        className="flex-shrink-0 bg-[#fff] border-l border-slate-200 flex flex-col p-3"
                      >
                        <div className="w-full h-full border border-dashed border-[#b7b7b7] rounded-[4px] bg-[#fafafa] overflow-hidden">
                          <PreviewFrame
                            html={code.html}
                            css={code.css}
                            js={code.js}
                            refreshKey={previewKey}
                            onConsole={pushConsole}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Splitter: Environment vs Test Cases & Output */}
              <ResizeHandle
                direction="vertical"
                onResize={(delta) => {
                  setBottomHeight((h) => {
                    const nh = Math.max(140, Math.min(550, h - delta));
                    try {
                      localStorage.setItem('pcp_bottom_panel_h', String(nh));
                    } catch {}
                    return nh;
                  });
                }}
              />

              {/* Bottom Section: Test Cases & Output */}
              <div
                style={{ height: `${bottomHeight}px` }}
                className="flex-shrink-0 flex flex-col border-t border-slate-200 bg-white"
              >
                {/* Tabs Header */}
                <div className="flex h-9 items-center justify-between border-b border-slate-200 px-4 bg-white select-none">
                  <div className="flex items-center gap-6">
                    <button
                      type="button"
                      onClick={() => setBottomTab('tests')}
                      className={cn(
                        'h-9 border-b-2 text-xs font-semibold flex items-center gap-1.5 transition',
                        bottomTab === 'tests'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700',
                      )}
                    >
                      <span>Test Cases</span>
                      <span className="text-[11px] text-slate-400 font-normal">
                        ({outcome ? `${outcome.passedCount}/${outcome.totalCount}` : slot.question.publicTests.length > 0 ? `0/${slot.question.publicTests.length}` : '1/1'})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBottomTab('output')}
                      className={cn(
                        'h-9 border-b-2 text-xs font-semibold flex items-center gap-1.5 transition',
                        bottomTab === 'output'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700',
                      )}
                    >
                      <span>Output</span>
                      {consoleLines.length > 0 && (
                        <span className="rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-700">
                          {consoleLines.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Right actions: Expand icon & Run tests button */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void runTests()}
                      disabled={locked || running}
                      className="text-xs text-slate-500 hover:text-blue-600 transition"
                      title="Run test cases"
                    >
                      {running ? 'Running…' : 'Run Tests'}
                    </button>
                    <button type="button" className="text-slate-400 hover:text-slate-600" title="Expand panel">
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Tabs Content */}
                <div className="flex-1 overflow-auto relative">
                  {bottomTab === 'tests' ? (
                    <div className="p-4 bg-white h-full overflow-auto">
                      <TestResults
                        outcome={outcome}
                        running={running}
                        error={runError}
                        expectedTests={slot.question.publicTests}
                        theme="light"
                      />
                    </div>
                  ) : (
                    <div className="h-full bg-[#0d1724]">
                      <ConsolePanel lines={consoleLines} onClear={() => setConsoleLines([])} />
                    </div>
                  )}
                </div>

                {/* Bottom Submit Bar (Fixed Submit Code in bottom-right) */}
                <div className="h-11 border-t border-slate-200 bg-white px-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirmSubmit(true)}
                    disabled={locked || submitting}
                    className="rounded-[4px] bg-[#0066d6] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0052b3] shadow-sm transition disabled:opacity-50"
                  >
                    {submitting ? 'Submitting…' : 'Submit Code'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Preview Modal */}
      {fullscreenPreview ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink-950 p-4">
          <div className="flex items-center justify-between pb-3">
            <span className="text-sm font-semibold text-slate-200">Fullscreen Preview</span>
            <Button size="sm" variant="secondary" onClick={() => setFullscreenPreview(false)}>
              Close Fullscreen
            </Button>
          </div>
          <div className="flex-1 overflow-hidden rounded-lg bg-white ring-1 ring-ink-700">
            <PreviewFrame html={code.html} css={code.css} js={code.js} refreshKey={previewKey} onConsole={pushConsole} />
          </div>
        </div>
      ) : null}

      <TabSwitchModal
        open={Boolean(awayMessage)}
        message={awayMessage}
        violationCount={violationCount}
        maxViolations={maxViolations}
        onAcknowledge={dismissAway}
      />

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit this question?"
        message="Your code will be graded against the test cases and your score will be recorded."
        confirmLabel="Submit Code"
        busy={submitting}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmSubmit(false)}
      />
    </div>
  );
}
