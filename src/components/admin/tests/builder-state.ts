import { DEFAULT_TIME_ZONE, examValuesFrom, windowFieldPayload } from '../exam-types';
import { marksError, percentError, toCents } from './format';
import type {
  AccessMode,
  Difficulty,
  QuestionBankItem,
  QuestionStatus,
  ResultVisibility,
  TestDetail,
  TestQuestionDto,
} from './types';

/* ------------------------------------------------------------- steps */

export const STEPS = [
  { id: 'basics', label: 'Basic information' },
  { id: 'questions', label: 'Questions' },
  { id: 'marks', label: 'Marks' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'access', label: 'Access' },
  { id: 'settings', label: 'Settings' },
  { id: 'preview', label: 'Preview' },
  { id: 'publish', label: 'Publish' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export const isStepId = (v: unknown): v is StepId => STEPS.some((s) => s.id === v);

/* -------------------------------------------------------------- form */

/** A question as the builder holds it (from the saved test or the picker). */
export interface SelectedQuestion {
  questionId: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  category: string | null;
  tags: string[];
  status: QuestionStatus;
  currentVersion: number;
  defaultMarks: number;
  enabledTests: number;
  /** Version frozen on the test (set at publish); null until then. */
  pinnedVersion: number | null;
  /** Marks in this test, as typed (decimal string). */
  marks: string;
}

/**
 * Everything the builder edits. Numbers are kept as the typed strings so a
 * half-typed value ("12.") is not clobbered; they are parsed on save.
 */
export interface BuilderForm {
  title: string;
  description: string;
  instructions: string;
  batch: string;
  durationMinutes: string;
  timezone: string;
  /** Stored start instant (ISO) or '' -- the baseline, never edited directly. */
  startIso: string;
  endIso: string;
  /** What the admin typed into the window inputs; null = untouched. */
  editedStart: string | null;
  editedEnd: string | null;
  accessMode: AccessMode;
  maxAttempts: string;
  passingPercentage: string;
  resultVisibility: ResultVisibility;
  maxViolations: string;
  shuffleQuestions: boolean;
  questions: SelectedQuestion[];
}

export const EMPTY_FORM: BuilderForm = {
  title: '',
  description: '',
  instructions: '',
  batch: '',
  durationMinutes: '60',
  timezone: DEFAULT_TIME_ZONE,
  startIso: '',
  endIso: '',
  editedStart: null,
  editedEnd: null,
  accessMode: 'ANY_AUTHENTICATED_USER',
  maxAttempts: '1',
  passingPercentage: '40',
  resultVisibility: 'FULL',
  maxViolations: '0',
  shuffleQuestions: false,
  questions: [],
};

export function questionFromDto(q: TestQuestionDto): SelectedQuestion {
  return {
    questionId: q.questionId,
    title: q.title,
    slug: q.slug,
    difficulty: q.difficulty,
    category: q.category,
    tags: q.tags,
    status: q.status,
    currentVersion: q.currentVersion,
    defaultMarks: q.defaultMarks,
    enabledTests: q.enabledTests,
    pinnedVersion: q.pinnedVersion,
    marks: String(q.marks),
  };
}

export function questionFromBank(q: QuestionBankItem): SelectedQuestion {
  return {
    questionId: q.id,
    title: q.title,
    slug: q.slug,
    difficulty: q.difficulty,
    category: q.category,
    tags: q.tags,
    status: q.status,
    currentVersion: q.version,
    defaultMarks: q.marks,
    enabledTests: q.enabledTests,
    pinnedVersion: null,
    marks: String(q.marks),
  };
}

export function formFromDetail(detail: TestDetail): BuilderForm {
  const window = examValuesFrom(detail);
  return {
    title: detail.title,
    description: detail.description ?? '',
    instructions: detail.instructions ?? '',
    batch: detail.batch ?? '',
    durationMinutes: String(detail.durationMinutes),
    timezone: detail.timezone || DEFAULT_TIME_ZONE,
    startIso: window.startTime,
    endIso: window.endTime,
    editedStart: null,
    editedEnd: null,
    accessMode: detail.accessMode,
    maxAttempts: String(detail.maxAttempts),
    passingPercentage: String(detail.passingPercentage),
    resultVisibility: detail.resultVisibility,
    maxViolations: String(detail.maxViolations),
    shuffleQuestions: detail.shuffleQuestions,
    questions: [...detail.questions].sort((a, b) => a.order - b.order).map(questionFromDto),
  };
}

/** The instants the form currently means (edited fields re-interpreted in the test's zone). */
export function effectiveWindow(form: BuilderForm): { start: string | null; end: string | null } {
  return {
    start: windowFieldPayload(form.startIso, form.editedStart, form.timezone),
    end: windowFieldPayload(form.endIso, form.editedEnd, form.timezone),
  };
}

export const totalMarksOf = (questions: SelectedQuestion[]) =>
  questions.reduce((sum, q) => sum + toCents(q.marks), 0) / 100;

/* -------------------------------------------------------- validation */

const isInt = (v: string, min: number, max: number) =>
  /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;

/** Client-side checks mirroring the server's (which always has the final say). */
export function validateForm(form: BuilderForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = form.title.trim();
  if (title.length < 3) errors.title = 'Give the test a title (at least 3 characters).';
  else if (title.length > 160) errors.title = 'Keep the title under 160 characters.';
  if (form.description.length > 5000) errors.description = 'Keep the description under 5000 characters.';
  if (form.instructions.length > 20_000)
    errors.instructions = 'Keep the instructions under 20000 characters.';
  if (form.batch.length > 64) errors.batch = 'Keep the batch label under 64 characters.';

  form.questions.forEach((q, i) => {
    const err = marksError(q.marks);
    if (err) errors[`questions.${i}.marks`] = err;
  });
  const pct = percentError(form.passingPercentage);
  if (pct) errors.passingPercentage = pct;

  if (!isInt(form.durationMinutes, 1, 600)) errors.durationMinutes = 'Duration must be 1 to 600 minutes.';
  const { start, end } = effectiveWindow(form);
  if (form.editedStart && !start) errors.startTime = 'Enter a valid start date and time.';
  if (form.editedEnd && !end) errors.endTime = 'Enter a valid end date and time.';
  if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
    errors.endTime = 'The end time must be after the start time.';
  }

  if (!isInt(form.maxAttempts, 1, 20)) errors.maxAttempts = 'Allow between 1 and 20 attempts.';
  if (!isInt(form.maxViolations, 0, 100)) errors.maxViolations = 'Enter 0 (off) to 100 violations.';
  return errors;
}

/** Which step a (client or server) field error belongs to. */
export function stepOfField(field: string): StepId {
  if (/^questions\.\d+\.marks$/.test(field) || field === 'passingPercentage') return 'marks';
  if (field.startsWith('questions')) return 'questions';
  if (['startTime', 'endTime', 'durationMinutes', 'timezone'].includes(field)) return 'schedule';
  if (['accessMode', 'maxAttempts'].includes(field)) return 'access';
  if (['resultVisibility', 'maxViolations', 'shuffleQuestions'].includes(field)) return 'settings';
  return 'basics';
}

/* ----------------------------------------------------------- payload */

export function questionsPayload(questions: SelectedQuestion[]) {
  return questions.map((q) => ({ questionId: q.questionId, marks: q.marks.trim() }));
}

/**
 * PATCH / POST body. Untouched window fields go back as the stored instant,
 * byte for byte (windowFieldPayload); only edited ones are converted, in the
 * TEST's zone. `questions` is included only when it changed, so an unchanged
 * (possibly locked) list is never resent.
 */
export function buildPayload(form: BuilderForm, opts: { includeQuestions: boolean }) {
  const { start, end } = effectiveWindow(form);
  return {
    title: form.title.trim(),
    description: form.description.trim() ? form.description : null,
    instructions: form.instructions.trim() ? form.instructions : null,
    batch: form.batch.trim() || null,
    durationMinutes: Number(form.durationMinutes),
    startTime: start,
    endTime: end,
    timezone: form.timezone,
    accessMode: form.accessMode,
    maxAttempts: Number(form.maxAttempts),
    passingPercentage: form.passingPercentage.trim(),
    resultVisibility: form.resultVisibility,
    maxViolations: Number(form.maxViolations),
    shuffleQuestions: form.shuffleQuestions,
    ...(opts.includeQuestions ? { questions: questionsPayload(form.questions) } : {}),
  };
}

export function questionsChanged(a: SelectedQuestion[], b: SelectedQuestion[]): boolean {
  return (
    a.length !== b.length ||
    a.some((q, i) => q.questionId !== b[i]?.questionId || toCents(q.marks) !== toCents(b[i]?.marks ?? ''))
  );
}

/** Which steps hold unsaved edits (empty = clean). */
export function dirtySteps(form: BuilderForm, base: BuilderForm): Set<StepId> {
  const dirty = new Set<StepId>();
  const differs = (k: keyof BuilderForm) => String(form[k]).trim() !== String(base[k]).trim();
  if (differs('title') || differs('description') || differs('instructions') || differs('batch')) {
    dirty.add('basics');
  }
  const ids = (qs: SelectedQuestion[]) => qs.map((q) => q.questionId).join(',');
  if (ids(form.questions) !== ids(base.questions)) dirty.add('questions');
  const savedMarks = new Map(base.questions.map((q) => [q.questionId, q.marks.trim()]));
  const marksEdited = form.questions.some((q) => {
    const saved = savedMarks.get(q.questionId);
    return (
      saved !== undefined &&
      (toCents(saved) !== toCents(q.marks) || (q.marks.trim() === '') !== (saved === ''))
    );
  });
  const pctEdited =
    form.passingPercentage.trim() === ''
      ? base.passingPercentage.trim() !== ''
      : Number(form.passingPercentage) !== Number(base.passingPercentage);
  if (marksEdited || pctEdited) dirty.add('marks');
  const w = effectiveWindow(form);
  const bw = effectiveWindow(base);
  if (w.start !== bw.start || w.end !== bw.end || differs('timezone') || differs('durationMinutes')) {
    dirty.add('schedule');
  }
  if (differs('accessMode') || differs('maxAttempts')) dirty.add('access');
  if (differs('resultVisibility') || differs('maxViolations') || differs('shuffleQuestions')) {
    dirty.add('settings');
  }
  return dirty;
}
