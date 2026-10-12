import { z } from 'zod';
import { normalizeEmail } from './email';
import { validationError } from './errors';
import { isValidTimeZone } from './timing';

const MAX_CODE = Number(process.env.MAX_CODE_BYTES ?? 200_000);

export const codeField = z.string().max(MAX_CODE, 'Code is too large.').default('');

export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier.');

const paginationInputBase = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
});

export const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase words separated by hyphens.');

export const emailSchema = z
  .string()
  .transform(normalizeEmail)
  .refine((v) => /^[^\s@,;<>"']+@[^\s@,;<>"'.]+(\.[^\s@,;<>"'.]+)+$/.test(v), 'Invalid email address.');

export const roleSchema = z.enum(['STUDENT', 'ADMIN']);
export const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
// Only declarative behaviour specs are executable; the runner has no raw-script path.
export const testTypeSchema = z.enum(['DECLARATIVE']);

/**
 * Marks as an exact decimal string: 0.01 to 1000, at most 2 decimal places.
 * Accepts a number or a string so forms can send either.
 */
export const marksSchema = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine(
    (v) => /^\d{1,4}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 1000,
    'Marks must be between 0.01 and 1000, with at most 2 decimal places.',
  );

/** Passing percentage: 0 to 100, at most 2 decimal places. */
export const percentageSchema = z
  .union([z.number(), z.string()])
  .transform((v) => String(v).trim())
  .refine(
    (v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) >= 0 && Number(v) <= 100,
    'The pass mark must be a percentage between 0 and 100.',
  );

/**
 * One test case. There are no per-test marks: a question's marks are split
 * equally between its enabled test cases. Every test case is student-visible.
 */
export const questionTestInput = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier.')
    .optional()
    .nullable()
    .transform((v) => v || undefined),
  name: z.string().trim().min(1, 'Test name is required.').max(140),
  description: z.string().max(2000).optional().nullable(),
  testType: testTypeSchema.default('DECLARATIVE'),
  testCode: z.string().min(2, 'Test body is required.').max(20_000),
  expectedBehavior: z.string().max(2000).optional().nullable(),
  order: z.number().int().min(0).max(999).default(0),
  enabled: z.boolean().default(true),
});

export const questionCreateInput = z.object({
  title: z.string().trim().min(3, 'Title is required.').max(160),
  slug: slugSchema.optional(),
  description: z.string().min(1, 'Description is required.').max(20_000),
  instructions: z.string().max(20_000).optional().nullable(),
  constraints: z.string().max(5000).optional().nullable(),
  expectedBehavior: z.string().max(5000).optional().nullable(),
  // Web development only: the runner executes HTML/CSS/JS pages.
  type: z.literal('WEB').default('WEB'),
  category: z.string().trim().max(60).optional().nullable(),
  marks: marksSchema.default('10'),
  suggestedMinutes: z.number().int().min(1).max(600).optional().nullable(),
  starterHtml: codeField,
  starterCss: codeField,
  starterJs: codeField,
  referenceHtml: z.string().max(MAX_CODE).optional().nullable(),
  referenceCss: z.string().max(MAX_CODE).optional().nullable(),
  referenceJs: z.string().max(MAX_CODE).optional().nullable(),
  mediaUrl: z
    .string()
    .max(500)
    .refine((v) => v === '' || /^https:\/\//.test(v), 'Media URL must be an https:// link.')
    .optional()
    .nullable(),
  difficulty: difficultySchema.default('EASY'),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  tests: z.array(questionTestInput).max(40).default([]),
});

export const questionStatusAction = z.object({
  action: z.enum(['publish', 'unpublish', 'archive', 'unarchive']),
});

export const questionListInput = paginationInputBase.extend({
  status: z.enum(['DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED']).optional(),
  difficulty: difficultySchema.optional(),
  category: z.string().max(60).optional(),
  tag: z.string().max(30).optional(),
});

export const questionUpdateInput = questionCreateInput.partial();

/** A test's question list: order is the array order; marks default to each question's own marks. */
export const testQuestionsInput = z
  .array(z.object({ questionId: idSchema, marks: marksSchema.optional() }))
  .max(60)
  .refine(
    (qs) => new Set(qs.map((q) => q.questionId)).size === qs.length,
    'A question can appear only once in a test.',
  );

const optionalInstant = z.coerce.date().optional().nullable();

const testFields = {
  title: z.string().trim().min(3, 'Title is required.').max(160),
  description: z.string().max(5000).optional().nullable(),
  instructions: z.string().max(20_000).optional().nullable(),
  durationMinutes: z.number().int().min(1).max(600),
  startTime: optionalInstant,
  endTime: optionalInstant,
  timezone: z
    .string()
    .refine((v) => isValidTimeZone(v), 'Choose a valid time zone (for example Asia/Kolkata).'),
  batch: z.string().max(64).optional().nullable(),
  accessMode: z.enum(['ASSIGNED_USERS_ONLY', 'ANY_AUTHENTICATED_USER']),
  maxAttempts: z.number().int().min(1).max(20),
  passingPercentage: percentageSchema,
  resultVisibility: z.enum(['HIDDEN', 'SCORE_ONLY', 'FULL']),
  maxViolations: z.number().int().min(0).max(100),
  shuffleQuestions: z.boolean(),
  questions: testQuestionsInput,
};

const windowIsOrdered = (v: { startTime?: Date | null; endTime?: Date | null }) =>
  !(v.startTime && v.endTime) || v.endTime.getTime() > v.startTime.getTime();
const windowMessage = { message: 'The end time must be after the start time.', path: ['endTime'] };

/** Create a test (always as a DRAFT; publishing is a separate, checked action). */
export const examCreateInput = z
  .object({
    ...testFields,
    durationMinutes: testFields.durationMinutes.default(60),
    timezone: testFields.timezone.default('Asia/Kolkata'),
    accessMode: testFields.accessMode.default('ANY_AUTHENTICATED_USER'),
    maxAttempts: testFields.maxAttempts.default(1),
    passingPercentage: percentageSchema.default('40'),
    resultVisibility: testFields.resultVisibility.default('FULL'),
    maxViolations: testFields.maxViolations.default(0),
    shuffleQuestions: testFields.shuffleQuestions.default(false),
    questions: testQuestionsInput.default([]),
  })
  .refine(windowIsOrdered, windowMessage);

/** Edit a test. Status is not editable here (see examStatusAction). */
export const examUpdateInput = z.object(testFields).partial().refine(windowIsOrdered, windowMessage);

export const examStatusAction = z.object({
  action: z.enum(['publish', 'unpublish', 'close', 'archive', 'unarchive']),
});

export const examListInput = paginationInputBase.extend({
  phase: z.enum(['DRAFT', 'UPCOMING', 'ACTIVE', 'ENDED', 'ARCHIVED']).optional(),
});

/**
 * Assign a test. Emails may belong to people who have never signed in (the
 * assignment links to their account on first sign-in).
 */
export const examAssignInput = z
  .object({
    userIds: z.array(idSchema).max(1000).optional(),
    emails: z.array(emailSchema).max(1000).optional(),
    batch: z.string().trim().min(1).max(64).optional(),
    allStudents: z.boolean().optional(),
  })
  .refine((v) => !!(v.userIds?.length || v.emails?.length || v.batch || v.allStudents), {
    message: 'Choose students, emails, a batch, or all students.',
  });

/**
 * A student's code. Strict, like every body that sits next to a score: scores
 * are only ever computed by the server, so a `score` (or any other extra
 * field) is a 400 VALIDATION_ERROR rather than silently dropped.
 */
export const attemptSaveInput = z
  .object({
    html: codeField,
    css: codeField,
    js: codeField,
  })
  .strict();

export const runInput = attemptSaveInput;

export const proctorEventInput = z.object({
  examId: idSchema,
  attemptId: idSchema.optional().nullable(),
  type: z.enum([
    'TAB_HIDDEN',
    'WINDOW_BLUR',
    'WINDOW_FOCUS',
    'FULLSCREEN_EXIT',
    'FULLSCREEN_ENTER',
    'COPY',
    'CUT',
    'PASTE',
    'CONTEXT_MENU',
    'PAGE_UNLOAD',
    'PAGE_RELOAD',
    'HEARTBEAT_LOST',
    'CAMERA_PERMISSION_GRANTED',
    'CAMERA_PERMISSION_DENIED',
    'CAMERA_UNAVAILABLE',
    'CAMERA_STREAM_STOPPED',
    'CAMERA_RESTORED',
  ]),
  // Client timestamps are advisory only; the server stamps occurredAt itself.
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600 * 1000)
    .optional(),
  metadata: z.record(z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});

export const heartbeatInput = z.object({
  examId: idSchema,
  fullscreen: z.boolean().optional(),
});

/**
 * Student roster entries: an address with an optional batch and note. The
 * roster never grants sign-in or a role, so a `role` (or any other unknown
 * field) is rejected rather than silently ignored.
 */
export const allowedEmailCreateInput = z
  .object({
    email: emailSchema,
    batch: z.string().max(64).optional().nullable(),
    note: z.string().max(300).optional().nullable(),
  })
  .strict();

export const allowedEmailUpdateInput = z
  .object({
    batch: z.string().max(64).optional().nullable(),
    note: z.string().max(300).optional().nullable(),
  })
  .strict();

/** Administrator-only change to an account's role or active state. */
export const userAccessInput = z
  .object({
    role: roleSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.role !== undefined || v.active !== undefined, {
    message: 'Change the role, the active state, or both.',
  });

export const paginationInput = paginationInputBase;

export const auditListInput = paginationInputBase.extend({
  action: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z_.]*$/, 'Invalid action filter.')
    .optional(),
  entity: z.enum(['Question', 'Exam', 'Attempt', 'AllowedEmail', 'User']).optional(),
  entityId: idSchema.optional(),
});

export const resultsListInput = z.object({
  examId: idSchema.optional(),
  batch: z.string().trim().max(64).optional(),
  q: z.string().trim().max(120).optional(),
  state: z.enum(['IN_PROGRESS', 'GRADING_PENDING', 'PASSED', 'FAILED']).optional(),
  view: z.enum(['best', 'all']).default('best'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const bulkRegradeInput = z.object({
  /** pending: never graded; incomplete: PARTIAL/FAILED/pending; all: every submitted attempt. */
  mode: z.enum(['pending', 'incomplete', 'all']).default('pending'),
  reason: z.string().trim().min(3, 'Give a reason for the regrade.').max(300),
  force: z.boolean().default(false),
  /** Continue after this attempt id (the previous call's nextCursor). */
  after: idSchema.optional(),
});

export type QuestionCreateInput = z.infer<typeof questionCreateInput>;
export type QuestionTestInput = z.infer<typeof questionTestInput>;
export type ExamCreateInput = z.infer<typeof examCreateInput>;
export type ExamUpdateInput = z.infer<typeof examUpdateInput>;

/** Convert a ZodError into a flat, user-friendly field->message map. */
export function zodDetails(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = zodDetails(result.error);
    throw validationError(Object.values(details)[0] ?? 'Invalid request.', details);
  }
  return result.data;
}
