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
  exam: {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number;
    maxViolations: number;
  };
  session: {
    startedAt: string;
    expiresAt: string;
    msRemaining: number;
    serverTime: string;
    availability: string;
  };
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
  const [confirmEndExam, setConfirmEndExam] = React.useState(false);
  const [endingExam, setEndingExam] = React.useState(false);

  const [clock, setClock] = React.useState({ msRemaining: 0, syncedAt: Date.now() });
  const [expired, setExpired] = React.useState(false);
  const [bookmarked, setBookmarked] = React.useState<Record<string, boolean>>({});
  const [fullscreenPreview, setFullscreenPreview] = React.useState(false);
  const [currentView, setCurrentView] = React.useState<'workspace' | 'all'>('workspace');
  const [showPreview, setShowPreview] = React.useState(true);
  const [bottomTab, setBottomTab] = React.useState<'tests' | 'output'>('tests');
  const [section1Expanded, setSection1Expanded] = React.useState(true);

  // Adjustable section dimensions
  const [leftWidth, setLeftWidth] = React.useState(510);
  const [previewWidth, setPreviewWidth] = React.useState(380);
  const [bottomHeight, setBottomHeight] = React.useState(240);

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

  const handleAcknowledgeAway = React.useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await requestFullscreen();
      }
    } catch {
      /* browser gesture fallback */
    }
    dismissAway();
  }, [requestFullscreen, dismissAway]);

  const handlePasteAttempt = React.useCallback(() => {
    toast.push('Pasting code is disabled during this exam to ensure academic integrity.', 'error');
  }, [toast]);

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
        res.failedCount === 0
          ? 'All test cases passed.'
          : `${res.passedCount}/${res.totalCount} test cases passed.`,
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

  const handleEndExam = React.useCallback(async () => {
    if (endingExam || expired) return;
    setEndingExam(true);
    try {
      await flush();
      await apiPost(`/api/exams/${examId}/end`);
      toast.push('Test submitted successfully! Redirecting…', 'success');
      setConfirmEndExam(false);
      setTimeout(() => router.push('/dashboard'), 1200);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to end test. Please try again.', 'error');
      setEndingExam(false);
    }
  }, [examId, endingExam, expired, flush, router, toast]);

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
    <div className="flex h-screen flex-col bg-white font-sans text-slate-800">
      {/* ------------------------------------------------------------ top white header */}
      <header className="flex h-14 flex-shrink-0 select-none items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2">
            {/* SCALER Logo */}
            <div className="flex cursor-pointer items-center gap-1.5">
              <span className="text-base font-black tracking-wider text-slate-900">SCALER</span>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <path d="M4 4H16L20 8V20H4V4Z" fill="#0066d6" />
                <path
                  d="M10 8H16V14"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 16L16 8"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-slate-300">|</span>
            <h1 className="max-w-xs truncate text-xs font-semibold text-slate-800 sm:text-[13px] md:max-w-md">
              {data.exam.title || 'Web Dev 101 Mid Term Exam 2029 Batch'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Circular Attempted Progress */}
          <div className="flex select-none items-center gap-2 text-xs font-medium text-slate-700">
            <span className="inline-block h-3.5 w-3.5 flex-shrink-0 rounded-full border border-blue-600" />
            <span>
              {attemptedCount} / {data.questions.length} Attempted
            </span>
          </div>

          {/* Hidden Background Timer for Proctoring Auto-Submit */}
          <div className="sr-only">
            <ExamTimer serverMsRemaining={clock.msRemaining} syncedAt={clock.syncedAt} onExpire={finish} />
          </div>

          {violationCount > 0 ? (
            <span className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              <span>{violationCount}</span>
            </span>
          ) : null}

          {/* End Test Button */}
          <button
            type="button"
            onClick={() => setConfirmEndExam(true)}
            disabled={expired || endingExam}
            className="shadow-xs flex cursor-pointer items-center gap-1.5 rounded-[4px] bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
            title="End and submit entire test"
          >
            {endingExam ? 'Ending…' : 'End Test'}
          </button>

          {/* User Profile Avatar */}
          <button
            type="button"
            className="shadow-xs flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:text-slate-900"
          >
            <User className="h-4 w-4 stroke-[1.5]" />
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------ main body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Leftmost Vertical Navigation Bar (Width: 68px) */}
        <aside className="flex w-[68px] flex-shrink-0 select-none flex-col items-center border-r border-slate-200 bg-white py-2.5">
          {/* Info button */}
          <button
            type="button"
            title="Exam Info"
            className="mb-2 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
          >
            <Info className="h-3.5 w-3.5 stroke-[1.75]" />
          </button>

          {/* ALL Button */}
          <button
            type="button"
            onClick={() => setCurrentView('all')}
            className={cn(
              'relative flex w-full items-center justify-center py-1.5 text-[11px] font-bold tracking-wider transition',
              currentView === 'all'
                ? 'bg-blue-50/70 text-blue-600'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
            )}
            title="All Questions"
          >
            {currentView === 'all' && <span className="absolute bottom-0 left-0 top-0 w-0.5 bg-blue-600" />}
            ALL
          </button>

          {/* Section 1 Header */}
          <div className="mb-1 mt-2.5 flex w-full items-center justify-center gap-1 px-2 text-[11px] font-bold text-blue-600">
            <span>S1</span>
            <ChevronUp className="h-3 w-3 stroke-[2.5]" />
          </div>

          {/* Question Buttons Q1, Q2... */}
          <div className="flex w-full flex-col items-center">
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
                    'relative flex h-8 w-full items-center justify-between border-b border-slate-50 px-2 text-xs transition',
                    isCurrent
                      ? 'bg-blue-50/60 font-semibold text-blue-600'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                  title={`Question ${i + 1}: ${q.question.title}`}
                >
                  {isCurrent && <span className="absolute bottom-0 left-0 top-0 w-0.5 bg-blue-600" />}
                  <span className="text-[11px] font-medium">Q {i + 1}</span>
                  {isCompleted ? (
                    <span
                      className="shadow-xs flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white"
                      title="Answered"
                    >
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
          <div className="relative flex flex-1 flex-col overflow-auto bg-slate-50 p-4 sm:p-6">
            {/* Info alert banner */}
            <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-medium text-blue-700">
              This test is running in Proctored Mode. Submissions are saved and evaluated against test cases.
            </div>

            {/* Title & Section */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">All Questions</h2>
              <span className="text-xs italic text-slate-500">* Mandatory sections</span>
            </div>

            {/* Collapsible Section Card */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div
                onClick={() => setSection1Expanded((v) => !v)}
                className="flex cursor-pointer select-none items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3"
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
                    SECTION 1 <span className="text-rose-500">*</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">Default Section</span>
                    <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                      {data.questions.length} questions
                    </span>
                  </div>
                </div>
                <button type="button" className="text-slate-400 transition hover:text-slate-600">
                  {section1Expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>

              {section1Expanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <th className="w-12 px-4 py-2.5">#</th>
                        <th className="px-4 py-2.5">QUESTION</th>
                        <th className="w-32 px-4 py-2.5">TYPE</th>
                        <th className="w-24 px-4 py-2.5">SCORE</th>
                        <th className="w-44 px-4 py-2.5">STATUS</th>
                        <th className="w-32 px-4 py-2.5 text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.questions.map((q, i) => {
                        const isCompleted = q.attempt.status !== 'IN_PROGRESS';
                        return (
                          <tr key={q.question.id} className="transition hover:bg-slate-50/80">
                            <td className="px-4 py-3 font-mono text-slate-500">{i + 1}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{q.question.title}</td>
                            <td className="px-4 py-3 text-slate-600">
                              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                                <span className="text-[10px] font-bold text-orange-500">HTML</span>
                                Frontend
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-700">{q.points}</td>
                            <td className="px-4 py-3">
                              {isCompleted ? (
                                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                                  </span>
                                  Answered Successfully
                                </span>
                              ) : (
                                <span className="text-slate-400">Not Attempted</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  void selectQuestion(i);
                                  setCurrentView('workspace');
                                }}
                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
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
              className="fixed right-0 top-1/2 -translate-y-1/2 rounded-l-md bg-blue-600 px-1 py-3 text-white shadow-md transition hover:bg-blue-700"
              title="Back to question workspace"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* View 2: Question Workspace (Screenshot 1) */
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Left: Question Panel (Adjustable Width) */}
            <div
              style={{ width: `${leftWidth}px` }}
              className="flex min-w-0 flex-shrink-0 flex-col border-r border-slate-200 bg-white"
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
                setLeftWidth((w) => Math.max(260, Math.min(750, w + delta)));
              }}
            />

            {/* Right: Frontend Environment (Top) + Test Cases & Output (Bottom) */}
            <div className="flex min-w-0 flex-1 flex-col bg-[#10233d]">
              {/* Upper Section: Frontend Environment */}
              <div className="flex min-h-0 flex-1 flex-col bg-[#10233d]">
                {/* Top Environment Header (White bar) */}
                <div className="flex h-9 select-none items-center justify-between border-b border-slate-200 bg-white px-3 text-xs">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <span className="font-mono text-[12px] font-bold text-blue-600">&lt;/&gt;</span>
                    Frontend Environment
                  </span>
                  <div className="flex items-center gap-4 text-slate-500">
                    <button
                      type="button"
                      onClick={resetStarter}
                      disabled={locked}
                      className="flex items-center gap-1 text-xs transition hover:text-slate-900"
                      title="Reset to starter code"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs transition hover:text-slate-900"
                      title="Settings"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFullscreenPreview((v) => !v)}
                      className="flex items-center gap-1 text-[11px] transition hover:text-slate-900"
                      title="Maximize Preview"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span>Maximize</span>
                    </button>
                  </div>
                </div>

                {/* Horizontal File Tabs Bar (Navy #142943) */}
                <div className="flex h-8 select-none items-center justify-between border-b border-[#1b3456] bg-[#142943] px-2 text-xs">
                  {/* File tabs */}
                  <div className="flex h-full items-center">
                    <button
                      type="button"
                      onClick={() => setPane('html')}
                      className={cn(
                        'flex h-full items-center gap-1.5 border-t-2 px-3 text-xs font-medium transition',
                        pane === 'html'
                          ? 'border-blue-500 bg-[#1b3456] text-white'
                          : 'border-transparent text-slate-400 hover:text-slate-200',
                      )}
                    >
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-orange-600 text-[9px] font-bold text-white">
                        5
                      </span>
                      <span>index.html</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPane('css')}
                      className={cn(
                        'flex h-full items-center gap-1.5 border-t-2 px-3 text-xs font-medium transition',
                        pane === 'css'
                          ? 'border-blue-500 bg-[#1b3456] text-white'
                          : 'border-transparent text-slate-400 hover:text-slate-200',
                      )}
                    >
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-blue-600 text-[9px] font-bold text-white">
                        3
                      </span>
                      <span>style.css</span>
                    </button>
                    {slot.question.starterJs ? (
                      <button
                        type="button"
                        onClick={() => setPane('js')}
                        className={cn(
                          'flex h-full items-center gap-1.5 border-t-2 px-3 text-xs font-medium transition',
                          pane === 'js'
                            ? 'border-blue-500 bg-[#1b3456] text-white'
                            : 'border-transparent text-slate-400 hover:text-slate-200',
                        )}
                      >
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-amber-500 text-[9px] font-bold text-black">
                          JS
                        </span>
                        <span>script.js</span>
                      </button>
                    ) : null}
                  </div>

                  {/* Hide/Show Preview button */}
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-slate-300 transition hover:text-white"
                    title={showPreview ? 'Hide live preview' : 'Show live preview'}
                  >
                    {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    <span>{showPreview ? 'Hide Preview' : 'Show Preview'}</span>
                  </button>
                </div>

                {/* Editor & Preview Split */}
                <div className="flex min-h-0 flex-1">
                  {/* Project Sidebar (~210px, Navy #10233d) */}
                  <div className="flex w-52 flex-shrink-0 select-none flex-col border-r border-[#1a3150] bg-[#10233d]">
                    <div className="border-b border-[#1a3150]/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      PROJECT
                    </div>
                    <div className="space-y-0.5 p-1.5">
                      <button
                        type="button"
                        onClick={() => setPane('html')}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-xs transition',
                          pane === 'html'
                            ? 'bg-[#172b46] font-medium text-white ring-1 ring-[#203a5f]'
                            : 'text-slate-300 hover:bg-[#15273f] hover:text-white',
                        )}
                      >
                        <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded bg-orange-600 text-[9px] font-bold text-white">
                          5
                        </span>
                        <span className="truncate">index.html</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPane('css')}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-xs transition',
                          pane === 'css'
                            ? 'bg-[#172b46] font-medium text-white ring-1 ring-[#203a5f]'
                            : 'text-slate-300 hover:bg-[#15273f] hover:text-white',
                        )}
                      >
                        <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded bg-blue-600 text-[9px] font-bold text-white">
                          3
                        </span>
                        <span className="truncate">style.css</span>
                      </button>
                      {slot.question.starterJs ? (
                        <button
                          type="button"
                          onClick={() => setPane('js')}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-left text-xs transition',
                            pane === 'js'
                              ? 'bg-[#172b46] font-medium text-white ring-1 ring-[#203a5f]'
                              : 'text-slate-300 hover:bg-[#15273f] hover:text-white',
                          )}
                        >
                          <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded bg-amber-500 text-[9px] font-bold text-black">
                            JS
                          </span>
                          <span className="truncate">script.js</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Code Area */}
                  <div className="flex min-w-0 flex-1 flex-col bg-[#131f30]">
                    <div className="min-h-0 flex-1">
                      <CodeEditor
                        key={`${attempt.id}-${pane}`}
                        value={editorValue}
                        language={language as 'html' | 'css' | 'javascript'}
                        readOnly={locked}
                        preventPaste={!locked}
                        onPasteAttempt={handlePasteAttempt}
                        onChange={(next) =>
                          setCode((prev) => ({ ...prev, [pane === 'js' ? 'js' : pane]: next }))
                        }
                        onSaveShortcut={() => void flush()}
                        onRunShortcut={() => void runTests()}
                      />
                    </div>
                    {/* Status footer */}
                    <div className="flex h-6 items-center border-t border-[#1a2d46] bg-[#0d1724] px-3 text-[11px] text-slate-400">
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
                          setPreviewWidth((w) => Math.max(240, Math.min(800, w - delta)));
                        }}
                      />
                      <div
                        style={{ width: `${previewWidth}px` }}
                        className="flex flex-shrink-0 flex-col border-l border-slate-200 bg-[#fff] p-3"
                      >
                        <div className="h-full w-full overflow-hidden rounded-[4px] border border-dashed border-[#b7b7b7] bg-[#fafafa]">
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
                  setBottomHeight((h) => Math.max(140, Math.min(550, h - delta)));
                }}
              />

              {/* Bottom Section: Test Cases & Output */}
              <div
                style={{ height: `${bottomHeight}px` }}
                className="flex flex-shrink-0 flex-col border-t border-slate-200 bg-white"
              >
                {/* Tabs Header */}
                <div className="flex h-9 select-none items-center justify-between border-b border-slate-200 bg-white px-4">
                  <div className="flex items-center gap-6">
                    <button
                      type="button"
                      onClick={() => setBottomTab('tests')}
                      className={cn(
                        'flex h-9 items-center gap-1.5 border-b-2 text-xs font-semibold transition',
                        bottomTab === 'tests'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700',
                      )}
                    >
                      <span>Test Cases</span>
                      <span className="text-[11px] font-normal text-slate-400">
                        (
                        {outcome
                          ? `${outcome.passedCount}/${outcome.totalCount}`
                          : slot.question.publicTests.length > 0
                            ? `0/${slot.question.publicTests.length}`
                            : '1/1'}
                        )
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBottomTab('output')}
                      className={cn(
                        'flex h-9 items-center gap-1.5 border-b-2 text-xs font-semibold transition',
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
                      className="text-xs text-slate-500 transition hover:text-blue-600"
                      title="Run test cases"
                    >
                      {running ? 'Running…' : 'Run Tests'}
                    </button>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600"
                      title="Expand panel"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Tabs Content */}
                <div className="relative flex-1 overflow-auto">
                  {bottomTab === 'tests' ? (
                    <div className="h-full overflow-auto bg-white p-4">
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
                <div className="flex h-11 items-center justify-end border-t border-slate-200 bg-white px-4">
                  <button
                    type="button"
                    onClick={() => setConfirmSubmit(true)}
                    disabled={locked || submitting}
                    className="rounded-[4px] bg-[#0066d6] px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0052b3] disabled:opacity-50"
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
            <PreviewFrame
              html={code.html}
              css={code.css}
              js={code.js}
              refreshKey={previewKey}
              onConsole={pushConsole}
            />
          </div>
        </div>
      ) : null}

      <TabSwitchModal
        open={Boolean(awayMessage)}
        message={awayMessage}
        violationCount={violationCount}
        maxViolations={maxViolations}
        onAcknowledge={handleAcknowledgeAway}
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

      <ConfirmDialog
        open={confirmEndExam}
        title="End Test?"
        message={`You have attempted ${attemptedCount} of ${data.questions.length} questions. Are you sure you want to end your test? Once submitted, your exam will finish and you cannot make further changes.`}
        confirmLabel={endingExam ? 'Ending Test…' : 'Yes, End Test'}
        danger
        busy={endingExam}
        onConfirm={() => void handleEndExam()}
        onCancel={() => setConfirmEndExam(false)}
      />
    </div>
  );
}
