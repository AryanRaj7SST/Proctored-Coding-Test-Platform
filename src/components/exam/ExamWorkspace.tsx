'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { PreviewFrame, type ConsoleLine } from '@/components/editor/PreviewFrame';
import { ConsolePanel } from '@/components/editor/ConsolePanel';
import { QuestionPanel, type StudentQuestion } from './QuestionPanel';
import { TestResults, type RunOutcome } from './TestResults';
import { ExamTimer } from './ExamTimer';
import {
  QuestionStatusDot,
  QuestionStatusLabel,
  questionState,
  type QuestionResultStatus,
} from './QuestionStatus';
import { TabSwitchModal } from '@/components/proctor/TabSwitchModal';
import { CameraPreview } from '@/components/proctor/CameraPreview';
import { ProctorGate } from '@/components/proctor/ProctorGate';
import { Button, ConfirmDialog, Spinner, ResizeHandle } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAutosave } from '@/hooks/useAutosave';
import { useProctor } from '@/hooks/useProctor';
import { useCameraMonitor } from '@/hooks/useCameraMonitor';
import { cameraFailureMessage, requestCamera } from '@/lib/camera';
import { apiPatch, apiPost, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  User,
  Info,
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

const LANGUAGE_ICONS: Record<string, string> = {
  html: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg',
  css: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg',
  js: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg',
  javascript: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg',
  py: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg',
  python: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg',
  cpp: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg',
  java: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg',
};

const DEFAULT_ICON = 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg';

function getLanguageIcon(langOrExt: string): string {
  const key = langOrExt.toLowerCase();
  return LANGUAGE_ICONS[key] ?? DEFAULT_ICON;
}

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
  gradingPending?: boolean;
  resultStatus?: QuestionResultStatus;
}

interface QuestionSlot {
  order: number;
  points: number;
  question: StudentQuestion;
  attempt: AttemptDto;
}

interface StartResponse {
  user?: {
    id: string;
    email: string;
    role?: 'STUDENT' | 'ADMIN';
  };
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
  accommodations?: { allowClipboard: boolean };
  questions: QuestionSlot[];
}

interface HeartbeatResponse {
  status: string;
  msRemaining: number;
  /** Server clock: the sitting's time is up. */
  expired: boolean;
  /** The sitting is closed server-side (work submitted; graded or pending). */
  finalized: boolean;
  endReason: 'STUDENT_ENDED' | 'EXPIRED' | 'EXAM_CLOSED' | 'VIOLATION_LIMIT' | 'ACCESS_REVOKED' | null;
  gradingPending: number;
  violationCount: number;
}

interface EndExamResponse {
  submittedCount: number;
  gradedCount: number;
  pendingCount: number;
}

type SubmitResponse = Omit<RunOutcome, 'score'> & {
  alreadySubmitted: boolean;
  gradingPending: boolean;
  gradingError: string | null;
  score: number | null;
  /** The question's counted score: its best graded submission. */
  bestScore: number | null;
  questionStatus: 'PASSED' | 'PARTIAL' | 'FAILED' | null;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The code to show for a question: the saved attempt, or the starter where a file is still empty. */
function codeOf(slot: QuestionSlot): { html: string; css: string; js: string } {
  return {
    html: slot.attempt.html || slot.question.starterHtml,
    css: slot.attempt.css || slot.question.starterCss,
    js: slot.attempt.js || slot.question.starterJs,
  };
}

const ACCESS_REVOKED_MESSAGE =
  'An administrator removed your access to this test. Your saved work was submitted.';

/** Student-facing summary once the server has closed the sitting. */
function closedMessage(reason: HeartbeatResponse['endReason'], gradingPending: number): string {
  const base =
    reason === 'VIOLATION_LIMIT'
      ? 'The proctoring violation limit was reached, so your test was ended and your saved work submitted.'
      : reason === 'STUDENT_ENDED'
        ? 'Your test has been submitted.'
        : reason === 'ACCESS_REVOKED'
          ? ACCESS_REVOKED_MESSAGE
          : "Time's up. Your saved work has been submitted.";
  return gradingPending > 0
    ? `${base} Your answers are being graded; results will appear on your dashboard. A delay in grading never counts against you.`
    : base;
}

type Pane = 'html' | 'css' | 'js';

const HEARTBEAT_MS = 12_000;

/* ------------------------------------------------------------- component */

export function ExamWorkspace({
  examId,
  camera = null,
  onCameraChange,
  onClosed,
}: {
  examId: string;
  /** The live camera stream from the system check (kept in memory, shown locally only). */
  camera?: MediaStream | null;
  onCameraChange?: (stream: MediaStream | null) => void;
  /** The sitting is closed: the camera is released. */
  onClosed?: () => void;
}) {
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
  const [switchingQuestion, setSwitchingQuestion] = React.useState(false);
  const switchingRef = React.useRef(false);

  const [reloadKey, setReloadKey] = React.useState(0);
  const reloadTest = React.useCallback(() => {
    setLoading(true);
    setFatal(null);
    setReloadKey((k) => k + 1);
  }, []);

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
  // A submitted question stays editable (and resubmittable) until the sitting ends.
  const locked =
    expired || (attempt ? attempt.status !== 'IN_PROGRESS' && attempt.status !== 'SUBMITTED' : true);

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
        if (first) setCode(codeOf(first));
        setPreviewKey((k) => k + 1);
      } catch (err) {
        if (!cancelled) setFatal(err instanceof Error ? err.message : 'Could not open this test.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, reloadKey]);

  /* ------------------------------------------------------------- autosave */

  // The attempt id travels with every save (never read from current state),
  // so an edit made on one question can never be written to another.
  const saveCode = React.useCallback(
    async (attemptId: string, value: { html: string; css: string; js: string }) => {
      await apiPatch(`/api/attempts/${attemptId}`, value);
    },
    [],
  );

  const {
    state: saveState,
    flush,
    retry,
  } = useAutosave(code, attempt?.id ?? null, saveCode, {
    enabled: Boolean(attempt) && !locked,
  });

  /* ------------------------------------------------------------ heartbeat */

  const [violationCount, setViolationCount] = React.useState(0);
  React.useEffect(() => {
    if (data) setViolationCount(data.violationCount);
  }, [data]);

  // Closing the sitting is SERVER work: the page only flushes its last edit and
  // then asks the server (via the heartbeat) to finalise, retrying until the
  // server confirms. Nothing is claimed as submitted before that confirmation.
  const [closing, setClosing] = React.useState<{
    phase: 'finalizing' | 'done' | 'unconfirmed';
    message: string;
  } | null>(null);
  const closingRef = React.useRef(false);
  const heartbeatTimerRef = React.useRef<{ stop: () => void } | null>(null);

  const closeSitting = React.useCallback(
    async (known?: HeartbeatResponse, trigger: 'timer' | 'server' = 'server') => {
      if (closingRef.current) return; // timer, heartbeat and violations may all fire
      closingRef.current = true;
      heartbeatTimerRef.current?.stop();
      const timeUp = trigger === 'timer' || (known?.expired && !known.finalized);
      setClosing({
        phase: 'finalizing',
        message: timeUp ? "Time's up. Submitting your work…" : 'Closing your test…',
      });
      try {
        await flush(); // accepted by the server inside the submit grace window
      } catch {
        /* the server grades the last autosaved code regardless */
      }
      setExpired(true); // lock the editor and stop the regular heartbeat

      let res: HeartbeatResponse | undefined = known?.finalized ? known : undefined;
      for (let attemptNo = 0; !res && attemptNo < 24; attemptNo += 1) {
        try {
          const beat = await apiPost<HeartbeatResponse>('/api/heartbeat', { examId });
          setViolationCount(beat.violationCount);
          if (beat.finalized) {
            res = beat;
            break;
          }
          if (!beat.expired && beat.msRemaining > 1000) {
            // Our countdown ran ahead of the server's: the sitting is still open.
            setClock({ msRemaining: beat.msRemaining, syncedAt: Date.now() });
            setExpired(false);
            setClosing(null);
            closingRef.current = false;
            return;
          }
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            setClosing({
              phase: 'unconfirmed',
              message:
                'Your sign-in expired. Your saved work is kept and will be submitted by the server. Sign in again to see your result.',
            });
            return;
          }
        }
        // The server waits out a short grace window before finalising.
        await sleep(attemptNo < 5 ? 1500 : 5000);
      }

      if (!res) {
        setClosing({
          phase: 'unconfirmed',
          message:
            "We couldn't reach the server to confirm your submission. Your saved work is kept and will be submitted automatically.",
        });
        return;
      }
      const message = closedMessage(res.endReason, res.gradingPending);
      setClosing({ phase: 'done', message });
      toast.push(message, res.endReason === 'VIOLATION_LIMIT' ? 'error' : 'success');
      setTimeout(() => router.push('/dashboard'), 4000);
    },
    [examId, flush, router, toast],
  );

  React.useEffect(() => {
    if (!data || expired) return;
    let stop = false;
    const timer: { id?: ReturnType<typeof setInterval> } = {};
    const stopHeartbeat = () => {
      stop = true;
      if (timer.id) clearInterval(timer.id);
    };
    heartbeatTimerRef.current = { stop: stopHeartbeat };

    const tick = async () => {
      if (stop || closingRef.current) return;
      try {
        const res = await apiPost<HeartbeatResponse>('/api/heartbeat', { examId });
        if (stop || closingRef.current) return;
        setClock({ msRemaining: res.msRemaining, syncedAt: Date.now() });
        setViolationCount(res.violationCount);
        // Time ran out, or the server closed the sitting (violation limit,
        // exam ended by an administrator).
        if (res.expired || res.finalized) void closeSitting(res);
      } catch (err) {
        if (stop || closingRef.current) return;
        // 404: this student can no longer open the test (an administrator
        // revoked their access; the server already submitted their work).
        if (err instanceof ApiError && err.status === 404) {
          stopHeartbeat();
          setClosing({ phase: 'done', message: ACCESS_REVOKED_MESSAGE });
          setTimeout(() => router.push('/dashboard'), 4000);
          return;
        }
        // Offline: keep the local countdown running; the server still owns the
        // deadline and will finalise the attempt regardless.
      }
    };
    void tick();
    timer.id = setInterval(() => {
      if (stop || closingRef.current) return;
      void tick();
    }, HEARTBEAT_MS);
    return () => {
      stopHeartbeat();
      heartbeatTimerRef.current = null;
    };
  }, [data, examId, expired, closeSitting, router]);

  /* ----------------------------------------------------------- proctoring */

  const onServerClosed = React.useCallback(() => void closeSitting(), [closeSitting]);

  // Clipboard accommodation: computed server-side from per-student accommodation
  // or open test access.
  const isPasteAllowed = data?.accommodations?.allowClipboard === true;

  // Proctoring runs for the whole open sitting -- including while the question
  // on screen has already been submitted -- and stops once it closes.
  const sittingOpen = Boolean(data) && !expired && !closing;

  const onClipboardBlocked = React.useCallback(
    (action: 'COPY' | 'CUT' | 'PASTE' | 'CONTEXT_MENU') => {
      if (action === 'PASTE') return; // a recorded violation: the warning modal explains it
      toast.push(
        action === 'CONTEXT_MENU'
          ? 'The right-click menu is disabled during this test.'
          : 'Copy/Paste Blocked: copying and pasting are disabled during this test.',
        'error',
      );
    },
    [toast],
  );

  const { alert, dismissAlert, isFullscreen, requestFullscreen, report } = useProctor({
    examId,
    attemptId: attempt?.id ?? null,
    enabled: sittingOpen,
    allowClipboard: isPasteAllowed,
    onCountChange: setViolationCount,
    onTerminated: onServerClosed,
    onClipboardBlocked,
  });

  const handleAcknowledgeAlert = React.useCallback(async () => {
    // The click is a user gesture, so fullscreen can be restored in the same step.
    if (!document.fullscreenElement) await requestFullscreen();
    dismissAlert();
  }, [requestFullscreen, dismissAlert]);

  /* --------------------------------------------------------------- camera */

  // Only transitions are reported (one event per interruption): the stream
  // itself never leaves this browser.
  const cameraLive = useCameraMonitor(camera, sittingOpen, (live) => {
    void report(live ? 'CAMERA_RESTORED' : 'CAMERA_STREAM_STOPPED');
  });
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [cameraBusy, setCameraBusy] = React.useState(false);

  // The sitting is open and the camera is on: record that once per page load.
  const grantReported = React.useRef(false);
  React.useEffect(() => {
    if (!sittingOpen || !cameraLive || grantReported.current) return;
    grantReported.current = true;
    void report('CAMERA_PERMISSION_GRANTED');
  }, [sittingOpen, cameraLive, report]);

  const reenableCamera = React.useCallback(async () => {
    setCameraBusy(true);
    const result = await requestCamera();
    setCameraBusy(false);
    if (result.ok) {
      setCameraError(null);
      onCameraChange?.(result.stream); // the monitor reports CAMERA_RESTORED once it is live
      return;
    }
    setCameraError(cameraFailureMessage(result.reason));
    void report(result.reason === 'DENIED' ? 'CAMERA_PERMISSION_DENIED' : 'CAMERA_UNAVAILABLE', {
      metadata: { reason: result.reason },
    });
  }, [onCameraChange, report]);

  // The sitting is over: release the camera now rather than on navigation.
  React.useEffect(() => {
    if (closing?.phase === 'done') onClosed?.();
  }, [closing, onClosed]);

  const handlePasteAttempt = React.useCallback(() => {
    if (isPasteAllowed) return;
    toast.push('Pasting code is disabled during this test to ensure academic integrity.', 'error');
  }, [isPasteAllowed, toast]);

  // The violation limit is enforced by the server (proctor-events and
  // heartbeat close the sitting and grade it). The page only reacts to the
  // server's verdict; it never submits on its own count.
  const maxViolations = data?.exam.maxViolations ?? 0;
  React.useEffect(() => {
    if (maxViolations > 0 && violationCount >= maxViolations && !closingRef.current) {
      void closeSitting();
    }
  }, [violationCount, maxViolations, closeSitting]);

  /* -------------------------------------------------------- question swap */

  const selectQuestion = React.useCallback(
    async (next: number) => {
      if (!data || next === index || switchingRef.current) return;
      switchingRef.current = true;
      setSwitchingQuestion(true);
      try {
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
        setCode(codeOf(target));
        setOutcome(null);
        setRunError(null);
        setConsoleLines([]);
        setPreviewKey((k) => k + 1);
        setPane('html');
      } finally {
        switchingRef.current = false;
        setSwitchingQuestion(false);
      }
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
    setRunError(null);
    setBottomTab('tests');
    setConfirmSubmit(false);
    try {
      await flush();
      const resubmission = attempt.status === 'SUBMITTED';
      const res = await apiPost<SubmitResponse>(`/api/attempts/${attempt.id}/submit`, code);
      setBottomTab('tests');
      setData((prev) => {
        if (!prev) return prev;
        const questions = prev.questions.slice();
        const current = questions[index];
        if (current) {
          questions[index] = {
            ...current,
            attempt: {
              ...current.attempt,
              status: 'SUBMITTED',
              // The best submission counts; a lower resubmission never lowers it.
              score: res.bestScore ?? res.score,
              maxScore: res.maxScore,
              gradingPending: res.bestScore === null && res.gradingPending,
              resultStatus:
                res.bestScore !== null && res.bestScore !== res.score
                  ? current.attempt.resultStatus
                  : res.questionStatus,
            },
          };
        }
        return { ...prev, questions };
      });
      if (res.gradingPending || res.score === null) {
        // Recorded, but the grader could not run: no score is invented.
        const message =
          resubmission && res.bestScore !== null
            ? `Automatic grading is temporarily unavailable. Your best score so far (${res.bestScore}/${res.maxScore}) is kept, and your latest code will be graded when the test ends.`
            : 'Your answer was submitted, but automatic grading is temporarily unavailable. It will be graded later; you do not need to resubmit.';
        setOutcome(null);
        setRunError(message);
        toast.push(message, 'info');
      } else {
        setOutcome({ ...res, score: res.score, graded: true });
        toast.push(
          res.bestScore !== null && res.bestScore > res.score
            ? `Submitted. This submission scored ${res.score}/${res.maxScore}; your best score ${res.bestScore}/${res.maxScore} counts.`
            : `Submitted. Score ${res.score}/${res.maxScore}. You can resubmit until time runs out.`,
          'success',
        );
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Submission failed. Please try again.';
      setRunError(message);
      setBottomTab('tests');
      toast.push(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [attempt, submitting, locked, code, index, flush, toast]);

  const handleEndExam = React.useCallback(async () => {
    if (endingExam || expired || closingRef.current) return;
    // Cancel the heartbeat interval immediately before network requests start
    // so no concurrent heartbeat tick can race the manual submit call.
    heartbeatTimerRef.current?.stop();
    setEndingExam(true);
    closingRef.current = true; // the timer must not start a second close
    try {
      await flush();
      const res = await apiPost<EndExamResponse>(`/api/exams/${examId}/end`);
      toast.push(
        res.pendingCount > 0
          ? `Test submitted. Grading is delayed for ${res.pendingCount} question(s) and will be completed by your mentor. Redirecting…`
          : 'Test submitted successfully! Redirecting…',
        'success',
      );
      setConfirmEndExam(false);
      setExpired(true);
      setTimeout(() => router.push('/dashboard'), res.pendingCount > 0 ? 4000 : 1200);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to end test. Please try again.', 'error');
      closingRef.current = false;
      setEndingExam(false);
    }
  }, [examId, endingExam, expired, flush, router, toast]);

  const onTimerExpire = React.useCallback(() => void closeSitting(undefined, 'timer'), [closeSitting]);

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
      <div
        className="flex h-screen items-center justify-center bg-ink-950 text-slate-400"
        role="status"
        aria-live="polite"
      >
        <Spinner className="mr-2 h-5 w-5" /> Preparing your test…
      </div>
    );
  }

  if (fatal || !data || !slot || !attempt) {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-4 bg-ink-950 px-6 text-center"
        role="alert"
        aria-live="assertive"
      >
        <p className="text-sm text-rose-300">{fatal ?? 'This test is not available.'}</p>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => router.push('/dashboard')}>
            Back to dashboard
          </Button>
          <Button onClick={reloadTest}>Try again</Button>
        </div>
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
            <div className="flex cursor-pointer items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/scaler-logo.png" alt="Scaler" className="h-8 w-auto object-contain sm:h-9" />
            </div>
            <span className="text-slate-300">|</span>
            <h1 className="max-w-xs truncate text-xs font-semibold text-slate-800 sm:text-[13px] md:max-w-md">
              {data.exam.title || 'Test'}
            </h1>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-6">
          {/* Circular Attempted Progress */}
          <div className="flex select-none items-center gap-2 text-xs font-medium text-slate-700">
            <span className="hidden h-3.5 w-3.5 flex-shrink-0 rounded-full border border-blue-600 sm:inline-block" />
            <span>
              {attemptedCount} / {data.questions.length}
              <span className="hidden sm:inline"> Attempted</span>
            </span>
          </div>

          {/* The student's own camera, local preview only (never recorded or uploaded). */}
          <CameraPreview stream={camera} live={cameraLive} compact className="hidden sm:flex" />

          {/* Visible countdown; it also triggers the server-side close at zero. */}
          <ExamTimer
            serverMsRemaining={clock.msRemaining}
            syncedAt={clock.syncedAt}
            onExpire={onTimerExpire}
            stoppedLabel={
              closing ? (closing.phase === 'done' ? 'Submitted' : 'Submitting…') : expired ? 'Ended' : null
            }
          />

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
            aria-busy={endingExam || undefined}
            className="shadow-xs flex cursor-pointer items-center gap-1.5 rounded-[4px] bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
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
            title="Test info"
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
              return (
                <button
                  key={q.question.id}
                  type="button"
                  disabled={switchingQuestion}
                  onClick={() => {
                    void selectQuestion(i);
                    setCurrentView('workspace');
                  }}
                  className={cn(
                    'relative flex h-8 w-full items-center justify-between border-b border-slate-50 px-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50',
                    isCurrent
                      ? 'bg-blue-50/60 font-semibold text-blue-600'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                  title={`Question ${i + 1}: ${q.question.title}`}
                >
                  {isCurrent && <span className="absolute bottom-0 left-0 top-0 w-0.5 bg-blue-600" />}
                  <span className="text-[11px] font-medium">Q {i + 1}</span>
                  <QuestionStatusDot state={questionState(q.attempt)} />
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
                        const state = questionState(q.attempt);
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
                            <td className="px-4 py-3 font-mono text-slate-700">
                              {q.attempt.score !== null && state !== 'PENDING' && state !== 'NOT_SUBMITTED'
                                ? `${q.attempt.score}/${q.points}`
                                : q.points}
                            </td>
                            <td className="px-4 py-3">
                              <QuestionStatusLabel state={state} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                disabled={switchingQuestion}
                                onClick={() => {
                                  void selectQuestion(i);
                                  setCurrentView('workspace');
                                }}
                                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getLanguageIcon('html')}
                        alt="HTML5"
                        className="h-3.5 w-3.5 shrink-0 object-contain"
                      />
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getLanguageIcon('css')}
                        alt="CSS3"
                        className="h-3.5 w-3.5 shrink-0 object-contain"
                      />
                      <span>style.css</span>
                    </button>
                    {/* Always offered: a question may need JavaScript even with no starter JS. */}
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getLanguageIcon('js')}
                        alt="JavaScript"
                        className="h-3.5 w-3.5 shrink-0 object-contain"
                      />
                      <span>script.js</span>
                    </button>
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
                  {/* Code Area */}
                  <div className="flex min-w-0 flex-1 flex-col bg-[#131f30]">
                    <div className="min-h-0 flex-1">
                      <CodeEditor
                        key={`${attempt.id}-${pane}`}
                        value={editorValue}
                        language={language as 'html' | 'css' | 'javascript'}
                        readOnly={locked}
                        preventPaste={!locked && !isPasteAllowed}
                        onPasteAttempt={handlePasteAttempt}
                        onChange={(next) =>
                          setCode((prev) => ({ ...prev, [pane === 'js' ? 'js' : pane]: next }))
                        }
                        onSaveShortcut={() => void flush()}
                        onRunShortcut={() => void runTests()}
                      />
                    </div>
                    {/* Status footer */}
                    <div
                      className="flex h-6 items-center justify-between border-t border-[#1a2d46] bg-[#0d1724] px-3 text-[11px] text-slate-400"
                      role="status"
                      aria-live="polite"
                    >
                      <span>
                        {saveState === 'saving'
                          ? 'Saving…'
                          : saveState === 'retrying'
                            ? 'Not saved yet — retrying…'
                            : saveState === 'error'
                              ? "Couldn't save —"
                              : 'Your Code is Saved'}
                      </span>
                      {saveState === 'error' && (
                        <button
                          type="button"
                          onClick={() => void retry()}
                          className="ml-2 text-amber-400 underline transition hover:text-amber-300"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Side-by-Side Live Preview */}
                  {showPreview && (
                    <ResizeHandle
                      direction="horizontal"
                      className="bg-[#10233d]"
                      onResize={(delta) => {
                        setPreviewWidth((w) => Math.max(240, Math.min(800, w - delta)));
                      }}
                    />
                  )}
                  <div
                    style={{
                      width: `${previewWidth}px`,
                      display: showPreview ? 'flex' : 'none',
                    }}
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
                          : `0/${slot.question.tests.length}`}
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
                      aria-busy={running || undefined}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Run test cases"
                    >
                      {running && <Spinner className="h-3 w-3" />}
                      <span>{running ? 'Running…' : 'Run Tests'}</span>
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
                        running={running || submitting}
                        error={runError}
                        onRetry={() => void runTests()}
                        expectedTests={slot.question.tests}
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
                    aria-busy={submitting || undefined}
                    className="rounded-[4px] bg-[#0066d6] px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0052b3] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting
                      ? 'Submitting…'
                      : attempt.status === 'SUBMITTED'
                        ? 'Resubmit Code'
                        : 'Submit Code'}
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
        alert={sittingOpen ? alert : null}
        violationCount={violationCount}
        maxViolations={maxViolations}
        onAcknowledge={() => void handleAcknowledgeAlert()}
      />

      {sittingOpen && (!isFullscreen || !cameraLive) ? (
        <ProctorGate
          fullscreen={isFullscreen}
          camera={cameraLive}
          cameraError={cameraError}
          busy={cameraBusy}
          onFullscreen={() => void requestFullscreen()}
          onCamera={() => void reenableCamera()}
        />
      ) : null}

      <ConfirmDialog
        open={confirmSubmit}
        title={attempt?.status === 'SUBMITTED' ? 'Resubmit this question?' : 'Submit this question?'}
        message="Your code will be graded against the test cases. You can resubmit as many times as you like until time runs out; your best score counts."
        confirmLabel={attempt?.status === 'SUBMITTED' ? 'Resubmit Code' : 'Submit Code'}
        busy={submitting}
        onConfirm={() => void submit()}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={confirmEndExam}
        title="End Test?"
        message={`You have attempted ${attemptedCount} of ${data.questions.length} questions. Are you sure you want to end your test? Once submitted, your test will finish and you cannot make further changes.`}
        confirmLabel={endingExam ? 'Ending Test…' : 'Yes, End Test'}
        danger
        busy={endingExam}
        onConfirm={() => void handleEndExam()}
        onCancel={() => setConfirmEndExam(false)}
      />

      {closing ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="closing-title"
          aria-describedby="closing-message"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 px-4"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-xl">
            <h2 id="closing-title" className="text-base font-semibold text-slate-900">
              {closing.phase === 'finalizing'
                ? 'Submitting your test'
                : closing.phase === 'done'
                  ? 'Test submitted'
                  : 'Submission not yet confirmed'}
            </h2>
            <p id="closing-message" aria-live="polite" className="mt-2 text-sm text-slate-600">
              {closing.phase === 'finalizing' ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="h-4 w-4" /> {closing.message}
                </span>
              ) : (
                closing.message
              )}
            </p>
            {closing.phase !== 'finalizing' ? (
              <Button className="mt-5" variant="secondary" onClick={() => router.push('/dashboard')}>
                Go to dashboard
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
